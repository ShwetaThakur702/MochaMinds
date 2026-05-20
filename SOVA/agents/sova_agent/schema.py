import os
from datetime import datetime
from dotenv import load_dotenv
from typing import Optional, List

from pydantic import BaseModel
from sqlalchemy import create_engine, Column, Integer, String, DateTime, Text, Float
from sqlalchemy.orm import declarative_base, sessionmaker

load_dotenv()

# ==========================================
# PYDANTIC SCHEMAS (API Requests/Responses)
# ==========================================

class RunSummary(BaseModel):
    run_date: str
    so_file: str
    ris_file: str
    total_sos: int
    rejected_rows: int
    total_exceptions: int
    r1_count: int
    r2_count: int
    r3_count: int
    r4_count: int
    r5_count: int
    skipped_rules: List[str]
    output_path: str

class LogEntry(BaseModel):
    level: str
    message: str

class ValidationResponse(BaseModel):
    summary: RunSummary
    logs: List[LogEntry]
    exceptions: List[dict]

class HealthResponse(BaseModel):
    status: str
    version: str = "1.0"
    agent: str = "SOVA"


# ==========================================
# SQLALCHEMY MODELS & DB SETUP
# ==========================================

DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://postgres:password@localhost:5432/sova_db")

engine = create_engine(DATABASE_URL)
SessionLocal = sessionmaker(bind=engine)
Base = declarative_base()

class ValidationRun(Base):
    __tablename__ = "validation_runs"
    id = Column(Integer, primary_key=True, index=True)
    run_timestamp = Column(DateTime, default=datetime.utcnow)
    so_file_name = Column(String(255))
    ris_file_name = Column(String(255))
    total_sos = Column(Integer)
    total_exceptions = Column(Integer)
    r1_count = Column(Integer, default=0)
    r2_count = Column(Integer, default=0)
    r3_count = Column(Integer, default=0)
    r4_count = Column(Integer, default=0)
    r5_count = Column(Integer, default=0)
    skipped_rules = Column(String(255))
    output_file = Column(String(512))

class ExceptionRecord(Base):
    __tablename__ = "exception_records"
    id = Column(Integer, primary_key=True, index=True)
    run_id = Column(Integer)
    so_id = Column(String(50))
    project_code = Column(String(100))
    customer_name = Column(String(255))
    service_order_status = Column(String(100))
    rule_id = Column(String(10))
    rule_name = Column(String(100))
    exception_reason = Column(Text)
    severity = Column(String(20))
    psid_hiring_manager = Column(String(50))
    expected_billing_start_date = Column(String(50))
    so_creation_date = Column(String(50))
    so_submission_date = Column(String(50))
    hiring_geo_location = Column(String(100))
    onsite_offshore = Column(String(50))
    work_location_country = Column(String(100))
    work_location_city = Column(String(100))
    so_cluster_group = Column(String(100))
    manager_cluster_group = Column(String(100))
    budgeted_ctc_currency = Column(String(20))
    recommended_currency = Column(String(20))
    job_title = Column(String(255))
    primary_skill_set = Column(String(255))
    description_quality_flag = Column(String(50))
    recommended_action = Column(Text)
    validity_indicator = Column(String(20))
    run_date = Column(String(50))

class AuditLog(Base):
    __tablename__ = "audit_log"
    id = Column(Integer, primary_key=True, index=True)
    run_id = Column(Integer)
    log_level = Column(String(20))
    message = Column(Text)
    timestamp = Column(DateTime, default=datetime.utcnow)

class AppNotification(Base):
    __tablename__ = "app_notifications"
    id = Column(Integer, primary_key=True, index=True)
    run_id = Column(Integer)
    message = Column(Text)
    severity = Column(String(20))  # "INFO", "WARNING", "HIGH"
    is_read = Column(Integer, default=0) # 0 = unread, 1 = read
    created_at = Column(DateTime, default=datetime.utcnow)

def init_db():
    Base.metadata.create_all(bind=engine)

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
