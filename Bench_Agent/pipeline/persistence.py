"""
pipeline/persistence.py — Phase 6 database persistence layer.

Exposes eight functions:
    save_snapshot(snapshot_dict)              → 1 row in bench_snapshots
    save_forecast(forecast_df)                → 91 rows in bench_forecasts
    save_alerts(alerts_df, freeze_df)         → R3 + R4 rows in bench_alerts
    save_ingestion_errors(errors)             → rows in ingestion_errors
    save_exclusion_audit(stats_dict)          → 1 row in exclusion_audit
    save_notifications(notifications)         → rows in notifications
    save_bench_dashboard(bench_df)            → rows in bench_dashboard
    save_hiring_freeze_advisory(freeze_df)    → rows in hiring_freeze_advisory
    save_agent_errors(error_type, msg, rule)  → 1 row in agent_errors

Design rules:
  - psycopg2 only, no ORM.
  - One connection per call: open → insert → commit → close.
  - DB unavailable: log warning and return — never crash the pipeline.
  - TC2: no Emplid or individual employee data is persisted to external APIs.
    bench_dashboard intentionally stores Emplid per row — internal DB only.
"""
from __future__ import annotations

import json
import logging
import math
import os
from typing import Any

import numpy as np
import pandas as pd

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Connection helper
# ---------------------------------------------------------------------------

def _connect():
    import psycopg2
    url = os.getenv("POSTGRES_URL", "postgresql://localhost/bench_agent")
    return psycopg2.connect(url)


# ---------------------------------------------------------------------------
# JSON serialisation — converts pandas/numpy types to JSON-safe Python
# ---------------------------------------------------------------------------

def _to_safe(obj: Any) -> Any:
    if isinstance(obj, pd.Series):
        return {str(k): _to_safe(v) for k, v in obj.items()}
    if isinstance(obj, dict):
        return {k: _to_safe(v) for k, v in obj.items()}
    if isinstance(obj, np.integer):
        return int(obj)
    if isinstance(obj, np.floating):
        return None if np.isnan(obj) else float(obj)
    if isinstance(obj, np.bool_):
        return bool(obj)
    if isinstance(obj, pd.Timestamp):
        return obj.isoformat()
    if isinstance(obj, float) and math.isnan(obj):
        return None
    try:
        if pd.isnull(obj):
            return None
    except (TypeError, ValueError):
        pass
    return obj


def _dumps(obj: Any) -> str:
    return json.dumps(_to_safe(obj))


# ---------------------------------------------------------------------------
# save_snapshot — 1 row per run
# ---------------------------------------------------------------------------

