"""
Phase 10 — test_exclusion_filters.py

Tests: apply_exclusion_filters() returns the correct split and that
no excluded condition survives into the deployable population.
"""


def test_returns_three_element_tuple(bench_tuple):
    # Returns (deployable_df, excluded_df, exclusion_audit_dict)
    assert isinstance(bench_tuple, tuple)
    assert len(bench_tuple) == 3


def test_exclusion_audit_is_dict(bench_tuple):
    audit = bench_tuple[2]
    assert isinstance(audit, dict)
    assert "deployable_bench_count" in audit
    assert "excluded_cao_new" in audit


def test_deployable_plus_excluded_equals_total(deployable_df, excluded_df):
    # TC3: every input row must land in exactly one bucket
    assert len(deployable_df) + len(excluded_df) == 1000


def test_deployable_count(deployable_df):
    # CAO 'New' fix applied — deployable bench now 53 (was 80 before CAO exclusion)
    assert len(deployable_df) == 53


def test_excluded_count(excluded_df):
    assert len(excluded_df) == 947


def test_no_leave_type_in_deployable(deployable_df):
    # Condition 1: on leave → excluded
    assert deployable_df["Leave type"].isna().all()


def test_no_bz_resources_in_deployable(deployable_df):
    # Condition 2: BZ resource → excluded
    assert deployable_df["BZ resources"].isna().all()


def test_no_d_rated_in_deployable(deployable_df):
    # Condition 3: D-rated → excluded
    assert deployable_df["D rated"].isna().all()


def test_no_exit_in_deployable(deployable_df):
    # Condition 4: exit confirmed → excluded
    assert deployable_df["Exit"].isna().all()


def test_no_resignation_in_deployable(deployable_df):
    # Condition 5: resignation submitted → excluded
    assert deployable_df["Resignation Submitted Date"].isna().all()


def test_no_campus_without_fbd_in_deployable(deployable_df):
    # Condition 6: Campus lateral without FBD → excluded
    bad = (
        (deployable_df["Campus/Lateral"] == "Campus") &
        (deployable_df["Campus status"] == "Without FBD")
    )
    assert not bad.any()


def test_no_cao_new_in_deployable(deployable_df):
    # Condition 7: CAO Status == 'New' → excluded (active CAO bench assignment)
    assert not (deployable_df["CAO Status"] == "New").any()
