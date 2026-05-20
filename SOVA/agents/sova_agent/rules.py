import pandas as pd
import logging
import os
from datetime import datetime
from typing import Optional
from dotenv import load_dotenv

load_dotenv()
logger = logging.getLogger(__name__)

R1_REQUEST_DATE_FIELD = os.getenv("R1_REQUEST_DATE_FIELD", "SO Submission Date")
R1_GAP_DAYS = int(os.getenv("R1_GAP_DAYS", "30"))
R5_MIN_WORD_COUNT = int(os.getenv("R5_MIN_WORD_COUNT", "50"))

REQUIRED_JD_KEYWORDS = ["skill", "experience", "role", "technology", "responsible"]


def _base_row(so_row: pd.Series, run_date: str) -> dict:
    return {
        "SO ID": so_row.get("SO ID", "N/A"),
        "Project Code": str(so_row.get("Project ID", "N/A")),
        "Customer Name": so_row.get("Customer Name", "N/A"),
        "Service Order Status": so_row.get("Status", "N/A"),
        "PSID of Hiring Manager": str(so_row.get("PSID of Hiring Manager", "N/A")),
        "Expected Billing Start Date": str(so_row.get("Start Date", "N/A"))[:10],
        "SO Creation Date": str(so_row.get("SO Creation Date", "N/A"))[:10],
        "SO Submission Date": str(so_row.get("SO Submission Date", "N/A"))[:10],
        "Hiring GeoLocation": so_row.get("Hiring Geo/Location", "N/A"),
        "Onsite/Offshore": so_row.get("Requirement Location", "N/A"),
        "Work Location Country": so_row.get("Country", "N/A"),
        "Work Location City": so_row.get("City Name", "N/A"),
        "SO ClusterGroup": so_row.get("SL/IND_CLUSTER", "N/A"),
        "Manager ClusterGroup": "N/A",
        "Budgeted CTC Currency": "N/A",
        "Recommended Currency": "N/A",
        "Job Title": so_row.get("Project Role", "N/A"),
        "Primary Skill Set": so_row.get("Primary Skill Description", "N/A"),
        "Description Quality Flag": "N/A",
        "Recommended Action": "N/A",
        "Validity Indicator": "INVALID",
        "Run Date": run_date,
    }


# ─── R1: Billing Start Date ────────────────────────────────────────────────

def run_r1(so_df: pd.DataFrame, run_date: str) -> list[dict]:
    exceptions = []
    for _, row in so_df.iterrows():
        billing = row.get("Start Date")
        request = row.get(R1_REQUEST_DATE_FIELD)

        if pd.isnull(billing) or pd.isnull(request):
            continue  # excluded per input validation rules

        gap = (billing - request).days

        flagged = False
        reason = ""
        if billing < request:
            flagged = True
            reason = f"Expected Billing Start Date ({billing.date()}) precedes request date ({request.date()})"
        elif gap < R1_GAP_DAYS:
            flagged = True
            reason = f"Gap of {gap} days is less than required {R1_GAP_DAYS} days (too tight)"

        if flagged:
            exc = _base_row(row, run_date)
            exc.update({
                "Rule ID": "R1",
                "Rule Name": "Billing Start Date",
                "Exception Reason": reason,
                "Severity": "High",
                "Recommended Action": "Review and update Expected Billing Start Date to allow at least 30 days lead time from SO request date.",
            })
            exceptions.append(exc)

    logger.info(f"R1: {len(exceptions)} exceptions")
    return exceptions


# ─── R2: Geo / Location Consistency ────────────────────────────────────────

def run_r2(so_df: pd.DataFrame, geo_policy: Optional[pd.DataFrame], run_date: str) -> tuple:
    if geo_policy is None:
        logger.warning("R2 skipped: geo_policy.csv not available")
        return [], True  # skipped=True

    # Build lookup: (HiringGeo, RequirementLocation) -> set of AllowedCountry
    policy_map = {}
    for _, row in geo_policy.iterrows():
        key = (str(row["HiringGeo"]).strip().upper(), str(row["RequirementLocation"]).strip().capitalize())
        policy_map.setdefault(key, set()).add(str(row["AllowedCountry"]).strip())

    exceptions = []
    for _, row in so_df.iterrows():
        geo = str(row.get("Hiring Geo/Location", "")).strip().upper()
        loc_type = str(row.get("Requirement Location", "")).strip().capitalize()
        country = str(row.get("Country", "")).strip()

        key = (geo, loc_type)
        if key not in policy_map:
            # No policy defined for this combination — skip this SO for R2
            continue

        allowed = policy_map[key]
        if country not in allowed:
            exc = _base_row(row, run_date)
            exc.update({
                "Rule ID": "R2",
                "Rule Name": "Geo / Location Consistency",
                "Exception Reason": (
                    f"Hiring Geo '{geo}' with '{loc_type}' type expects country in "
                    f"{allowed} but found '{country}'"
                ),
                "Severity": "Medium",
                "Recommended Action": "Verify and correct Work Location Country, Hiring GeoLocation, or Onsite/Offshore field.",
            })
            exceptions.append(exc)

    logger.info(f"R2: {len(exceptions)} exceptions")
    return exceptions, False


