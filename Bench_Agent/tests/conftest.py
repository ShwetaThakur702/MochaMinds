"""
Session-scoped fixtures shared across all test modules.
Pipeline runs once per pytest session — no re-ingestion per test.
"""
import sys
from pathlib import Path

# Ensure project root is importable regardless of pytest invocation directory
sys.path.insert(0, str(Path(__file__).parent.parent))

import pytest

from pipeline.exclusion_filters import apply_exclusion_filters
from pipeline.feature_engineering import engineer_features
from pipeline.ingestion import load_all
from pipeline.preprocessing import preprocess_ris
from pipeline.r1_bench_snapshot import compute_bench_snapshot
from pipeline.r2_forecast import compute_daily_forecast
from pipeline.r3_threshold import compute_threshold_alerts
from pipeline.r4_hiring_freeze import compute_hiring_freeze


# ---------------------------------------------------------------------------
# Ingestion
# ---------------------------------------------------------------------------

@pytest.fixture(scope="session")
def raw_data():
    return load_all()


@pytest.fixture(scope="session")
def ris_raw(raw_data):
    return raw_data["ris"]


# ---------------------------------------------------------------------------
# Preprocessing
# ---------------------------------------------------------------------------

@pytest.fixture(scope="session")
def preprocessed_df(ris_raw):
    return preprocess_ris(ris_raw)


# ---------------------------------------------------------------------------
# Exclusion filters
# ---------------------------------------------------------------------------

@pytest.fixture(scope="session")
def bench_tuple(preprocessed_df):
    return apply_exclusion_filters(preprocessed_df)


@pytest.fixture(scope="session")
def deployable_df(bench_tuple):
    return bench_tuple[0]


@pytest.fixture(scope="session")
def excluded_df(bench_tuple):
    return bench_tuple[1]


# ---------------------------------------------------------------------------
# Feature engineering
# ---------------------------------------------------------------------------

@pytest.fixture(scope="session")
def enriched_df(deployable_df, raw_data):
    return engineer_features(deployable_df, raw_data["threshold"])


# ---------------------------------------------------------------------------
# Rule outputs
# ---------------------------------------------------------------------------

@pytest.fixture(scope="session")
def r1_snapshot(enriched_df):
    return compute_bench_snapshot(enriched_df)


@pytest.fixture(scope="session")
def r2_forecast(enriched_df):
    return compute_daily_forecast(enriched_df)


@pytest.fixture(scope="session")
def r3_alerts(enriched_df, raw_data):
    return compute_threshold_alerts(enriched_df, raw_data["threshold"])


@pytest.fixture(scope="session")
def r4_freeze(enriched_df, raw_data):
    return compute_hiring_freeze(
        enriched_df,
        raw_data["so_ageing"],
        raw_data["skill"],
    )
