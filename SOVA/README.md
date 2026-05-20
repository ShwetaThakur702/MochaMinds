# SOVA — SO Validity Agent
**ITC Infotech Hackathon 2026 | Agent 02 | Rule-Based**

Automatically validates Staffing Orders against 5 business rules (R1–R5),
flags exceptions, and serves results through a Next.js dashboard.

---

## Project Structure

```
Team Mochaminds/
├── api.py                        ← FastAPI backend (port 8000)
├── server.py                     ← Uvicorn entrypoint
├── schema.sql                    ← PostgreSQL DDL
├── requirements.txt              ← Python dependencies
├── .env                          ← Backend config (DB, rule thresholds)
├── .gitignore
│
├── agents/
│   ├── __init__.py
│   └── sova_agent/
│       ├── __init__.py
│       ├── agent.py              ← Orchestrator — runs all 5 rules
│       ├── rules.py              ← R1–R5 rule engine (pure Python)
│       ├── schema.py             ← Pydantic models
│       └── prompts.py            ← Prompt/message templates
│
├── config/
│   ├── cluster_map.csv           ← PSID → ClusterGroup (R3)
│   ├── currency_map.csv          ← Country → ApprovedCurrency (R4)
│   └── geo_policy.csv            ← HiringGeo + Onsite/Offshore → Country (R2)
│
├── data/
│   ├── SO_Ageing_Synthetic.xlsx  ← Sample SO input file
│   ├── RIS_Synthetic.xlsx        ← Sample RIS input file
│   └── SOVA_ValidityReport_SAMPLE.xlsx
│
├── reports/                      ← Auto-generated SOVA validity reports
│
└── ui/                           ← Next.js frontend (port 3000)
    ├── package.json
    ├── next.config.js
    ├── tailwind.config.js
    ├── postcss.config.js
    ├── .env.local                ← Frontend config (API base URL)
    ├── pages/
    │   ├── _app.js
    │   ├── index.js              ← Dashboard + validation
    │   └── history.js            ← Run history
    ├── components/
    │   ├── Sidebar.js
    │   ├── StatCard.js
    │   ├── FileDropzone.js
    │   ├── ExceptionsTable.js
    │   └── RuleChart.js
    └── styles/
        └── globals.css
```

---

## Requirements

- **Python 3.10** (recommended — avoids DLL issues on Windows)
- **Node.js 18+**
- **PostgreSQL 12+**

---

## Setup

### 1. Install Python dependencies
```bash
pip install -r requirements.txt
```

### 2. Setup PostgreSQL
```bash
# Create the database
psql -U postgres -c "CREATE DATABASE sova_db;"

# Run the schema
psql -U postgres -d sova_db -f schema.sql
```

Then update `.env` with your PostgreSQL password:
```
DATABASE_URL=postgresql://postgres:YOUR_PASSWORD@localhost:5432/sova_db
```

### 3. Install frontend dependencies
```bash
cd ui
npm install
cd ..
```

---

## Running the Project

Open **two terminals** from the `Team Mochaminds/` root folder:

### Terminal 1 — Backend (FastAPI)
```bash
python server.py
# Runs on http://localhost:8000
```

### Terminal 2 — Frontend (Next.js)
```bash
cd ui
npm run dev
# Runs on http://localhost:3000
```

Open **http://localhost:3000** in your browser.

---

## Rules Summary

| Rule | Name | Severity | Ref File Needed |
|------|------|----------|-----------------|
| R1 | Billing Start Date | High | None |
| R2 | Geo / Location Consistency | Medium | config/geo_policy.csv |
| R3 | Cluster Group Match | Medium | config/cluster_map.csv |
| R4 | Currency Mapping | Medium | config/currency_map.csv |
| R5 | JD Quality | Low | None |

If a config file is missing, the dependent rule is skipped with a logged warning — no crash.

---

## Config

Edit `.env` at the project root to change backend settings:
```
R1_REQUEST_DATE_FIELD=SO Submission Date   # Confirm with Samuel Anandkumar
R1_GAP_DAYS=30
R5_MIN_WORD_COUNT=50
```

Edit `ui/.env.local` to change the backend URL:
```
NEXT_PUBLIC_API_BASE=http://localhost:8000
```

---

## Output

Report saved as: `SOVA_ValidityReport_YYYYMMDD_HHMMSS.xlsx`
- Sheet `SOVA_Exceptions` — one row per exception, color-coded by severity
- Sheet `Summary` — exception counts by rule

---

## Submission

Zip as: `TeamName_Agent02_SOVA_Submission.zip`

---

## RM Contact
For KT and field clarifications: **Samuel Anandkumar** via official hackathon channel.
