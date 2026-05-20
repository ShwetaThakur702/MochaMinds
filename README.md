# MochaMinds — AI Agent Suite
**ITC Infotech Hackathon 2026 | Team MochaMinds**

This repository contains two independent AI agents built for the hackathon. Each agent has its own backend, frontend, and data pipeline — but they share the same infrastructure requirements (Python, Node.js, PostgreSQL).

| Agent | Folder | Port (Backend) | Port (Frontend) | What it does |
|-------|--------|---------------|-----------------|--------------|
| **Bench Agent** | `Bench_Agent/` | 8000 | 5173 | Tracks employees on bench, forecasts releases, fires alerts, recommends hiring freezes |
| **SOVA** | `SOVA/` | 8000 | 3000 | Validates Staffing Orders against 5 business rules and flags exceptions |

> Run only one agent at a time, or change one agent's backend port to avoid conflicts on port 8000.

---

## First-Time Setup (Both Agents)

Each agent has its own `.env` file. Before running either agent:

```bash
# Bench Agent
cp Bench_Agent/.env.example Bench_Agent/.env
# open Bench_Agent/.env and paste your OpenRouter API key

# SOVA
# create or edit SOVA/.env and set your PostgreSQL password
```

`.env` files are never committed — you must create them yourself.

---

## Tech Stack

| Layer | Bench Agent | SOVA |
|-------|-------------|------|
| **Backend** | Python 3.10, FastAPI, Uvicorn | Python 3.10, FastAPI, Uvicorn |
| **AI / Orchestration** | LangGraph, OpenRouter (GPT-4o-mini) | Rule engine (pure Python) |
| **Data processing** | Pandas, OpenPyXL | Pandas, OpenPyXL |
| **Frontend** | React 18, TypeScript, Vite, Recharts | Next.js 14, Tailwind CSS |
| **Database** | PostgreSQL 16 | PostgreSQL 12+ |
| **Testing** | Pytest | — |

---

## Prerequisites

Install these once — they are shared by both agents:

| Tool | Why | Download |
|------|-----|----------|
| Python 3.10+ | Runs both backends | https://www.python.org/downloads/ |
| Node.js 18+ | Runs both frontends | https://nodejs.org/ |
| PostgreSQL 12+ | Persists pipeline results | https://www.postgresql.org/download/ |
| OpenRouter API key | Powers GPT narratives in Bench Agent R4 | https://openrouter.ai/ |

Check existing installations:
```bash
python3 --version
node --version
psql --version
```

---

---

# Agent 01 — Bench Agent

Tracks employees not on any billable project (the "bench"), forecasts upcoming releases, fires alerts when bench numbers cross thresholds, and recommends hiring freezes using AI. Everything it produces is advisory — it never enforces decisions.

## What It Does

When you start the backend, it automatically:

1. **Reads your Excel data files** from `Bench_Agent/data/`
2. **Runs 4 business rules** in sequence:
   - **R1 — Bench Snapshot:** counts how many people are on bench right now, broken down by location, grade, status, and business unit
   - **R2 — Release Forecast:** predicts how many people will come off projects over the next 91 days
   - **R3 — Threshold Alerts:** compares bench counts against configured limits and fires CRITICAL / HIGH / MEDIUM alerts when breached
   - **R4 — Hiring Freeze Advisory:** checks if supply of a skill exceeds open demand and recommends a freeze (uses GPT to write a plain-English narrative)
3. **Serves everything via a REST API** at `http://localhost:8000`
4. **Shows it all on a React dashboard** at `http://localhost:5173`

## Setup — Bench Agent

### Step 1 — Install Python dependencies

```bash
cd Bench_Agent
pip install -r requirements.txt
```

> If you get a permission error: `pip install --user -r requirements.txt`
> If you have multiple Python versions: use `pip3` instead of `pip`

### Step 2 — Set up the database *(optional for demo)*

> **Skipping this step is fine for a demo.** The pipeline runs entirely in memory — the database is only used to persist results between restarts. If PostgreSQL is not available, the backend logs warnings and continues normally.

**macOS**
```bash
brew install postgresql@16
brew services start postgresql@16
echo 'export PATH="/opt/homebrew/opt/postgresql@16/bin:$PATH"' >> ~/.zshrc && source ~/.zshrc
createdb bench_agent
psql -d bench_agent -f schema.sql
```