# ─── R3: Cluster Group Match ────────────────────────────────────────────────

def run_r3(so_df: pd.DataFrame, cluster_map: Optional[pd.DataFrame], run_date: str) -> tuple:
    if cluster_map is None:
        logger.warning("R3 skipped: cluster_map.csv not available")
        return [], True

    # Build PSID -> ManagerClusterGroup dict
    psid_cluster = {}
    for _, row in cluster_map.iterrows():
        psid_cluster[str(int(row["PSID"])).strip()] = str(row["ManagerClusterGroup"]).strip()

    exceptions = []
    for _, row in so_df.iterrows():
        psid = str(int(row["PSID of Hiring Manager"])) if pd.notna(row.get("PSID of Hiring Manager")) else None
        so_cluster = str(row.get("SL/IND_CLUSTER", "")).strip()

        if psid is None or psid not in psid_cluster:
            # Per SRS R3 rule: log config warning, skip — not a rule violation
            logger.warning(f"R3: PSID {psid} not in cluster map — skipping SO {row.get('SO ID')}")
            continue

        mgr_cluster = psid_cluster[psid]

        if so_cluster != mgr_cluster:
            exc = _base_row(row, run_date)
            exc["Manager ClusterGroup"] = mgr_cluster
            exc.update({
                "Rule ID": "R3",
                "Rule Name": "Cluster Group Match",
                "Exception Reason": (
                    f"SO ClusterGroup '{so_cluster}' does not match "
                    f"Hiring Manager's ClusterGroup '{mgr_cluster}' (PSID: {psid})"
                ),
                "Severity": "Medium",
                "Recommended Action": "Verify SO ClusterGroup assignment with the Hiring Manager and update if required.",
            })
            exceptions.append(exc)

    logger.info(f"R3: {len(exceptions)} exceptions")
    return exceptions, False


# ─── R4: Currency Mapping (derived from HiringGeo vs Country) ───────────────

# Maps HiringGeo code → expected Onsite country
GEO_COUNTRY_MAP = {
    "ITGUR": "India",          "ITHYD": "India",          "ITPUN": "India",
    "ITAUT": "Australia",      "ITI2A": "Australia",      "ITI2B": "Brazil",
    "HRBTM": "United States",
    "I2AUS": "Australia",      "I2CAN": "Canada",         "I2GBR": "United Kingdom",
    "I2DEU": "Germany",        "I2FRA": "France",         "I2NLD": "Netherlands",
    "I2ITA": "Italy",          "I2SGP": "Singapore",      "I2MYS": "Malaysia",
    "I2ARE": "UAE",            "I2SAU": "Saudi Arabia",   "I2BRA": "Brazil",
    "I2POL": "Poland",         "I2ZAF": "South Africa",   "I2JPN": "Japan",
    "I2USA": "United States",  "I3LBN": "Lebanon",        "I3LKN": "Kenya",
}


def run_r4(so_df: pd.DataFrame, currency_map: Optional[pd.DataFrame], run_date: str) -> tuple:
    if currency_map is None:
        logger.warning("R4 skipped: currency_map.csv not available")
        return [], True

    # Build Country → ApprovedCurrency lookup
    country_currency = {}
    for _, row in currency_map.iterrows():
        country_currency[str(row["Country"]).strip()] = str(row["ApprovedCurrency"]).strip()

    exceptions = []
    for _, row in so_df.iterrows():
        req_loc = str(row.get("Requirement Location", "")).strip().capitalize()

        # Offshore is always India — no currency mismatch possible
        if req_loc != "Onsite":
            continue

        geo = str(row.get("Hiring Geo/Location", "")).strip().upper()
        actual_country = str(row.get("Country", "")).strip()

        # Look up what country this HiringGeo code implies
        geo_expected_country = GEO_COUNTRY_MAP.get(geo)
        if not geo_expected_country:
            continue  # unknown geo code — skip

        geo_currency = country_currency.get(geo_expected_country, "N/A")
        actual_currency = country_currency.get(actual_country, "N/A")

        if geo_currency == "N/A" or actual_currency == "N/A":
            continue  # one side not mappable — skip

        if geo_currency != actual_currency:
            exc = _base_row(row, run_date)
            exc["Budgeted CTC Currency"] = actual_currency
            exc["Recommended Currency"] = geo_currency
            exc.update({
                "Rule ID": "R4",
                "Rule Name": "Currency Mapping",
                "Exception Reason": (
                    f"Hiring Geo '{geo}' implies billing in {geo_expected_country} ({geo_currency}), "
                    f"but Work Location Country is '{actual_country}' ({actual_currency}). "
                    f"Currency mismatch detected."
                ),
                "Severity": "Medium",
                "Recommended Action": (
                    f"Verify Work Location Country and Hiring Geo are consistent. "
                    f"Expected currency based on Hiring Geo: {geo_currency}."
                ),
            })
            exceptions.append(exc)

    logger.info(f"R4: {len(exceptions)} exceptions")
    return exceptions, False


# ─── R5: JD Quality ─────────────────────────────────────────────────────────

