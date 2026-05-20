"""
api.py — FastAPI REST server for Bench Agent (Phase 8).

Startup: ingestion + preprocessing pipeline runs once; enriched DataFrames
are cached in memory.  Each endpoint calls only its rule module on the
cache — no re-ingestion on request.

CORS is open for all origins so the static dashboard (file://) can connect.
"""
from __future__ import annotations

import json
import logging
import math
import os
from contextlib import asynccontextmanager
from datetime import date, datetime
from pathlib import Path
from typing import Any, Optional

import httpx
import numpy as np
import pandas as pd
from dotenv import load_dotenv
from fastapi import FastAPI, File, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from pydantic import BaseModel

from pipeline.exclusion_filters import apply_exclusion_filters
from pipeline.feature_engineering import engineer_features
from pipeline.ingestion import load_all
from pipeline.preprocessing import preprocess_ris
from pipeline.r1_bench_snapshot import compute_bench_snapshot
from pipeline.r2_forecast import compute_daily_forecast
from pipeline.r3_threshold import compute_threshold_alerts
from pipeline.r4_hiring_freeze import compute_hiring_freeze, compute_deployment_matches
from pipeline.action_advisor import run_action_advisor
from pipeline.digest_generator import generate_daily_digest, generate_rm_nudges

load_dotenv()

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# LLM config (mirrors agent.py — all values driven by .env)
# ---------------------------------------------------------------------------
LLM_MODEL = os.getenv("LLM_MODEL", "gpt-4o-mini")
MOCK_LLM = os.getenv("MOCK_LLM", "false").lower() == "true"
_API_KEY = os.getenv("OPENAI_API_KEY", "")
_API_BASE = os.getenv("OPENAI_API_BASE", "https://api.openai.com/v1")

# ---------------------------------------------------------------------------
# In-memory pipeline cache
# ---------------------------------------------------------------------------
_cache: dict[str, Any] = {
    "ready": False,
    "error": None,
    "enriched_bench_df": None,
    "threshold_df": None,
    "so_ageing_df": None,
    "skill_df": None,
    "notifications": [],
    "actions": [],
    "digest": {},
    "rm_nudges": [],
    "deployment_matches": [],
    "exclusion_audit": {},
    "skill_rating_distribution": {},
    "skill_staleness": {},
    "grade_supply": {},
    "grade_demand": {},
    # Accumulates raw RIS DataFrames across uploads for this backend session.
    # Never written by _execute_pipeline — only managed by upload_ris().
    # Cleared only when the backend process restarts.
    "session_extra_ris": [],
}


# ---------------------------------------------------------------------------
# Notification builder
# ---------------------------------------------------------------------------

_PROPOSED_STATUSES = {"Proposed - Feedback Awaiting", "Proposed - Pending Interview"}