**Linux (Ubuntu / Debian)**
```bash
sudo apt install postgresql postgresql-contrib
sudo systemctl start postgresql
sudo -u postgres createdb bench_agent
sudo -u postgres psql -d bench_agent -f schema.sql
```

**Windows**
1. Install from https://www.postgresql.org/download/windows/
2. Open pgAdmin or SQL Shell (psql) and run:
```sql
CREATE DATABASE bench_agent;
```
3. Apply the schema:
```bash
psql -U postgres -d bench_agent -f schema.sql
```

Verify:
```bash
psql -d bench_agent -c "\dt"
```
You should see 9 tables: `bench_snapshots`, `bench_forecasts`, `bench_alerts`, `ingestion_errors`, `exclusion_audit`, `bench_dashboard`, `hiring_freeze_advisory`, `agent_errors`, `notifications`.

### Step 3 — Configure environment variables

```bash
cp .env.example .env
```

Open `.env` and fill in your values:

```env
# Database — change only if your PostgreSQL setup uses a password
POSTGRES_URL=postgresql://localhost/bench_agent

# Your OpenRouter API key (get one free at https://openrouter.ai/)
OPENAI_API_KEY=your-openrouter-key-here

# OpenRouter endpoint — do not change
OPENAI_API_BASE=https://openrouter.ai/api/v1

# GPT model used for R4 narratives
LLM_MODEL=openai/gpt-4o-mini

# Set to true to skip real GPT calls (useful for testing without spending credits)
MOCK_LLM=false

# Optional: paste a Teams webhook URL to get notifications in a Teams channel
TEAMS_WEBHOOK_URL=
```

The frontend uses a Vite proxy to talk to the backend — no API URL is hardcoded. The default target is `http://127.0.0.1:8000` and works out of the box. If your backend runs on a different host/port:

```bash
cp ui/.env.example ui/.env
# edit ui/.env
```
```env
VITE_API_TARGET=http://127.0.0.1:8000
```

### Step 4 — Install frontend dependencies

```bash
cd ui
npm install
cd ..
```

### Step 5 — Add your data files

Put Excel source files in `Bench_Agent/data/`:

| File | What it contains |
|------|-----------------|
| `RIS_Synthetic.xlsx` | Employee resource data (one row per person-assignment) |
| `Skill_Data_Synthetic.xlsx` | Open skill demands |
| `SO_Ageing_Synthetic.xlsx` | Sales opportunity ageing data |
| `Bench_Threshold.xlsx` | Alert thresholds per org slice |

Sample synthetic files are already included — you can run the agent immediately without real data.

## Running — Bench Agent

Open **two terminals** from `Bench_Agent/`.

**Terminal 1 — Backend:**
```bash
python3 -m uvicorn api:app --reload --host 127.0.0.1 --port 8000
```

Expected output:
```
INFO: pipeline loaded — 53 bench rows cached
INFO: Application startup complete.
INFO: Uvicorn running on http://127.0.0.1:8000
```

**Terminal 2 — Frontend:**
```bash
cd ui
npm run dev
```

Open **http://localhost:5173** in your browser.

## Uploading Data — Bench Agent

Click **Upload RIS** in the top-right of the dashboard. Accepts `.xlsx` and `.csv` files. Uploads stack within a session (deduplicated by Emplid) and reset on backend restart.

## Running Tests — Bench Agent

```bash
pytest -v
```

All 52 tests should pass in about 10–15 seconds.

| Test file | What it checks |
|-----------|---------------|
| `test_ingestion.py` | Excel files load correctly, bad rows are rejected |
| `test_preprocessing.py` | Column cleanup and date parsing |
| `test_exclusion_filters.py` | Deployable bench is isolated correctly |
| `test_feature_engineering.py` | Derived columns are computed correctly |
| `test_rules.py` | R1/R2/R3/R4 outputs are correct |

## API Endpoints — Bench Agent

Interactive docs at **http://localhost:8000/docs**.

