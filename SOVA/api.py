import io
import os
import logging
from datetime import datetime
from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.responses import FileResponse, JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv

from agents.sova_agent.agent import run_agent, export_to_sheets, send_ops_alert
from agents.sova_agent.schema import (
    ValidationResponse, HealthResponse,
    init_db, SessionLocal, ValidationRun, ExceptionRecord, AuditLog, AppNotification
)

load_dotenv()
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(
    title="SOVA — SO Validity Agent",
    description="Validates Staffing Orders against R1–R5 business rules. ITC Infotech Hackathon 2026.",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

OUTPUT_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "reports")
os.makedirs(OUTPUT_DIR, exist_ok=True)


@app.on_event("startup")
def startup():
    try:
        init_db()
        logger.info("Database initialized")
    except Exception as e:
        logger.warning(f"DB init failed (non-fatal): {e}")


@app.get("/health", response_model=HealthResponse)
def health():
    return HealthResponse(status="ok")


@app.post("/validate")
async def validate(
    so_file: UploadFile = File(..., description="SO Ageing Excel file (.xlsx)"),
    ris_file: UploadFile = File(..., description="RIS Excel file (.xlsx)"),
):
    if not so_file.filename.endswith(".xlsx"):
        raise HTTPException(status_code=400, detail="SO file must be .xlsx")
    if not ris_file.filename.endswith(".xlsx"):
        raise HTTPException(status_code=400, detail="RIS file must be .xlsx")

    so_bytes = io.BytesIO(await so_file.read())
    ris_bytes = io.BytesIO(await ris_file.read())

    try:
        result = run_agent(
            so_bytes=so_bytes,
            ris_bytes=ris_bytes,
            so_filename=so_file.filename,
            ris_filename=ris_file.filename,
            output_dir=OUTPUT_DIR,
        )
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    except Exception as e:
        logger.error(f"Agent error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Agent failed: {str(e)}")

    # Persist to DB (non-fatal if DB unavailable)
    try:
        db = SessionLocal()
        run_record = ValidationRun(
            run_timestamp=datetime.utcnow(),
            so_file_name=so_file.filename,
            ris_file_name=ris_file.filename,
            total_sos=result["total_sos"],
            total_exceptions=result["total_exceptions"],
            r1_count=result["r1_count"],
            r2_count=result["r2_count"],
            r3_count=result["r3_count"],
            r4_count=result["r4_count"],
            r5_count=result["r5_count"],
            skipped_rules=",".join(result["skipped_rules"]),
            output_file=result["output_path"],
        )
        db.add(run_record)
        db.flush()

        for exc in result["exceptions"]:
            db.add(ExceptionRecord(
                run_id=run_record.id,
                so_id=exc.get("SO ID", "N/A"),
                project_code=exc.get("Project Code", "N/A"),
                customer_name=exc.get("Customer Name", "N/A"),
                service_order_status=exc.get("Service Order Status", "N/A"),
                rule_id=exc.get("Rule ID", "N/A"),
                rule_name=exc.get("Rule Name", "N/A"),
                exception_reason=exc.get("Exception Reason", "N/A"),
                severity=exc.get("Severity", "N/A"),
                psid_hiring_manager=exc.get("PSID of Hiring Manager", "N/A"),
                expected_billing_start_date=exc.get("Expected Billing Start Date", "N/A"),
                so_creation_date=exc.get("SO Creation Date", "N/A"),
                so_submission_date=exc.get("SO Submission Date", "N/A"),
                hiring_geo_location=exc.get("Hiring GeoLocation", "N/A"),
                onsite_offshore=exc.get("Onsite/Offshore", "N/A"),
                work_location_country=exc.get("Work Location Country", "N/A"),
                work_location_city=exc.get("Work Location City", "N/A"),
                so_cluster_group=exc.get("SO ClusterGroup", "N/A"),
                manager_cluster_group=exc.get("Manager ClusterGroup", "N/A"),
                budgeted_ctc_currency=exc.get("Budgeted CTC Currency", "N/A"),
                recommended_currency=exc.get("Recommended Currency", "N/A"),
                job_title=exc.get("Job Title", "N/A"),
                primary_skill_set=exc.get("Primary Skill Set", "N/A"),
                description_quality_flag=exc.get("Description Quality Flag", "N/A"),
                recommended_action=exc.get("Recommended Action", "N/A"),
                validity_indicator=exc.get("Validity Indicator", "INVALID"),
                run_date=exc.get("Run Date", "N/A"),
            ))

        for log_entry in result["logs"]:
            db.add(AuditLog(
                run_id=run_record.id,
                log_level=log_entry["level"],
                message=log_entry["message"],
            ))

        db.commit()
        run_id = run_record.id
        db.close()
        
        # Trigger the notification / webhook alert
        summary_for_alert = {
            "total_sos": result["total_sos"],
            "total_exceptions": result["total_exceptions"],
            "r1_count": result["r1_count"],
            "r2_count": result["r2_count"]
        }
        send_ops_alert(run_id, summary_for_alert)
        
    except Exception as e:
        logger.warning(f"DB persist failed (non-fatal): {e}")
        run_id = None

    return {
        "run_id": run_id,
        "summary": {
            "run_date": result["run_date"],
            "so_file": result["so_file"],
            "ris_file": result["ris_file"],
            "total_sos": result["total_sos"],
            "rejected_rows": result["rejected_rows"],
            "total_exceptions": result["total_exceptions"],
            "r1_count": result["r1_count"],
            "r2_count": result["r2_count"],
            "r3_count": result["r3_count"],
            "r4_count": result["r4_count"],
            "r5_count": result["r5_count"],
            "skipped_rules": result["skipped_rules"],
            "output_path": result["output_path"],
        },
        "logs": result["logs"],
        "exceptions": result["exceptions"],
    }