def _build_notifications(
    enriched_df: pd.DataFrame,
    alerts_df: pd.DataFrame,
    freeze_df: pd.DataFrame,
) -> list[dict]:
    """Generate notifications from R3/R4/at-risk results.

    Rules:
      1. THRESHOLD_BREACH      — R3 org slice with is_breached == True
      2. HIRING_FREEZE         — R4 skill with freeze_recommended and surplus > 3
      3. AT_RISK               — bench > 60 days with no proposed status
      4. CRITICAL_UNDERSTAFFING — R4 skill with understaffing_severity == 'CRITICAL'
    """
    ts = datetime.now().isoformat(timespec="seconds")
    notifications: list[dict] = []
    counter = 1

    # Rule 1: R3 threshold breaches
    for _, row in alerts_df[alerts_df["is_breached"] == True].iterrows():
        notifications.append({
            "id": counter,
            "type": "THRESHOLD_BREACH",
            "severity": str(row["alert_severity"]),
            "message": (
                f"{row['org_slice']} bench ({int(row['current_bench_count'])}) "
                f"exceeds threshold ({int(row['bench_threshold'])}) "
                f"by +{int(row['breach_amount'])}"
            ),
            "timestamp": ts,
            "read": False,
        })
        counter += 1

    # Rule 2: R4 hiring freeze with surplus > 3
    high_surplus = freeze_df[
        (freeze_df["freeze_recommended"] == True) & (freeze_df["supply_surplus"] > 3)
    ]
    for _, row in high_surplus.iterrows():
        surplus = int(row["supply_surplus"])
        notifications.append({
            "id": counter,
            "type": "HIRING_FREEZE",
            "severity": "HIGH" if surplus > 10 else "MEDIUM",
            "message": (
                f"Hiring freeze advised for '{row['skill']}': "
                f"supply ({int(row['total_supply'])}) exceeds demand "
                f"({int(row['open_demand_count'])}) by {surplus}"
            ),
            "timestamp": ts,
            "read": False,
        })
        counter += 1

    # Rule 3: At-risk — bench > 60 days and not in proposed status
    at_risk_mask = (
        enriched_df["bench_aging_derived"].notna()
        & (enriched_df["bench_aging_derived"] > 60)
        & (~enriched_df["Final Status"].isin(_PROPOSED_STATUSES))
    )
    at_risk_count = int(at_risk_mask.sum())
    if at_risk_count > 0:
        notifications.append({
            "id": counter,
            "type": "AT_RISK",
            "severity": "HIGH" if at_risk_count > 10 else "MEDIUM",
            "message": (
                f"{at_risk_count} employee{'s' if at_risk_count != 1 else ''} "
                f"on bench >60 days with no proposed status — review pipeline"
            ),
            "timestamp": ts,
            "read": False,
        })
        counter += 1

    # Rule 4: CRITICAL understaffing from R4 (coverage_ratio < 0.2)
    if "understaffing_severity" in freeze_df.columns:
        critical_skills = freeze_df[freeze_df["understaffing_severity"] == "CRITICAL"]
        for _, row in critical_skills.iterrows():
            ratio = row.get("coverage_ratio", 0)
            ratio_str = f"{ratio:.2f}" if ratio != float("inf") else "∞"
            notifications.append({
                "id": counter,
                "type": "CRITICAL_UNDERSTAFFING",
                "severity": "CRITICAL",
                "message": (
                    f"CRITICAL: '{row['skill']}' — only {int(row['total_supply'])} bench vs "
                    f"{int(row['open_demand_count'])} open demand (ratio: {ratio_str}). "
                    f"Escalate to hiring."
                ),
                "timestamp": ts,
                "read": False,
            })
            counter += 1

    critical_count = int(
        (freeze_df["understaffing_severity"] == "CRITICAL").sum()
        if "understaffing_severity" in freeze_df.columns else 0
    )
    logger.info(
        "_build_notifications: %d total (%d threshold breach, %d hiring freeze, at_risk=%d, critical_understaffing=%d)",
        len(notifications),
        int(alerts_df["is_breached"].sum()) if "is_breached" in alerts_df.columns else 0,
        len(high_surplus),
        at_risk_count,
        critical_count,
    )
    return notifications


# ---------------------------------------------------------------------------
# Shared pipeline executor — used by startup and POST /api/bench/run
# ---------------------------------------------------------------------------