def save_snapshot(snapshot_dict: dict) -> None:
    """Insert one R1 snapshot row into bench_snapshots."""
    try:
        conn = _connect()
    except Exception as exc:
        logger.warning("persistence.save_snapshot: DB unavailable (%s) — skipping", exc)
        return

    try:
        with conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    INSERT INTO bench_snapshots (run_date, total_headcount, snapshot_json)
                    VALUES (%s, %s, %s)
                    """,
                    (
                        snapshot_dict.get("run_date"),
                        int(snapshot_dict["total_headcount"]),
                        _dumps(snapshot_dict),
                    ),
                )
        logger.info("persistence.save_snapshot: 1 row inserted into bench_snapshots")
    except Exception as exc:
        logger.warning("persistence.save_snapshot: insert failed (%s) — skipping", exc)
    finally:
        conn.close()


# ---------------------------------------------------------------------------
# save_forecast — 91 rows per run
# ---------------------------------------------------------------------------

def save_forecast(forecast_df: pd.DataFrame) -> None:
    """Bulk-insert R2 daily forecast rows into bench_forecasts."""
    try:
        conn = _connect()
    except Exception as exc:
        logger.warning("persistence.save_forecast: DB unavailable (%s) — skipping", exc)
        return

    rows = []
    for _, r in forecast_df.iterrows():
        fd = r["forecast_date"]
        rows.append((
            str(r["run_date"]) if "run_date" in r.index else str(pd.Timestamp.today().date()),
            fd.strftime("%Y-%m-%d") if isinstance(fd, pd.Timestamp) else str(fd),
            int(r["days_from_today"]),
            int(r["total_forecast_bench"]),
            int(r["confirmed_count"]),
            int(r["projected_count"]),
            str(r["forecast_confidence_band"]),
            str(r["bucket"]),
        ))

    try:
        with conn:
            with conn.cursor() as cur:
                cur.executemany(
                    """
                    INSERT INTO bench_forecasts
                        (run_date, forecast_date, days_from_today, total_forecast_bench,
                         confirmed_count, projected_count, forecast_confidence_band, bucket)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
                    """,
                    rows,
                )
        logger.info("persistence.save_forecast: %d rows inserted into bench_forecasts", len(rows))
    except Exception as exc:
        logger.warning("persistence.save_forecast: insert failed (%s) — skipping", exc)
    finally:
        conn.close()


# ---------------------------------------------------------------------------
# save_alerts — R3 threshold alerts + R4 hiring freeze, unified table
# ---------------------------------------------------------------------------

def save_ingestion_errors(errors: list[dict]) -> None:
    """Insert ingestion rejection records into ingestion_errors.

    Each dict must have: source_file, emplid, rejection_reason, row_data.
    row_data is stored as JSONB — converted to JSON string here.
    """
    if not errors:
        logger.info("persistence.save_ingestion_errors: no errors to persist")
        return

    try:
        conn = _connect()
    except Exception as exc:
        logger.warning("persistence.save_ingestion_errors: DB unavailable (%s) — skipping", exc)
        return

    rows = []
    for e in errors:
        rows.append((
            str(e.get("source_file", "")),
            str(e.get("emplid", "")) if e.get("emplid") is not None else None,
            str(e.get("rejection_reason", "")),
            _dumps(e.get("row_data", {})),
        ))

    try:
        with conn:
            with conn.cursor() as cur:
                cur.executemany(
                    """
                    INSERT INTO ingestion_errors
                        (source_file, emplid, rejection_reason, row_data)
                    VALUES (%s, %s, %s, %s::jsonb)
                    """,
                    rows,
                )
        logger.info(
            "persistence.save_ingestion_errors: %d rows inserted into ingestion_errors",
            len(rows),
        )
    except Exception as exc:
        logger.warning("persistence.save_ingestion_errors: insert failed (%s) — skipping", exc)
    finally:
        conn.close()


def save_exclusion_audit(stats: dict) -> None:
    """Insert one exclusion audit row into exclusion_audit.

    Expected keys in stats (all integers):
      total_input_rows, excluded_on_leave, excluded_bz, excluded_d_rated,
      excluded_exit, excluded_resignation, excluded_campus_no_fbd,
      total_excluded, deployable_bench_count
    """
    try:
        conn = _connect()
    except Exception as exc:
        logger.warning("persistence.save_exclusion_audit: DB unavailable (%s) — skipping", exc)
        return

    try:
        with conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    INSERT INTO exclusion_audit (
                        total_input_rows, excluded_on_leave, excluded_bz,
                        excluded_d_rated, excluded_exit, excluded_resignation,
                        excluded_campus_no_fbd, total_excluded, deployable_bench_count
                    ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
                    """,
                    (
                        int(stats.get("total_input_rows", 0)),
                        int(stats.get("excluded_on_leave", 0)),
                        int(stats.get("excluded_bz", 0)),
                        int(stats.get("excluded_d_rated", 0)),
                        int(stats.get("excluded_exit", 0)),
                        int(stats.get("excluded_resignation", 0)),
                        int(stats.get("excluded_campus_no_fbd", 0)),
                        int(stats.get("total_excluded", 0)),
                        int(stats.get("deployable_bench_count", 0)),
                    ),
                )
        logger.info("persistence.save_exclusion_audit: 1 row inserted into exclusion_audit")
    except Exception as exc:
        logger.warning("persistence.save_exclusion_audit: insert failed (%s) — skipping", exc)
    finally:
        conn.close()


