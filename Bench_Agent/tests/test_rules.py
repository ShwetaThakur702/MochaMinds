"""
Phase 10 — test_rules.py

Tests: R1 snapshot KPIs, R2 forecast shape/FC2, R3 threshold breach
detection, R4 hiring freeze logic and TC2 (no PII in output).
"""


# ---------------------------------------------------------------------------
# R1 — Bench Snapshot
# ---------------------------------------------------------------------------

def test_r1_total_headcount(r1_snapshot):
    # CAO 'New' exclusion fix applied — deployable bench is now 53
    assert r1_snapshot["total_headcount"] == 53


def test_r1_status_counts_sum_to_headcount(r1_snapshot):
    # Catch-all 'other' bucket ensures every row is accounted for
    total = sum(r1_snapshot["status_counts"].values())
    assert total == 53


def test_r1_status_counts_keys_present(r1_snapshot):
    expected_keys = {"available", "proposed", "allocated", "nafd", "other"}
    assert expected_keys.issubset(r1_snapshot["status_counts"].keys())


def test_r1_run_date_present(r1_snapshot):
    assert "run_date" in r1_snapshot
    assert r1_snapshot["run_date"] != ""


# ---------------------------------------------------------------------------
# R2 — Daily Forecast
# ---------------------------------------------------------------------------

def test_r2_forecast_has_91_rows(r2_forecast):
    # today through today+90 inclusive = 91 days
    assert len(r2_forecast) == 91


def test_r2_forecast_confidence_band_no_nulls(r2_forecast):
    # FC2: forecast_confidence_band must never be null
    assert r2_forecast["forecast_confidence_band"].isna().sum() == 0


def test_r2_days_from_today_range(r2_forecast):
    assert r2_forecast["days_from_today"].min() == 0
    assert r2_forecast["days_from_today"].max() == 90


def test_r2_bucket_values(r2_forecast):
    valid_buckets = {"30d", "60d", "90d"}
    assert set(r2_forecast["bucket"].unique()).issubset(valid_buckets)


def test_r2_confirmed_plus_projected_equals_total(r2_forecast):
    mismatch = (
        r2_forecast["confirmed_count"] + r2_forecast["projected_count"]
        != r2_forecast["total_forecast_bench"]
    )
    assert not mismatch.any()


# ---------------------------------------------------------------------------
# R3 — Threshold Alerts
# ---------------------------------------------------------------------------

def test_r3_cyber_sec_breach_detected(r3_alerts):
    cyber = r3_alerts[r3_alerts["org_slice"] == "CYBER_SEC"]
    assert len(cyber) == 1, "CYBER_SEC not found in alerts"
    assert cyber.iloc[0]["is_breached"] == True


def test_r3_cyber_sec_severity(r3_alerts):
    cyber = r3_alerts[r3_alerts["org_slice"] == "CYBER_SEC"]
    assert cyber.iloc[0]["alert_severity"] == "MEDIUM"


def test_r3_non_breached_slices_are_ok(r3_alerts):
    non_breached = r3_alerts[r3_alerts["is_breached"] == False]
    assert (non_breached["alert_severity"] == "OK").all()


def test_r3_output_columns(r3_alerts):
    required = {
        "org_slice", "current_bench_count", "bench_threshold",
        "breach_amount", "is_breached", "alert_severity", "recommended_action",
    }
    assert required.issubset(set(r3_alerts.columns))


# ---------------------------------------------------------------------------
# R4 — Hiring Freeze Advisory
# ---------------------------------------------------------------------------

def test_r4_at_least_one_freeze_recommended(r4_freeze):
    assert r4_freeze["freeze_recommended"].any()


def test_r4_freeze_count(r4_freeze):
    # Validated number: 8 skills with supply surplus > 0
    # With corrected CAO logic and smaller bench, 6 skills now exceed supply threshold
    assert int(r4_freeze["freeze_recommended"].sum()) == 6


def test_r4_no_pii_columns(r4_freeze):
    # TC2: Emplid, employee names, individual rows must never appear in output
    pii_terms = {"emplid", "employee", "emp_id", "name", "person"}
    for col in r4_freeze.columns:
        assert col.lower() not in pii_terms, f"PII column found in R4 output: {col}"


def test_r4_advisory_note_populated(r4_freeze):
    # Every row must have a non-empty advisory note (rule-based fallback)
    assert r4_freeze["advisory_note"].notna().all()
    assert (r4_freeze["advisory_note"] != "").all()


def test_r4_supply_surplus_sign_matches_freeze(r4_freeze):
    # freeze_recommended should be True iff supply_surplus > 0
    freeze_rows    = r4_freeze[r4_freeze["freeze_recommended"] == True]
    no_freeze_rows = r4_freeze[r4_freeze["freeze_recommended"] == False]
    assert (freeze_rows["supply_surplus"] > 0).all()
    assert (no_freeze_rows["supply_surplus"] <= 0).all()