def _execute_pipeline(
    ris_path: Optional[str] = None,
    extra_ris_dfs: Optional[list] = None,
) -> dict:
    """Run ingestion → preprocessing → exclusions → features → R3 → R4.

    ris_path       — override the RIS file (POST /api/bench/run).
    extra_ris_dfs  — additional raw DataFrames to concatenate with the base RIS
                     (accumulated uploads for the current backend session).
    Returns a dict ready to merge into _cache.
    Raises on any unrecoverable error — callers must catch.
    """
    import pipeline.ingestion as _ing_mod
    from pipeline.ingestion import _strip_columns

    original_ris = _ing_mod.RIS_PATH
    if ris_path:
        _ing_mod.RIS_PATH = Path(ris_path)

    try:
        raw = load_all()

        # Merge any accumulated session uploads into the base RIS DataFrame
        if extra_ris_dfs:
            stripped_extras = [_strip_columns(df.copy()) for df in extra_ris_dfs]
            combined = pd.concat([raw["ris"]] + stripped_extras, ignore_index=True)
            # Latest upload wins on duplicate Emplid
            combined = combined.drop_duplicates(subset=["Emplid"], keep="last")
            raw["ris"] = combined
            logger.info(
                "_execute_pipeline: merged %d extra DataFrames — %d total RIS rows",
                len(extra_ris_dfs), len(combined),
            )

        ris_df = preprocess_ris(raw["ris"])
        deployable_df, _, exclusion_audit = apply_exclusion_filters(ris_df)
        enriched_df = engineer_features(deployable_df, raw["threshold"])

        # Compute R3 + R4 so notifications can be built immediately
        alerts_df = compute_threshold_alerts(enriched_df, raw["threshold"])
        freeze_df = compute_hiring_freeze(
            enriched_df, raw["so_ageing"], raw["skill"]
        )
        notifications = _build_notifications(enriched_df, alerts_df, freeze_df)

        # R1 snapshot needed by action_advisor
        r1_snapshot = compute_bench_snapshot(enriched_df)
        # R2 daily forecast needed by action_advisor
        from pipeline.r2_forecast import compute_daily_forecast as _cdf
        r2_daily = _cdf(enriched_df)

        actions = run_action_advisor(
            enriched_bench_df=enriched_df,
            r1_snapshot=r1_snapshot,
            r2_daily_forecast_df=r2_daily,
            r3_alerts_df=alerts_df,
            r4_freeze_df=freeze_df,
        )

        digest = generate_daily_digest(
            enriched_bench_df=enriched_df,
            r1_snapshot=r1_snapshot,
            r2_daily_forecast_df=r2_daily,
            r3_alerts_df=alerts_df,
            r4_freeze_df=freeze_df,
        )

        rm_nudges = generate_rm_nudges(
            enriched_bench_df=enriched_df,
            r3_alerts_df=alerts_df,
            r4_freeze_df=freeze_df,
        )

        deployment_matches_df = compute_deployment_matches(enriched_df, raw["so_ageing"], raw["skill"])

        # --- Intelligence fields for Skill/Grade tabs ---
        from pipeline.feature_engineering import add_staleness_flag
        skill_bench = raw["skill"][raw["skill"]["Bench/Non Bench"] == "Bench"].copy()
        skill_bench_stale = add_staleness_flag(skill_bench)

        # Skill rating distribution (Overall Rating 1-4)
        skill_rating_dist = (
            skill_bench_stale["Overall Rating"]
            .value_counts()
            .sort_index()
            .to_dict()
        )
        skill_rating_dist = {str(k): int(v) for k, v in skill_rating_dist.items()}

        # Stale skill count per Skiil (via Emplid join)
        stale_by_skill = (
            skill_bench_stale[skill_bench_stale["is_stale"]]
            .merge(enriched_df[["Emplid", "Skiil"]], left_on="Employee ID", right_on="Emplid", how="inner")
            .groupby("Skiil")
            .size()
            .reset_index(name="stale_count")
            .rename(columns={"Skiil": "skill"})
            .sort_values("stale_count", ascending=False)
        )
        skill_staleness = {row["skill"]: int(row["stale_count"]) for _, row in stale_by_skill.iterrows()}

        # Grade supply (deployable bench) and demand (SO ageing)
        grade_supply = {str(k): int(v) for k, v in enriched_df["Grade"].value_counts().items()}
        grade_demand = {str(k): int(v) for k, v in raw["so_ageing"]["Grade"].value_counts().items()}

        # Persist all pipeline outputs to DB — non-fatal if DB unavailable
        from pipeline.persistence import (
            save_notifications, save_agent_errors,
            save_snapshot, save_forecast, save_alerts,
            save_bench_dashboard, save_hiring_freeze_advisory,
        )
        save_snapshot(r1_snapshot)
        save_forecast(r2_daily)
        save_alerts(alerts_df, freeze_df)
        save_bench_dashboard(enriched_df)
        save_hiring_freeze_advisory(freeze_df)
        save_notifications(notifications)

        return {
            "ready": True,
            "error": None,
            "enriched_bench_df": enriched_df,
            "threshold_df": raw["threshold"],
            "so_ageing_df": raw["so_ageing"],
            "skill_df": raw["skill"],
            "notifications": notifications,
            "actions": actions,
            "digest": digest,
            "rm_nudges": rm_nudges,
            "deployment_matches": _clean_records(deployment_matches_df),
            "exclusion_audit": exclusion_audit,
            "skill_rating_distribution": skill_rating_dist,
            "skill_staleness": skill_staleness,
            "grade_supply": grade_supply,
            "grade_demand": grade_demand,
        }
    finally:
        _ing_mod.RIS_PATH = original_ris


def _run_startup_pipeline() -> None:
    logger.info("=== Startup: running ingestion pipeline ===")
    try:
        result = _execute_pipeline()
        _cache.update(result)
        logger.info(
            "Startup complete — %d deployable bench rows, %d notifications",
            len(_cache["enriched_bench_df"]),
            len(_cache["notifications"]),
        )
    except Exception as exc:
        _cache["ready"] = False
        _cache["error"] = str(exc)
        logger.error("Startup pipeline FAILED: %s", exc, exc_info=True)
        save_agent_errors(type(exc).__name__, str(exc), "startup")


# ---------------------------------------------------------------------------
# App
# ---------------------------------------------------------------------------

@asynccontextmanager
async def lifespan(_app: FastAPI):
    _run_startup_pipeline()
    yield


