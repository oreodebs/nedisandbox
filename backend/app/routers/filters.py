# backend/app/routers/filters.py
from __future__ import annotations

from typing import List, Optional, Dict, Any

from fastapi import APIRouter, Depends, Query, HTTPException
from sqlalchemy import text
from sqlalchemy.orm import Session

from db import get_db  # uses your backend/db.py

router = APIRouter()


def _split_list(values: Optional[List[str]]) -> List[str]:
    if not values:
        return []
    out: List[str] = []
    for v in values:
        if v is None:
            continue
        parts = [p.strip() for p in str(v).split(",")]
        out.extend([p for p in parts if p])
    seen = set()
    clean: List[str] = []
    for x in out:
        if x not in seen:
            seen.add(x)
            clean.append(x)
    return clean


def _require_one(name: str, vals: List[str]) -> str:
    if not vals:
        raise HTTPException(status_code=400, detail=f"Missing required parameter: {name}")
    if len(vals) != 1:
        raise HTTPException(status_code=400, detail=f"'{name}' must be a single value (not multiple).")
    return vals[0]


def _optional_one(name: str, vals: List[str]) -> Optional[str]:
    if not vals:
        return None
    if len(vals) != 1:
        raise HTTPException(status_code=400, detail=f"'{name}' must be a single value (not multiple).")
    return vals[0]


def _rows_to_list(rows) -> List[str]:
    return [str(r[0]).strip() for r in rows if r and r[0] is not None and str(r[0]).strip()]


@router.get("/zones")
def get_zones(db: Session = Depends(get_db)) -> Dict[str, Any]:
    q = text(
        """
        SELECT DISTINCT loc.zone
        FROM dim_location loc
        WHERE NULLIF(TRIM(loc.zone), '') IS NOT NULL
        ORDER BY loc.zone
        """
    )
    rows = db.execute(q).fetchall()
    return {"zones": _rows_to_list(rows)}


@router.get("/states")
def get_states(
    zone: Optional[str] = Query(None),
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    params: Dict[str, Any] = {}
    clauses: List[str] = ["NULLIF(TRIM(loc.state), '') IS NOT NULL"]

    if zone and zone.strip():
        clauses.append("loc.zone = :zone")
        params["zone"] = zone.strip()

    where_sql = "WHERE " + " AND ".join(clauses)

    q = text(
        f"""
        SELECT DISTINCT loc.state
        FROM dim_location loc
        {where_sql}
        ORDER BY loc.state
        """
    )
    rows = db.execute(q, params).fetchall()
    return {"zone": zone.strip() if zone else None, "states": _rows_to_list(rows)}


@router.get("/lgas")
def get_lgas(
    state: str = Query(...),
    zone: Optional[str] = Query(None),
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    if not state or not state.strip():
        raise HTTPException(status_code=400, detail="Missing required parameter: state")

    params: Dict[str, Any] = {"state": state.strip()}
    clauses: List[str] = [
        "loc.state = :state",
        "NULLIF(TRIM(loc.lga), '') IS NOT NULL",
    ]

    if zone and zone.strip():
        clauses.append("loc.zone = :zone")
        params["zone"] = zone.strip()

    where_sql = "WHERE " + " AND ".join(clauses)

    q = text(
        f"""
        SELECT DISTINCT loc.lga
        FROM dim_location loc
        {where_sql}
        ORDER BY loc.lga
        """
    )
    rows = db.execute(q, params).fetchall()
    return {"zone": zone.strip() if zone else None, "state": state.strip(), "lgas": _rows_to_list(rows)}


@router.get("/wards")
def get_wards(
    state: str = Query(...),
    lga: str = Query(...),
    zone: Optional[str] = Query(None),
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    if not state or not state.strip():
        raise HTTPException(status_code=400, detail="Missing required parameter: state")
    if not lga or not lga.strip():
        raise HTTPException(status_code=400, detail="Missing required parameter: lga")

    params: Dict[str, Any] = {"state": state.strip(), "lga": lga.strip()}
    clauses: List[str] = [
        "loc.state = :state",
        "loc.lga = :lga",
        "NULLIF(TRIM(loc.ward), '') IS NOT NULL",
    ]

    if zone and zone.strip():
        clauses.append("loc.zone = :zone")
        params["zone"] = zone.strip()

    where_sql = "WHERE " + " AND ".join(clauses)

    q = text(
        f"""
        SELECT DISTINCT loc.ward
        FROM dim_location loc
        {where_sql}
        ORDER BY loc.ward
        """
    )
    rows = db.execute(q, params).fetchall()
    return {
        "zone": zone.strip() if zone else None,
        "state": state.strip(),
        "lga": lga.strip(),
        "wards": _rows_to_list(rows),
    }


@router.get("/schools")
def get_schools(
    state: str = Query(...),
    lga: str = Query(...),
    ward: Optional[str] = Query(None),
    zone: Optional[str] = Query(None),
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    if not state or not state.strip():
        raise HTTPException(status_code=400, detail="Missing required parameter: state")
    if not lga or not lga.strip():
        raise HTTPException(status_code=400, detail="Missing required parameter: lga")

    params: Dict[str, Any] = {"state": state.strip(), "lga": lga.strip()}
    clauses: List[str] = [
        "loc.state = :state",
        "loc.lga = :lga",
        "NULLIF(TRIM(s.school_name), '') IS NOT NULL",
    ]

    if ward and ward.strip():
        clauses.append("loc.ward = :ward")
        params["ward"] = ward.strip()
    if zone and zone.strip():
        clauses.append("loc.zone = :zone")
        params["zone"] = zone.strip()

    where_sql = "WHERE " + " AND ".join(clauses)

    # Schools are tied to ward_location_id in dim_school
    q = text(
        f"""
        SELECT DISTINCT s.school_name
        FROM dim_school s
        JOIN dim_location loc ON loc.id = s.ward_location_id
        {where_sql}
        ORDER BY s.school_name
        """
    )
    rows = db.execute(q, params).fetchall()
    return {
        "zone": zone.strip() if zone else None,
        "state": state.strip(),
        "lga": lga.strip(),
        "ward": ward.strip() if ward else None,
        "schools": _rows_to_list(rows),
    }


@router.get("/gap-bands")
def get_gap_bands() -> Dict[str, Any]:
    return {"gap_bands": ["1", "2", "3-5", "5+"]}


@router.get("/years")
def get_years(db: Session = Depends(get_db)) -> Dict[str, Any]:
    q = text(
        """
        SELECT DISTINCT ss3_year
        FROM fact_ss3_completion
        WHERE ss3_year IS NOT NULL
        ORDER BY ss3_year
        """
    )
    rows = db.execute(q).fetchall()
    years = [int(r[0]) for r in rows if r and r[0] is not None]
    return {"years": years}


@router.get("/genders")
def get_genders(db: Session = Depends(get_db)) -> Dict[str, Any]:
    # Only Male + Female (no Unknown). Normalize mixed casing.
    q = text(
        """
        SELECT DISTINCT
          CASE
            WHEN LOWER(TRIM(gender::text)) = 'male' THEN 'Male'
            WHEN LOWER(TRIM(gender::text)) = 'female' THEN 'Female'
            ELSE NULL
          END AS gender_norm
        FROM dim_learner
        WHERE NULLIF(TRIM(gender::text), '') IS NOT NULL
        ORDER BY gender_norm
        """
    )
    rows = db.execute(q).fetchall()
    genders = [r[0] for r in rows if r and r[0] in ("Male", "Female")]
    if not genders:
        genders = ["Male", "Female"]
    return {"genders": genders}
