"""
agents/bench_agent/schema.py — PostgreSQL DDL as Python constants.

Mirrors schema.sql exactly. Used by the persistence layer and tests
to create/verify the database schema without reading a file from disk.

All 9 tables:
  bench_snapshots       — R1 aggregate snapshot per run
  bench_forecasts       — R2 daily forecast rows (91 per run)
  bench_alerts          — R3 threshold alerts + R4 freeze (unified)
  ingestion_errors      — rows rejected during file ingestion
  exclusion_audit       — per-run exclusion filter breakdown
  bench_dashboard       — R1 per-employee rows
  hiring_freeze_advisory— R4 per-skill advisory rows
  agent_errors          — structured pipeline error log
  notifications         — active notifications from last pipeline run
"""

CREATE_BENCH_SNAPSHOTS = """
CREATE TABLE IF NOT EXISTS bench_snapshots (
    id              SERIAL PRIMARY KEY,
    run_date        DATE         NOT NULL,
    total_headcount INTEGER      NOT NULL,
    snapshot_json   JSONB        NOT NULL,
    created_at      TIMESTAMPTZ  DEFAULT NOW()
);
"""

CREATE_BENCH_FORECASTS = """
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
"""

CREATE_BENCH_ALERTS = """
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
"""

CREATE_INGESTION_ERRORS = """
CREATE TABLE IF NOT EXISTS ingestion_errors (
    id               SERIAL PRIMARY KEY,
    run_date         TIMESTAMP    DEFAULT NOW(),
    source_file      VARCHAR(100),
    emplid           VARCHAR(50),
    rejection_reason VARCHAR(200),
    row_data         JSONB
);
"""

CREATE_EXCLUSION_AUDIT = """
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
"""

CREATE_BENCH_DASHBOARD = """
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
"""

CREATE_HIRING_FREEZE_ADVISORY = """
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
"""

CREATE_AGENT_ERRORS = """
CREATE TABLE IF NOT EXISTS agent_errors (
    id            SERIAL PRIMARY KEY,
    run_date      TIMESTAMP DEFAULT NOW(),
    error_type    VARCHAR(100),
    error_message TEXT,
    rule          VARCHAR(10)
);
"""

CREATE_NOTIFICATIONS = """
CREATE TABLE IF NOT EXISTS notifications (
    id         SERIAL PRIMARY KEY,
    run_date   TIMESTAMPTZ  DEFAULT NOW(),
    type       VARCHAR(50)  NOT NULL,
    severity   VARCHAR(20)  NOT NULL,
    message    TEXT         NOT NULL,
    read       BOOLEAN      DEFAULT FALSE,
    created_at TIMESTAMPTZ  DEFAULT NOW()
);
"""

ALL_TABLES = [
    CREATE_BENCH_SNAPSHOTS,
    CREATE_BENCH_FORECASTS,
    CREATE_BENCH_ALERTS,
    CREATE_INGESTION_ERRORS,
    CREATE_EXCLUSION_AUDIT,
    CREATE_BENCH_DASHBOARD,
    CREATE_HIRING_FREEZE_ADVISORY,
    CREATE_AGENT_ERRORS,
    CREATE_NOTIFICATIONS,
]


def create_all_tables(conn) -> None:
    """Execute all CREATE TABLE statements against an open psycopg2 connection."""
    with conn:
        with conn.cursor() as cur:
            for ddl in ALL_TABLES:
                cur.execute(ddl)
