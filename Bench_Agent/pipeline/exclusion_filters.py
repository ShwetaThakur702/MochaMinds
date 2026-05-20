import logging

import pandas as pd

logger = logging.getLogger(__name__)


def apply_exclusion_filters(
    df: pd.DataFrame,
) -> tuple[pd.DataFrame, pd.DataFrame, dict]:
    """Isolate the deployable bench population.

    A person is EXCLUDED if ANY of the following conditions is true:
      1. Leave type is not null           (on leave)
      2. BZ resources is not null         (BZ resource)
      3. D rated is not null              (D1 / D2)
      4. Exit is not null                 (exit confirmed)
      5. Resignation Submitted Date is not null
      6. Campus/Lateral == 'Campus' AND Campus status == 'Without FBD'
      7. CAO Status == 'New'              (currently assigned to CAO bench engagement)

    Explicitly NOT exclusion conditions:
      - CAO Status == 'Old'  — employee already exited CAO engagement, IS deployable
      - BNH_BNHP Projects    — covers 68% of synthetic dataset, likely data artifact
      - NE under bench       — date field, not a deployability flag (see warning below)
      - OC column            — contains Emplid cross-references, not a binary flag

    Returns
    -------
    deployable_bench : pd.DataFrame  — population eligible for deployment
    excluded         : pd.DataFrame  — everyone excluded, with 'exclusion_reason' column
    exclusion_audit  : dict          — per-condition counts for chart/API exposure
    """
    print("WARNING: OC exclusion skipped — column contains Emplid cross-references, business rule unclear. Pending clarification.")
    print("WARNING: BNH_BNHP exclusion skipped — covers 68% of synthetic dataset, likely data artifact. Pending validation.")
    logger.warning(
        "NE under bench is a date field — exclusion logic unclear, skipped pending mentor validation."
    )

    conditions: dict[str, pd.Series] = {
        "on_leave":         df["Leave type"].notna(),
        "is_bz":            df["BZ resources"].notna(),
        "is_d_rated":       df["D rated"].notna(),
        "has_exit":         df["Exit"].notna(),
        "has_resignation":  df["Resignation Submitted Date"].notna(),
        "is_campus_no_fbd": (df["Campus/Lateral"] == "Campus") & (df["Campus status"] == "Without FBD"),
        "is_cao_new":       df["CAO Status"] == "New",
        # is_bnh_bnhp — skipped, covers 68% of synthetic dataset, likely data artifact
        # is_oc       — skipped, OC column holds Emplid cross-refs, not a binary flag
        # ne_under_bench — date field, not a deployability disqualifier
    }

    # Combined mask — excluded if any condition fires
    exclusion_mask = pd.concat(conditions.values(), axis=1).any(axis=1)

    # --- Per-condition counts (log to console; wired to DB in Phase 6) ---
    logger.info("=== Exclusion filter breakdown (conditions are not mutually exclusive) ===")
    for name, mask in conditions.items():
        logger.info("  %-25s  excluded=%d", name, mask.sum())

    total_excluded = exclusion_mask.sum()
    deployable_count = (~exclusion_mask).sum()
    logger.info("Total input rows    : %d", len(df))
    logger.info("Total excluded      : %d", total_excluded)
    logger.info("Deployable bench    : %d", deployable_count)

    exclusion_audit = {
        "total_input_rows":        len(df),
        "excluded_on_leave":       int(conditions["on_leave"].sum()),
        "excluded_bz":             int(conditions["is_bz"].sum()),
        "excluded_d_rated":        int(conditions["is_d_rated"].sum()),
        "excluded_exit":           int(conditions["has_exit"].sum()),
        "excluded_resignation":    int(conditions["has_resignation"].sum()),
        "excluded_campus_no_fbd":  int(conditions["is_campus_no_fbd"].sum()),
        "excluded_cao_new":        int(conditions["is_cao_new"].sum()),
        "total_excluded":          int(total_excluded),
        "deployable_bench_count":  int(deployable_count),
    }

    # Persist exclusion audit row to DB (non-fatal)
    from pipeline.persistence import save_exclusion_audit
    save_exclusion_audit(exclusion_audit)

    # Attach a readable exclusion_reason string to the excluded population
    excluded_df = df[exclusion_mask].copy()
    condition_df = pd.concat(conditions.values(), axis=1)
    condition_df.columns = list(conditions.keys())
    excluded_df["exclusion_reason"] = (
        condition_df[exclusion_mask]
        .apply(lambda row: "|".join(row.index[row].tolist()), axis=1)
    )

    # --- Deployable bench ---
    deployable_bench = df[~exclusion_mask].copy()

    # Derived aging column based on today's date (Bench aging pre-computed col not trusted)
    today = pd.Timestamp.today().normalize()
    current_bench_mask = deployable_bench["Current or Future Bench"] == "Current bench"
    deployable_bench["bench_aging_derived"] = pd.NA
    deployable_bench.loc[current_bench_mask, "bench_aging_derived"] = (
        (today - deployable_bench.loc[current_bench_mask, "Resource Start Date"])
        .dt.days
    )
    deployable_bench["bench_aging_derived"] = pd.to_numeric(
        deployable_bench["bench_aging_derived"], errors="coerce"
    )

    return deployable_bench, excluded_df, exclusion_audit
