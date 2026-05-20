import logging

import numpy as np
import pandas as pd

from pipeline.feature_engineering import add_staleness_flag

logger = logging.getLogger(__name__)


def compute_hiring_freeze(
    deployable_bench_df: pd.DataFrame,
    so_ageing_df: pd.DataFrame,
    skill_df: pd.DataFrame,
) -> pd.DataFrame:
    """Compute R4 rule-based hiring freeze advisory.

    TC2 COMPLIANCE: Returns only aggregated skill-level statistics.
    No Emplid, employee names, or individual rows are included in the output.

    Fix 3: Adds coverage_ratio and understaffing_severity per skill cluster.
      SURPLUS  — ratio > 1.0  (freeze candidate)
      ADEQUATE — ratio 0.5–1.0
      SHORTAGE — ratio 0.2–0.5
      CRITICAL — ratio < 0.2  (escalate alongside R3 threshold alerts)

    Parameters
    ----------
    deployable_bench_df : enriched deployable bench from engineer_features()
    so_ageing_df        : SO Ageing filtered to Active + Open/Recruit (from Phase 1)
    skill_df            : Skill_Data_Synthetic, unfiltered

    Returns
    -------
    pd.DataFrame — one row per skill with supply/demand/freeze/severity fields.
    """
    run_date = pd.Timestamp.today().date().isoformat()

    # ------------------------------------------------------------------
    # Step 1 — Supply side
    # ------------------------------------------------------------------
    bench_supply = (
        deployable_bench_df.groupby("Skiil")
        .size()
        .reset_index(name="bench_count")
        .rename(columns={"Skiil": "skill"})
    )

    near_term_mask = (
        deployable_bench_df["Releases in Next 30 days and beyond"] == "Release in 30 days"
    )
    near_term = (
        deployable_bench_df[near_term_mask]
        .groupby("Skiil")
        .size()
        .reset_index(name="near_term_releases")
        .rename(columns={"Skiil": "skill"})
    )

    supply = bench_supply.merge(near_term, on="skill", how="left")
    supply["near_term_releases"] = supply["near_term_releases"].fillna(0).astype(int)
    supply["total_supply"]       = supply["bench_count"] + supply["near_term_releases"]

    logger.info("R4 supply: %d skills across %d bench employees", len(supply), len(deployable_bench_df))

    # ------------------------------------------------------------------
    # Step 2 — Demand side (SO Ageing already filtered in Phase 1)
    # ------------------------------------------------------------------
    demand = (
        so_ageing_df.groupby("Primary Skill Description")
        .size()
        .reset_index(name="open_demand_count")
        .rename(columns={"Primary Skill Description": "skill"})
    )

    logger.info("R4 demand: %d skills across %d open SO lines", len(demand), len(so_ageing_df))

    # ------------------------------------------------------------------
    # Step 3 — Supply vs demand gap
    # ------------------------------------------------------------------
    gap = supply.merge(demand, on="skill", how="outer").fillna(0)
    gap["bench_count"]        = gap["bench_count"].astype(int)
    gap["near_term_releases"] = gap["near_term_releases"].astype(int)
    gap["total_supply"]       = gap["total_supply"].astype(int)
    gap["open_demand_count"]  = gap["open_demand_count"].astype(int)

    gap["supply_surplus"]     = gap["total_supply"] - gap["open_demand_count"]
    gap["freeze_recommended"] = gap["supply_surplus"] > 0

    # Fix 3 — Coverage ratio and understaffing severity
    gap["coverage_ratio"] = gap.apply(
        lambda r: round(r["total_supply"] / r["open_demand_count"], 2)
        if r["open_demand_count"] > 0 else np.inf,
        axis=1,
    )

    def _understaffing_severity(row) -> str:
        ratio = row["coverage_ratio"]
        if row["freeze_recommended"]:
            return "SURPLUS"
        if ratio is np.inf or ratio >= 0.5:
            return "ADEQUATE"
        if ratio >= 0.2:
            return "SHORTAGE"
        return "CRITICAL"

    gap["understaffing_severity"] = gap.apply(_understaffing_severity, axis=1)

    critical_count = int((gap["understaffing_severity"] == "CRITICAL").sum())
    shortage_count = int((gap["understaffing_severity"] == "SHORTAGE").sum())
    logger.info(
        "R4 understaffing: CRITICAL=%d, SHORTAGE=%d skills",
        critical_count, shortage_count,
    )

    gap["advisory_note"] = gap.apply(
        lambda r: (
            f"Supply ({int(r['total_supply'])}) exceeds demand ({int(r['open_demand_count'])}) "
            f"by {int(r['supply_surplus'])} for skill '{r['skill']}'. Recommend hiring pause."
            if r["freeze_recommended"] else
            f"Demand ({int(r['open_demand_count'])}) exceeds supply ({int(r['total_supply'])}) "
            f"by {int(abs(r['supply_surplus']))} for skill '{r['skill']}'. No freeze needed."
        ),
        axis=1,
    )

    # ------------------------------------------------------------------
    # Step 4 — Skill enrichment: avg bench rating per skill (TC2 compliant)
    # ------------------------------------------------------------------
    skill_bench = skill_df[skill_df["Bench/Non Bench"] == "Bench"].copy()

    enriched_skills = skill_bench.merge(
        deployable_bench_df[["Emplid", "Skiil"]],
        left_on="Employee ID",
        right_on="Emplid",
        how="inner",
    )

    avg_rating = (
        enriched_skills.groupby("Skiil")["Overall Rating"]
        .mean()
        .round(2)
        .reset_index()
        .rename(columns={"Skiil": "skill", "Overall Rating": "avg_skill_rating"})
    )

    gap = gap.merge(avg_rating, on="skill", how="left")
    gap["avg_skill_rating"] = gap["avg_skill_rating"].round(2)
    gap["run_date"] = run_date

    freeze_count  = gap["freeze_recommended"].sum()
    deficit_count = (~gap["freeze_recommended"]).sum()
    logger.info(
        "R4: %d skills analysed — %d freeze recommended, %d demand exceeds supply",
        len(gap), freeze_count, deficit_count,
    )

    cols = [
        "skill", "bench_count", "near_term_releases", "total_supply",
        "open_demand_count", "supply_surplus", "freeze_recommended",
        "avg_skill_rating", "advisory_note",
        "coverage_ratio", "understaffing_severity",
        "run_date",
    ]
    return gap[cols].sort_values("supply_surplus", ascending=False).reset_index(drop=True)