def save_alerts(alerts_df: pd.DataFrame, freeze_df: pd.DataFrame) -> None:
    """Insert R3 threshold alerts and R4 hiring-freeze rows into bench_alerts.

    R3 rows → alert_type='threshold', llm_narrative=NULL
    R4 rows → alert_type='freeze',    llm_narrative from freeze_df if present
    """
    try:
        conn = _connect()
    except Exception as exc:
        logger.warning("persistence.save_alerts: DB unavailable (%s) — skipping", exc)
        return

    today = str(pd.Timestamp.today().date())
    rows: list[tuple] = []

    # R3 threshold alerts
    for _, r in alerts_df.iterrows():
        rows.append((
            str(r.get("run_date", today)),
            "threshold",
            str(r["org_slice"]),
            int(r["current_bench_count"]),
            int(r["bench_threshold"]),
            float(r["breach_amount"]),
            str(r["alert_severity"]),
            str(r.get("recommended_action", "")),
            None,                           # no LLM narrative for threshold alerts
        ))

    # R4 hiring-freeze advisory
    has_narrative = "llm_narrative" in freeze_df.columns
    for _, r in freeze_df.iterrows():
        severity = "FREEZE" if bool(r["freeze_recommended"]) else "OK"
        narrative = str(r["llm_narrative"]) if has_narrative and pd.notna(r.get("llm_narrative")) else None
        rows.append((
            str(r.get("run_date", today)),
            "freeze",
            str(r["skill"]),
            int(r["total_supply"]),
            int(r["open_demand_count"]),
            float(r["supply_surplus"]),
            severity,
            str(r.get("advisory_note", "")),
            narrative,
        ))

    try:
        with conn:
            with conn.cursor() as cur:
                cur.executemany(
                    """
                    INSERT INTO bench_alerts
                        (run_date, alert_type, org_slice_or_skill, current_count,
                         threshold_or_demand, breach_or_surplus, alert_severity,
                         recommended_action, llm_narrative)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
                    """,
                    rows,
                )
        r3 = len(alerts_df)
        r4 = len(freeze_df)
        logger.info(
            "persistence.save_alerts: %d rows inserted into bench_alerts (%d threshold + %d freeze)",
            len(rows), r3, r4,
        )
    except Exception as exc:
        logger.warning("persistence.save_alerts: insert failed (%s) — skipping", exc)
    finally:
        conn.close()


def save_notifications(notifications: list[dict]) -> None:
    """Insert notification records into the notifications table.

    Each dict must have: type, severity, message.
    Existing notifications are NOT cleared — each pipeline run appends.
    """
    if not notifications:
        logger.info("persistence.save_notifications: no notifications to persist")
        return

    try:
        conn = _connect()
    except Exception as exc:
        logger.warning("persistence.save_notifications: DB unavailable (%s) — skipping", exc)
        return

    rows = [
        (str(n["type"]), str(n["severity"]), str(n["message"]))
        for n in notifications
    ]

    try:
        with conn:
            with conn.cursor() as cur:
                cur.executemany(
                    "INSERT INTO notifications (type, severity, message) VALUES (%s, %s, %s)",
                    rows,
                )
        logger.info(
            "persistence.save_notifications: %d rows inserted into notifications", len(rows)
        )
    except Exception as exc:
        logger.warning("persistence.save_notifications: insert failed (%s) — skipping", exc)
    finally:
        conn.close()


# ---------------------------------------------------------------------------
# save_bench_dashboard — one row per deployable employee per run
# ---------------------------------------------------------------------------