| Endpoint | What it returns |
|----------|----------------|
| `GET /health` | Server status and bench count |
| `GET /api/bench/snapshot` | R1 — current bench headcount KPIs |
| `GET /api/bench/forecast` | R2 — 91-day daily release forecast |
| `GET /api/bench/alerts` | R3 — threshold breach alerts |
| `GET /api/bench/hiring-freeze` | R4 — hiring freeze recommendations |
| `GET /api/bench/notifications` | All active notifications |
| `GET /api/bench/actions` | AI-generated action recommendations |
| `GET /api/bench/digest` | Daily summary digest |
| `GET /api/bench/rm-nudges` | RM nudge messages |
| `GET /api/bench/deployment-matches` | Skill-to-demand deployment matches |
| `POST /api/bench/upload` | Upload a new RIS file (.xlsx or .csv) |
| `POST /api/bench/run` | Manually trigger a fresh pipeline run |

## Project Structure — Bench Agent

```
Bench_Agent/
├── api.py                      # FastAPI server — start here
├── requirements.txt            # Python packages
├── schema.sql                  # PostgreSQL table definitions
├── .env                        # Your secrets (never commit this)
├── .env.example                # Template — copy to .env and fill in
│
├── pipeline/
│   ├── ingestion.py            # Load Excel source files
│   ├── preprocessing.py        # Clean and type-cast data
│   ├── exclusion_filters.py    # Isolate deployable bench
│   ├── feature_engineering.py  # Compute derived columns
│   ├── r1_bench_snapshot.py    # Headcount KPIs
│   ├── r2_forecast.py          # 91-day forecast
│   ├── r3_threshold.py         # Threshold alerts
│   ├── r4_hiring_freeze.py     # Hiring freeze advisory
│   ├── action_advisor.py       # AI action recommendations
│   ├── digest_generator.py     # Daily digest + RM nudges
│   └── persistence.py          # Write results to PostgreSQL
│
├── agents/
│   └── bench_agent/
│       ├── agent.py            # LangGraph pipeline (for Excel output)
│       └── prompts.py          # GPT prompt templates
│
├── output/
│   └── excel_writer.py         # Writes BA_Dashboard Excel report
│
├── data/                       # Source Excel files go here
│   ├── RIS_Synthetic.xlsx
│   ├── Skill_Data_Synthetic.xlsx
│   ├── SO_Ageing_Synthetic.xlsx
│   └── Bench_Threshold.xlsx
│
├── ui/                         # React + TypeScript frontend
│   ├── vite.config.ts          # Vite config — proxy to backend
│   └── src/
│       ├── App.tsx
│       ├── api.ts              # API calls (all relative URLs via proxy)
│       ├── types.ts
│       ├── sampleData.ts       # Fallback data when backend is offline
│       └── components/         # Dashboard UI components
│
└── tests/
    ├── conftest.py
    └── test_*.py
```

---

---

# Agent 02 — SOVA (SO Validity Agent)

Automatically validates Staffing Orders against 5 business rules (R1–R5), flags exceptions, and serves results through a Next.js dashboard.

## Rules Summary

| Rule | Name | Severity | Config file needed |
|------|------|----------|--------------------|
| R1 | Billing Start Date | High | None |
| R2 | Geo / Location Consistency | Medium | `config/geo_policy.csv` |
| R3 | Cluster Group Match | Medium | `config/cluster_map.csv` |
| R4 | Currency Mapping | Medium | `config/currency_map.csv` |
| R5 | JD Quality | Low | None |

If a config file is missing, the dependent rule is skipped with a logged warning — no crash.

## What It Does

1. Accepts an SO input file (Excel) via the dashboard or API
2. Runs R1–R5 against every Staffing Order row
3. Flags each exception with severity (High / Medium / Low)
4. Saves results to PostgreSQL and generates a timestamped Excel report
5. Serves everything through a Next.js dashboard at `http://localhost:3000`

## Setup — SOVA

### Step 1 — Install Python dependencies

```bash
cd SOVA
pip install -r requirements.txt
```

### Step 2 — Set up the database

```bash
psql -U postgres -c "CREATE DATABASE sova_db;"
psql -U postgres -d sova_db -f schema.sql
```

Create or edit `.env` in the `SOVA/` folder:
```env
DATABASE_URL=postgresql://postgres:YOUR_PASSWORD@localhost:5432/sova_db
R1_REQUEST_DATE_FIELD=SO Submission Date
R1_GAP_DAYS=30
R5_MIN_WORD_COUNT=50
```

