"""
Phase 10 — test_ingestion.py

Tests: load_all() loads all 4 source files, validates row counts
and confirms the threshold artifact row is dropped on load.
"""


def test_load_all_returns_four_datasets(raw_data):
    assert set(raw_data.keys()) == {"ris", "threshold", "skill", "so_ageing"}


def test_all_datasets_non_empty(raw_data):
    for key, df in raw_data.items():
        assert len(df) > 0, f"Dataset '{key}' is empty"


def test_ris_row_count(raw_data):
    assert len(raw_data["ris"]) == 1000


def test_ris_emplid_no_nulls(raw_data):
    # load_ris() rejects rows with null Emplid — none should survive
    assert raw_data["ris"]["Emplid"].isna().sum() == 0


def test_threshold_row_count(raw_data):
    # 22 raw rows minus 1 artifact row ('4') = 21 valid org slices
    assert len(raw_data["threshold"]) == 21


def test_threshold_artifact_row_dropped(raw_data):
    # The row with org_slice == '4' must not appear after load
    assert "4" not in raw_data["threshold"]["org_slice"].values


def test_threshold_columns(raw_data):
    assert list(raw_data["threshold"].columns) == ["org_slice", "bench_threshold"]


def test_so_ageing_row_count(raw_data):
    # load_so_ageing() keeps only Status==Active AND SO Line Status in {Open, Recruit}
    assert len(raw_data["so_ageing"]) == 235