def save_bench_dashboard(bench_df: pd.DataFrame) -> None:
    """Insert one row per deployable bench employee into bench_dashboard.

    Columns written: emplid, employee_name, grade, business_unit,
    pool_description, country, final_status, bench_aging, aging_bucket,
    skiil, org_slice_key.
    """
    if bench_df.empty:
        logger.info("persistence.save_bench_dashboard: empty dataframe — skipping")
        return

    try:
        conn = _connect()
    except Exception as exc:
        logger.warning("persistence.save_bench_dashboard: DB unavailable (%s) — skipping", exc)
        return

    today = str(pd.Timestamp.today().date())

    def _safe_str(val) -> str | None:
        try:
            if pd.isnull(val):
                return None
        except (TypeError, ValueError):
            pass
        return str(val)

    def _safe_float(val) -> float | None:
        try:
            f = float(val)
            return None if (f != f) else f  # NaN check
        except (TypeError, ValueError):
            return None

    rows = []
    for _, r in bench_df.iterrows():
        rows.append((
            today,
            _safe_str(r.get("Emplid")),
            _safe_str(r.get("Employee Name")),
            _safe_str(r.get("Grade")),
            _safe_str(r.get("Business Unit")),
            _safe_str(r.get("Pool Description")),
            _safe_str(r.get("Country")),
            _safe_str(r.get("Final Status")),
            _safe_float(r.get("bench_aging_derived")),
            _safe_str(r.get("bench_aging_bucket_derived")),
            _safe_str(r.get("Skiil")),
            _safe_str(r.get("org_slice_key")),
        ))

    try:
        with conn:
            with conn.cursor() as cur:
                cur.executemany(
                    """
                    INSERT INTO bench_dashboard (
                        run_date, emplid, employee_name, grade, business_unit,
                        pool_description, country, final_status,
                        bench_aging, aging_bucket, skiil, org_slice_key
                    ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                    """,
                    rows,
                )
        logger.info("persistence.save_bench_dashboard: %d rows inserted into bench_dashboard", len(rows))
    except Exception as exc:
        logger.warning("persistence.save_bench_dashboard: insert failed (%s) — skipping", exc)
    finally:
        conn.close()


# ---------------------------------------------------------------------------
# save_hiring_freeze_advisory — one row per skill per run
# ---------------------------------------------------------------------------

def save_hiring_freeze_advisory(freeze_df: pd.DataFrame) -> None:
    """Insert R4 hiring-freeze rows into hiring_freeze_advisory.

    Only freeze_recommended == True rows are written.
    """
    freeze_rows = freeze_df[freeze_df["freeze_recommended"] == True] if "freeze_recommended" in freeze_df.columns else freeze_df
    if freeze_rows.empty:
        logger.info("persistence.save_hiring_freeze_advisory: no freeze rows — skipping")
        return

    try:
        conn = _connect()
    except Exception as exc:
        logger.warning("persistence.save_hiring_freeze_advisory: DB unavailable (%s) — skipping", exc)
        return

    today = str(pd.Timestamp.today().date())
    rows = []
    for _, r in freeze_rows.iterrows():
        narrative = r.get("llm_narrative")
        rows.append((
            today,
            str(r["skill"]),
            int(r.get("bench_count", 0)),
            int(r.get("open_demand_count", 0)),
            int(r.get("supply_surplus", 0)),
            bool(r.get("freeze_recommended", False)),
            str(r.get("advisory_note", "")),
            str(narrative) if narrative and str(narrative) != "nan" else None,
        ))

    try:
        with conn:
            with conn.cursor() as cur:
                cur.executemany(
                    """
                    INSERT INTO hiring_freeze_advisory (
                        run_date, skill, bench_count, open_demand_count,
                        supply_surplus, freeze_recommended, advisory_note, llm_narrative
                    ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
                    """,
                    rows,
                )
        logger.info(
            "persistence.save_hiring_freeze_advisory: %d rows inserted into hiring_freeze_advisory",
            len(rows),
        )
    except Exception as exc:
        logger.warning("persistence.save_hiring_freeze_advisory: insert failed (%s) — skipping", exc)
    finally:
        conn.close()


# ---------------------------------------------------------------------------
# save_agent_errors — one row per caught exception
# ---------------------------------------------------------------------------

def save_agent_errors(error_type: str, error_message: str, rule: str = "") -> None:
    """Insert one pipeline error row into agent_errors.

    Call from exception handlers in api.py and agent.py nodes.
    Never raises — always degrades gracefully.
    """
    try:
        conn = _connect()
    except Exception as exc:
        logger.warning("persistence.save_agent_errors: DB unavailable (%s) — skipping", exc)
        return

    try:
        with conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    INSERT INTO agent_errors (error_type, error_message, rule)
                    VALUES (%s, %s, %s)
                    """,
                    (str(error_type)[:100], str(error_message), str(rule)[:10]),
                )
        logger.info("persistence.save_agent_errors: 1 row inserted into agent_errors")
    except Exception as exc:
        logger.warning("persistence.save_agent_errors: insert failed (%s) — skipping", exc)
    finally:
        conn.close()