### Step 3 — Install frontend dependencies

```bash
cd ui
npm install
cd ..
```

Edit `ui/.env.local` if your backend runs on a non-default host/port:
```env
NEXT_PUBLIC_API_BASE=http://localhost:8000
```

## Running — SOVA

Open **two terminals** from `SOVA/`.

**Terminal 1 — Backend:**
```bash
python server.py
```
Runs at **http://localhost:8000**.

**Terminal 2 — Frontend:**
```bash
cd ui
npm run dev
```
Runs at **http://localhost:3000**.

Open **http://localhost:3000** in your browser.

## Output — SOVA

Reports are saved to `SOVA/reports/` as:
```
SOVA_ValidityReport_YYYYMMDD_HHMMSS.xlsx
```
- **Sheet `SOVA_Exceptions`** — one row per exception, color-coded by severity
- **Sheet `Summary`** — exception counts by rule

## Project Structure — SOVA

```
SOVA/
├── api.py                        # FastAPI backend (port 8000)
├── server.py                     # Uvicorn entrypoint
├── schema.sql                    # PostgreSQL DDL
├── requirements.txt              # Python dependencies
├── .env                          # Backend config (DB, rule thresholds)
│
├── agents/
│   └── sova_agent/
│       ├── agent.py              # Orchestrator — runs all 5 rules
│       ├── rules.py              # R1–R5 rule engine (pure Python)
│       ├── schema.py             # Pydantic models
│       └── prompts.py            # Prompt/message templates
│
├── config/
│   ├── cluster_map.csv           # PSID → ClusterGroup (R3)
│   ├── currency_map.csv          # Country → ApprovedCurrency (R4)
│   └── geo_policy.csv            # HiringGeo + Onsite/Offshore → Country (R2)
│
├── data/
│   ├── SO_Ageing_Synthetic.xlsx  # Sample SO input file
│   ├── RIS_Synthetic.xlsx        # Sample RIS input file
│   └── SOVA_ValidityReport_SAMPLE.xlsx
│
├── reports/                      # Auto-generated SOVA validity reports
│
└── ui/                           # Next.js frontend (port 3000)
    ├── pages/
    │   ├── index.js              # Dashboard + validation
    │   └── history.js            # Run history
    └── components/
        ├── Sidebar.js
        ├── StatCard.js
        ├── FileDropzone.js
        ├── ExceptionsTable.js
        └── RuleChart.js
```

---

---

## Troubleshooting

### Bench Agent

**"Address already in use" on port 8000**
```bash
kill $(lsof -ti :8000) 2>/dev/null
```

**Dashboard shows "Offline" / all data is sample data**
The backend is not running or not reachable. Check Terminal 1 for errors.

**Upload fails — "Missing required columns"**
The error message lists exactly which columns are missing. Cross-check against `_REQUIRED_RIS_COLUMNS` in `api.py`.

**Upload fails — "Network Error"**
1. Confirm the backend is running on port 8000
2. Confirm `ui/.env` has `VITE_API_TARGET=http://127.0.0.1:8000`
3. Restart the frontend after any `.env` change

**R4 narratives are empty or show mock text**
Set `MOCK_LLM=false` in `.env` and make sure `OPENAI_API_KEY` is a valid OpenRouter key.

**"ModuleNotFoundError: No module named 'langchain_openai'"**
Run `pip install -r requirements.txt` — this package may have been added in a recent update.

### SOVA

**Dashboard shows no data after upload**
Confirm the backend started without errors and `NEXT_PUBLIC_API_BASE` in `ui/.env.local` points to the correct host and port.

**Rule skipped with a warning**
A config CSV (`geo_policy.csv`, `cluster_map.csv`, or `currency_map.csv`) is missing from `SOVA/config/`. Restore the file to re-enable the rule.

**Report not generated**
Check that the `SOVA/reports/` folder exists and the process has write permission.

### Both Agents

**PostgreSQL connection errors**
```bash
# macOS
brew services start postgresql@16

# Linux
sudo systemctl start postgresql
```

---

## Team

**Team MochaMinds** — ITC Infotech Hackathon 2026

For field clarifications on SOVA rules: **Samuel Anandkumar** via the official hackathon channel.
