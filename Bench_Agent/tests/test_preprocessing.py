"""
Phase 10 — test_preprocessing.py

Tests: preprocess_ris() drops junk columns, parses dates cleanly,
and removes the 100%-null Confirm Release Period column.
"""
import pandas as pd


def test_raw_ris_column_count(ris_raw):
    # Before preprocessing: 113 columns
    assert len(ris_raw.columns) == 113


def test_preprocessed_column_count(preprocessed_df):
    # After dropping 8 junk columns: 113 - 8 = 105
    assert len(preprocessed_df.columns) == 105


def test_resource_end_date_no_nat(preprocessed_df):
    # Synthetic data has 0 parse failures on Resource End Date
    assert preprocessed_df["Resource End Date"].isna().sum() == 0


def test_revised_end_date_no_nat(preprocessed_df):
    assert preprocessed_df["revised end date"].isna().sum() == 0


def test_forecast_date_no_nat(preprocessed_df):
    assert preprocessed_df["Forecast Date"].isna().sum() == 0


def test_confirm_release_period_dropped(preprocessed_df):
    # 100% null, dropped by preprocess_ris
    assert "Confirm Release Period" not in preprocessed_df.columns


def test_date_columns_are_datetime(preprocessed_df):
    for col in ("Resource End Date", "revised end date", "Forecast Date"):
        assert pd.api.types.is_datetime64_any_dtype(preprocessed_df[col]), (
            f"Column '{col}' was not parsed to datetime"
        )


def test_skiil_column_preserved(preprocessed_df):
    # TC5: intentional misspelling must never be renamed
    assert "Skiil" in preprocessed_df.columns