def compute_deployment_matches(
    enriched_bench_df: pd.DataFrame,
    so_ageing_df: pd.DataFrame,
    skill_df: pd.DataFrame,
) -> pd.DataFrame:
    """Match deployable bench supply to open SO demand by skill.

    Fix 1 — Endorsement filter:
      Only Endorsed skill records contribute to HIGH-confidence matches.
      Skills matched only via Pending endorsements get match_confidence='LOW'.
      endorsement_pending_count: potential matches pending endorsement approval.

    Fix 2 — Staleness filter:
      Stale skill records (Last Used < current_year - 2) are excluded from
      matched_count. stale_match_count shows the hidden risk.
      matched_count uses only fresh (non-stale) endorsed records.

    TC2 COMPLIANCE: returns only aggregated skill-level counts — no Emplid.

    Parameters
    ----------
    enriched_bench_df : output of engineer_features()
    so_ageing_df      : SO Ageing filtered to Active + Open/Recruit
    skill_df          : Skill_Data_Synthetic (for endorsement + staleness data)

    Returns
    -------
    pd.DataFrame — one row per skill with columns:
        skill, bench_count, open_demand_count,
        matched_count, endorsed_match_count, stale_match_count,
        endorsement_pending_count, match_confidence,
        gap, coverage_pct, coverage_label, run_date
    Sorted by gap descending (largest unmet demand first).
    """
    run_date = pd.Timestamp.today().date().isoformat()

    # ------------------------------------------------------------------
    # Fix 1+2: Build endorsed/pending × fresh/stale breakdown per Skiil
    # ------------------------------------------------------------------
    skill_bench = skill_df[skill_df["Bench/Non Bench"] == "Bench"].copy()
    skill_bench = add_staleness_flag(skill_bench)

    # Join skill records to deployable bench on Employee ID = Emplid
    skill_enriched = skill_bench.merge(
        enriched_bench_df[["Emplid", "Skiil"]],
        left_on="Employee ID",
        right_on="Emplid",
        how="inner",
    )

    # Count distinct bench employees per Skiil × endorsement × freshness
    # (one employee can have multiple skill records — count distinct Emplid)
    endorsed_fresh = (
        skill_enriched[
            (skill_enriched["Endorsement Status"] == "Endorsed") &
            (~skill_enriched["is_stale"])
        ]
        .groupby("Skiil")["Emplid"]
        .nunique()
        .reset_index(name="endorsed_fresh_count")
        .rename(columns={"Skiil": "skill"})
    )

    pending_fresh = (
        skill_enriched[
            (skill_enriched["Endorsement Status"] == "Pending") &
            (~skill_enriched["is_stale"])
        ]
        .groupby("Skiil")["Emplid"]
        .nunique()
        .reset_index(name="pending_fresh_count")
        .rename(columns={"Skiil": "skill"})
    )

    stale_any = (
        skill_enriched[skill_enriched["is_stale"]]
        .groupby("Skiil")["Emplid"]
        .nunique()
        .reset_index(name="stale_count")
        .rename(columns={"Skiil": "skill"})
    )

    # ------------------------------------------------------------------
    # Raw bench and demand counts (used for display totals)
    # ------------------------------------------------------------------
    bench_by_skill = (
        enriched_bench_df.groupby("Skiil", dropna=False)
        .size()
        .reset_index(name="bench_count")
        .rename(columns={"Skiil": "skill"})
    )
    bench_by_skill["skill"] = bench_by_skill["skill"].fillna("Unknown")

    demand_by_skill = (
        so_ageing_df.groupby("Primary Skill Description", dropna=False)
        .size()
        .reset_index(name="open_demand_count")
        .rename(columns={"Primary Skill Description": "skill"})
    )
    demand_by_skill["skill"] = demand_by_skill["skill"].fillna("Unknown")

    # Outer join all components
    merged = (
        bench_by_skill
        .merge(demand_by_skill,  on="skill", how="outer")
        .merge(endorsed_fresh,   on="skill", how="left")
        .merge(pending_fresh,    on="skill", how="left")
        .merge(stale_any,        on="skill", how="left")
        .fillna(0)
    )

    for col in ["bench_count", "open_demand_count", "endorsed_fresh_count",
                "pending_fresh_count", "stale_count"]:
        merged[col] = merged[col].astype(int)

    # Fix 1: endorsed_match_count = min(endorsed_fresh, demand)
    # If endorsed = 0 but pending > 0, fall back to pending matches (LOW confidence)
    merged["endorsed_match_count"] = merged[["endorsed_fresh_count", "open_demand_count"]].min(axis=1)
    merged["pending_only"] = (merged["endorsed_fresh_count"] == 0) & (merged["pending_fresh_count"] > 0)
    merged["matched_count"] = merged.apply(
        lambda r: min(r["pending_fresh_count"], r["open_demand_count"])
        if r["pending_only"] else r["endorsed_match_count"],
        axis=1,
    ).astype(int)

    # Fix 2: stale_match_count = min(stale, unmet demand after fresh matches)
    merged["stale_match_count"] = merged.apply(
        lambda r: min(r["stale_count"], max(0, r["open_demand_count"] - r["matched_count"])),
        axis=1,
    ).astype(int)

    # Fix 1: match_confidence
    # HIGH  — endorsed fresh records cover demand
    # LOW   — only pending or stale records match (no endorsed fresh)
    # NONE  — no bench supply exists for this skill
    merged["endorsement_pending_count"] = merged["pending_fresh_count"].astype(int)

    def _match_confidence(row) -> str:
        if row["bench_count"] == 0:
            return "NONE"
        if row["endorsed_fresh_count"] > 0:
            return "HIGH"
        return "LOW"

    merged["match_confidence"] = merged.apply(_match_confidence, axis=1)

    # Gap = unmet demand (after endorsed fresh matching)
    merged["gap"] = (merged["open_demand_count"] - merged["matched_count"]).clip(lower=0).astype(int)

    # Coverage %
    merged["coverage_pct"] = merged.apply(
        lambda r: round(r["matched_count"] / r["open_demand_count"] * 100, 1)
        if r["open_demand_count"] > 0 else 0.0,
        axis=1,
    )

    # Coverage label (based on endorsed fresh matched count)
    def _label(row) -> str:
        if row["open_demand_count"] == 0:
            return "NONE"
        if row["matched_count"] >= row["open_demand_count"]:
            return "FULL"
        if row["matched_count"] > 0:
            return "PARTIAL"
        return "NONE"

    merged["coverage_label"] = merged.apply(_label, axis=1)
    merged["run_date"] = run_date

    cols = [
        "skill", "bench_count", "open_demand_count",
        "matched_count", "endorsed_match_count", "stale_match_count",
        "endorsement_pending_count", "match_confidence",
        "gap", "coverage_pct", "coverage_label", "run_date",
    ]
    result = merged[cols].sort_values("gap", ascending=False).reset_index(drop=True)

    full    = int((result["coverage_label"] == "FULL").sum())
    partial = int((result["coverage_label"] == "PARTIAL").sum())
    none    = int((result["coverage_label"] == "NONE").sum())
    low_conf = int((result["match_confidence"] == "LOW").sum())
    logger.info(
        "deployment_matches: %d skills — FULL=%d PARTIAL=%d NONE=%d | LOW_CONFIDENCE=%d",
        len(result), full, partial, none, low_conf,
    )
    return result
