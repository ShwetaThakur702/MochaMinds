"""
pipeline/digest_generator.py — daily executive digest and RM nudges.

TC2 COMPLIANCE: no Emplid, no employee names. Only counts, org slices,
skill cluster names, and aggregated metrics appear in output.

Exposes two functions:
    generate_daily_digest()   → dict (executive summary blob)
    generate_rm_nudges()      → list[dict] (per-nudge RM action cards)
"""
from __future__ import annotations

import logging
from datetime import date, timedelta

import pandas as pd

logger = logging.getLogger(__name__)

_PROPOSED_STATUSES = {"Proposed - Feedback Awaiting", "Proposed - Pending Interview"}


# ---------------------------------------------------------------------------
# Daily digest
# ---------------------------------------------------------------------------

def generate_daily_digest(
    enriched_bench_df: pd.DataFrame,
    r1_snapshot: dict,
    r2_daily_forecast_df: pd.DataFrame,
    r3_alerts_df: pd.DataFrame,
    r4_freeze_df: pd.DataFrame,
) -> dict:
    """Produce a single-page executive digest summarising the current bench state.

    Parameters
    ----------
    enriched_bench_df      : output of engineer_features()
    r1_snapshot            : output of compute_bench_snapshot()
    r2_daily_forecast_df   : output of compute_daily_forecast()
    r3_alerts_df           : output of compute_threshold_alerts()
    r4_freeze_df           : output of compute_hiring_freeze()

    Returns
    -------
    dict with keys:
        run_date, total_bench, at_risk_count, nafd_count, nafd_pct,
        proposed_count, current_bench_count,
        breached_slices, forecasted_breach_slices,
        freeze_recommended_skills, combined_surplus,
        bench_7d_forecast, bench_30d_forecast,
        aging_breakdown, top_3_org_slices, summary_text
    """
    run_date = str(date.today())
    total_bench = int(r1_snapshot.get("total_headcount", max(len(enriched_bench_df), 1)))

    # At-risk
    at_risk_mask = (
        enriched_bench_df["bench_aging_derived"].notna()
        & (enriched_bench_df["bench_aging_derived"] > 60)
        & (~enriched_bench_df["Final Status"].isin(_PROPOSED_STATUSES))
    )
    at_risk_count = int(at_risk_mask.sum())

    # NAFD
    nafd_count = int(r1_snapshot.get("status_counts", {}).get("nafd", 0))
    nafd_pct = round(nafd_count / total_bench * 100, 1) if total_bench > 0 else 0.0

    # Proposed
    proposed_count = int(
        enriched_bench_df["Final Status"]
        .isin(_PROPOSED_STATUSES)
        .sum()
    )

    # R3 breach summary
    breached_slices: list[str] = []
    forecasted_breach_slices: list[str] = []
    if r3_alerts_df is not None and not r3_alerts_df.empty:
        if "is_breached" in r3_alerts_df.columns:
            breached_slices = r3_alerts_df[r3_alerts_df["is_breached"] == True]["org_slice"].tolist()
        if "forecasted_breach" in r3_alerts_df.columns:
            forecasted_breach_slices = r3_alerts_df[
                (~r3_alerts_df["is_breached"]) & (r3_alerts_df["forecasted_breach"] == True)
            ]["org_slice"].tolist()

    # R4 freeze summary
    freeze_recommended_skills: list[str] = []
    combined_surplus = 0
    if r4_freeze_df is not None and not r4_freeze_df.empty:
        freeze_rows = r4_freeze_df[r4_freeze_df["freeze_recommended"] == True]
        freeze_recommended_skills = freeze_rows["skill"].tolist()
        combined_surplus = int(freeze_rows["supply_surplus"].sum())

    # R2 7-day and 30-day max forecast
    bench_7d_forecast = 0
    bench_30d_forecast = 0
    if r2_daily_forecast_df is not None and not r2_daily_forecast_df.empty:
        df_7 = r2_daily_forecast_df[r2_daily_forecast_df["bucket"] == "7d"]
        df_30 = r2_daily_forecast_df[r2_daily_forecast_df["bucket"] == "30d"]
        if not df_7.empty:
            bench_7d_forecast = int(df_7["total_forecast_bench"].max())
        if not df_30.empty:
            bench_30d_forecast = int(df_30["total_forecast_bench"].max())

    # Aging breakdown
    aging_breakdown: dict[str, int] = {}
    if "aging_bucket" in enriched_bench_df.columns:
        aging_breakdown = {
            str(k): int(v)
            for k, v in enriched_bench_df["aging_bucket"].value_counts().items()
        }

    # Top 3 org slices by headcount
    top_3_org_slices: dict[str, int] = {}
    if "org_slice_key" in enriched_bench_df.columns:
        top_3 = (
            enriched_bench_df[enriched_bench_df["org_slice_key"] != "UNMAPPED"]
            .groupby("org_slice_key")
            .size()
            .sort_values(ascending=False)
            .head(3)
        )
        top_3_org_slices = {str(k): int(v) for k, v in top_3.items()}

    # Plain-English summary text (no PII)
    breach_txt = (
        f"{len(breached_slices)} org slice(s) currently breaching threshold "
        f"({', '.join(breached_slices[:3])}{'…' if len(breached_slices) > 3 else ''})"
        if breached_slices else "No threshold breaches today"
    )
    freeze_txt = (
        f"Hiring freeze recommended for {len(freeze_recommended_skills)} skill cluster(s) "
        f"(combined surplus: {combined_surplus})"
        if freeze_recommended_skills else "No hiring freeze advisories"
    )
    summary_text = (
        f"As of {run_date}: {total_bench} deployable bench employees. "
        f"{at_risk_count} at-risk (>60 days, no proposed status). "
        f"NAFD: {nafd_count} ({nafd_pct}%). "
        f"Proposed: {proposed_count}. "
        f"{breach_txt}. "
        f"{freeze_txt}. "
        f"7-day bench forecast peak: {bench_7d_forecast}. "
        f"30-day bench forecast peak: {bench_30d_forecast}."
    )

    digest = {
        "run_date": run_date,
        "total_bench": total_bench,
        "at_risk_count": at_risk_count,
        "nafd_count": nafd_count,
        "nafd_pct": nafd_pct,
        "proposed_count": proposed_count,
        "breached_slices": breached_slices,
        "forecasted_breach_slices": forecasted_breach_slices,
        "freeze_recommended_skills": freeze_recommended_skills,
        "combined_surplus": combined_surplus,
        "bench_7d_forecast": bench_7d_forecast,
        "bench_30d_forecast": bench_30d_forecast,
        "aging_breakdown": aging_breakdown,
        "top_3_org_slices": top_3_org_slices,
        "summary_text": summary_text,
    }

    logger.info(
        "digest: total=%d at_risk=%d breached=%d freeze_skills=%d",
        total_bench, at_risk_count, len(breached_slices), len(freeze_recommended_skills),
    )
    return digest


