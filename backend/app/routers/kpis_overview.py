from __future__ import annotations

from typing import Literal

from fastapi import APIRouter, Depends, Query
from sqlalchemy import Integer, bindparam, text
from sqlalchemy.orm import Session

from db import get_db

router = APIRouter(prefix="/kpis/overview", tags=["kpis_overview"])

GeoLevel = Literal["zone", "state", "lga"]


def _geo_field(group_by: GeoLevel) -> str:
    # whitelist-only output (safe to inject)
    if group_by == "zone":
        return "loc.zone"
    if group_by == "state":
        return "loc.state"
    if group_by == "lga":
        return "loc.lga"
    return "loc.zone"


def _bind_year(stmt):
    """Ensure :year is bound as an INTEGER for consistent DB behavior."""
    return stmt.bindparams(bindparam("year", type_=Integer))


# -----------------------------
# CARDS (overview)
# -----------------------------
@router.get("/cards")
def overview_cards(
    year: int = Query(..., ge=1900, le=2100),
    db: Session = Depends(get_db),
):
    q = _bind_year(
        text(
            """
            WITH base AS (
              SELECT *
              FROM fact_ss3_completion
              WHERE ss3_year = :year
            )
            SELECT
              COUNT(*)::bigint AS ss3_total,
              COUNT(*) FILTER (WHERE waec_year = :year)::bigint AS waec_writers,
              COUNT(*) FILTER (WHERE jamb_year = :year)::bigint AS jamb_writers,
              COUNT(*) FILTER (WHERE admission_year = :year)::bigint AS admitted,
              COUNT(*) FILTER (WHERE matriculation_year = :year)::bigint AS matriculated,
              COUNT(*) FILTER (
                WHERE admission_year IS NOT NULL
                  AND (admission_year - ss3_year) > 2
              )::bigint AS delayed_admission
            FROM base
            """
        )
    )

    row = db.execute(q, {"year": year}).mappings().first() or {}
    # Convert any bigint/int-like values cleanly
    return {k: int(v) if v is not None and isinstance(v, (int,)) else v for k, v in row.items()}


# -----------------------------
# FUNNEL (grouped)
# -----------------------------
@router.get("/funnel/grouped")
def overview_funnel_grouped(
    year: int = Query(...),
    group_by: GeoLevel = Query("zone"),
    db: Session = Depends(get_db),
):
    geo = _geo_field(group_by)

    q = _bind_year(
        text(
            f"""
            SELECT
              {geo} AS geo,
              COUNT(*)::bigint AS ss3_total,
              COUNT(*) FILTER (WHERE ss3.waec_year = :year)::bigint AS waec_writers,
              COUNT(*) FILTER (WHERE ss3.jamb_year = :year)::bigint AS jamb_writers,
              COUNT(*) FILTER (WHERE ss3.admission_year = :year)::bigint AS admitted,
              COUNT(*) FILTER (WHERE ss3.matriculation_year = :year)::bigint AS matriculated
            FROM fact_ss3_completion ss3
            JOIN dim_location loc ON loc.id = ss3.ward_location_id
            WHERE ss3.ss3_year = :year
            GROUP BY {geo}
            ORDER BY ss3_total DESC
            """
        )
    )

    rows = db.execute(q, {"year": year}).mappings().all()
    return {"year": year, "group_by": group_by, "rows": rows}


# -----------------------------
# FUNNEL (gender)
# -----------------------------
@router.get("/funnel/gender")
def overview_funnel_gender(
    year: int = Query(...),
    db: Session = Depends(get_db),
):
    q = _bind_year(
        text(
            """
            SELECT
              lr.gender::text AS gender,
              COUNT(*)::bigint AS ss3_total,
              COUNT(*) FILTER (WHERE ss3.waec_year = :year)::bigint AS waec_writers,
              COUNT(*) FILTER (WHERE ss3.jamb_year = :year)::bigint AS jamb_writers,
              COUNT(*) FILTER (WHERE ss3.admission_year = :year)::bigint AS admitted,
              COUNT(*) FILTER (WHERE ss3.matriculation_year = :year)::bigint AS matriculated
            FROM fact_ss3_completion ss3
            JOIN dim_learner lr ON lr.id = ss3.learner_id
            WHERE ss3.ss3_year = :year
            GROUP BY lr.gender
            ORDER BY ss3_total DESC
            """
        )
    )

    return {
        "year": year,
        "rows": db.execute(q, {"year": year}).mappings().all(),
    }


