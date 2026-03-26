# app/routers/kpis_direct.py

from __future__ import annotations

from typing import Any, Dict, List, Literal, Optional, Tuple

from fastapi import APIRouter, Depends, Query
from sqlalchemy import Integer, bindparam, text
from sqlalchemy.orm import Session

# IMPORTANT:
# You must already have get_db() in your app (same as you used before).
# If yours is in app/db.py then import from there.
# Otherwise update this import to match your project.
from db import get_db  # <-- change if your get_db lives elsewhere

router = APIRouter()

GeoLevel = Literal["zone", "state", "lga", "ward", "school"]
Gender = Literal["Male", "Female"]


# ------------------------------------------------------------------------------
# Helpers: drilldown filters
# ------------------------------------------------------------------------------

def _location_filters(
    zone: Optional[str],
    state: Optional[str],
    lga: Optional[str],
    ward: Optional[str],
) -> Tuple[str, Dict[str, Any]]:
    """
    Returns SQL AND clauses + params for dim_location filters.
    Supports both drill paths:
      - zone -> state -> lga -> ward
      - state -> lga -> ward
    """
    clauses: List[str] = []
    params: Dict[str, Any] = {}

    if zone:
        clauses.append("loc.zone = :zone")
        params["zone"] = zone
    if state:
        clauses.append("loc.state = :state")
        params["state"] = state
    if lga:
        clauses.append("loc.lga = :lga")
        params["lga"] = lga
    if ward:
        clauses.append("loc.ward = :ward")
        params["ward"] = ward

    if not clauses:
        return "", {}
    return " AND " + " AND ".join(clauses), params


def _school_filter(school_id: Optional[int]) -> Tuple[str, Dict[str, Any]]:
    if not school_id:
        return "", {}
    return " AND ss3.school_id = :school_id", {"school_id": school_id}


def _group_expr(group_by: GeoLevel) -> str:
    # Whitelist-only output (safe to inject as SQL identifier expression)
    if group_by == "zone":
        return "loc.zone"
    if group_by == "state":
        return "loc.state"
    if group_by == "lga":
        return "loc.lga"
    if group_by == "ward":
        return "loc.ward"
    # school
    return "COALESCE(sch.name, 'UNKNOWN SCHOOL')"


def _bind_year(stmt):
    """
    Ensure :year is always treated as an INTEGER bind param (consistent across drivers).
    """
    return stmt.bindparams(bindparam("year", type_=Integer))


# ------------------------------------------------------------------------------
# Core “Same-Year” base cohort CTE (SS3 cohort for the selected year)
# ------------------------------------------------------------------------------

_BASE_COHORT = """
WITH cohort AS (
  SELECT DISTINCT
    ss3.learner_id,
    ss3.ward_location_id,
    ss3.school_id
  FROM fact_ss3_completion ss3
  JOIN dim_location loc ON loc.id = ss3.ward_location_id
  LEFT JOIN dim_school sch ON sch.id = ss3.school_id
  WHERE ss3.ss3_year = :year
    AND COALESCE(ss3.completed, true) = true
    {loc_filters}
    {school_filter}
),
waec_any AS (
  -- one row per learner, "passed_any" if learner passed at least one attempt that year
  SELECT
    w.learner_id,
    bool_or(COALESCE(w.passed,false)) AS passed_any
  FROM fact_waec_attempt w
  WHERE w.exam_year = :year
  GROUP BY w.learner_id
),
jamb_any AS (
  SELECT
    j.learner_id,
    bool_or(COALESCE(j.passed,false)) AS passed_any
  FROM fact_jamb_attempt j
  WHERE j.exam_year = :year
  GROUP BY j.learner_id
),
adm_any AS (
  SELECT
    a.learner_id,
    bool_or(COALESCE(a.admitted,false)) AS admitted_any
  FROM fact_admission a
  WHERE a.admission_year = :year
  GROUP BY a.learner_id
),
mat_any AS (
  SELECT
    m.learner_id,
    bool_or(COALESCE(m.matriculated,false)) AS matric_any
  FROM fact_matriculation m
  WHERE m.matric_year = :year
  GROUP BY m.learner_id
)
"""