# ---------------------------------------------------------------------------
# RM nudges
# ---------------------------------------------------------------------------

def generate_rm_nudges(
    enriched_bench_df: pd.DataFrame,
    r3_alerts_df: pd.DataFrame,
    r4_freeze_df: pd.DataFrame,
) -> list[dict]:
    """Generate concise nudge cards targeted at Resource Managers.

    Each nudge is a short, copy-paste-ready action sentence with context.

    Returns
    -------
    list of dicts, each with keys:
        nudge_id, category, org_slice_or_skill, nudge_text, supporting_data, run_date
    """
    nudges: list[dict] = []
    run_date = str(date.today())
    nudge_id = 1

    def _make_nudge(
        nid: int,
        category: str,
        target: str,
        nudge_text: str,
        supporting_data: dict,
    ) -> dict:
        urgency = "HIGH" if category == "AT_RISK" else "MEDIUM"
        data_lines = "; ".join(f"{k}: {v}" for k, v in supporting_data.items())
        email_subject = f"Action Required — Bench Status: {target}"
        email_body = (
            f"Hi Resource Manager,\n\n"
            f"This is an automated bench alert from the Bench Agent.\n\n"
            f"{nudge_text}\n\n"
            f"Supporting data: {data_lines}\n\n"
            f"Please take action within the recommended timeframe.\n\n"
            f"— Bench Agent (advisory only)"
        )
        return {
            "nudge_id": nid,
            "category": category,
            "org_slice_or_skill": target,
            "nudge_text": nudge_text,
            "supporting_data": supporting_data,
            "run_date": run_date,
            "email_subject": email_subject,
            "email_body": email_body,
            "urgency": urgency,
        }

    # Nudge type 1: At-risk employees per org slice
    at_risk_mask = (
        enriched_bench_df["bench_aging_derived"].notna()
        & (enriched_bench_df["bench_aging_derived"] > 60)
        & (~enriched_bench_df["Final Status"].isin(_PROPOSED_STATUSES))
    )
    at_risk_df = enriched_bench_df[at_risk_mask]
    if not at_risk_df.empty and "org_slice_key" in at_risk_df.columns:
        per_slice = (
            at_risk_df.groupby("org_slice_key", dropna=False)
            .size()
            .sort_values(ascending=False)
        )
        for org_slice, count in per_slice.items():
            if str(org_slice) == "UNMAPPED":
                continue
            nudges.append(_make_nudge(
                nudge_id, "AT_RISK", str(org_slice),
                (
                    f"Action required: {count} employee{'s' if count != 1 else ''} in "
                    f"{org_slice} on bench >60 days with no proposed assignment. "
                    f"Initiate deployment push today."
                ),
                {"at_risk_count": int(count), "bench_threshold_days": 60},
            ))
            nudge_id += 1

    # Nudge type 2: Active threshold breaches
    if r3_alerts_df is not None and not r3_alerts_df.empty and "is_breached" in r3_alerts_df.columns:
        breached = r3_alerts_df[r3_alerts_df["is_breached"] == True]
        for _, row in breached.iterrows():
            nudges.append(_make_nudge(
                nudge_id, "THRESHOLD_BREACH", str(row["org_slice"]),
                (
                    f"URGENT: {row['org_slice']} bench ({int(row['current_bench_count'])}) "
                    f"exceeds threshold ({int(row['bench_threshold'])}) by "
                    f"{int(row['breach_amount'])}. Activate hiring freeze advisory and "
                    f"accelerate demand matching immediately."
                ),
                {
                    "current_bench_count": int(row["current_bench_count"]),
                    "bench_threshold": int(row["bench_threshold"]),
                    "breach_amount": int(row["breach_amount"]),
                    "alert_severity": str(row["alert_severity"]),
                },
            ))
            nudge_id += 1

    # Nudge type 3: Hiring freeze advisories
    if r4_freeze_df is not None and not r4_freeze_df.empty:
        freeze_rows = r4_freeze_df[r4_freeze_df["freeze_recommended"] == True]
        for _, row in freeze_rows.iterrows():
            nudges.append(_make_nudge(
                nudge_id, "HIRING_FREEZE", str(row["skill"]),
                (
                    f"Pause new hiring for '{row['skill']}': supply ({int(row['total_supply'])}) "
                    f"exceeds open demand ({int(row['open_demand_count'])}) by "
                    f"{int(row['supply_surplus'])}. Review active job requisitions."
                ),
                {
                    "total_supply": int(row["total_supply"]),
                    "open_demand_count": int(row["open_demand_count"]),
                    "supply_surplus": int(row["supply_surplus"]),
                },
            ))
            nudge_id += 1

    # Nudge type 4: Forecasted breaches (pre-emptive)
    if r3_alerts_df is not None and "forecasted_breach" in r3_alerts_df.columns:
        pre_breach = r3_alerts_df[
            (~r3_alerts_df["is_breached"]) & (r3_alerts_df["forecasted_breach"] == True)
        ]
        for _, row in pre_breach.iterrows():
            nudges.append(_make_nudge(
                nudge_id, "FORECASTED_BREACH", str(row["org_slice"]),
                (
                    f"Pre-emptive alert: {row['org_slice']} is within threshold now "
                    f"({int(row['current_bench_count'])}/{int(row['bench_threshold'])}), "
                    f"but {int(row.get('forecasted_bench_30d', 0))} upcoming releases will "
                    f"push it over within 30 days. Engage demand pipeline this week."
                ),
                {
                    "current_bench_count": int(row["current_bench_count"]),
                    "bench_threshold": int(row["bench_threshold"]),
                    "forecasted_bench_30d": int(row.get("forecasted_bench_30d", 0)),
                },
            ))
            nudge_id += 1

    logger.info("rm_nudges: %d nudges generated", len(nudges))
    return nudges