# -----------------------------
# BAND VIEW
# -----------------------------
@router.get("/band-view")
def overview_band_view(
    year: int = Query(...),
    db: Session = Depends(get_db),
):
    q = _bind_year(
        text(
            """
            SELECT
              COALESCE(NULLIF(gap_band::text, ''), 'UNKNOWN') AS band,
              COUNT(*)::bigint AS count
            FROM fact_ss3_completion
            WHERE ss3_year = :year
            GROUP BY 1
            ORDER BY 1
            """
        )
    )

    return {
        "year": year,
        "rows": db.execute(q, {"year": year}).mappings().all(),
    }


# -----------------------------
# DROPOFF (gender)
# -----------------------------
@router.get("/dropoff/gender")
def overview_dropoff_gender(
    year: int = Query(...),
    db: Session = Depends(get_db),
):
    q = _bind_year(
        text(
            """
            SELECT
              lr.gender::text AS gender,
              r.label AS reason,
              COUNT(*)::bigint AS count
            FROM fact_dropout d
            JOIN dim_dropout_reason r ON r.id = d.reason_id
            JOIN dim_learner lr ON lr.id = d.learner_id
            WHERE d.cohort_ss3_year = :year
              AND (d.activity_year = :year OR d.activity_year IS NULL)
            GROUP BY lr.gender, r.label
            ORDER BY lr.gender, count DESC
            """
        )
    )

    return {
        "year": year,
        "rows": db.execute(q, {"year": year}).mappings().all(),
    }


# -----------------------------
# DROPOFF (location)
# -----------------------------
@router.get("/dropoff/location")
def overview_dropoff_location(
    year: int = Query(...),
    group_by: GeoLevel = Query("zone"),
    db: Session = Depends(get_db),
):
    geo = _geo_field(group_by)

    q = _bind_year(
        text(
            f"""
            SELECT
              {geo} AS geo,
              r.label AS reason,
              COUNT(*)::bigint AS count
            FROM fact_dropout d
            JOIN dim_dropout_reason r ON r.id = d.reason_id
            JOIN fact_ss3_completion ss3 ON ss3.learner_id = d.learner_id
            JOIN dim_location loc ON loc.id = ss3.ward_location_id
            WHERE d.cohort_ss3_year = :year
              AND (d.activity_year = :year OR d.activity_year IS NULL)
            GROUP BY {geo}, r.label
            ORDER BY count DESC
            """
        )
    )

    return {
        "year": year,
        "group_by": group_by,
        "rows": db.execute(q, {"year": year}).mappings().all(),
    }


# -----------------------------
# MEDIAN TRANSITION TIME
# -----------------------------
@router.get("/median-transition-time")
def overview_median_transition_time(
    year: int = Query(...),
    db: Session = Depends(get_db),
):
    q = _bind_year(
        text(
            """
            SELECT
              PERCENTILE_CONT(0.5) WITHIN GROUP (
                ORDER BY (matriculation_year - waec_year)
              ) AS median_years
            FROM fact_ss3_completion
            WHERE ss3_year = :year
              AND waec_year IS NOT NULL
              AND matriculation_year IS NOT NULL
              AND matriculation_year >= waec_year
            """
        )
    )

    row = db.execute(q, {"year": year}).mappings().first() or {}
    return {
        "year": year,
        "median_transition_time_years": float(row.get("median_years") or 0.0),
    }