import logging

import pandas as pd

from pipeline.ingestion import ThresholdConfigMissingError

logger = logging.getLogger(__name__)


def _alert_severity(breach_amount: float) -> str:
    if breach_amount > 20:
        return "CRITICAL"
    if breach_amount > 10:
        return "HIGH"
    if breach_amount > 0:
        return "MEDIUM"
    return "OK"


def _recommended_action(
    org_slice: str,
    current: int,
    threshold: float,
    breach: float,
    forecasted_30d: int,
    forecasted_breach: bool,
) -> str:
    if breach <= 0 and not forecasted_breach:
        return (
            f"No action required. {org_slice} bench ({current}) is within threshold "
            f"({int(threshold)}). 30-day forecast adds {forecasted_30d} more."
        )
    if breach <= 0 and forecasted_breach:
        return (
            f"Monitor closely. {org_slice} current bench ({current}) is within threshold "
            f"({int(threshold)}), but adding {forecasted_30d} forecasted releases "
            f"will breach threshold within 30 days."
        )
    return (
        f"Review bench pipeline for {org_slice}. "
        f"Current bench ({current}) exceeds threshold ({int(threshold)}) "
        f"by {int(breach)}. 30-day forecast adds {forecasted_30d} more "
        f"({'also breached' if forecasted_breach else 'within threshold on forecast'}). "
        f"Consider hiring freeze advisory."
    )


def compute_threshold_alerts(
    deployable_bench_df: pd.DataFrame,
    threshold_config_df: pd.DataFrame,
) -> pd.DataFrame:
    """Compute R3 threshold breach alerts for each matched org slice.

    Compares BOTH current bench count and current + 30-day forecasted bench
    against the configured threshold per org slice. UNMAPPED rows excluded.
    All matched org slices appear in output; non-breached rows get alert_severity='OK'.

    Parameters
    ----------
    deployable_bench_df  : enriched deployable bench from engineer_features()
                           Must contain: org_slice_key, is_future_release,
                           effective_release_date columns.
    threshold_config_df  : threshold config from load_threshold_config()

    Returns
    -------
    pd.DataFrame — one row per matched org slice, with columns:
        org_slice, current_bench_count, forecasted_bench_30d,
        bench_threshold, breach_amount, is_breached, forecasted_breach,
        alert_severity, recommended_action, run_date

    Raises
    ------
    ThresholdConfigMissingError if threshold_config_df is None or empty.
    """
    if threshold_config_df is None or threshold_config_df.empty:
        msg = "Threshold config is missing or empty. R3 cannot run."
        logger.error(msg)
        print(f"ERROR: {msg}", flush=True)
        raise ThresholdConfigMissingError(msg)

    today = pd.Timestamp.today().normalize()
    horizon_30d = today + pd.Timedelta(days=30)
    run_date = str(today.date())

    # ------------------------------------------------------------------
    # Current bench count per org slice — UNMAPPED excluded
    # ------------------------------------------------------------------
    mapped = deployable_bench_df[deployable_bench_df["org_slice_key"] != "UNMAPPED"]
    unmapped_count = (deployable_bench_df["org_slice_key"] == "UNMAPPED").sum()
    logger.info("R3: %d UNMAPPED rows excluded from threshold comparison", unmapped_count)

    bench_by_org = (
        mapped.groupby("org_slice_key")
        .size()
        .reset_index(name="current_bench_count")
        .rename(columns={"org_slice_key": "org_slice"})
    )

    # ------------------------------------------------------------------
    # 30-day forecasted bench additions per org slice
    # Candidates: is_future_release == True AND release date <= today + 30d
    # ------------------------------------------------------------------
    future_30d_mask = (
        (deployable_bench_df["is_future_release"] == True)
        & (deployable_bench_df["effective_release_date"] <= horizon_30d)
        & (deployable_bench_df["org_slice_key"] != "UNMAPPED")
    )
    forecast_by_org = (
        deployable_bench_df[future_30d_mask]
        .groupby("org_slice_key")
        .size()
        .reset_index(name="forecasted_bench_30d")
        .rename(columns={"org_slice_key": "org_slice"})
    )
    logger.info(
        "R3: %d employees forecast to join bench within 30 days (across all org slices)",
        int(future_30d_mask.sum()),
    )

    # ------------------------------------------------------------------
    # Merge: current bench + forecasted + threshold config
    # ------------------------------------------------------------------
    merged = bench_by_org.merge(threshold_config_df, on="org_slice", how="inner")
    merged = merged.merge(forecast_by_org, on="org_slice", how="left")
    merged["forecasted_bench_30d"] = merged["forecasted_bench_30d"].fillna(0).astype(int)

    logger.info(
        "R3: %d org slices in bench data, %d in threshold config, %d matched",
        len(bench_by_org), len(threshold_config_df), len(merged),
    )

    # ------------------------------------------------------------------
    # Breach calculations
    # ------------------------------------------------------------------
    merged["breach_amount"]     = merged["current_bench_count"] - merged["bench_threshold"]
    merged["is_breached"]       = merged["breach_amount"] > 0
    merged["forecasted_breach"] = (
        merged["current_bench_count"] + merged["forecasted_bench_30d"] > merged["bench_threshold"]
    )
    merged["alert_severity"]    = merged["breach_amount"].apply(_alert_severity)
    merged["recommended_action"] = merged.apply(
        lambda r: _recommended_action(
            r["org_slice"],
            int(r["current_bench_count"]),
            r["bench_threshold"],
            r["breach_amount"],
            int(r["forecasted_bench_30d"]),
            bool(r["forecasted_breach"]),
        ),
        axis=1,
    )
    merged["run_date"] = run_date

    # ------------------------------------------------------------------
    # Logging
    # ------------------------------------------------------------------
    breached = merged[merged["is_breached"]]
    forecast_breached = merged[merged["forecasted_breach"] & ~merged["is_breached"]]
    logger.info(
        "R3: %d org slices compared — %d currently breached, %d forecast-only breach, %d OK",
        len(merged), len(breached), len(forecast_breached),
        len(merged) - len(breached) - len(forecast_breached),
    )
    for _, row in breached.iterrows():
        logger.warning(
            "ALERT [%s] %s: bench=%d threshold=%g breach=%+.0f forecast_30d=%d forecasted_breach=%s",
            row["alert_severity"], row["org_slice"],
            row["current_bench_count"], row["bench_threshold"],
            row["breach_amount"], row["forecasted_bench_30d"], row["forecasted_breach"],
        )
    for _, row in forecast_breached.iterrows():
        logger.warning(
            "ALERT [FORECAST] %s: current=%d threshold=%g forecast_30d=%d → will breach",
            row["org_slice"], row["current_bench_count"],
            row["bench_threshold"], row["forecasted_bench_30d"],
        )

    cols = [
        "org_slice", "current_bench_count", "forecasted_bench_30d",
        "bench_threshold", "breach_amount", "is_breached", "forecasted_breach",
        "alert_severity", "recommended_action", "run_date",
    ]
    return merged[cols].reset_index(drop=True)
