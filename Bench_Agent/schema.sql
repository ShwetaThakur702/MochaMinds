-- Bench Agent — PostgreSQL schema (Phase 6)
-- Apply with: psql -d bench_agent -f schema.sql

-- One row per pipeline run — full R1 KPI payload stored as JSONB
CREATE TABLE IF NOT EXISTS bench_snapshots (
    id              SERIAL PRIMARY KEY,
    run_date        DATE         NOT NULL,
    total_headcount INTEGER      NOT NULL,
    snapshot_json   JSONB        NOT NULL,
    created_at      TIMESTAMPTZ  DEFAULT NOW()
);

-- One row per calendar day per pipeline run (91 rows per run)
CREATE TABLE IF NOT EXISTS bench_forecasts (
    id                       SERIAL PRIMARY KEY,
    run_date                 DATE     NOT NULL,
    forecast_date            DATE     NOT NULL,
    days_from_today          INTEGER  NOT NULL,
    total_forecast_bench     INTEGER  NOT NULL,
    confirmed_count          INTEGER  NOT NULL,
    projected_count          INTEGER  NOT NULL,
    forecast_confidence_band TEXT     NOT NULL,
    bucket                   TEXT     NOT NULL,
    created_at               TIMESTAMPTZ DEFAULT NOW()
);

-- Unified alert table: both R3 threshold alerts and R4 hiring-freeze rows
-- alert_type: 'threshold' (R3) | 'freeze' (R4)
CREATE TABLE IF NOT EXISTS bench_alerts (
    id                  SERIAL PRIMARY KEY,
    run_date            DATE     NOT NULL,
    alert_type          TEXT     NOT NULL,
    org_slice_or_skill  TEXT     NOT NULL,
    current_count       INTEGER,
    threshold_or_demand INTEGER,
    breach_or_surplus   NUMERIC,
    alert_severity      TEXT,
    recommended_action  TEXT,
    llm_narrative       TEXT,
    created_at          TIMESTAMPTZ DEFAULT NOW()
);

-- Rows rejected during ingestion (null Emplid, unparseable dates, etc.)
CREATE TABLE IF NOT EXISTS ingestion_errors (
    id               SERIAL PRIMARY KEY,
    run_date         TIMESTAMP    DEFAULT NOW(),
    source_file      VARCHAR(100),
    emplid           VARCHAR(50),
    rejection_reason VARCHAR(200),
    row_data         JSONB
);

-- Per-run exclusion filter breakdown — one row per pipeline run
CREATE TABLE IF NOT EXISTS exclusion_audit (
    id                      SERIAL PRIMARY KEY,
    run_date                TIMESTAMP DEFAULT NOW(),
    total_input_rows        INTEGER,
    excluded_on_leave       INTEGER,
    excluded_bz             INTEGER,
    excluded_d_rated        INTEGER,
    excluded_exit           INTEGER,
    excluded_resignation    INTEGER,
    excluded_campus_no_fbd  INTEGER,
    total_excluded          INTEGER,
    deployable_bench_count  INTEGER
);

-- R1 output — one row per deployable bench employee per run
CREATE TABLE IF NOT EXISTS bench_dashboard (
    id               SERIAL PRIMARY KEY,
    run_date         DATE,
    emplid           VARCHAR(50),
    employee_name    VARCHAR(200),
    grade            VARCHAR(20),
    business_unit    VARCHAR(100),
    pool_description VARCHAR(200),
    country          VARCHAR(100),
    final_status     VARCHAR(200),
    bench_aging      FLOAT,
    aging_bucket     VARCHAR(20),
    skiil            VARCHAR(100),
    org_slice_key    VARCHAR(100)
);

-- R4 output — one row per skill cluster per run
CREATE TABLE IF NOT EXISTS hiring_freeze_advisory (
    id                 SERIAL PRIMARY KEY,
    run_date           DATE,
    skill              VARCHAR(100),
    bench_count        INTEGER,
    open_demand_count  INTEGER,
    supply_surplus     INTEGER,
    freeze_recommended BOOLEAN,
    advisory_note      TEXT,
    llm_narrative      TEXT
);

-- Pipeline error log — structured errors from any rule or phase
CREATE TABLE IF NOT EXISTS agent_errors (
    id            SERIAL PRIMARY KEY,
    run_date      TIMESTAMP DEFAULT NOW(),
    error_type    VARCHAR(100),
    error_message TEXT,
    rule          VARCHAR(10)
);

-- Notifications generated after each pipeline run
-- type: THRESHOLD_BREACH | HIRING_FREEZE | AT_RISK
CREATE TABLE IF NOT EXISTS notifications (
    id         SERIAL PRIMARY KEY,
    run_date   TIMESTAMPTZ  DEFAULT NOW(),
    type       VARCHAR(50)  NOT NULL,
    severity   VARCHAR(20)  NOT NULL,
    message    TEXT         NOT NULL,
    read       BOOLEAN      DEFAULT FALSE,
    created_at TIMESTAMPTZ  DEFAULT NOW()
);
