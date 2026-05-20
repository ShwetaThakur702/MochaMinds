import sys
import logging
from pathlib import Path

import pandas as pd

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Path resolution — data/ is a sibling of pipeline/
# ---------------------------------------------------------------------------
DATA_DIR = Path(__file__).parent.parent / "data"

RIS_PATH       = DATA_DIR / "RIS_Synthetic.xlsx"
SKILL_PATH     = DATA_DIR / "Skill_Data_Synthetic.xlsx"
SO_PATH        = DATA_DIR / "SO_Ageing_Synthetic.xlsx"
THRESHOLD_PATH = DATA_DIR / "Bench_Threshold.xlsx"


class ThresholdConfigMissingError(Exception):
    pass


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _strip_columns(df: pd.DataFrame) -> pd.DataFrame:
    """Strip trailing/leading spaces from every column name. Always call this
    immediately after pd.read_excel() before touching any column by name."""
    df.columns = df.columns.str.strip()
    return df


def _detect_sheet(path: Path) -> str:
    """Return the first sheet name without hardcoding it."""
    xl = pd.ExcelFile(path)
    return xl.sheet_names[0]


# Accumulates ingestion errors for the current run; wired to DB in Phase 6.
_ingestion_errors: list[dict] = []


def _log_ingestion_error(source_file: str, emplid, reason: str, row_data: dict) -> None:
    record = {
        "source_file": source_file,
        "emplid": str(emplid) if emplid is not None else None,
        "rejection_reason": reason,
        "row_data": row_data,
    }
    _ingestion_errors.append(record)
    logger.warning("Ingestion error | file=%s emplid=%s reason=%s", source_file, emplid, reason)


def get_ingestion_errors() -> list[dict]:
    """Return accumulated ingestion error records (used by persistence layer)."""
    return list(_ingestion_errors)


def clear_ingestion_errors() -> None:
    """Reset error list between runs."""
    _ingestion_errors.clear()


# ---------------------------------------------------------------------------
# Loaders
# ---------------------------------------------------------------------------

def load_ris() -> pd.DataFrame:
    """Load RIS_Synthetic.xlsx, strip column names, validate Emplid."""
    df = pd.read_excel(RIS_PATH, sheet_name="RIS")
    df = _strip_columns(df)  # MUST be first — Skiil, Department ID, etc. have trailing spaces

    # Reject rows with null Emplid
    null_mask = df["Emplid"].isna()
    null_count = null_mask.sum()
    if null_count:
        bad_rows = df[null_mask]
        for _, row in bad_rows.iterrows():
            _log_ingestion_error(
                source_file="RIS_Synthetic.xlsx",
                emplid=None,
                reason="null_emplid",
                row_data=row.to_dict(),
            )
        df = df[~null_mask].copy()
        logger.info("RIS: dropped %d rows with null Emplid", null_count)

    logger.info("RIS loaded: %d rows, %d columns", len(df), len(df.columns))
    return df


def load_threshold_config() -> pd.DataFrame:
    """Load Bench_Threshold.xlsx with dynamic sheet detection.

    Raw structure: 22 rows, 2 columns named ['Unnamed: 0', 'Bench Threshold'].
    Row 0 contains the artifact value '4' — dropped here.
    Returns 21-row DataFrame with columns ['org_slice', 'bench_threshold'].
    """
    if not THRESHOLD_PATH.exists():
        msg = f"Threshold config not found: {THRESHOLD_PATH}. R3 and R4 cannot run."
        logger.error(msg)
        print(msg, file=sys.stderr)
        raise ThresholdConfigMissingError(msg)

    sheet = _detect_sheet(THRESHOLD_PATH)
    df = pd.read_excel(THRESHOLD_PATH, sheet_name=sheet)
    df = _strip_columns(df)  # strip before any column access

    # Rename to canonical names
    df.columns = ["org_slice", "bench_threshold"]

    # Drop the row-0 artifact (org_slice == '4')
    df = df[df["org_slice"].astype(str).str.strip() != "4"].copy()
    df = df.reset_index(drop=True)

    # Normalise types
    df["org_slice"] = df["org_slice"].astype(str).str.strip().str.upper()
    df["bench_threshold"] = pd.to_numeric(df["bench_threshold"], errors="coerce")

    logger.info("Threshold config loaded: %d org slices from sheet '%s'", len(df), sheet)
    return df


def load_skill_data() -> pd.DataFrame:
    """Load Skill_Data_Synthetic.xlsx. Join key: Employee ID (int64)."""
    df = pd.read_excel(SKILL_PATH, sheet_name="Skill_Data")
    df = _strip_columns(df)  # strip before any column access

    logger.info("Skill_Data loaded: %d rows, %d columns", len(df), len(df.columns))
    return df


def load_so_ageing() -> pd.DataFrame:
    """Load SO_Ageing_Synthetic.xlsx and filter to open active demand lines.

    Keeps rows where:
      Status == 'Active'
      SO Line Status Description in {'Open', 'Recruit'}
    """
    df = pd.read_excel(SO_PATH, sheet_name="SO_Ageing")
    df = _strip_columns(df)  # strip before any column access

    before = len(df)
    df = df[
        (df["Status"] == "Active") &
        (df["SO Line Status Description"].isin(["Open", "Recruit"]))
    ].copy()
    logger.info(
        "SO_Ageing loaded: %d active open-demand rows retained from %d total",
        len(df), before,
    )
    return df


# ---------------------------------------------------------------------------
# Public entry point
# ---------------------------------------------------------------------------

def load_all() -> dict[str, pd.DataFrame]:
    """Load and validate all four source files. Returns a dict with keys:
    'ris', 'threshold', 'skill', 'so_ageing'.

    Raises ThresholdConfigMissingError if the threshold file is absent.
    Persists any ingestion rejection records to the ingestion_errors DB table.
    """
    clear_ingestion_errors()

    ris       = load_ris()
    threshold = load_threshold_config()
    skill     = load_skill_data()
    so_ageing = load_so_ageing()

    # Persist ingestion errors (null Emplid rejections, etc.) to DB
    errors = get_ingestion_errors()
    if errors:
        from pipeline.persistence import save_ingestion_errors
        save_ingestion_errors(errors)

    return {
        "ris":       ris,
        "threshold": threshold,
        "skill":     skill,
        "so_ageing": so_ageing,
    }
