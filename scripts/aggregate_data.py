#!/usr/bin/env python3
"""
aggregate_data.py
=================
Run this script after updating any CSV in /public/data/ to regenerate
the pre-aggregated JSON files used by the dashboard.

Usage:
    python3 scripts/aggregate_data.py

The script reads CSVs from ../public/data/ (relative to this script)
and writes compressed JSON files to the same folder.
"""

import gzip
import json
import os
import sys

try:
    import pandas as pd
except ImportError:
    print("ERROR: pandas is required. Install with: pip install pandas")
    sys.exit(1)


# ── Paths ─────────────────────────────────────────────────────────────────────
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(SCRIPT_DIR, "..", "public", "data")
DATA_DIR = os.path.normpath(DATA_DIR)


# ── Helpers ────────────────────────────────────────────────────────────────────
def safe_read(fname: str) -> "pd.DataFrame | None":
    path = os.path.join(DATA_DIR, fname)
    if not os.path.exists(path):
        print(f"  SKIP {fname} (not found)")
        return None
    print(f"  Reading {fname} ...")
    df = pd.read_csv(path, dtype=str, low_memory=False)
    print(f"    → {len(df):,} rows")
    return df


def to_numeric(df: "pd.DataFrame", cols: list) -> "pd.DataFrame":
    for c in cols:
        if c in df.columns:
            df[c] = pd.to_numeric(df[c], errors="coerce").fillna(0)
    return df


def write_gz(obj: list, fname: str) -> None:
    path = os.path.join(DATA_DIR, fname)
    with gzip.open(path, "wt", compresslevel=9, encoding="utf-8") as f:
        json.dump(obj, f, separators=(",", ":"))
    kb = os.path.getsize(path) / 1024
    print(f"    ✓ {fname}  ({kb:.0f} KB)")


def split_by_state(records: list, out_dir: str) -> None:
    """Split a list of records into per-state gzipped JSON files."""
    full_dir = os.path.join(DATA_DIR, out_dir)
    os.makedirs(full_dir, exist_ok=True)

    by_state: dict[str, list] = {}
    for rec in records:
        k = str(rec.get("state", "UNKNOWN"))
        by_state.setdefault(k, []).append(rec)

    for state, recs in by_state.items():
        slug = state.replace("/", "_").replace(" ", "_").replace("(", "").replace(")", "")
        out_path = os.path.join(full_dir, f"{slug}.json.gz")
        with gzip.open(out_path, "wt", compresslevel=9, encoding="utf-8") as f:
            json.dump(recs, f, separators=(",", ":"))

    total_kb = sum(
        os.path.getsize(os.path.join(full_dir, fn)) / 1024
        for fn in os.listdir(full_dir)
        if fn.endswith(".json.gz")
    )
    print(f"    ✓ {out_dir}/  ({len(by_state)} states, {total_kb:.0f} KB total)")


# ── ACCESS COVERAGE ───────────────────────────────────────────────────────────
def agg_access():
    print("\n[1/6] Access Coverage")
    df = safe_read("fact_access_coverage_ward.csv")
    if df is None:
        return
    nums = ["student_count", "school_count", "classroom_count",
            "computer_count", "infrastructure_score", "is_o_level_student"]
    df = to_numeric(df, nums)

    state_keys = ["session", "zone", "state", "gender", "disability",
                  "school_type", "school_level", "class_grade"]
    agg_s = (df.groupby([k for k in state_keys if k in df.columns], dropna=False)
               [nums].sum().reset_index())
    write_gz(agg_s.to_dict(orient="records"), "agg_access_state.json.gz")

    lga_keys = state_keys + ["lga"]
    agg_l = (df.groupby([k for k in lga_keys if k in df.columns], dropna=False)
               [nums].sum().reset_index())
    split_by_state(agg_l.to_dict(orient="records"), "agg_access_lga")