app = FastAPI(
    title="Bench Agent API",
    version="1.0.0",
    description="Advisory-only bench management API — never enforces decisions.",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---------------------------------------------------------------------------
# JSON serialisation helpers
# ---------------------------------------------------------------------------

def _clean(val: Any) -> Any:
    """Convert a scalar to a JSON-safe Python type. NaN / NaT / inf → None."""
    if isinstance(val, pd.Timestamp):
        return val.strftime("%Y-%m-%d")
    if isinstance(val, np.integer):
        return int(val)
    if isinstance(val, np.floating):
        v = float(val)
        return None if (math.isnan(v) or math.isinf(v)) else v
    if isinstance(val, np.bool_):
        return bool(val)
    if isinstance(val, float) and (math.isnan(val) or math.isinf(val)):
        return None
    try:
        if pd.isnull(val):
            return None
    except (TypeError, ValueError):
        pass
    return val


def _sanitize(obj: Any) -> Any:
    """Recursively sanitize any structure so it is safe to pass to json.dumps."""
    if isinstance(obj, dict):
        return {k: _sanitize(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [_sanitize(v) for v in obj]
    return _clean(obj)


class SafeJSONResponse(JSONResponse):
    """JSONResponse that sanitizes inf/nan/numpy types before serialising."""
    def render(self, content: Any) -> bytes:
        return json.dumps(
            _sanitize(content),
            ensure_ascii=False,
            allow_nan=False,
            separators=(",", ":"),
        ).encode("utf-8")


def _clean_records(df: pd.DataFrame) -> list[dict]:
    """DataFrame → list of JSON-safe dicts."""
    return [{k: _clean(v) for k, v in row.items()} for row in df.to_dict(orient="records")]


def _clean_series(s: pd.Series) -> dict:
    """pd.Series (groupby counts) → JSON-safe dict with string keys."""
    return {str(k): _clean(v) for k, v in s.items()}


def _pipeline_error() -> JSONResponse:
    detail = _cache["error"] or "pipeline not ready"
    logger.warning("Endpoint called before pipeline ready: %s", detail)
    return JSONResponse(
        status_code=503,
        content={"error": "pipeline failed", "detail": detail},
    )


# ---------------------------------------------------------------------------
# GET /health
# ---------------------------------------------------------------------------

@app.get("/health")
def health():
    bench_count = (
        len(_cache["enriched_bench_df"])
        if _cache["ready"] and _cache["enriched_bench_df"] is not None
        else 0
    )
    return {
        "status": "ok",
        "run_date": str(date.today()),
        "bench_count": bench_count,
        "pipeline_ready": _cache["ready"],
    }


# ---------------------------------------------------------------------------
# GET /api/bench/snapshot — R1
# ---------------------------------------------------------------------------

@app.get("/api/bench/snapshot")
def get_snapshot():
    if not _cache["ready"]:
        return _pipeline_error()

    snap = compute_bench_snapshot(_cache["enriched_bench_df"])

    payload = {
        "total_headcount":        snap["total_headcount"],
        "run_date":               snap["run_date"],
        "status_counts":          snap["status_counts"],
        "current_vs_future":      _clean_series(snap["current_vs_future"]),
        "aging_distribution":     _clean_series(snap["aging_distribution"]),
        "by_location":            _clean_series(snap["by_location"]),
        "by_bu":                  _clean_series(snap["by_bu"]),
        "by_grade":               _clean_series(snap["by_grade"]),
        "by_pool":                _clean_series(snap["by_pool"]),
        "by_country":             _clean_series(snap["by_country"]),
        "by_allocation_category": _clean_series(snap["by_allocation_category"]),
        "by_skill":               _clean_series(snap["by_skill"]),
        "exclusion_audit":        _cache.get("exclusion_audit", {}),
        "skill_rating_distribution": _cache.get("skill_rating_distribution", {}),
        "skill_staleness":        _cache.get("skill_staleness", {}),
        "grade_supply":           _cache.get("grade_supply", {}),
        "grade_demand":           _cache.get("grade_demand", {}),
    }
    return SafeJSONResponse(content=payload)


# ---------------------------------------------------------------------------
# GET /api/bench/forecast — R2
# ---------------------------------------------------------------------------

@app.get("/api/bench/forecast")
def get_forecast(days: int = 90):
    """Return daily forecast rows.  Query param: ?days=30|60|90 (default 90)."""
    if not _cache["ready"]:
        return _pipeline_error()

    days = max(1, min(days, 90))
    daily_df = compute_daily_forecast(_cache["enriched_bench_df"])
    sliced = daily_df[daily_df["days_from_today"] <= days]
    return SafeJSONResponse(content=_clean_records(sliced))


# ---------------------------------------------------------------------------
# GET /api/bench/alerts — R3
# ---------------------------------------------------------------------------

@app.get("/api/bench/alerts")
def get_alerts():
    if not _cache["ready"]:
        return _pipeline_error()

    alerts_df = compute_threshold_alerts(
        _cache["enriched_bench_df"],
        _cache["threshold_df"],
    )

    # Attach the list of Emplids in each org slice so the UI can show them on hover
    bench_df = _cache["enriched_bench_df"]
    psid_map: dict[str, list[str]] = (
        bench_df.groupby("org_slice_key")["Emplid"]
        .apply(lambda s: [str(v) for v in s.dropna().tolist()])
        .to_dict()
    )
    records = _clean_records(alerts_df)
    for row in records:
        row["bench_psids"] = psid_map.get(row.get("org_slice", ""), [])

    return SafeJSONResponse(content=records)


# ---------------------------------------------------------------------------
# LLM narrative enrichment — mirrors run_r4_llm node in agent.py
# TC2: only aggregated skill-level stats are sent to the LLM (no PII)
# ---------------------------------------------------------------------------

_LLM_BATCH_SIZE = 4  # Max skills per LLM call to stay within free-tier token budget


def _build_llm_batch_prompt(batch_rows: pd.DataFrame) -> str:
    """Build explicit JSON-template prompt for one batch of skills."""
    from agents.bench_agent.prompts import HIRING_FREEZE_PROMPT
    skills = list(batch_rows["skill"])
    template = "{" + ",".join(f'"{s}":"..."' for s in skills) + "}"
    parts = [
        f"{row['skill']} supply={int(row['total_supply'])} demand={int(row['open_demand_count'])}"
        for _, row in batch_rows.iterrows()
    ]
    summary = ", ".join(parts)
    return HIRING_FREEZE_PROMPT.format(template=template, supply_demand_summary=summary)


def _call_llm_batch_api(batch_rows: pd.DataFrame) -> dict:
    """Call LLM for one batch, return {skill: advisory} dict."""
    from langchain_core.messages import HumanMessage
    from langchain_openai import ChatOpenAI

    prompt = _build_llm_batch_prompt(batch_rows)
    llm = ChatOpenAI(
        model=LLM_MODEL,
        openai_api_key=_API_KEY,
        openai_api_base=_API_BASE,
        temperature=0,
        max_tokens=200,
        default_headers={
            "HTTP-Referer": "http://localhost",
            "X-Title": "BenchAgent",
        },
        request_timeout=30,
    )
    raw = llm.invoke([HumanMessage(content=prompt)]).content.strip()
    if raw.startswith("```"):
        raw = raw.split("```", 2)[1]
        if raw.startswith("json"):
            raw = raw[4:]
        raw = raw.rsplit("```", 1)[0].strip()
    parsed = json.loads(raw)
    return {str(k): str(v) for k, v in parsed.items()} if isinstance(parsed, dict) else {}


def _add_llm_narrative(freeze_df: pd.DataFrame) -> pd.DataFrame:
    """Attach LLM narrative to each row. Falls back to advisory_note on error."""
    freeze_df = freeze_df.copy()
    freeze_rows = freeze_df[freeze_df["freeze_recommended"] == True]

    if freeze_rows.empty:
        freeze_df["llm_narrative"] = freeze_df["advisory_note"]
        return freeze_df

    if MOCK_LLM:
        logger.warning("MOCK_LLM=true — generating mock LLM narratives")

        def _mock_narrative(row: pd.Series) -> str:
            if not row.get("freeze_recommended"):
                return row["advisory_note"]
            surplus = int(row.get("supply_surplus", 0))
            supply = int(row.get("total_supply", 0))
            demand = int(row.get("open_demand_count", 0))
            skill = row["skill"]
            if surplus > 4:
                action = "Pause all new hiring immediately"
                timeline = "Immediate freeze recommended — review in 30 days"
            elif surplus >= 3:
                action = "Pause hiring for 30 days"
                timeline = "Short-term freeze — reassess demand pipeline in 4 weeks"
            else:
                action = "Pause hiring for 60 days"
                timeline = "Monitor bench; reassess if demand improves within 60 days"
            return (
                f"{action} for '{skill}'. "
                f"Bench supply ({supply}) exceeds open demand ({demand}) by {surplus}. "
                f"{timeline}."
            )

        freeze_df["llm_narrative"] = freeze_df.apply(_mock_narrative, axis=1)
        return freeze_df

    narrative_map: dict[str, str] = {}
    batches = [freeze_rows.iloc[i:i+_LLM_BATCH_SIZE] for i in range(0, len(freeze_rows), _LLM_BATCH_SIZE)]
    logger.info("Calling LLM model=%s, %d batch(es) of ≤%d skills", LLM_MODEL, len(batches), _LLM_BATCH_SIZE)

    for idx, batch in enumerate(batches):
        try:
            result = _call_llm_batch_api(batch)
            narrative_map.update(result)
            logger.info("LLM batch %d/%d: got %d narratives", idx + 1, len(batches), len(result))
        except Exception as exc:
            logger.warning("LLM batch %d failed (%s) — advisory_note fallback for batch", idx + 1, exc)

    freeze_df["llm_narrative"] = freeze_df.apply(
        lambda row: narrative_map.get(row["skill"], row["advisory_note"]),
        axis=1,
    )
    return freeze_df


# ---------------------------------------------------------------------------
# GET /api/bench/hiring-freeze — R4 rules + LLM narrative
# ---------------------------------------------------------------------------

@app.get("/api/bench/hiring-freeze")
def get_hiring_freeze():
    if not _cache["ready"]:
        return _pipeline_error()

    freeze_df = compute_hiring_freeze(
        _cache["enriched_bench_df"],
        _cache["so_ageing_df"],
        _cache["skill_df"],
    )
    freeze_df = _add_llm_narrative(freeze_df)

    # Merge endorsement/staleness cols from cached deployment_matches
    _DM_ENRICH_COLS = [
        "skill", "endorsed_match_count", "stale_match_count",
        "endorsement_pending_count", "match_confidence",
    ]
    dm_records = _cache.get("deployment_matches", [])
    if dm_records:
        dm_df = pd.DataFrame(dm_records)
        cols_present = [c for c in _DM_ENRICH_COLS if c in dm_df.columns]
        if len(cols_present) > 1:
            freeze_df = freeze_df.merge(dm_df[cols_present], on="skill", how="left")

    # Attach Emplids per skill so the UI can show them on hover
    bench_df = _cache["enriched_bench_df"]
    skill_psid_map: dict[str, list[str]] = (
        bench_df.groupby("Skiil")["Emplid"]
        .apply(lambda s: [str(v) for v in s.dropna().tolist()])
        .to_dict()
    )
    records = _clean_records(freeze_df)
    for row in records:
        row["supply_psids"] = skill_psid_map.get(row.get("skill", ""), [])

    return SafeJSONResponse(content=records)


# ---------------------------------------------------------------------------
# POST /api/bench/run — trigger a fresh full pipeline run
# ---------------------------------------------------------------------------

class RunRequest(BaseModel):
    ris_file: Optional[str] = None


@app.post("/api/bench/run")
def trigger_run(body: RunRequest = RunRequest()):
    """Re-run the full pipeline and refresh the in-memory cache.

    Accepts an optional JSON body:
        {"ris_file": "/path/to/custom_ris.xlsx"}
    If omitted, uses the default data/RIS_Synthetic.xlsx.

    Returns:
        {"status": "success", "run_date": "YYYY-MM-DD", "deployable_bench_count": N,
         "notification_count": N}
    """
    if body.ris_file:
        p = Path(body.ris_file)
        if not p.exists():
            return JSONResponse(
                status_code=400,
                content={"error": "ris_file not found", "path": str(body.ris_file)},
            )
        logger.info("POST /api/bench/run: custom ris_file=%s", body.ris_file)
    else:
        logger.info("POST /api/bench/run: using default RIS file")

    try:
        result = _execute_pipeline(ris_path=body.ris_file)
        _cache.update(result)
        bench_count = len(_cache["enriched_bench_df"])
        notif_count = len(_cache["notifications"])
        logger.info(
            "POST /api/bench/run: complete — bench=%d notifications=%d",
            bench_count, notif_count,
        )
        return SafeJSONResponse(content={
            "status": "success",
            "run_date": str(date.today()),
            "deployable_bench_count": bench_count,
            "notification_count": notif_count,
        })
    except Exception as exc:
        logger.error("POST /api/bench/run: pipeline failed — %s", exc, exc_info=True)
        return JSONResponse(
            status_code=500,
            content={"status": "error", "detail": str(exc)},
        )


# ---------------------------------------------------------------------------
# POST /api/bench/upload — multipart file upload → auto pipeline run
# ---------------------------------------------------------------------------

_DATA_DIR = Path(__file__).parent / "data"
_PROTECTED_RIS = _DATA_DIR / "RIS_Synthetic.xlsx"

# Minimum columns the pipeline requires — upload is rejected if any are missing.
# Column names are compared after stripping whitespace (source data has trailing spaces).
_REQUIRED_RIS_COLUMNS: set[str] = {
    # Identity
    "Emplid",
    # Exclusion filters (exclusion_filters.py will crash without these)
    "Leave type", "BZ resources", "D rated", "Exit",
    "Resignation Submitted Date", "Campus/Lateral", "Campus status",
    "CAO Status", "Current or Future Bench", "Resource Start Date",
    # Stored in bench_dashboard
    "Employee Name", "Grade", "Business Unit", "Pool Description",
    "Country", "Final Status",
    # Skill / feature engineering
    "Skiil", "Resource End Date", "Forecast Date", "Confirm release",
}


@app.post("/api/bench/upload")
async def upload_ris(file: UploadFile = File(...)):
    """Accept a multipart .xlsx upload, save it with a timestamp prefix,
    and immediately trigger a fresh pipeline run.

    TC1: data/RIS_Synthetic.xlsx is NEVER overwritten.
    Saved as: data/RIS_upload_YYYYMMDD_HHMMSS.xlsx

    Returns:
        {"status": "success", "filename": "...",
         "deployable_bench_count": N, "run_date": "YYYY-MM-DD"}
    """
    # Validate extension — accept both .xlsx and .csv
    original_name = file.filename or ""
    lower_name = original_name.lower()
    is_csv  = lower_name.endswith(".csv")
    is_xlsx = lower_name.endswith(".xlsx")
    if not is_csv and not is_xlsx:
        return JSONResponse(
            status_code=400,
            content={
                "status": "error",
                "error": "Invalid file type",
                "detail": f"Expected a .xlsx or .csv file, got: '{original_name}'",
            },
        )

    # Build timestamped filename — never touches RIS_Synthetic.xlsx (TC1)
    ts = datetime.now().strftime("%Y%m%d_%H%M%S")
    safe_name = f"RIS_upload_{ts}.xlsx"
    dest_path = _DATA_DIR / safe_name

    raw_bytes = await file.read()
    if len(raw_bytes) == 0:
        return JSONResponse(
            status_code=400,
            content={"status": "error", "error": "Empty file", "detail": "Uploaded file has no content."},
        )

    import io
    try:
        if is_csv:
            df_upload = pd.read_csv(io.BytesIO(raw_bytes))
        else:
            # Read the first sheet regardless of its name
            df_upload = pd.read_excel(io.BytesIO(raw_bytes), sheet_name=0)
    except Exception as exc:
        return JSONResponse(
            status_code=400,
            content={
                "status": "error",
                "error": "Invalid file",
                "detail": f"Could not parse file: {exc}",
            },
        )

    # Validate required columns — strip whitespace to match source-data quirks
    uploaded_cols = {c.strip() for c in df_upload.columns}
    missing = sorted(_REQUIRED_RIS_COLUMNS - uploaded_cols)
    if missing:
        return JSONResponse(
            status_code=400,
            content={
                "status": "error",
                "error": "Missing required columns",
                "detail": f"File is missing {len(missing)} required column(s): {', '.join(missing)}",
                "missing_columns": missing,
            },
        )

    # Always save as xlsx with sheet named "RIS" — pipeline expects this
    xlsx_buf = io.BytesIO()
    df_upload.to_excel(xlsx_buf, index=False, engine="openpyxl", sheet_name="RIS")
    final_bytes = xlsx_buf.getvalue()

    # Save to data/ directory
    _DATA_DIR.mkdir(parents=True, exist_ok=True)
    dest_path.write_bytes(final_bytes)
    logger.info("POST /api/bench/upload: saved %s (%d bytes)", safe_name, len(raw_bytes))

    # Accumulate this upload into the session — persists until backend restarts
    session_extra = _cache.get("session_extra_ris", [])
    session_extra.append(df_upload.copy())

    # Run pipeline with base RIS + all session uploads combined
    try:
        result = _execute_pipeline(extra_ris_dfs=session_extra)
        _cache.update(result)
        _cache["session_extra_ris"] = session_extra  # restore after update()
        bench_count = len(_cache["enriched_bench_df"])
        logger.info(
            "POST /api/bench/upload: pipeline complete — bench=%d uploads_this_session=%d file=%s",
            bench_count, len(session_extra), safe_name,
        )
        return SafeJSONResponse(content={
            "status": "success",
            "filename": safe_name,
            "deployable_bench_count": bench_count,
            "uploads_this_session": len(session_extra),
            "run_date": str(date.today()),
        })
    except Exception as exc:
        # Roll back the accumulator if the pipeline failed
        session_extra.pop()
        logger.error("POST /api/bench/upload: pipeline failed — %s", exc, exc_info=True)
        return JSONResponse(
            status_code=500,
            content={
                "status": "error",
                "error": "Pipeline failed after upload",
                "detail": str(exc),
            },
        )


# ---------------------------------------------------------------------------
# GET /api/bench/notifications — active notifications from last pipeline run
# ---------------------------------------------------------------------------

@app.get("/api/bench/notifications")
def get_notifications():
    """Return the list of active notifications generated by the last pipeline run.

    Notification types:
      THRESHOLD_BREACH — R3 org slice bench exceeds configured threshold
      HIRING_FREEZE    — R4 skill cluster with bench surplus > 3 over open demand
      AT_RISK          — employees on bench >60 days with no proposed status
    """
    if not _cache["ready"]:
        return _pipeline_error()

    notifications = _cache.get("notifications", [])
    return SafeJSONResponse(content=notifications)


# ---------------------------------------------------------------------------
# GET /api/bench/actions — structured action items from action_advisor
# ---------------------------------------------------------------------------

@app.get("/api/bench/actions")
def get_actions():
    """Return structured action items from the last pipeline run.

    Each item has keys: rule, priority, owner, action, rationale, run_date
    Priorities: IMMEDIATE | 7-DAY | 30-DAY
    """
    if not _cache["ready"]:
        return _pipeline_error()

    return SafeJSONResponse(content=_cache.get("actions", []))


# ---------------------------------------------------------------------------
# GET /api/bench/digest — daily executive digest
# ---------------------------------------------------------------------------

@app.get("/api/bench/digest")
def get_digest():
    """Return the daily executive digest from the last pipeline run.

    Keys: run_date, total_bench, at_risk_count, nafd_count, nafd_pct,
          proposed_count, breached_slices, forecasted_breach_slices,
          freeze_recommended_skills, combined_surplus,
          bench_7d_forecast, bench_30d_forecast,
          aging_breakdown, top_3_org_slices, summary_text
    """
    if not _cache["ready"]:
        return _pipeline_error()

    return SafeJSONResponse(content=_cache.get("digest", {}))


# ---------------------------------------------------------------------------
# GET /api/bench/rm-nudges — RM nudge cards
# ---------------------------------------------------------------------------

@app.get("/api/bench/rm-nudges")
def get_rm_nudges():
    """Return per-nudge RM action cards from the last pipeline run.

    Each nudge has keys:
        nudge_id, category, org_slice_or_skill, nudge_text,
        supporting_data, run_date

    Categories: AT_RISK | THRESHOLD_BREACH | HIRING_FREEZE | FORECASTED_BREACH
    """
    if not _cache["ready"]:
        return _pipeline_error()

    return SafeJSONResponse(content=_cache.get("rm_nudges", []))


# ---------------------------------------------------------------------------
# GET /api/bench/deployment-matches — skill coverage vs open demand
# ---------------------------------------------------------------------------

@app.get("/api/bench/deployment-matches")
def get_deployment_matches():
    """Return skill-level deployment coverage vs open SO demand.

    Each row has keys:
        skill, bench_count, open_demand_count, matched_count,
        gap, coverage_pct, coverage_label, run_date

    coverage_label: FULL | PARTIAL | NONE
    Sorted by gap descending (largest unmet demand first).
    """
    if not _cache["ready"]:
        return _pipeline_error()

    return SafeJSONResponse(content=_cache.get("deployment_matches", []))


@app.get("/api/bench/download")
def download_excel():
    """Serve the latest generated Excel dashboard file.

    Looks for BA_Dashboard_*.xlsx in the output_files/ directory and
    returns the most recently modified one.
    """
    output_dir = Path(__file__).parent / "output_files"
    if not output_dir.exists():
        return JSONResponse(status_code=404, content={"detail": "No output directory found. Run the pipeline first."})

    files = sorted(output_dir.glob("BA_Dashboard_*.xlsx"), key=lambda p: p.stat().st_mtime, reverse=True)
    if not files:
        return JSONResponse(status_code=404, content={"detail": "No Excel report found. Run the pipeline first."})

    latest = files[0]
    return FileResponse(
        path=str(latest),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        filename=latest.name,
    )


# ---------------------------------------------------------------------------
# POST /api/bench/notify-teams — send an Adaptive Card to a Teams channel
# ---------------------------------------------------------------------------

class TeamsPayload(BaseModel):
    message: str
    severity: str = "MEDIUM"
    action_type: str = "ALERT"


@app.post("/api/bench/notify-teams")
async def notify_teams(payload: TeamsPayload):
    """Send a Bench Agent alert as an Adaptive Card to a Teams channel.

    Reads TEAMS_WEBHOOK_URL from env. Returns {"status": "skipped"} if not set.
    """
    webhook_url = os.getenv("TEAMS_WEBHOOK_URL", "").strip()
    if not webhook_url:
        return SafeJSONResponse(content={"status": "skipped", "reason": "TEAMS_WEBHOOK_URL not configured"})

    card = {
        "type": "message",
        "attachments": [{
            "contentType": "application/vnd.microsoft.card.adaptive",
            "content": {
                "$schema": "http://adaptivecards.io/schemas/adaptive-card.json",
                "type": "AdaptiveCard",
                "version": "1.4",
                "body": [
                    {
                        "type": "TextBlock",
                        "text": "🔔 Bench Agent Alert",
                        "weight": "Bolder",
                        "size": "Large",
                    },
                    {
                        "type": "TextBlock",
                        "text": payload.message,
                        "wrap": True,
                    },
                    {
                        "type": "FactSet",
                        "facts": [
                            {"title": "Severity",  "value": payload.severity},
                            {"title": "Type",      "value": payload.action_type},
                            {"title": "Time",      "value": datetime.now().strftime("%Y-%m-%d %H:%M")},
                        ],
                    },
                ],
                "actions": [
                    {
                        "type": "Action.OpenUrl",
                        "title": "Open Dashboard",
                        "url": "http://localhost:5173",
                    }
                ],
            },
        }],
    }

    try:
        async with httpx.AsyncClient() as client:
            r = await client.post(webhook_url, json=card, timeout=5.0)
        return SafeJSONResponse(content={"status": "sent", "teams_status": r.status_code})
    except Exception as exc:
        logger.warning("notify_teams: request failed — %s", exc)
        return JSONResponse(status_code=502, content={"status": "error", "reason": str(exc)})