@app.get("/download/{filename}")
def download_report(filename: str):
    path = os.path.join(OUTPUT_DIR, filename)
    if not os.path.exists(path):
        raise HTTPException(status_code=404, detail="Report file not found")
    return FileResponse(
        path,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        filename=filename,
    )


@app.post("/export/sheets")
async def export_current_to_sheets(payload: dict):
    """
    Export the most-recent in-memory result to a new Google Sheet.
    Body: { summary: {...}, exceptions: [...], run_id: int|null }
    """
    try:
        url = export_to_sheets(
            exceptions=payload.get("exceptions", []),
            summary=payload.get("summary", {}),
            run_id=payload.get("run_id"),
        )
        return {"url": url}
    except FileNotFoundError as e:
        raise HTTPException(status_code=501, detail=str(e))
    except ImportError as e:
        raise HTTPException(status_code=501, detail=str(e))
    except Exception as e:
        logger.error(f"Google Sheets export failed: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Google Sheets export failed: {str(e)}")


@app.post("/export/sheets/{run_id}")
def export_history_run_to_sheets(run_id: int):
    """
    Re-export a historical run (by run_id) from PostgreSQL to a new Google Sheet.
    """
    try:
        db = SessionLocal()
        run = db.query(ValidationRun).filter(ValidationRun.id == run_id).first()
        if not run:
            raise HTTPException(status_code=404, detail=f"Run #{run_id} not found")

        exc_rows = db.query(ExceptionRecord).filter(ExceptionRecord.run_id == run_id).all()
        exceptions = [
            {
                "SO ID":                    r.so_id,
                "Project Code":             r.project_code,
                "Customer Name":            r.customer_name,
                "Service Order Status":     r.service_order_status,
                "Rule ID":                  r.rule_id,
                "Rule Name":                r.rule_name,
                "Exception Reason":         r.exception_reason,
                "Severity":                 r.severity,
                "PSID of Hiring Manager":   r.psid_hiring_manager,
                "Expected Billing Start Date": r.expected_billing_start_date,
                "SO Creation Date":         r.so_creation_date,
                "SO Submission Date":       r.so_submission_date,
                "Hiring GeoLocation":       r.hiring_geo_location,
                "Onsite/Offshore":          r.onsite_offshore,
                "Work Location Country":    r.work_location_country,
                "Work Location City":       r.work_location_city,
                "SO ClusterGroup":          r.so_cluster_group,
                "Manager ClusterGroup":     r.manager_cluster_group,
                "Budgeted CTC Currency":    r.budgeted_ctc_currency,
                "Recommended Currency":     r.recommended_currency,
                "Job Title":                r.job_title,
                "Primary Skill Set":        r.primary_skill_set,
                "Description Quality Flag": r.description_quality_flag,
                "Recommended Action":       r.recommended_action,
                "Validity Indicator":       r.validity_indicator,
                "Run Date":                 r.run_date,
            }
            for r in exc_rows
        ]

        summary = {
            "run_date":         str(run.run_timestamp),
            "so_file":          run.so_file_name,
            "ris_file":         run.ris_file_name,
            "total_sos":        run.total_sos,
            "rejected_rows":    0,
            "total_exceptions": run.total_exceptions,
            "r1_count":         run.r1_count,
            "r2_count":         run.r2_count,
            "r3_count":         run.r3_count,
            "r4_count":         run.r4_count,
            "r5_count":         run.r5_count,
            "skipped_rules":    run.skipped_rules.split(",") if run.skipped_rules else [],
        }
        db.close()

        url = export_to_sheets(exceptions=exceptions, summary=summary, run_id=run_id)
        return {"url": url}

    except HTTPException:
        raise
    except FileNotFoundError as e:
        raise HTTPException(status_code=501, detail=str(e))
    except ImportError as e:
        raise HTTPException(status_code=501, detail=str(e))
    except Exception as e:
        logger.error(f"Google Sheets export failed: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Google Sheets export failed: {str(e)}")


