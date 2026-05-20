# Bench Agent (BA) — Implementation Plan

## Context You Must Know Before Writing a Single Line

This is a **Hybrid (Rule-Based + AI) Resource Management Agent** for an IT firm.
It tracks bench employees (people not currently billable), forecasts releases, fires
threshold alerts, and advises hiring freezes.

**Disqualification conditions (treat these as hard constraints):**
- Sending employee data to any external AI/LLM API
- Hardcoding threshold values (must come from config file)
- Not applying exclusion filters before headcount computation
- Renaming the `Skiil` column in RIS (it's intentionally misspelled)
- Using any LLM other than `gpt-5-mini` for AI-assisted logic

---

## Current Folder State (What Already Exists)

```
bench_agent/          ← project root — YOU ARE HERE
├── plan.md           ← this file (already placed at root)
└── data/             ← already created, input files already placed here
    ├── RIS_Synthetic.xlsx
    ├── Skill_Data_Synthetic.xlsx
    ├── SO_Ageing_Synthetic.xlsx
    └── Copy_of_Bench_Threshold.xlsx
```

## Directory Structure to Create (Everything Else)

All paths below are **relative to `bench_agent/`** (the project root where `plan.md` lives).
Do NOT create a nested `bench_agent/bench_agent/` folder. Work from the root.

```
bench_agent/          ← project root
├── plan.md           ← already exists, do not touch
├── data/             ← already exists, do not touch
│   ├── RIS_Synthetic.xlsx
│   ├── Skill_Data_Synthetic.xlsx
│   ├── SO_Ageing_Synthetic.xlsx
│   └── Copy_of_Bench_Threshold.xlsx
│
├── agents/
│   └── bench_agent/
│       ├── __init__.py
│       ├── agent.py              # Main orchestrator (LangGraph workflow)
│       ├── schema.py             # PostgreSQL DDL + SQLAlchemy models
│       └── prompts.py            # LLM prompt templates (R4 only)
├── pipeline/
│   ├── __init__.py
│   ├── ingestion.py              # File loading + validation
│   ├── preprocessing.py          # Cleaning, type casting, column standardization
│   ├── feature_engineering.py    # Derived columns, flags, computed fields
│   ├── exclusion_filters.py      # Deployable bench population isolation
│   ├── r1_bench_snapshot.py      # Rule R1
│   ├── r2_forecast.py            # Rule R2
│   ├── r3_threshold.py           # Rule R3
│   └── r4_hiring_freeze.py       # Rule R4
├── output/
│   ├── __init__.py
│   └── excel_writer.py           # Writes BA_Dashboard, BA_Forecast, BA_Alerts sheets
├── ui/
│   └── dashboard.html            # Static analytics dashboard (acceptable per spec)
├── tests/
│   ├── __init__.py
│   ├── test_ingestion.py
│   ├── test_exclusion_filters.py
│   ├── test_r1_snapshot.py
│   ├── test_r2_forecast.py
│   └── test_r3_threshold.py
├── config/
│   └── threshold_config.csv      # Cleaned copy of threshold — never hardcoded
├── api.py                        # FastAPI REST API serving pre-computed outputs
├── schema.sql                    # PostgreSQL DDL (standalone, for submission)
├── .env                          # DB connection string, LLM endpoint
├── requirements.txt
└── README.md
```

---

## Phase 0: Project Bootstrap

### 0.1 Create all directories and `__init__.py` files
Create the full directory tree above. Every Python package directory needs `__init__.py`.

### 0.2 requirements.txt
```
pandas==2.2.2
numpy==1.26.4
openpyxl==3.1.2
psycopg2-binary==2.9.9
sqlalchemy==2.0.30
langchain==0.1.20
langgraph==0.0.62
openai==1.30.0
fastapi==0.111.0
uvicorn==0.29.0
python-dotenv==1.0.1
pytest==8.2.0
httpx==0.27.0
```

### 0.3 .env template
```
POSTGRES_URL=postgresql://user:password@localhost:5432/bench_agent
OPENAI_API_KEY=your_key_here
OPENAI_API_BASE=https://api.openai.com/v1
LLM_MODEL=gpt-5-mini
```

---

## Phase 1: Data Ingestion (`pipeline/ingestion.py`)

### Purpose
Load all 4 source files, validate mandatory fields, reject/log bad rows.
**This module must never modify source files (TC1: read-only).**

### 1.1 Column Name Standardization

When loading ANY file with pandas, immediately strip trailing/leading spaces from
all column names. Many RIS columns have trailing spaces (e.g., `'Skiil '`,
`'Pool Description '`, `'City '`, `'Location Category '`). Use:
```python
df.columns = df.columns.str.strip()
```
Do this right after `pd.read_excel()` — before any other operation.

**IMPORTANT:** After stripping, the skill column becomes `'Skiil'` (still misspelled).
Do NOT rename it to `'Skill'`. Keep it as `'Skiil'` throughout per TC5.

### 1.1a DATA_DIR Path Resolution

Since `plan.md` lives at the project root and `data/` is a sibling folder,
use this at the top of `pipeline/ingestion.py`:

```python
from pathlib import Path

# pipeline/ingestion.py lives at:  bench_agent/pipeline/ingestion.py
# data/ lives at:                  bench_agent/data/
DATA_DIR = Path(__file__).parent.parent / "data"

RIS_PATH       = DATA_DIR / "RIS_Synthetic.xlsx"
SKILL_PATH     = DATA_DIR / "Skill_Data_Synthetic.xlsx"
SO_PATH        = DATA_DIR / "SO_Ageing_Synthetic.xlsx"
THRESHOLD_PATH = DATA_DIR / "Copy_of_Bench_Threshold.xlsx"
```

Do NOT hardcode absolute paths. `Path(__file__).parent.parent` resolves correctly
regardless of where the agent is invoked from.

### 1.2 Load RIS (`RIS_Synthetic.xlsx`)

- Sheet name: `RIS`
- 1000 rows, 113 columns
- After loading, validate:
  - Rows where `Emplid` is null → log to `ingestion_errors` table with reason
    `'null_emplid'`, drop from processing
  - Log count of rejected rows

### 1.3 Load Threshold Config (`Copy_of_Bench_Threshold.xlsx`)

- Sheet name: `Sheet1`
- 22 rows, 2 columns — but column headers are unnamed
- After loading:
  - Rename columns to `['org_slice', 'bench_threshold']`
  - **Drop row 0** — it contains `'4'` as org_slice which is a data artifact
  - Strip whitespace from `org_slice` values
  - Result should be 21 rows with valid org slice keys
- If this file is absent: **raise a structured error and halt** — do not crash silently.
  R3 and R4 cannot run without it. Log the error to stdout and to DB if DB is available.

### 1.4 Load Skill Data (`Skill_Data_Synthetic.xlsx`)

- Sheet name: `Skill_Data`
- 1000 rows, 39 columns
- Join key: `Employee ID` (int64) → maps to RIS `Emplid` (int64), direct join
- Filter to `Bench/Non Bench == 'Bench'` rows only when doing skill enrichment

### 1.5 Load SO Ageing Data (`SO_Ageing_Synthetic.xlsx`)

- Sheet name: `SO_Ageing`
- 500 rows, 88 columns
- Filter to `Status == 'Active'` AND
  `SO Line Status Description in ['Open', 'Recruit']` — these are open demands
- Join key for R4: `Primary Skill Description` → maps to RIS `Skiil` (exact same 58 values)

### 1.6 Input Validation Rules

| Check | On Null/Invalid | Action |
|---|---|---|
| RIS `Emplid` is null | Reject row | Log to `ingestion_errors`, drop |
| Date fields unparseable | Keep row in snapshot | Exclude from forecast only |
| Threshold file missing | Halt R3 + R4 | Structured error, logged |
| Threshold file has row with key `'4'` | Drop silently | Expected artifact |

---

## Phase 2: Preprocessing (`pipeline/preprocessing.py`)

### Purpose
Type cast all columns to correct types. No business logic here — just cleaning.

### 2.1 Date Column Parsing

Parse ALL of these columns with `pd.to_datetime(df[col], errors='coerce')`.
Rows where parsing fails become `NaT` — do NOT drop them here, exclusion/forecast
logic handles them separately.

Date columns to parse in RIS:
```python
DATE_COLUMNS = [
    'Resource Start Date', 'Resource End Date', 'revised end date',
    'Forecast Date', 'Project end date', 'LWD', 'Exit date (+60 days)',
    'Resignation Submitted Date', 'NE under bench', 'Establishment Date',
    'Hire Date'
]
```

**Note:** `Confirm Release Period` is 100% null in this dataset — skip it entirely.
Do not attempt to parse it.

### 2.2 Numeric Columns

Cast these to numeric with `pd.to_numeric(..., errors='coerce')`:
```python
NUMERIC_COLUMNS = [
    '% Allocation', 'Total Allocation %', 'Bench aging', 'Past Experience',
    'Current Experience', 'Total Experience'
]
```

### 2.3 String Columns

Strip whitespace from all object/string columns:
```python
for col in df.select_dtypes(include=['object']).columns:
    df[col] = df[col].str.strip()
```

### 2.4 Threshold Config Preprocessing

- Ensure `bench_threshold` column is float
- Ensure `org_slice` is string, stripped, uppercase

---

## Phase 3: Exclusion Filters (`pipeline/exclusion_filters.py`)

### Purpose
Isolate the **deployable bench population**. This is the most critical step.
**All downstream rules operate ONLY on the filtered dataframe.**
Applying filters incorrectly or partially will invalidate all output (TC3).

### 3.1 Exclusion Logic

Build a boolean mask. A person is **excluded** (non-deployable) if ANY of the
following conditions is true:

```python
# Condition 1: On leave
on_leave = df['Leave type'].notna()

# Condition 2: BZ Resource (has a BZ Emplid assigned)
is_bz = df['BZ resources'].notna()

# Condition 3: CAO resource
# Do NOT exclude all non-null CAO rows — CAO column has 955/1000 non-null
# meaning it's the client name, not an exclusion flag.
# Exclusion is: CAO Status == 'Old' (already processed/exited CAO engagement)
# OR check with RM: the spec says exclude 'CAO' category. Use CAO Bench Project
# to identify bench-assigned CAO resources specifically.
# Safe implementation: exclude where Final Status contains 'CAO' explicitly,
# or where the resource is flagged via RM Status for BZ == specific values.
# IMPORTANT: Validate this logic against business rules before finalizing.
is_cao_excluded = df['CAO Status'].str.strip() == 'Old'

# Condition 4: D-rated
is_d_rated = df['D rated'].notna()  # Values: 'D1', 'D2'

# Condition 5: Exit confirmed
has_exit = df['Exit'].notna()

# Condition 6: Resigned
has_resignation = df['Resignation Submitted Date'].notna()

# Condition 7: NE under bench (Not Eligible)
is_ne = df['NE under bench'].notna()

# Condition 8: Campus hire without FBD (First Billable Date)
is_campus_no_fbd = (df['Campus/Lateral'] == 'Campus') & \
                   (df['Campus status'] == 'Without FBD')

# Condition 9: BNH/BNHP projects
is_bnh = df['BNH_BNHP Projects'].isin(['BNH', 'BNHP'])

# Condition 10: OC (On Contract)
is_oc = df['OC'].notna()

# Combined exclusion mask
exclusion_mask = (
    on_leave | is_bz | is_cao_excluded | is_d_rated |
    has_exit | has_resignation | is_ne | is_campus_no_fbd |
    is_bnh | is_oc
)

deployable_bench = df[~exclusion_mask].copy()
excluded_population = df[exclusion_mask].copy()
```

### 3.2 Log Exclusion Stats

After filtering, log to DB table `exclusion_audit`:
- Total input rows
- Rows excluded per condition (breakdown by reason)
- Deployable bench count
- Run timestamp

This is your audit trail. Evaluators will check this.

---

## Phase 4: Feature Engineering (`pipeline/feature_engineering.py`)

### Purpose
Create derived columns needed by R1–R4 that don't exist in raw data.
All derivations are computed on the **deployable bench** dataframe only.

### 4.1 Aging Bucket (Verify/Override)

RIS already has `Bench Gird` with values `<30`, `31-60`, `61-90`, `>91`.
Use this as-is. But also compute a derived `aging_bucket_derived` from `Bench aging`
(float days) as a verification column:

```python
def derive_aging_bucket(days):
    if pd.isna(days):
        return 'Unknown'
    elif days < 30:
        return '<30 days'
    elif days <= 60:
        return '31-60 days'
    elif days <= 90:
        return '61-90 days'
    else:
        return '>91 days'

df['aging_bucket_derived'] = df['Bench aging'].apply(derive_aging_bucket)
```

If `Bench Gird` and `aging_bucket_derived` differ, log discrepancy. Use `Bench Gird`
as the authoritative field in output (it comes from the source system).

### 4.2 Release Date (Best Available)

Create a single `effective_release_date` column using priority order:
1. `revised end date` if not NaT
2. `Resource End Date` if not NaT
3. `Forecast Date` if not NaT
4. NaT (unknown release date)

```python
df['effective_release_date'] = df['revised end date'].fillna(
    df['Resource End Date']
).fillna(
    df['Forecast Date']
)
```

### 4.3 Forecast Confidence Flag

Create `forecast_confidence` column based on `Confirm release`:
- `'Confirmed Release'` → `'HIGH'`
- `'Extension to be performed/Initiated'` → `'MEDIUM'`
- `'Unclear'` or null → `'LOW'`

```python
confidence_map = {
    'Confirmed Release': 'HIGH',
    'Extension to be performed/Initiated': 'MEDIUM',
    'Unclear': 'LOW'
}
df['forecast_confidence'] = df['Confirm release'].map(confidence_map).fillna('LOW')
```

This field is **mandatory in every R2 forecast row** per FC2.

### 4.4 Is Future Release (for R2)

A person is a candidate for the forecast bench on a given date if:
- `effective_release_date` is not NaT
- `effective_release_date` > today
- `Future Allocation` is null (no existing future allocation)
- Not excluded by leave/exit/resignation (already handled by exclusion filter)

```python
today = pd.Timestamp.today().normalize()
df['is_future_release'] = (
    df['effective_release_date'].notna() &
    (df['effective_release_date'] > today) &
    df['Future Allocation'].isna()
)
```

### 4.5 Org Slice Key (for R3 threshold matching)

Create `org_slice_key` column from `Department ID`. This is the join key to
threshold config. 12 of 21 threshold keys match `Department ID` directly.

For the remaining 9 threshold keys that don't match `Department ID`, use this
mapping to derive from other columns:

```python
# These keys appear in SL/IND_CLUSTER, not Department ID
DEPT_TO_ORG_OVERRIDE = {
    'DIGI_EXP': 'SL/IND_CLUSTER',   # found in SL/IND_CLUSTER
}

# These keys map via Skiil field (skill-based thresholds)
SKILL_BASED_THRESHOLDS = {
    'SERVICENOW': 'ServiceNow',   # matches Skiil value
    'TESTING': None,              # verify — may need manual mapping
    'INFRA': None,                # verify
    'IDES': None,                 # verify
    'MES': None,                  # verify
    'SCM': None,                  # verify
    'DS': None,                   # verify — 'DS' is ambiguous (Data Science?)
    'ITCICL': None,               # verify
}
```

**Action:** For the unmapped threshold keys, implement a fallback:
if no match found in `Department ID`, try `SL/IND_CLUSTER`. If still no match,
log a warning `'threshold_key_unmapped'` and skip that org slice from R3
(do not crash). Document unmapped keys in output.

### 4.6 Skill-Level Supply Count (for R4)

Aggregate bench supply by skill:
```python
bench_supply_by_skill = deployable_bench.groupby('Skiil').size().reset_index()
bench_supply_by_skill.columns = ['skill', 'bench_count']

# Add near-term releases (releases in 30 days)
near_term = deployable_bench[
    deployable_bench['Releases in Next 30 days and beyond'] == 'Release in 30 days'
].groupby('Skiil').size().reset_index()
near_term.columns = ['skill', 'near_term_releases']

bench_supply_by_skill = bench_supply_by_skill.merge(near_term, on='skill', how='left')
bench_supply_by_skill['near_term_releases'] = bench_supply_by_skill['near_term_releases'].fillna(0)
bench_supply_by_skill['total_supply'] = (
    bench_supply_by_skill['bench_count'] +
    bench_supply_by_skill['near_term_releases']
)
```

---

## Phase 5: Business Rules

### R1 — Current Bench Snapshot (`pipeline/r1_bench_snapshot.py`)

Input: `deployable_bench` dataframe (post-exclusion-filter)

Compute and return a dict with these KPIs:

```python
{
    'total_bench_headcount': int,
    'by_location': df grouped by 'Location Category',
    'by_bu': df grouped by 'Business Unit',
    'by_grade': df grouped by 'Grade',
    'by_pool': df grouped by 'Pool Description',
    'by_country': df grouped by 'Country',
    'aging_distribution': df grouped by 'Bench Gird',  # use existing bucket column
    'status_counts': {
        'available': count where Final Status == 'Available for mapping',
        'proposed': count where Final Status in ['Proposed - Feedback Awaiting',
                                                 'Proposed - Pending Interview'],
        'allocated': count where Final Status == 'Allocated to Billable Project',
        'nafd': count where Final Status startswith 'NAFD',
    },
    'current_vs_future': df grouped by 'Current or Future Bench',
    'allocation_category': df grouped by 'Bench allocation category',
    'run_date': today's date
}
```

Persist full dashboard rows to PostgreSQL table `bench_dashboard`.

### R2 — Release-Based Daily Forecast (`pipeline/r2_forecast.py`)

Input: `deployable_bench` dataframe

**Day-level time series (stronger implementation — earns bonus points):**

```python
today = pd.Timestamp.today().normalize()
forecast_horizon = today + pd.Timedelta(days=90)
date_range = pd.date_range(start=today, end=forecast_horizon, freq='D')

results = []
for date in date_range:
    # People who will be on bench by this date
    on_bench_by_date = deployable_bench[
        deployable_bench['effective_release_date'] <= date
    ]
    
    confirmed = on_bench_by_date[on_bench_by_date['forecast_confidence'] == 'HIGH']
    projected = on_bench_by_date[on_bench_by_date['forecast_confidence'].isin(['MEDIUM', 'LOW'])]
    
    results.append({
        'forecast_date': date,
        'days_from_today': (date - today).days,
        'total_forecast_bench': len(on_bench_by_date),
        'confirmed_count': len(confirmed),
        'projected_count': len(projected),
        'forecast_confidence_band': 'HIGH' if len(projected) == 0 else 'MIXED',
        'bucket': '30d' if (date-today).days <= 30 else '60d' if (date-today).days <= 60 else '90d'
    })

forecast_df = pd.DataFrame(results)
```

Also produce org-slice-level forecast by grouping on `Department ID` per date.

Persist to PostgreSQL table `bench_forecast`.

### R3 — Bench Threshold Breach (`pipeline/r3_threshold.py`)

Input: `deployable_bench` dataframe + `threshold_config` dataframe

```python
# Get current bench count per org slice
current_bench_by_org = deployable_bench.groupby('org_slice_key').size().reset_index()
current_bench_by_org.columns = ['org_slice', 'current_bench_count']

# Get 30-day forecasted bench per org slice
# (reuse R2 output at the 30-day mark, grouped by org)

# Merge with threshold config
merged = current_bench_by_org.merge(threshold_config, on='org_slice', how='inner')
merged['breach_amount'] = merged['current_bench_count'] - merged['bench_threshold']
merged['is_breached'] = merged['breach_amount'] > 0

alerts = merged[merged['is_breached']].copy()
alerts['alert_severity'] = alerts['breach_amount'].apply(
    lambda x: 'CRITICAL' if x > 20 else 'HIGH' if x > 10 else 'MEDIUM'
)
alerts['recommended_action'] = 'Review bench for org slice. Consider hiring freeze advisory.'
alerts['run_date'] = pd.Timestamp.today().date()
```

Persist to PostgreSQL table `bench_alerts`.

**If threshold config is missing: raise `ThresholdConfigMissingError` with message,
log to stderr and DB `agent_errors` table, return empty alerts with error flag.
Do NOT raise unhandled exception.**

### R4 — Hiring Freeze Advisory (`pipeline/r4_hiring_freeze.py`)

Input: `bench_supply_by_skill`, `so_demand_df` (filtered SO Ageing), `skill_df`

**Rule-based core (minimum viable):**

```python
# Demand side: count open SO lines per skill
open_demand_by_skill = so_demand_df.groupby('Primary Skill Description').size().reset_index()
open_demand_by_skill.columns = ['skill', 'open_demand_count']

# Supply vs demand
supply_demand = bench_supply_by_skill.merge(
    open_demand_by_skill, on='skill', how='outer'
).fillna(0)

supply_demand['supply_surplus'] = (
    supply_demand['total_supply'] - supply_demand['open_demand_count']
)
supply_demand['freeze_recommended'] = supply_demand['supply_surplus'] > 0

freeze_candidates = supply_demand[supply_demand['freeze_recommended']].copy()
freeze_candidates['advisory_note'] = freeze_candidates.apply(
    lambda r: f"Bench supply ({int(r['total_supply'])}) exceeds open demand "
              f"({int(r['open_demand_count'])}) by {int(r['supply_surplus'])} "
              f"for skill '{r['skill']}'. Advisory: Pause hiring for this cluster.",
    axis=1
)
```

**AI-assisted narrative (LangGraph layer — R4 hybrid component):**

Use LangGraph to generate a structured hiring freeze recommendation narrative.
**CRITICAL CONSTRAINT (TC2): Do NOT pass individual employee data to the LLM.**
Only pass aggregated statistics (skill name, supply count, demand count, surplus).

In `agents/bench_agent/prompts.py`, define:
```python
HIRING_FREEZE_PROMPT = """
You are a resource management advisor. Based on the following aggregated bench 
supply vs open demand data, generate a concise hiring freeze advisory recommendation.

Data (aggregated, no PII):
{supply_demand_summary}

For each skill cluster where supply exceeds demand, provide:
1. A one-line freeze recommendation
2. Rationale based on the surplus
3. Suggested review timeline (immediate/30-day/60-day)

Output as structured JSON only. No preamble.
"""
```

In `agents/bench_agent/agent.py`, define a LangGraph StateGraph with nodes:
- `load_data` → `apply_exclusions` → `run_r1` → `run_r2` → `run_r3` → `run_r4_rules`
  → `run_r4_llm` → `persist_outputs` → `write_excel`

Configure LLM as:
```python
from langchain_openai import ChatOpenAI
llm = ChatOpenAI(
    model="gpt-5-mini",           # TC: mandatory model
    temperature=0,
    base_url=os.getenv("OPENAI_API_BASE"),
    api_key=os.getenv("OPENAI_API_KEY")
)
```

---

## Phase 6: PostgreSQL Schema (`schema.sql` + `agents/bench_agent/schema.py`)

Create these tables. Write both a `schema.sql` file (for submission) and
SQLAlchemy models (for runtime use).

```sql
-- Ingestion audit
CREATE TABLE IF NOT EXISTS ingestion_errors (
    id SERIAL PRIMARY KEY,
    run_date TIMESTAMP DEFAULT NOW(),
    source_file VARCHAR(100),
    emplid VARCHAR(50),
    rejection_reason VARCHAR(200),
    row_data JSONB
);

-- Exclusion audit
CREATE TABLE IF NOT EXISTS exclusion_audit (
    id SERIAL PRIMARY KEY,
    run_date TIMESTAMP DEFAULT NOW(),
    total_input_rows INTEGER,
    excluded_on_leave INTEGER,
    excluded_bz INTEGER,
    excluded_cao INTEGER,
    excluded_d_rated INTEGER,
    excluded_exit INTEGER,
    excluded_resignation INTEGER,
    excluded_ne INTEGER,
    excluded_campus_no_fbd INTEGER,
    excluded_bnh INTEGER,
    excluded_oc INTEGER,
    total_excluded INTEGER,
    deployable_bench_count INTEGER
);

-- R1 output
CREATE TABLE IF NOT EXISTS bench_dashboard (
    id SERIAL PRIMARY KEY,
    run_date DATE,
    emplid VARCHAR(50),
    employee_name VARCHAR(200),
    grade VARCHAR(20),
    business_unit VARCHAR(100),
    pool_description VARCHAR(200),
    country VARCHAR(100),
    city VARCHAR(100),
    location_category VARCHAR(50),
    project_id VARCHAR(100),
    project_name VARCHAR(200),
    project_status VARCHAR(100),
    task_type VARCHAR(100),
    final_status VARCHAR(200),
    bench_allocation_category VARCHAR(100),
    bench_aging FLOAT,
    aging_bucket VARCHAR(20),
    current_or_future_bench VARCHAR(50),
    pct_allocation FLOAT,
    total_allocation_pct FLOAT,
    future_allocation VARCHAR(20),
    allocation_pct_status VARCHAR(50),
    resource_end_date DATE,
    revised_end_date DATE,
    forecast_date DATE,
    confirm_release VARCHAR(100),
    release_month VARCHAR(20),
    skiil VARCHAR(100),
    rm VARCHAR(100)
);

-- R2 output
CREATE TABLE IF NOT EXISTS bench_forecast (
    id SERIAL PRIMARY KEY,
    run_date DATE,
    forecast_date DATE,
    days_from_today INTEGER,
    org_slice VARCHAR(100),
    total_forecast_bench INTEGER,
    confirmed_count INTEGER,
    projected_count INTEGER,
    forecast_confidence VARCHAR(20),
    bucket VARCHAR(5)
);

-- R3 output
CREATE TABLE IF NOT EXISTS bench_alerts (
    id SERIAL PRIMARY KEY,
    run_date DATE,
    org_slice VARCHAR(100),
    current_bench_count INTEGER,
    bench_threshold FLOAT,
    breach_amount FLOAT,
    alert_severity VARCHAR(20),
    recommended_action TEXT
);

-- R4 output
CREATE TABLE IF NOT EXISTS hiring_freeze_advisory (
    id SERIAL PRIMARY KEY,
    run_date DATE,
    skill VARCHAR(100),
    bench_count INTEGER,
    near_term_releases INTEGER,
    total_supply INTEGER,
    open_demand_count INTEGER,
    supply_surplus INTEGER,
    freeze_recommended BOOLEAN,
    advisory_note TEXT,
    llm_narrative TEXT
);

-- Agent error log
CREATE TABLE IF NOT EXISTS agent_errors (
    id SERIAL PRIMARY KEY,
    run_date TIMESTAMP DEFAULT NOW(),
    error_type VARCHAR(100),
    error_message TEXT,
    rule VARCHAR(10)
);
```

---

## Phase 7: Excel Output Writer (`output/excel_writer.py`)

Write a single Excel file: `BA_Dashboard_YYYYMMDD.xlsx` with 3 sheets.

### Sheet 1: `BA_Dashboard`
One row per deployable bench employee. Columns in this exact order:
```
Emplid, Employee Name, Grade,
Business Unit, Pool Description, Country, City, Location Category,
Project Id, Project Name, Project Status, Task Type, Final Status,
Bench Allocation Category, Bench Aging, Aging Bucket, Current or Future Bench,
% Allocation, Total Allocation %, Future Allocation, Allocation % Status,
Resource End Date, Revised End Date, Forecast Date, Confirm Release, Release Month,
Skiil, RM, Run Date
```
Use `N/A` for any field that is null (per FC3 — schema compliance).

### Sheet 2: `BA_Forecast`
One row per date per org slice:
```
Run Date, Forecast Date, Days From Today, Org Slice,
Total Forecast Bench, Confirmed Count, Projected Count,
Forecast Confidence, Bucket (30d/60d/90d)
```

### Sheet 3: `BA_Alerts`
One row per threshold breach:
```
Run Date, Org Slice, Current Bench Count, Bench Threshold,
Breach Amount, Alert Severity, Recommended Action
```

Include hiring freeze advisory rows in this sheet as well, clearly separated
with a `Alert Type` column: `'THRESHOLD_BREACH'` vs `'HIRING_FREEZE_ADVISORY'`.

---

## Phase 8: FastAPI Server (`api.py`)

Expose pre-computed outputs via REST. Do NOT run live inference on API calls.

```python
# Endpoints to implement:
GET  /api/bench/snapshot          # R1 — current bench KPIs
GET  /api/bench/forecast          # R2 — forecast data (query params: days=30/60/90)
GET  /api/bench/alerts            # R3 — threshold breach alerts
GET  /api/bench/hiring-freeze     # R4 — hiring freeze recommendations
POST /api/bench/run               # Trigger a fresh agent run
GET  /api/health                  # Health check
```

All endpoints read from PostgreSQL (pre-computed). No pandas operations at
request time.

---

## Phase 9: Static Dashboard (`ui/dashboard.html`)

Build a single self-contained HTML file (no external dependencies except CDN).
Use Chart.js from CDN for charts.

Sections to include:
1. **Bench Summary** — total bench count, aging bucket distribution (bar chart),
   location split (pie chart)
2. **30/60/90 Day Forecast** — line chart with confirmed vs projected bands
3. **Threshold Alerts** — table of breached org slices with severity color coding
   (red=CRITICAL, orange=HIGH, yellow=MEDIUM)
4. **Hiring Freeze Advisory** — table of skill clusters recommended for freeze

The dashboard should load data from the FastAPI endpoints using `fetch()`.
Include a "Last Updated" timestamp pulled from the API.

---

## Phase 10: Testing (`tests/`)

Create `tests/` directory with:

### `tests/test_exclusion_filters.py`
Test that:
- A person on leave is excluded
- A BZ resource is excluded
- A D-rated person is excluded
- A person with resignation date is excluded
- A deployable person is NOT excluded
- Exclusion runs BEFORE any headcount computation

### `tests/test_r1_snapshot.py`
Test that:
- Headcount matches expected after applying known exclusion set
- Aging buckets are correct for known values
- All KPI keys are present in output

### `tests/test_r2_forecast.py`
Test that:
- A person with `effective_release_date` = today+15 appears in 30d bucket
- A person with `Future Allocation` = 'NE' does NOT appear in forecast
- `forecast_confidence` is always present in output rows

### `tests/test_r3_threshold.py`
Test that:
- Breach fires correctly when bench > threshold
- No breach fires when bench < threshold
- Missing threshold config raises structured error, not crash

### `tests/test_ingestion.py`
Test that:
- Null Emplid rows are rejected and logged
- Column name stripping works (no trailing spaces)
- Threshold row with key `'4'` is dropped

---

## Phase 11: README.md

Must include:
1. Project overview
2. Setup instructions (virtualenv, pip install, .env config)
3. PostgreSQL initialization: `psql -f schema.sql`
4. How to run the agent: `python -m agents.bench_agent.agent`
5. How to start the API: `uvicorn api:app --reload`
6. Known limitations (copy from spec section 7.3)
7. Threshold config format documentation

---

## Implementation Order

Execute phases in this strict order. Do not skip ahead.

```
Phase 0  → Bootstrap (dirs, requirements, .env)
Phase 1  → Ingestion (load + validate all 4 files)
Phase 2  → Preprocessing (type casting, column cleaning)
Phase 3  → Exclusion Filters (MOST CRITICAL — verify against test data)
Phase 4  → Feature Engineering (derived columns)
Phase 5a → R1 (bench snapshot)
Phase 5b → R2 (forecast)
Phase 5c → R3 (threshold alerts) — depends on threshold config being loaded
Phase 5d → R4 rule-based core (supply-demand)
Phase 5e → R4 LangGraph AI layer (narrative generation, no PII to LLM)
Phase 6  → PostgreSQL schema creation + persistence layer
Phase 7  → Excel output writer
Phase 8  → FastAPI server
Phase 9  → Static HTML dashboard
Phase 10 → Tests
Phase 11 → README
```

---

## Critical Gotchas

1. **Column name trailing spaces** — always `.str.strip()` column names immediately
   after loading. Affects: `Skiil `, `Pool Description `, `City `, `Location Category `,
   `Resource Start Date `, `Department ID `, `Assignment So Id `

2. **`Skiil` stays misspelled** — after stripping the trailing space it becomes `Skiil`.
   Do NOT rename to `Skill`. This is TC5 — violation means disqualification.

3. **`Confirm Release Period` is fully null** — skip it. Use `Confirm release` instead.

4. **Threshold row `'4'`** — drop it. It's a data artifact in row 0 of the threshold file.

5. **CAO exclusion is nuanced** — CAO column has 955/1000 non-null values (it's
   the client name, not a binary flag). Exclude based on `CAO Status == 'Old'`
   or cross-reference with the spec's intent. Log what logic you used.

6. **No PII to LLM** — only aggregated counts go to `gpt-5-mini`. No Emplid,
   no employee names, no project names. Failure here = TC2 violation.

7. **LLM model must be `gpt-5-mini`** — hardcode the model name string as
   `"gpt-5-mini"` in config. Using GPT-4 or any other model = disqualification.

8. **Threshold config is runtime-loaded** — never hardcode threshold values in code.
   They must come from the CSV/Excel file at runtime (TC4).

9. **Forecast rows need `Forecast Confidence` column** — every single R2 output row
   must have this field (FC2). It cannot be absent.

10. **Advisory only** — BA cannot write back to RIS, cannot modify any source file,
    cannot enforce hiring freezes. All outputs are recommendations only (FC1, TC1).