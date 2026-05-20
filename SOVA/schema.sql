-- SOVA Schema DDL
-- Run this against your PostgreSQL instance before starting the agent

CREATE TABLE IF NOT EXISTS validation_runs (
    id SERIAL PRIMARY KEY,
    run_timestamp TIMESTAMP DEFAULT NOW(),
    so_file_name VARCHAR(255),
    ris_file_name VARCHAR(255),
    total_sos INTEGER,
    total_exceptions INTEGER,
    r1_count INTEGER DEFAULT 0,
    r2_count INTEGER DEFAULT 0,
    r3_count INTEGER DEFAULT 0,
    r4_count INTEGER DEFAULT 0,
    r5_count INTEGER DEFAULT 0,
    skipped_rules VARCHAR(255),
    output_file VARCHAR(512)
);

CREATE TABLE IF NOT EXISTS exception_records (
    id SERIAL PRIMARY KEY,
    run_id INTEGER REFERENCES validation_runs(id),
    so_id VARCHAR(50),
    project_code VARCHAR(100),
    customer_name VARCHAR(255),
    service_order_status VARCHAR(100),
    rule_id VARCHAR(10),
    rule_name VARCHAR(100),
    exception_reason TEXT,
    severity VARCHAR(20),
    psid_hiring_manager VARCHAR(50),
    expected_billing_start_date VARCHAR(50),
    so_creation_date VARCHAR(50),
    so_submission_date VARCHAR(50),
    hiring_geo_location VARCHAR(100),
    onsite_offshore VARCHAR(50),
    work_location_country VARCHAR(100),
    work_location_city VARCHAR(100),
    so_cluster_group VARCHAR(100),
    manager_cluster_group VARCHAR(100),
    budgeted_ctc_currency VARCHAR(20),
    recommended_currency VARCHAR(20),
    job_title VARCHAR(255),
    primary_skill_set VARCHAR(255),
    description_quality_flag VARCHAR(50),
    recommended_action TEXT,
    validity_indicator VARCHAR(20),
    run_date VARCHAR(50)
);

CREATE TABLE IF NOT EXISTS audit_log (
    id SERIAL PRIMARY KEY,
    run_id INTEGER REFERENCES validation_runs(id),
    log_level VARCHAR(20),
    message TEXT,
    timestamp TIMESTAMP DEFAULT NOW()
);