# ── Notifications & Alerts ────────────────────────────────────────────────

@app.post("/mock/webhook/teams")
async def mock_teams_webhook(payload: dict):
    """
    A mock endpoint that simulates receiving a webhook from the agent.
    In a real scenario, this URL would be a Microsoft Teams or Slack webhook URL.
    """
    logger.info("=" * 60)
    logger.info("🚨 [MOCK WEBHOOK RECEIVED] 🚨")
    logger.info(f"Payload: {payload}")
    logger.info("=" * 60)
    return {"status": "received"}


@app.get("/notifications")
def get_notifications():
    """Fetch all unread notifications for the UI Bell."""
    try:
        db = SessionLocal()
        # Fetch last 20 unread
        notifs = db.query(AppNotification).filter(AppNotification.is_read == 0).order_by(AppNotification.created_at.desc()).limit(20).all()
        result = [
            {
                "id": n.id,
                "run_id": n.run_id,
                "message": n.message,
                "severity": n.severity,
                "created_at": n.created_at.isoformat() + "Z" if n.created_at else None
            }
            for n in notifs
        ]
        db.close()
        return result
    except Exception as e:
        return JSONResponse(status_code=503, content={"detail": f"DB unavailable: {e}"})


@app.post("/notifications/{notif_id}/read")
def mark_notification_read(notif_id: int):
    """Mark a notification as read so it disappears from the bell."""
    try:
        db = SessionLocal()
        notif = db.query(AppNotification).filter(AppNotification.id == notif_id).first()
        if notif:
            notif.is_read = 1
            db.commit()
        db.close()
        return {"status": "success"}
    except Exception as e:
        return JSONResponse(status_code=503, content={"detail": f"DB unavailable: {e}"})


@app.get("/history")
def get_history():
    try:
        db = SessionLocal()
        runs = db.query(ValidationRun).order_by(ValidationRun.run_timestamp.desc()).limit(20).all()
        result = []
        for r in runs:
            result.append({
                "id": r.id,
                "run_timestamp": r.run_timestamp.isoformat() + "Z" if r.run_timestamp else None,
                "so_file_name": r.so_file_name,
                "total_sos": r.total_sos,
                "total_exceptions": r.total_exceptions,
                "r1_count": r.r1_count,
                "r2_count": r.r2_count,
                "r3_count": r.r3_count,
                "r4_count": r.r4_count,
                "r5_count": r.r5_count,
                "skipped_rules": r.skipped_rules,
                "output_file": os.path.basename(r.output_file) if r.output_file else "N/A",
            })
        db.close()
        return result
    except Exception as e:
        return JSONResponse(status_code=503, content={"detail": f"DB unavailable: {e}"})
