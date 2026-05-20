# Bench Agent

> **First time setup?** The only thing you need to do before running is:
> ```bash
> cp .env.example .env
> # then open .env and paste in your own OpenRouter API key
> ```
> The `.env` file is never included in the zip — you must create it yourself. Everything else works out of the box.

---

A tool that tracks employees who are not on any billable project (the "bench"), forecasts upcoming releases, fires alerts when bench numbers cross thresholds, and recommends hiring freezes using AI. Everything it produces is advisory — it never enforces decisions.

---

## What It Does

When you start the backend, it automatically:

1. **Reads your Excel data files** from the `data/` folder
2. **Runs 4 business rules** in sequence:
   - **R1 — Bench Snapshot:** counts how many people are on bench right now, broken down by location, grade, status, and business unit
   - **R2 — Release Forecast:** predicts how many people will come off projects over the next 91 days
   - **R3 — Threshold Alerts:** compares bench counts against your configured limits and fires CRITICAL / HIGH / MEDIUM alerts when breached
   - **R4 — Hiring Freeze Advisory:** checks if supply of a skill exceeds open demand, and recommends a freeze (uses GPT to write a plain-English narrative)
3. **Serves everything via a REST API** at `http://localhost:8000`
4. **Shows it all on a React dashboard** at `http://localhost:5173`

---

## Before You Start

Install these on your machine:

| Tool | Why | Download |
|------|-----|----------|
| Python 3.9+ | Runs the backend | https://www.python.org/downloads/ |
| Node.js 18+ | Runs the frontend | https://nodejs.org/ |
| PostgreSQL 16 | Stores pipeline results | https://www.postgresql.org/download/ |
| An OpenRouter API key | Powers GPT narratives in R4 | https://openrouter.ai/ |

To check if you already have them:
```bash
python3 --version
node --version
psql --version
```

---

## Step 1 — Get the Code

If you received this as a zip or folder, just open it in your terminal:

```bash
cd "Bench_Agent-main"
```

If it's in a git repo:

```bash
git clone <repo-url>
cd bench_agent
```

---

## Step 2 — Install Python Dependencies

```bash
pip install -r requirements.txt
```

> If you get a permission error: `pip install --user -r requirements.txt`
> If you have multiple Python versions: use `pip3` instead of `pip`

---

## Step 3 — Set Up the Database *(optional for demo)*

> **Skipping this step is fine for a demo.** The pipeline runs entirely in memory — the database is only used to persist results between restarts. If PostgreSQL is not available, the backend logs warnings and continues normally.

### macOS

```bash
brew install postgresql@16
brew services start postgresql@16
echo 'export PATH="/opt/homebrew/opt/postgresql@16/bin:$PATH"' >> ~/.zshrc && source ~/.zshrc
createdb bench_agent
psql -d bench_agent -f schema.sql
```

### Linux (Ubuntu / Debian)

```bash
sudo apt install postgresql postgresql-contrib
sudo systemctl start postgresql
sudo -u postgres createdb bench_agent
sudo -u postgres psql -d bench_agent -f schema.sql
```

### Windows

1. Download and install from https://www.postgresql.org/download/windows/
2. Open **pgAdmin** or **SQL Shell (psql)** and run:
```sql
CREATE DATABASE bench_agent;
```
3. Apply the schema:
```bash
psql -U postgres -d bench_agent -f schema.sql
```

### Verify it worked

```bash
psql -d bench_agent -c "\dt"
```

You should see 9 tables: `bench_snapshots`, `bench_forecasts`, `bench_alerts`, `ingestion_errors`, `exclusion_audit`, `bench_dashboard`, `hiring_freeze_advisory`, `agent_errors`, `notifications`.

---

## Step 4 — Configure Environment Variables

### Backend

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

### Frontend

The frontend uses a Vite proxy to talk to the backend — no API URL is hardcoded anywhere in the source code. The default target is `http://127.0.0.1:8000` and **works out of the box without any extra setup**.

If your backend runs on a different port or host, copy the example file and edit it:

```bash
cp ui/.env.example ui/.env
# then edit ui/.env
```

```env
# ui/.env
VITE_API_TARGET=http://127.0.0.1:8000
```

> `ui/.env` is git-ignored (it may contain local overrides). `ui/.env.example` is committed and shows the available options.

---

## Step 5 — Install Frontend Dependencies

```bash
cd ui
npm install
cd ..
```

Only needs to be done once.

---

## Step 6 — Add Your Data Files

Put your Excel source files in the `data/` folder:

