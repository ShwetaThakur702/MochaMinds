"""
Phase 10 — test_feature_engineering.py

Tests: engineer_features() adds all 6 derived columns with correct
types and valid values. Does not test business logic — only structure.
"""


EXPECTED_DERIVED_COLS = [
    "effective_release_date",
    "forecast_confidence",
    "is_future_release",
    "org_slice_key",
    "talentx_skills_list",
    "bench_aging_bucket_derived",
]


def test_all_derived_columns_present(enriched_df):
    for col in EXPECTED_DERIVED_COLS:
        assert col in enriched_df.columns, f"Derived column missing: {col}"


def test_effective_release_date_no_nat(enriched_df):
    # Priority fallback chain ensures every row has a release date
    assert enriched_df["effective_release_date"].isna().sum() == 0


def test_forecast_confidence_no_nulls(enriched_df):
    # Default 'LOW' fills any unrecognised Confirm release value
    assert enriched_df["forecast_confidence"].isna().sum() == 0


def test_forecast_confidence_valid_values(enriched_df):
    valid = {"HIGH", "MEDIUM", "LOW"}
    actual = set(enriched_df["forecast_confidence"].unique())
    assert actual.issubset(valid), f"Unexpected values: {actual - valid}"


def test_org_slice_key_no_blanks(enriched_df):
    # Every row gets either a matched key or the sentinel 'UNMAPPED'
    assert enriched_df["org_slice_key"].isna().sum() == 0
    assert (enriched_df["org_slice_key"] != "").all()


def test_talentx_skills_list_contains_lists(enriched_df):
    all_lists = enriched_df["talentx_skills_list"].apply(lambda x: isinstance(x, list))
    assert all_lists.all(), "Some talentx_skills_list cells are not Python lists"


def test_bench_aging_bucket_derived_valid_values(enriched_df):
    valid = {"<30 days", "31-60 days", "61-90 days", ">91 days", "Unknown"}
    actual = set(enriched_df["bench_aging_bucket_derived"].unique())
    assert actual.issubset(valid), f"Unexpected bucket values: {actual - valid}"


def test_is_future_release_is_boolean(enriched_df):
    assert enriched_df["is_future_release"].dtype == bool or \
           enriched_df["is_future_release"].isin([True, False]).all()