# ------------------------------------------------------------------------------
# 1) Cards (Top KPI cards)
# ------------------------------------------------------------------------------

@router.get("/cards")
def direct_cards(
    year: int = Query(..., description="SS3 cohort year"),
    zone: Optional[str] = None,
    state: Optional[str] = None,
    lga: Optional[str] = None,
    ward: Optional[str] = None,
    school_id: Optional[int] = None,
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    loc_filters_sql, loc_params = _location_filters(zone, state, lga, ward)
    school_filter_sql, school_params = _school_filter(school_id)

    q = _bind_year(
        text(
            _BASE_COHORT.format(loc_filters=loc_filters_sql, school_filter=school_filter_sql)
            + """
SELECT
  -- base counts (same-year by definition)
  (SELECT COUNT(*) FROM cohort) AS ss3_total,

  -- how many of this SS3 cohort have a matriculation record in the SAME year
  (SELECT COUNT(*) FROM cohort c JOIN mat_any m ON m.learner_id = c.learner_id WHERE m.matric_any = true) AS same_year_matriculated,

  -- participation (same-year)
  CASE
    WHEN (SELECT COUNT(*) FROM cohort) = 0 THEN 0
    ELSE (
      (SELECT COUNT(*) FROM cohort c JOIN waec_any w ON w.learner_id = c.learner_id) :: float
      / (SELECT COUNT(*) FROM cohort) :: float
    ) * 100
  END AS waec_participation_rate,

  CASE
    WHEN (SELECT COUNT(*) FROM cohort) = 0 THEN 0
    ELSE (
      (SELECT COUNT(*) FROM cohort c JOIN jamb_any j ON j.learner_id = c.learner_id) :: float
      / (SELECT COUNT(*) FROM cohort) :: float
    ) * 100
  END AS jamb_participation_rate,

  -- pass rates (same-year)
  CASE
    WHEN (SELECT COUNT(*) FROM cohort c JOIN waec_any w ON w.learner_id = c.learner_id) = 0 THEN 0
    ELSE (
      (SELECT COUNT(*) FROM cohort c JOIN waec_any w ON w.learner_id = c.learner_id WHERE w.passed_any = true) :: float
      / (SELECT COUNT(*) FROM cohort c JOIN waec_any w ON w.learner_id = c.learner_id) :: float
    ) * 100
  END AS waec_pass_rate,

  CASE
    WHEN (SELECT COUNT(*) FROM cohort c JOIN jamb_any j ON j.learner_id = c.learner_id) = 0 THEN 0
    ELSE (
      (SELECT COUNT(*) FROM cohort c JOIN jamb_any j ON j.learner_id = c.learner_id WHERE j.passed_any = true) :: float
      / (SELECT COUNT(*) FROM cohort c JOIN jamb_any j ON j.learner_id = c.learner_id) :: float
    ) * 100
  END AS jamb_pass_rate,

  -- admission rate (admitted / passed jamb)
  CASE
    WHEN (SELECT COUNT(*) FROM cohort c JOIN jamb_any j ON j.learner_id = c.learner_id WHERE j.passed_any = true) = 0 THEN 0
    ELSE (
      (SELECT COUNT(*) FROM cohort c
         JOIN jamb_any j ON j.learner_id = c.learner_id
         JOIN adm_any a ON a.learner_id = c.learner_id
       WHERE j.passed_any = true AND a.admitted_any = true
      ) :: float
      / (SELECT COUNT(*) FROM cohort c JOIN jamb_any j ON j.learner_id = c.learner_id WHERE j.passed_any = true) :: float
    ) * 100
  END AS admission_rate,

  -- matriculation completion rate (matriculated / admitted)
  CASE
    WHEN (SELECT COUNT(*) FROM cohort c JOIN adm_any a ON a.learner_id = c.learner_id WHERE a.admitted_any = true) = 0 THEN 0
    ELSE (
      (SELECT COUNT(*) FROM cohort c
         JOIN adm_any a ON a.learner_id = c.learner_id
         JOIN mat_any m ON m.learner_id = c.learner_id
       WHERE a.admitted_any = true AND m.matric_any = true
      ) :: float
      / (SELECT COUNT(*) FROM cohort c JOIN adm_any a ON a.learner_id = c.learner_id WHERE a.admitted_any = true) :: float
    ) * 100
  END AS matriculation_completion_rate
;
"""
        )
    )

    params: Dict[str, Any] = {"year": year}
    params.update(loc_params)
    params.update(school_params)

    row = db.execute(q, params).mappings().first() or {}

    return {
        "year": year,
        "ss3_total": int(row.get("ss3_total") or 0),
        "same_year_matriculated": int(row.get("same_year_matriculated") or 0),

        "waec_participation_rate": float(row.get("waec_participation_rate") or 0.0),
        "waec_pass_rate": float(row.get("waec_pass_rate") or 0.0),

        "jamb_participation_rate": float(row.get("jamb_participation_rate") or 0.0),
        "jamb_pass_rate": float(row.get("jamb_pass_rate") or 0.0),

        "admission_rate": float(row.get("admission_rate") or 0.0),
        "matriculation_completion_rate": float(row.get("matriculation_completion_rate") or 0.0),
    }


# ------------------------------------------------------------------------------
# 2) Funnel (overall)
# ------------------------------------------------------------------------------

@router.get("/funnel")
def direct_funnel(
    year: int = Query(...),
    zone: Optional[str] = None,
    state: Optional[str] = None,
    lga: Optional[str] = None,
    ward: Optional[str] = None,
    school_id: Optional[int] = None,
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    loc_filters_sql, loc_params = _location_filters(zone, state, lga, ward)
    school_filter_sql, school_params = _school_filter(school_id)

    q = _bind_year(
        text(
            _BASE_COHORT.format(loc_filters=loc_filters_sql, school_filter=school_filter_sql)
            + """
SELECT
  (SELECT COUNT(*) FROM cohort) AS ss3_total,
  (SELECT COUNT(*) FROM cohort c JOIN waec_any w ON w.learner_id = c.learner_id) AS waec_writers,
  (SELECT COUNT(*) FROM cohort c JOIN jamb_any j ON j.learner_id = c.learner_id) AS jamb_writers,
  (SELECT COUNT(*) FROM cohort c JOIN adm_any a ON a.learner_id = c.learner_id WHERE a.admitted_any = true) AS admitted,
  (SELECT COUNT(*) FROM cohort c JOIN mat_any m ON m.learner_id = c.learner_id WHERE m.matric_any = true) AS matriculated
;
"""
        )
    )

    params: Dict[str, Any] = {"year": year}
    params.update(loc_params)
    params.update(school_params)

    r = db.execute(q, params).mappings().first() or {}
    ss3_total = int(r.get("ss3_total") or 0)
    waec_writers = int(r.get("waec_writers") or 0)
    jamb_writers = int(r.get("jamb_writers") or 0)
    admitted = int(r.get("admitted") or 0)
    matriculated = int(r.get("matriculated") or 0)

    def pct(num: int, den: int) -> float:
        return 0.0 if den == 0 else (num / den) * 100.0

    return {
        "year": year,
        "stages": [
            {"stage": "SS3 Completed", "count": ss3_total, "pct_of_prev": 100.0},
            {"stage": "WAEC Writers", "count": waec_writers, "pct_of_prev": pct(waec_writers, ss3_total)},
            {"stage": "JAMB Writers", "count": jamb_writers, "pct_of_prev": pct(jamb_writers, waec_writers if waec_writers else ss3_total)},
            {"stage": "Admitted", "count": admitted, "pct_of_prev": pct(admitted, jamb_writers)},
            {"stage": "Matriculated", "count": matriculated, "pct_of_prev": pct(matriculated, admitted)},
        ],
    }


# ------------------------------------------------------------------------------
# 3) Funnel grouped by location (zone/state/lga/ward/school)
# ------------------------------------------------------------------------------

@router.get("/funnel/grouped")
def direct_funnel_grouped(
    year: int = Query(...),
    group_by: GeoLevel = Query("zone"),
    zone: Optional[str] = None,
    state: Optional[str] = None,
    lga: Optional[str] = None,
    ward: Optional[str] = None,
    school_id: Optional[int] = None,
    db: Session = Depends(get_db),
) -> List[Dict[str, Any]]:
    loc_filters_sql, loc_params = _location_filters(zone, state, lga, ward)
    school_filter_sql, school_params = _school_filter(school_id)
    geo_expr = _group_expr(group_by)

    q = _bind_year(
        text(
            _BASE_COHORT.format(loc_filters=loc_filters_sql, school_filter=school_filter_sql)
            + f"""
SELECT
  {geo_expr} AS geo,
  COUNT(DISTINCT c.learner_id)::bigint AS ss3_total,
  COUNT(DISTINCT w.learner_id)::bigint AS waec_writers,
  COUNT(DISTINCT j.learner_id)::bigint AS jamb_writers,
  COUNT(DISTINCT CASE WHEN a.admitted_any THEN a.learner_id END)::bigint AS admitted,
  COUNT(DISTINCT CASE WHEN m.matric_any THEN m.learner_id END)::bigint AS matriculated
FROM cohort c
JOIN dim_location loc ON loc.id = c.ward_location_id
LEFT JOIN dim_school sch ON sch.id = c.school_id
LEFT JOIN waec_any w ON w.learner_id = c.learner_id
LEFT JOIN jamb_any j ON j.learner_id = c.learner_id
LEFT JOIN adm_any a ON a.learner_id = c.learner_id
LEFT JOIN mat_any m ON m.learner_id = c.learner_id
GROUP BY geo
ORDER BY ss3_total DESC;
"""
        )
    )

    params: Dict[str, Any] = {"year": year}
    params.update(loc_params)
    params.update(school_params)

    rows = db.execute(q, params).mappings().all()

    out: List[Dict[str, Any]] = []
    for r in rows:
        out.append(
            {
                "geo": r["geo"],
                "ss3_total": int(r["ss3_total"] or 0),
                "waec_writers": int(r["waec_writers"] or 0),
                "jamb_writers": int(r["jamb_writers"] or 0),
                "admitted": int(r["admitted"] or 0),
                "matriculated": int(r["matriculated"] or 0),
            }
        )
    return out


# ------------------------------------------------------------------------------
# 4) Funnel grouped by gender
# ------------------------------------------------------------------------------

@router.get("/funnel/gender")
def direct_funnel_gender(
    year: int = Query(...),
    zone: Optional[str] = None,
    state: Optional[str] = None,
    lga: Optional[str] = None,
    ward: Optional[str] = None,
    school_id: Optional[int] = None,
    db: Session = Depends(get_db),
) -> List[Dict[str, Any]]:
    loc_filters_sql, loc_params = _location_filters(zone, state, lga, ward)
    school_filter_sql, school_params = _school_filter(school_id)

    q = _bind_year(
        text(
            _BASE_COHORT.format(loc_filters=loc_filters_sql, school_filter=school_filter_sql)
            + """
SELECT
  COALESCE(lr.gender::text, 'UNKNOWN') AS gender,
  COUNT(DISTINCT c.learner_id)::bigint AS ss3_total,
  COUNT(DISTINCT w.learner_id)::bigint AS waec_writers,
  COUNT(DISTINCT j.learner_id)::bigint AS jamb_writers,
  COUNT(DISTINCT CASE WHEN a.admitted_any THEN a.learner_id END)::bigint AS admitted,
  COUNT(DISTINCT CASE WHEN m.matric_any THEN m.learner_id END)::bigint AS matriculated
FROM cohort c
JOIN dim_learner lr ON lr.id = c.learner_id
LEFT JOIN waec_any w ON w.learner_id = c.learner_id
LEFT JOIN jamb_any j ON j.learner_id = c.learner_id
LEFT JOIN adm_any a ON a.learner_id = c.learner_id
LEFT JOIN mat_any m ON m.learner_id = c.learner_id
GROUP BY gender
ORDER BY ss3_total DESC;
"""
        )
    )

    params: Dict[str, Any] = {"year": year}
    params.update(loc_params)
    params.update(school_params)

    rows = db.execute(q, params).mappings().all()
    return [
        {
            "gender": r["gender"],
            "ss3_total": int(r["ss3_total"] or 0),
            "waec_writers": int(r["waec_writers"] or 0),
            "jamb_writers": int(r["jamb_writers"] or 0),
            "admitted": int(r["admitted"] or 0),
            "matriculated": int(r["matriculated"] or 0),
        }
        for r in rows
    ]


# ------------------------------------------------------------------------------
# 5) WAEC pass rate by State & Gender (also supports group_by zone/state/lga/ward/school)
# ------------------------------------------------------------------------------

@router.get("/waec/pass-rate")
def direct_waec_pass_rate(
    year: int = Query(...),
    group_by: GeoLevel = Query("state"),
    split_by_gender: bool = Query(True),
    zone: Optional[str] = None,
    state: Optional[str] = None,
    lga: Optional[str] = None,
    ward: Optional[str] = None,
    school_id: Optional[int] = None,
    db: Session = Depends(get_db),
) -> List[Dict[str, Any]]:
    loc_filters_sql, loc_params = _location_filters(zone, state, lga, ward)
    school_filter_sql, school_params = _school_filter(school_id)
    geo_expr = _group_expr(group_by)

    gender_select = "COALESCE(lr.gender::text, 'UNKNOWN') AS gender," if split_by_gender else ""
    gender_group = ", gender" if split_by_gender else ""

    q = _bind_year(
        text(
            _BASE_COHORT.format(loc_filters=loc_filters_sql, school_filter=school_filter_sql)
            + f"""
SELECT
  {geo_expr} AS geo,
  {gender_select}
  COUNT(DISTINCT w.learner_id)::bigint AS writers,
  COUNT(DISTINCT CASE WHEN w.passed_any THEN w.learner_id END)::bigint AS passed,
  CASE WHEN COUNT(DISTINCT w.learner_id) = 0 THEN 0
       ELSE (COUNT(DISTINCT CASE WHEN w.passed_any THEN w.learner_id END)::float
            / COUNT(DISTINCT w.learner_id)::float) * 100
  END AS pass_rate
FROM cohort c
JOIN dim_location loc ON loc.id = c.ward_location_id
LEFT JOIN dim_school sch ON sch.id = c.school_id
JOIN dim_learner lr ON lr.id = c.learner_id
LEFT JOIN waec_any w ON w.learner_id = c.learner_id
GROUP BY geo{gender_group}
ORDER BY pass_rate DESC, passed DESC;
"""
        )
    )

    params: Dict[str, Any] = {"year": year}
    params.update(loc_params)
    params.update(school_params)

    rows = db.execute(q, params).mappings().all()
    return [
        {
            "geo": r["geo"],
            **({"gender": r["gender"]} if split_by_gender else {}),
            "writers": int(r["writers"] or 0),
            "passed": int(r["passed"] or 0),
            "pass_rate": float(r["pass_rate"] or 0.0),
        }
        for r in rows
    ]


# ------------------------------------------------------------------------------
# 6) JAMB pass rate by State & Gender (supports drilldown too)
# ------------------------------------------------------------------------------

@router.get("/jamb/pass-rate")
def direct_jamb_pass_rate(
    year: int = Query(...),
    group_by: GeoLevel = Query("state"),
    split_by_gender: bool = Query(True),
    zone: Optional[str] = None,
    state: Optional[str] = None,
    lga: Optional[str] = None,
    ward: Optional[str] = None,
    school_id: Optional[int] = None,
    db: Session = Depends(get_db),
) -> List[Dict[str, Any]]:
    loc_filters_sql, loc_params = _location_filters(zone, state, lga, ward)
    school_filter_sql, school_params = _school_filter(school_id)
    geo_expr = _group_expr(group_by)

    gender_select = "COALESCE(lr.gender::text, 'UNKNOWN') AS gender," if split_by_gender else ""
    gender_group = ", gender" if split_by_gender else ""

    q = _bind_year(
        text(
            _BASE_COHORT.format(loc_filters=loc_filters_sql, school_filter=school_filter_sql)
            + f"""
SELECT
  {geo_expr} AS geo,
  {gender_select}
  COUNT(DISTINCT j.learner_id)::bigint AS writers,
  COUNT(DISTINCT CASE WHEN j.passed_any THEN j.learner_id END)::bigint AS passed,
  CASE WHEN COUNT(DISTINCT j.learner_id) = 0 THEN 0
       ELSE (COUNT(DISTINCT CASE WHEN j.passed_any THEN j.learner_id END)::float
            / COUNT(DISTINCT j.learner_id)::float) * 100
  END AS pass_rate
FROM cohort c
JOIN dim_location loc ON loc.id = c.ward_location_id
LEFT JOIN dim_school sch ON sch.id = c.school_id
JOIN dim_learner lr ON lr.id = c.learner_id
LEFT JOIN jamb_any j ON j.learner_id = c.learner_id
GROUP BY geo{gender_group}
ORDER BY pass_rate DESC, passed DESC;
"""
        )
    )

    params: Dict[str, Any] = {"year": year}
    params.update(loc_params)
    params.update(school_params)

    rows = db.execute(q, params).mappings().all()
    return [
        {
            "geo": r["geo"],
            **({"gender": r["gender"]} if split_by_gender else {}),
            "writers": int(r["writers"] or 0),
            "passed": int(r["passed"] or 0),
            "pass_rate": float(r["pass_rate"] or 0.0),
        }
        for r in rows
    ]


# ------------------------------------------------------------------------------
# 7) Admission rate (same-year): admitted / passed JAMB (Gauge)
# ------------------------------------------------------------------------------

@router.get("/admission-rate")
def direct_admission_rate(
    year: int = Query(...),
    zone: Optional[str] = None,
    state: Optional[str] = None,
    lga: Optional[str] = None,
    ward: Optional[str] = None,
    school_id: Optional[int] = None,
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    loc_filters_sql, loc_params = _location_filters(zone, state, lga, ward)
    school_filter_sql, school_params = _school_filter(school_id)

    q = _bind_year(
        text(
            _BASE_COHORT.format(loc_filters=loc_filters_sql, school_filter=school_filter_sql)
            + """
SELECT
  COUNT(*) FILTER (WHERE j.passed_any = true)::bigint AS jamb_passed,
  COUNT(*) FILTER (WHERE j.passed_any = true AND a.admitted_any = true)::bigint AS admitted_from_passed
FROM cohort c
LEFT JOIN jamb_any j ON j.learner_id = c.learner_id
LEFT JOIN adm_any a ON a.learner_id = c.learner_id
;
"""
        )
    )

    params: Dict[str, Any] = {"year": year}
    params.update(loc_params)
    params.update(school_params)

    r = db.execute(q, params).mappings().first() or {}
    jamb_passed = int(r.get("jamb_passed") or 0)
    admitted_from_passed = int(r.get("admitted_from_passed") or 0)
    rate = 0.0 if jamb_passed == 0 else (admitted_from_passed / jamb_passed) * 100.0

    return {
        "year": year,
        "jamb_passed": jamb_passed,
        "admitted_from_passed": admitted_from_passed,
        "admission_rate": rate,
    }


# ------------------------------------------------------------------------------
# 8) Matriculation completion rate (same-year): matriculated / admitted (Gauge)
# ------------------------------------------------------------------------------

@router.get("/matriculation-rate")
def direct_matriculation_rate(
    year: int = Query(...),
    zone: Optional[str] = None,
    state: Optional[str] = None,
    lga: Optional[str] = None,
    ward: Optional[str] = None,
    school_id: Optional[int] = None,
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    loc_filters_sql, loc_params = _location_filters(zone, state, lga, ward)
    school_filter_sql, school_params = _school_filter(school_id)

    q = _bind_year(
        text(
            _BASE_COHORT.format(loc_filters=loc_filters_sql, school_filter=school_filter_sql)
            + """
SELECT
  COUNT(*) FILTER (WHERE a.admitted_any = true)::bigint AS admitted,
  COUNT(*) FILTER (WHERE a.admitted_any = true AND m.matric_any = true)::bigint AS matriculated_from_admitted
FROM cohort c
LEFT JOIN adm_any a ON a.learner_id = c.learner_id
LEFT JOIN mat_any m ON m.learner_id = c.learner_id
;
"""
        )
    )

    params: Dict[str, Any] = {"year": year}
    params.update(loc_params)
    params.update(school_params)

    r = db.execute(q, params).mappings().first() or {}
    admitted = int(r.get("admitted") or 0)
    matriculated_from_admitted = int(r.get("matriculated_from_admitted") or 0)
    rate = 0.0 if admitted == 0 else (matriculated_from_admitted / admitted) * 100.0

    return {
        "year": year,
        "admitted": admitted,
        "matriculated_from_admitted": matriculated_from_admitted,
        "matriculation_completion_rate": rate,
    }


# ------------------------------------------------------------------------------
# 9) Drop-off breakdown by Gender (reason counts)
# ------------------------------------------------------------------------------

@router.get("/dropoff/gender")
def direct_dropoff_gender(
    year: int = Query(...),
    zone: Optional[str] = None,
    state: Optional[str] = None,
    lga: Optional[str] = None,
    ward: Optional[str] = None,
    school_id: Optional[int] = None,
    db: Session = Depends(get_db),
) -> List[Dict[str, Any]]:
    loc_filters_sql, loc_params = _location_filters(zone, state, lga, ward)
    school_filter_sql, school_params = _school_filter(school_id)

    q = _bind_year(
        text(
            """
SELECT
  COALESCE(lr.gender::text, 'UNKNOWN') AS gender,
  COALESCE(r.label::text, 'UNKNOWN REASON') AS reason,
  COUNT(*)::bigint AS count
FROM fact_dropout d
JOIN dim_dropout_reason r ON r.id = d.reason_id
JOIN fact_ss3_completion ss3
  ON ss3.learner_id = d.learner_id
JOIN dim_location loc ON loc.id = ss3.ward_location_id
LEFT JOIN dim_school sch ON sch.id = ss3.school_id
JOIN dim_learner lr ON lr.id = d.learner_id
WHERE d.cohort_ss3_year = :year
  AND (d.activity_year = :year OR d.activity_year IS NULL)
  AND ss3.ss3_year = :year
  AND COALESCE(ss3.completed, true) = true
  {loc_filters}
  {school_filter}
GROUP BY gender, reason
ORDER BY gender, count DESC;
""".format(
                loc_filters=loc_filters_sql,
                school_filter=school_filter_sql,
            )
        )
    )

    params: Dict[str, Any] = {"year": year}
    params.update(loc_params)
    params.update(school_params)

    rows = db.execute(q, params).mappings().all()
    return [{"gender": r["gender"], "reason": r["reason"], "count": int(r["count"] or 0)} for r in rows]


# ------------------------------------------------------------------------------
# 10) Drop-off breakdown by Location (reason counts)
# ------------------------------------------------------------------------------

@router.get("/dropoff/location")
def direct_dropoff_location(
    year: int = Query(...),
    group_by: GeoLevel = Query("zone"),
    zone: Optional[str] = None,
    state: Optional[str] = None,
    lga: Optional[str] = None,
    ward: Optional[str] = None,
    school_id: Optional[int] = None,
    db: Session = Depends(get_db),
) -> List[Dict[str, Any]]:
    loc_filters_sql, loc_params = _location_filters(zone, state, lga, ward)
    school_filter_sql, school_params = _school_filter(school_id)
    geo_expr = _group_expr(group_by)

    q = _bind_year(
        text(
            """
SELECT
  {geo_expr} AS geo,
  COALESCE(r.label::text, 'UNKNOWN REASON') AS reason,
  COUNT(*)::bigint AS count
FROM fact_dropout d
JOIN dim_dropout_reason r ON r.id = d.reason_id
JOIN fact_ss3_completion ss3
  ON ss3.learner_id = d.learner_id
JOIN dim_location loc ON loc.id = ss3.ward_location_id
LEFT JOIN dim_school sch ON sch.id = ss3.school_id
WHERE d.cohort_ss3_year = :year
  AND (d.activity_year = :year OR d.activity_year IS NULL)
  AND ss3.ss3_year = :year
  AND COALESCE(ss3.completed, true) = true
  {loc_filters}
  {school_filter}
GROUP BY geo, reason
ORDER BY count DESC;
""".format(
                geo_expr=geo_expr,
                loc_filters=loc_filters_sql,
                school_filter=school_filter_sql,
            )
        )
    )

    params: Dict[str, Any] = {"year": year}
    params.update(loc_params)
    params.update(school_params)

    rows = db.execute(q, params).mappings().all()
    return [{"geo": r["geo"], "reason": r["reason"], "count": int(r["count"] or 0)} for r in rows]