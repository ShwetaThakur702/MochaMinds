import logging

import pandas as pd

logger = logging.getLogger(__name__)


def compute_daily_forecast(df: pd.DataFrame) -> pd.DataFrame:
    """Build a 91-row day-level forecast time series (today through today+90).

    A person is counted as 'on bench by a given date' if:
      - effective_release_date <= that date
      - is_future_release == True

    FC2: forecast_confidence_band is always populated — never null.

    Parameters
    ----------
    df : enriched deployable_bench_df from engineer_features()

    Returns
    -------
    pd.DataFrame with 91 rows, one per calendar day.
    """
    today = pd.Timestamp.today().normalize()
    forecast_horizon = today + pd.Timedelta(days=90)
    date_range = pd.date_range(start=today, end=forecast_horizon, freq="D")

    candidates = df[df["is_future_release"] == True].copy()
    logger.info("R2 forecast candidates (is_future_release=True): %d", len(candidates))

    rows = []
    for date in date_range:
        on_bench = candidates[candidates["effective_release_date"] <= date]

        confirmed  = on_bench[on_bench["forecast_confidence"] == "HIGH"]
        projected  = on_bench[on_bench["forecast_confidence"].isin(["MEDIUM", "LOW"])]

        days_from_today = (date - today).days
        if days_from_today <= 30:
            bucket = "30d"
        elif days_from_today <= 60:
            bucket = "60d"
        else:
            bucket = "90d"

        conf_band = "HIGH" if len(projected) == 0 else "MIXED"

        rows.append({
            "forecast_date":            date,
            "days_from_today":          days_from_today,
            "total_forecast_bench":     len(on_bench),
            "confirmed_count":          len(confirmed),
            "projected_count":          len(projected),
            "forecast_confidence_band": conf_band,   # FC2: never null
            "bucket":                   bucket,
        })

    daily_df = pd.DataFrame(rows)
    logger.info(
        "R2 daily forecast built: %d rows, date range %s → %s",
        len(daily_df), today.date(), forecast_horizon.date(),
    )
    return daily_df


def compute_bucket_summary(daily_df: pd.DataFrame) -> pd.DataFrame:
    """Collapse the day-level forecast into a 3-row bucket summary.

    Each bucket row shows the *incremental* bench additions within that window
    (new arrivals in 0-30d, 31-60d, 61-90d) plus the confirmed/projected split.

    Parameters
    ----------
    daily_df : output of compute_daily_forecast()

    Returns
    -------
    pd.DataFrame with 3 rows indexed by bucket.
    """
    # Incremental additions = max headcount in bucket minus headcount at bucket start
    bucket_order = ["30d", "60d", "90d"]
    summary_rows = []

    prev_total = 0
    for bucket in bucket_order:
        bucket_df = daily_df[daily_df["bucket"] == bucket]

        total_at_end   = int(bucket_df["total_forecast_bench"].max())
        additions      = total_at_end - prev_total
        confirmed_add  = int(bucket_df["confirmed_count"].max()) - (
            int(daily_df[daily_df["bucket"] == bucket_order[bucket_order.index(bucket) - 1]]["confirmed_count"].max())
            if bucket != "30d" else 0
        )
        projected_add  = additions - confirmed_add

        summary_rows.append({
            "bucket":                bucket,
            "total_bench_at_end":    total_at_end,
            "incremental_additions": additions,
            "confirmed_additions":   confirmed_add,
            "projected_additions":   projected_add,
        })
        prev_total = total_at_end

    return pd.DataFrame(summary_rows)
