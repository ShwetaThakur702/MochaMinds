"""
pipeline/action_advisor.py — structured action items from R1/R2/R3/R4 outputs.

TC2 COMPLIANCE: no Emplid, no employee names. Only counts, org slices,
and skill cluster names appear in output.

Action horizons:
  IMMEDIATE — act today / within 24 h
  7-DAY     — act within the next week
  30-DAY    — strategic, coming month
"""
from __future__ import annotations

import logging
from datetime import date

import pandas as pd

logger = logging.getLogger(__name__)

_PROPOSED_STATUSES = {"Proposed - Feedback Awaiting", "Proposed - Pending Interview"}


def run_action_advisor(
    enriched_bench_df: pd.DataFrame,
    r1_snapshot: dict,
    r2_daily_forecast_df: pd.DataFrame,
    r3_alerts_df: pd.DataFrame,
    r4_freeze_df: pd.DataFrame,
) -> list[dict]:
    """Generate structured action items from pipeline rule outputs.

    Parameters
    ----------
    enriched_bench_df      : output of engineer_features()
    r1_snapshot            : output of compute_bench_snapshot()
    r2_daily_forecast_df   : output of compute_daily_forecast()
    r3_alerts_df           : output of compute_threshold_alerts()
    r4_freeze_df           : output of compute_hiring_freeze()

    Returns
    -------
    list of dicts, each with keys:
        rule, priority, owner, action, rationale, run_date
    Sorted: IMMEDIATE → 7-DAY → 30-DAY.
    """
    actions: list[dict] = []
    run_date = str(date.today())
    total_bench = int(r1_snapshot.get("total_headcount", max(len(enriched_bench_df), 1)))

    # ==================================================================
    # IMMEDIATE
    # ==================================================================

    # 1a. At-risk employees — bench > 60 days, no proposed status
    at_risk_mask = (
        enriched_bench_df["bench_aging_derived"].notna()
        & (enriched_bench_df["bench_aging_derived"] > 60)
        & (~enriched_bench_df["Final Status"].isin(_PROPOSED_STATUSES))
    )
    at_risk_count = int(at_risk_mask.sum())
    if at_risk_count > 0:
        top_orgs = (
            enriched_bench_df[at_risk_mask]
            .groupby("org_slice_key", dropna=False)
            .size()
            .sort_values(ascending=False)
            .head(3)
        )
        org_detail = ", ".join(f"{k}: {v}" for k, v in top_orgs.items()
                               if str(k) != "UNMAPPED")
        actions.append({
            "rule": "R1",
            "priority": "IMMEDIATE",
            "owner": "RM / Staffing Lead",
            "action": (
                f"Initiate deployment push for {at_risk_count} at-risk "
                f"bench employee{'s' if at_risk_count != 1 else ''} "
                f"(>60 days bench, no proposed status)"
            ),
            "rationale": (
                f"{at_risk_count} employees have been on bench >60 days without a proposed "
                f"status. Top org slices: {org_detail or 'various'}. "
                f"Every idle day raises bench cost and reduces redeployability."
            ),
            "run_date": run_date,
        })

    # 1b. Active R3 threshold breaches
    if r3_alerts_df is not None and not r3_alerts_df.empty:
        breached = r3_alerts_df[r3_alerts_df["is_breached"] == True]
        for _, row in breached.iterrows():
            actions.append({
                "rule": "R3",
                "priority": "IMMEDIATE",
                "owner": "BU Head / RM",
                "action": (
                    f"Review bench pipeline for {row['org_slice']} — "
                    f"threshold exceeded by {int(row['breach_amount'])}"
                ),
                "rationale": (
                    f"{row['org_slice']} bench ({int(row['current_bench_count'])}) exceeds "
                    f"configured threshold ({int(row['bench_threshold'])}). "
                    f"Severity: {row['alert_severity']}. "
                    f"Activate hiring freeze advisory and accelerate demand matching."
                ),
                "run_date": run_date,
            })

    # ==================================================================
    # 7-DAY
    # ==================================================================

    # 2a. NAFD > 20 % of bench
    nafd_count = int(r1_snapshot.get("status_counts", {}).get("nafd", 0))
    nafd_pct = nafd_count / total_bench * 100 if total_bench > 0 else 0
    if nafd_pct > 20:
        actions.append({
            "rule": "R1",
            "priority": "7-DAY",
            "owner": "Staffing / Project Lead",
            "action": (
                f"Investigate NAFD population — {nafd_count} employees "
                f"({nafd_pct:.0f}% of bench) in NAFD status"
            ),
            "rationale": (
                f"NAFD represents {nafd_pct:.0f}% of bench (threshold: 20%). "
                f"Determine which NAFD reasons are resolvable and reassign "
                f"where possible to reduce this figure within 7 days."
            ),
            "run_date": run_date,
        })

    # 2b. Low-confidence releases in the 30-day window
    if r2_daily_forecast_df is not None and not r2_daily_forecast_df.empty:
        thirty_day = r2_daily_forecast_df[r2_daily_forecast_df["bucket"] == "30d"]
        if not thirty_day.empty:
            max_row = thirty_day.loc[thirty_day["total_forecast_bench"].idxmax()]
            low_conf = int(max_row.get("projected_count", 0))
            if low_conf > 0:
                actions.append({
                    "rule": "R2",
                    "priority": "7-DAY",
                    "owner": "Project RM / Delivery Manager",
                    "action": (
                        f"Confirm or update {low_conf} projected (low-confidence) "
                        f"releases in the 30-day window"
                    ),
                    "rationale": (
                        f"{low_conf} upcoming releases carry MEDIUM/LOW confidence. "
                        f"Stale release dates degrade forecast accuracy. "
                        f"Request updated status from delivery managers by end of week."
                    ),
                    "run_date": run_date,
                })

    # 2c. Org slices currently OK but forecast to breach within 30 days
    if r3_alerts_df is not None and "forecasted_breach" in r3_alerts_df.columns:
        pre_breach = r3_alerts_df[
            (~r3_alerts_df["is_breached"]) & (r3_alerts_df["forecasted_breach"] == True)
        ]
        for _, row in pre_breach.iterrows():
            actions.append({
                "rule": "R3",
                "priority": "7-DAY",
                "owner": "BU Head / RM",
                "action": (
                    f"Pre-empt forecasted bench breach for {row['org_slice']} "
                    f"— {int(row.get('forecasted_bench_30d', 0))} releases incoming"
                ),
                "rationale": (
                    f"{row['org_slice']} current bench ({int(row['current_bench_count'])}) "
                    f"is within threshold ({int(row['bench_threshold'])}), but "
                    f"{int(row.get('forecasted_bench_30d', 0))} upcoming releases will push "
                    f"it over within 30 days. Engage demand pipeline proactively now."
                ),
                "run_date": run_date,
            })

    # ==================================================================
    # 30-DAY
    # ==================================================================

    # 3. Hiring freeze recommendations from R4
    if r4_freeze_df is not None and not r4_freeze_df.empty:
        freeze_candidates = r4_freeze_df[r4_freeze_df["freeze_recommended"] == True]
        if not freeze_candidates.empty:
            skill_list = freeze_candidates["skill"].tolist()
            surplus_total = int(freeze_candidates["supply_surplus"].sum())
            preview = ", ".join(skill_list[:5])
            suffix = f" (+{len(skill_list) - 5} more)" if len(skill_list) > 5 else ""
            actions.append({
                "rule": "R4",
                "priority": "30-DAY",
                "owner": "Talent Acquisition / BU Head",
                "action": (
                    f"Implement hiring freeze for {len(skill_list)} skill cluster(s): "
                    f"{preview}{suffix}"
                ),
                "rationale": (
                    f"Bench supply exceeds open demand for {len(skill_list)} skill clusters "
                    f"(combined surplus: {surplus_total}). Continuing recruitment inflates "
                    f"bench cost without matching deployment opportunity."
                ),
                "run_date": run_date,
            })

    priority_order = {"IMMEDIATE": 0, "7-DAY": 1, "30-DAY": 2}
    actions.sort(key=lambda a: priority_order.get(a["priority"], 9))

    logger.info(
        "action_advisor: %d actions (%d IMMEDIATE, %d 7-DAY, %d 30-DAY)",
        len(actions),
        sum(1 for a in actions if a["priority"] == "IMMEDIATE"),
        sum(1 for a in actions if a["priority"] == "7-DAY"),
        sum(1 for a in actions if a["priority"] == "30-DAY"),
    )
    return actions
