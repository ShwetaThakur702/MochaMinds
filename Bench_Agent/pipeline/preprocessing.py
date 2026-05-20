import logging

import pandas as pd

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Date columns to parse — Confirm Release Period is 100% null, skipped entirely
# ---------------------------------------------------------------------------
DATE_COLUMNS = [
    "Resource Start Date",
    "Resource End Date",
    "revised end date",
    "Forecast Date",
    "Project end date",
    "LWD",
    "Exit date (+60 days)",
    "Resignation Submitted Date",
    "NE under bench",
    "Establishment Date",
    "Hire Date",
]

NUMERIC_COLUMNS = [
    "% Allocation",
    "Total Allocation %",
    "Bench aging",
    "Past Experience",
    "Current Experience",
    "Total Experience",
]

# 100% null, no business meaning, or redundant artifacts — safe to drop
COLUMNS_TO_DROP = [
    "NE under bench Duration",
    "Onsite status",
    "Comments as of today",
    "ll",
    "Concatenation",
    "CMP",
    "Ageing (Today - Tentative Billing Start date)",
    "Confirm Release Period",
]


def preprocess_ris(df: pd.DataFrame) -> pd.DataFrame:
    """Clean and type-cast the RIS dataframe in-place (returns a copy).

    Steps applied in order:
      1. Strip whitespace from all string column values
      2. Parse date columns — failures become NaT, rows are NOT dropped
      3. Cast numeric columns — failures become NaN
    """
    df = df.copy()

    # 1. Strip whitespace from every object/string column value
    obj_cols = df.select_dtypes(include=["object"]).columns
    df[obj_cols] = df[obj_cols].apply(lambda s: s.str.strip())

    # 2. Parse date columns
    nat_report = {}
    for col in DATE_COLUMNS:
        if col not in df.columns:
            logger.warning("preprocessing: date column %r not found — skipping", col)
            continue
        before_nulls = df[col].isna().sum()
        df[col] = pd.to_datetime(df[col], errors="coerce")
        nat_count = df[col].isna().sum()
        newly_nat = nat_count - before_nulls
        nat_report[col] = {"nat_total": int(nat_count), "newly_coerced": int(newly_nat)}

    logger.info("Date parsing complete. NaT counts: %s", nat_report)

    # 3. Cast numeric columns
    for col in NUMERIC_COLUMNS:
        if col not in df.columns:
            logger.warning("preprocessing: numeric column %r not found — skipping", col)
            continue
        df[col] = pd.to_numeric(df[col], errors="coerce")

    # 4. Drop null/redundant columns
    before_cols = len(df.columns)
    df = df.drop(columns=[c for c in COLUMNS_TO_DROP if c in df.columns])
    dropped = before_cols - len(df.columns)
    logger.info(
        "preprocessing: dropped %d columns (%d → %d)", dropped, before_cols, len(df.columns)
    )

    logger.info(
        "preprocessing: RIS cleaned — %d rows, %d columns", len(df), len(df.columns)
    )
    return df