# ── TEACHER CAPACITY ──────────────────────────────────────────────────────────
def agg_teacher():
    print("\n[2/6] Teacher Capacity")
    df = safe_read("fact_teacher_capacity_school.csv")
    if df is None:
        return
    nums = ["student_count", "teacher_count"]
    df = to_numeric(df, nums)

    state_keys = ["session", "zone", "state", "gender", "disability",
                  "school_type", "school_level", "class_grade",
                  "qualification_group", "qualification_status"]
    agg_s = (df.groupby([k for k in state_keys if k in df.columns], dropna=False)
               [nums].sum().reset_index())
    agg_s["pupil_teacher_ratio"] = (
        agg_s["student_count"] / agg_s["teacher_count"].replace(0, float("nan"))
    ).round(2)
    write_gz(agg_s.to_dict(orient="records"), "agg_teacher_state.json.gz")

    lga_keys = state_keys + ["lga"]
    agg_l = (df.groupby([k for k in lga_keys if k in df.columns], dropna=False)
               [nums].sum().reset_index())
    agg_l["pupil_teacher_ratio"] = (
        agg_l["student_count"] / agg_l["teacher_count"].replace(0, float("nan"))
    ).round(2)
    split_by_state(agg_l.to_dict(orient="records"), "agg_teacher_lga")


# ── TRANSITION DIRECT ─────────────────────────────────────────────────────────
def agg_transition_direct():
    print("\n[3/6] Transition Direct")
    df = safe_read("fact_transition_direct.csv")
    if df is None:
        return
    nums = ["ss3_total", "o_level_candidates", "utme_participants",
            "admitted_students", "matriculated_students",
            "delayed_transition_students", "median_time_to_matriculation_years"]
    df = to_numeric(df, nums)

    agg_funcs = {
        "ss3_total": "sum", "o_level_candidates": "sum",
        "utme_participants": "sum", "admitted_students": "sum",
        "matriculated_students": "sum", "delayed_transition_students": "sum",
        "median_time_to_matriculation_years": "mean",
    }

    state_keys = ["session", "zone", "state", "gender", "disability",
                  "exam_body", "institution_type"]
    agg_s = (df.groupby([k for k in state_keys if k in df.columns], dropna=False)
               [[c for c in nums if c in df.columns]]
               .agg({k: v for k, v in agg_funcs.items() if k in df.columns})
               .reset_index())
    write_gz(agg_s.to_dict(orient="records"), "agg_transition_direct_state.json.gz")

    lga_keys = state_keys + ["lga"]
    agg_l = (df.groupby([k for k in lga_keys if k in df.columns], dropna=False)
               [[c for c in nums if c in df.columns]]
               .agg({k: v for k, v in agg_funcs.items() if k in df.columns})
               .reset_index())
    split_by_state(agg_l.to_dict(orient="records"), "agg_transition_direct_lga")


# ── TRANSITION GENERAL ────────────────────────────────────────────────────────
def agg_transition_general():
    print("\n[4/6] Transition General")
    df = safe_read("fact_transition_general.csv")
    if df is None:
        return
    nums = ["o_level_candidates", "utme_participants", "admitted_students",
            "matriculated_students", "delayed_transition_students",
            "median_time_to_matriculation_years"]
    df = to_numeric(df, nums)

    agg_funcs = {
        "o_level_candidates": "sum", "utme_participants": "sum",
        "admitted_students": "sum", "matriculated_students": "sum",
        "delayed_transition_students": "sum",
        "median_time_to_matriculation_years": "mean",
    }

    state_keys = ["session", "zone", "state", "gender", "disability",
                  "exam_body", "gap_band", "institution_type"]
    agg_s = (df.groupby([k for k in state_keys if k in df.columns], dropna=False)
               [[c for c in nums if c in df.columns]]
               .agg({k: v for k, v in agg_funcs.items() if k in df.columns})
               .reset_index())
    write_gz(agg_s.to_dict(orient="records"), "agg_transition_general_state.json.gz")

    lga_keys = state_keys + ["lga"]
    agg_l = (df.groupby([k for k in lga_keys if k in df.columns], dropna=False)
               [[c for c in nums if c in df.columns]]
               .agg({k: v for k, v in agg_funcs.items() if k in df.columns})
               .reset_index())
    split_by_state(agg_l.to_dict(orient="records"), "agg_transition_general_lga")