def _build_jd_lookup(jd_library: Optional[pd.DataFrame]) -> dict:
    """
    Build a lookup dict: Grade -> True (a standard JD exists for this grade).
    Matches on Grade only (most reliable common key between SO and JD files).
    """
    if jd_library is None:
        return {}
    lookup = {}
    grade_col = None
    # Auto-detect Grade column (second column by convention in JD file)
    for col in jd_library.columns:
        if str(col).strip().upper() in ["GRADE", "LEVEL"]:
            grade_col = col
            break
    if grade_col is None and len(jd_library.columns) >= 2:
        grade_col = jd_library.columns[1]  # fallback: second column
    if grade_col:
        for _, row in jd_library.iterrows():
            grade = str(row.get(grade_col, "")).strip()
            jd_text = ""
            # Auto-detect JD text column (named 'JD' or 5th column)
            for col in jd_library.columns:
                if str(col).strip().upper() == "JD":
                    jd_text = str(row.get(col, "")).strip()
                    break
            if grade and jd_text and jd_text.lower() not in ["nan", "none", ""]:
                word_count = len(jd_text.split())
                lookup[grade] = word_count  # store word count of the library JD
    return lookup


def _assess_jd(
    description: str,
    job_title: str,
    skills: str,
    keywords: str,
    grade: str = "",
    jd_lookup: Optional[dict] = None,
) -> tuple[bool, str, str]:
    """Returns (is_poor, quality_flag, reason)"""
    desc = str(description).strip() if description and str(description) != "N/A" else ""
    title = str(job_title).strip() if job_title and str(job_title) != "N/A" else ""
    sk = str(skills).strip() if skills and str(skills) != "N/A" else ""
    kw = str(keywords).strip() if keywords and str(keywords) != "N/A" else ""
    grade_key = str(grade).strip() if grade and str(grade) != "N/A" else ""

    reasons = []

    # Check description
    if not desc or desc == "N/A":
        reasons.append("Description field is missing")
        combined = f"{title} {sk} {kw}"
    else:
        combined = desc

    word_count = len(combined.split())
    desc_is_short = word_count < R5_MIN_WORD_COUNT

    if desc_is_short:
        # ── JD Library Lookup ──────────────────────────────────────────────
        # If a standard JD exists for this SO's Grade in the JD library,
        # the role is well-defined at ITC Infotech level. The SO's short
        # description is still a problem but we validate against library.
        if jd_lookup and grade_key and grade_key in jd_lookup:
            lib_word_count = jd_lookup[grade_key]
            if lib_word_count >= R5_MIN_WORD_COUNT:
                # Library JD is rich enough — SO description is acceptable
                # via reference lookup. No exception raised.
                logger.debug(
                    f"R5: Grade '{grade_key}' matched JD library "
                    f"({lib_word_count} words) — SO passes via reference lookup."
                )
                return False, "ACCEPTABLE_VIA_JD_LIBRARY", ""
        reasons.append(
            f"Combined JD content is too short ({word_count} words; minimum {R5_MIN_WORD_COUNT})"
        )

    # Check presence of key role/skill/experience indicators
    missing_kw = []
    if not sk or sk == "N/A":
        missing_kw.append("Primary Skill Set missing")
    if not title or title == "N/A":
        missing_kw.append("Job Title missing")
    if not kw or kw == "N/A":
        missing_kw.append("Keywords missing")

    if missing_kw:
        reasons.extend(missing_kw)

    if reasons:
        flag = "POOR"
        if not desc or desc == "N/A":
            flag = "MISSING_DESCRIPTION"
        elif word_count < 10:
            flag = "TOO_SHORT"
        return True, flag, "; ".join(reasons)

    return False, "ACCEPTABLE", ""


def run_r5(so_df: pd.DataFrame, run_date: str, jd_library: Optional[pd.DataFrame] = None) -> list[dict]:
    jd_lookup = _build_jd_lookup(jd_library)
    if jd_lookup:
        logger.info(f"R5: JD library loaded with {len(jd_lookup)} grade entries — using reference lookup.")
    else:
        logger.info("R5: No JD library available — using heuristic-only mode.")

    exceptions = []
    for _, row in so_df.iterrows():
        grade = str(row.get("Grade", "")).strip()
        is_poor, flag, reason = _assess_jd(
            description=row.get("Description"),
            job_title=row.get("Project Role"),
            skills=row.get("Primary Skill Description"),
            keywords=row.get("Keywords"),
            grade=grade,
            jd_lookup=jd_lookup,
        )
        if is_poor:
            exc = _base_row(row, run_date)
            exc["Description Quality Flag"] = flag
            exc.update({
                "Rule ID": "R5",
                "Rule Name": "JD Quality",
                "Exception Reason": reason,
                "Severity": "Low",
                "Recommended Action": (
                    "Enrich the SO Description with role responsibilities, required skills, "
                    "experience range, and technology stack. Minimum 50 words expected. "
                    "Refer to the JD library for a standard template for this grade."
                ),
            })
            exceptions.append(exc)

    logger.info(f"R5: {len(exceptions)} exceptions")
    return exceptions