| File | What it contains |
|------|-----------------|
| `RIS_Synthetic.xlsx` | Employee resource data (one row per person-assignment) |
| `Skill_Data_Synthetic.xlsx` | Open skill demands |
| `SO_Ageing_Synthetic.xlsx` | Sales opportunity ageing data |
| `Bench_Threshold.xlsx` | Alert thresholds per org slice |

Sample synthetic files are already included — you can run the agent immediately without real data.

---

## Running the Agent

Open **two terminals** from the project root.

**Terminal 1 — Backend:**

```bash
python3 -m uvicorn api:app --reload --host 127.0.0.1 --port 8000
```

You should see:
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

---

## Uploading Data

Click **Upload RIS** in the top-right of the dashboard. A drag-and-drop popup will appear.

- Accepts **`.xlsx`** and **`.csv`** files
- The file must contain all required columns — you will get a clear error listing any that are missing
- Sheet name does not matter — the agent reads the first sheet regardless

### Session accumulation

Uploads **stack within a backend session** — they do not replace each other:

| Action | Deployable bench |
|--------|-----------------|
| Backend starts (base file) | 53 |
| Upload File A | 53 + new rows from A (deduplicated by Emplid) |
| Upload File B | previous total + new rows from B |
| **Backend restarts** | **resets to 53 (base file only)** |

If the same employee (same Emplid) appears in multiple uploads, the most recent upload's row wins.

---

## Running Tests

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

---

## API Endpoints

All endpoints available at `http://localhost:8000`. Interactive docs at **http://localhost:8000/docs**.

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

---

## Project Structure

```
bench_agent/
│
├── api.py                    # FastAPI server — start here
├── requirements.txt          # Python packages
├── schema.sql                # PostgreSQL table definitions
├── .env                      # Your secrets (never commit this)
├── .env.example              # Template — copy to .env and fill in
│
├── pipeline/
│   ├── ingestion.py          # Load Excel source files
│   ├── preprocessing.py      # Clean and type-cast data
│   ├── exclusion_filters.py  # Isolate deployable bench
│   ├── feature_engineering.py# Compute derived columns
│   ├── r1_bench_snapshot.py  # Headcount KPIs
│   ├── r2_forecast.py        # 91-day forecast
│   ├── r3_threshold.py       # Threshold alerts
│   ├── r4_hiring_freeze.py   # Hiring freeze advisory
│   ├── action_advisor.py     # AI action recommendations
│   ├── digest_generator.py   # Daily digest + RM nudges
│   └── persistence.py        # Write results to PostgreSQL
│
├── agents/
│   └── bench_agent/
│       ├── agent.py          # LangGraph pipeline (for Excel output)
│       └── prompts.py        # GPT prompt templates
│
├── output/
│   └── excel_writer.py       # Writes BA_Dashboard Excel report
│
├── data/                     # Source Excel files go here
│   ├── RIS_Synthetic.xlsx
│   ├── Skill_Data_Synthetic.xlsx
│   ├── SO_Ageing_Synthetic.xlsx
│   └── Bench_Threshold.xlsx
│
├── ui/                       # React + TypeScript frontend
│   ├── .env                  # Frontend env vars (VITE_API_TARGET)
│   ├── vite.config.ts        # Vite config — proxy to backend
│   └── src/
│       ├── App.tsx           # Main app
│       ├── api.ts            # API calls (all relative URLs via proxy)
│       ├── types.ts          # TypeScript types
│       ├── sampleData.ts     # Fallback data when backend is offline
│       └── components/       # Dashboard UI components
│
└── tests/
    ├── conftest.py
    └── test_*.py
```

---

## Troubleshooting

**"Address already in use" on port 8000**
```bash
kill $(lsof -ti :8000) 2>/dev/null
```
Then start the backend again.

**Dashboard shows "Offline" / all data is sample data**
The backend is not running or not reachable. Make sure Terminal 1 started without errors.

**Upload fails — "Missing required columns"**
The error message lists exactly which columns are missing. Cross-check your file against the column list in the README prompt or the `_REQUIRED_RIS_COLUMNS` constant in `api.py`.

**Upload fails — "Network Error"**
The frontend can't reach the backend. Check:
1. Backend is running on port 8000
2. `ui/.env` has `VITE_API_TARGET=http://127.0.0.1:8000`
3. Restart the frontend after any change to `ui/.env`

**R4 narratives are empty or show mock text**
Set `MOCK_LLM=false` in `.env` and make sure `OPENAI_API_KEY` is a valid OpenRouter key.

**"ModuleNotFoundError: No module named 'langchain_openai'"**
Run `pip install -r requirements.txt` — this package was added in a recent update.

**PostgreSQL connection errors**
```bash
# macOS
brew services start postgresql@16

# Linux
sudo systemctl start postgresql
```