# ── PERFORMANCE ───────────────────────────────────────────────────────────────
def agg_performance():
    print("\n[5/6] Performance")
    df = safe_read("fact_performance_school.csv")
    if df is None:
        return
    sum_cols = ["candidate_count", "passed_count", "utme_candidate_count",
                "utme_qualified_count", "admitted_count", "matriculated_count"]
    df = to_numeric(df, sum_cols)

    def safe_rate(n, d):
        return (n / d.replace(0, float("nan")) * 100).round(2)

    state_keys = ["session", "zone", "state", "gender", "disability", "olevel_exam_body"]
    agg_s = (df.groupby([k for k in state_keys if k in df.columns], dropna=False)
               [[c for c in sum_cols if c in df.columns]].sum().reset_index())
    agg_s["pass_rate_pct"] = safe_rate(agg_s["passed_count"], agg_s["candidate_count"])
    agg_s["utme_qualifying_rate_pct"] = safe_rate(agg_s["utme_qualified_count"], agg_s["utme_candidate_count"])
    agg_s["admission_rate_pct"] = safe_rate(agg_s["admitted_count"], agg_s["utme_candidate_count"])
    write_gz(agg_s.to_dict(orient="records"), "agg_performance_state.json.gz")

    lga_keys = state_keys + ["lga"]
    agg_l = (df.groupby([k for k in lga_keys if k in df.columns], dropna=False)
               [[c for c in sum_cols if c in df.columns]].sum().reset_index())
    agg_l["pass_rate_pct"] = safe_rate(agg_l["passed_count"], agg_l["candidate_count"])
    agg_l["utme_qualifying_rate_pct"] = safe_rate(agg_l["utme_qualified_count"], agg_l["utme_candidate_count"])
    agg_l["admission_rate_pct"] = safe_rate(agg_l["admitted_count"], agg_l["utme_candidate_count"])
    split_by_state(agg_l.to_dict(orient="records"), "agg_performance_lga")


# ── POLICY IMPACT ─────────────────────────────────────────────────────────────
def agg_policy():
    print("\n[6/6] Policy Impact")

    df = safe_read("fact_policy_impact_tertiary.csv")
    if df is not None:
        df = to_numeric(df, ["admitted_count", "matriculated_count"])
        keys = ["session", "zone", "state", "lga", "gender", "disability",
                "institution_type", "tertiary_institution", "programme_cluster", "discipline_group"]
        agg = (df.groupby([k for k in keys if k in df.columns], dropna=False)
                 [["admitted_count", "matriculated_count"]].sum().reset_index())
        write_gz(agg.to_dict(orient="records"), "agg_policy_tertiary_state.json.gz")

    df2 = safe_read("fact_policy_impact_loans.csv")
    if df2 is not None:
        loan_cols = [c for c in ["loan_applications", "loan_approved", "loan_disbursed"] if c in df2.columns]
        df2 = to_numeric(df2, loan_cols)
        keys2 = ["session", "zone", "state", "lga", "gender", "disability",
                 "institution_type", "tertiary_institution", "programme_cluster", "discipline_group"]
        agg2 = (df2.groupby([k for k in keys2 if k in df2.columns], dropna=False)
                   [loan_cols].sum().reset_index())
        write_gz(agg2.to_dict(orient="records"), "agg_policy_loans_state.json.gz")


# ── Main ───────────────────────────────────────────────────────────────────────
if __name__ == "__main__":
    print(f"Data dir: {DATA_DIR}")
    if not os.path.isdir(DATA_DIR):
        print(f"ERROR: Data directory not found: {DATA_DIR}")
        sys.exit(1)

    agg_access()
    agg_teacher()
    agg_transition_direct()
    agg_transition_general()
    agg_performance()
    agg_policy()

    print("\n✅ All aggregations complete.")
    print("   Commit the new .json.gz files in public/data/ alongside your updated CSVs.")
