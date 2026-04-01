#!/usr/bin/env python3
from __future__ import annotations

import argparse
import csv
import json
from pathlib import Path
from typing import Dict, Iterable

try:
    import pandas as pd  # type: ignore
except Exception:  # pragma: no cover
    pd = None

DATASETS = {
    "fact_access_coverage_ward.csv": "access",
    "fact_access_coverage_almajiri_state.csv": "access_almajiri",
    "fact_teacher_capacity_school.csv": "teacher",
    "fact_performance_school.csv": "performance",
    "fact_transition_general.csv": "transition_general",
    "fact_transition_direct.csv": "transition_direct",
    "fact_policy_impact_tertiary.csv": "policy_impact",
    "fact_policy_impact_loans.csv": "policy_loans",
}
SESSION_COLUMNS = ("session", "academic_session", "session_id")
BASE_DIR = Path(__file__).resolve().parent


def slugify_session(value: object) -> str:
    return str(value).strip().replace("/", "_").replace(" ", "_")


def find_session_column(columns: Iterable[str]) -> str | None:
    lowered = {str(col).strip().lower(): str(col) for col in columns}
    for candidate in SESSION_COLUMNS:
        if candidate in lowered:
            return lowered[candidate]
    return None


def append_jsonl(path: Path, records: list[dict]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("a", encoding="utf-8") as handle:
        for record in records:
            handle.write(json.dumps(record, ensure_ascii=False))
            handle.write("\n")


def finalize_jsonl(tmp_path: Path, out_path: Path) -> int:
    count = 0
    out_path.parent.mkdir(parents=True, exist_ok=True)
    with tmp_path.open("r", encoding="utf-8") as src, out_path.open("w", encoding="utf-8") as dst:
        dst.write("[\n")
        first = True
        for line in src:
            line = line.strip()
            if not line:
                continue
            if not first:
                dst.write(",\n")
            dst.write(line)
            first = False
            count += 1
        dst.write("\n]\n")
    return count


def process_with_pandas(source: Path, out_dir: Path, prefix: str) -> Dict[str, int]:
    manifest: Dict[str, int] = {}
    tmp_dir = out_dir / ".tmp"
    if pd is None:
        raise RuntimeError("pandas is required for chunked aggregation")
    first_chunk = True
    session_column = None
    for chunk in pd.read_csv(source, chunksize=50000, low_memory=False):
        if first_chunk:
            session_column = find_session_column(chunk.columns)
            if session_column is None:
                raise RuntimeError(f"No session column found in {source.name}")
            first_chunk = False
        chunk = chunk.fillna("")
        for session_value, group in chunk.groupby(session_column):
            session = slugify_session(session_value)
            records = group.to_dict(orient="records")
            append_jsonl(tmp_dir / f"{prefix}_{session}.jsonl", records)
    for jsonl_path in sorted(tmp_dir.glob(f"{prefix}_*.jsonl")):
        session = jsonl_path.stem[len(prefix) + 1 :]
        count = finalize_jsonl(jsonl_path, out_dir / f"{prefix}_{session}.json")
        manifest[session] = count
        jsonl_path.unlink(missing_ok=True)
    return manifest


def process_with_csv_module(source: Path, out_dir: Path, prefix: str) -> Dict[str, int]:
    tmp_dir = out_dir / ".tmp"
    manifest: Dict[str, int] = {}
    with source.open("r", encoding="utf-8-sig", newline="") as handle:
        reader = csv.DictReader(handle)
        session_column = find_session_column(reader.fieldnames or [])
        if session_column is None:
            raise RuntimeError(f"No session column found in {source.name}")
        buckets: Dict[str, list[dict]] = {}
        max_bucket = 10000
        for row in reader:
            session = slugify_session(row.get(session_column, ""))
            if not session:
                continue
            bucket = buckets.setdefault(session, [])
            bucket.append(row)
            if len(bucket) >= max_bucket:
                append_jsonl(tmp_dir / f"{prefix}_{session}.jsonl", bucket)
                manifest[session] = manifest.get(session, 0) + len(bucket)
                buckets[session] = []
        for session, rows in buckets.items():
            if rows:
                append_jsonl(tmp_dir / f"{prefix}_{session}.jsonl", rows)
                manifest[session] = manifest.get(session, 0) + len(rows)
    for jsonl_path in sorted(tmp_dir.glob(f"{prefix}_*.jsonl")):
        session = jsonl_path.stem[len(prefix) + 1 :]
        finalize_jsonl(jsonl_path, out_dir / f"{prefix}_{session}.json")
        jsonl_path.unlink(missing_ok=True)
    return manifest


def main() -> None:
    parser = argparse.ArgumentParser(description="Split large dashboard CSVs into per-session JSON files.")
    parser.add_argument("--data-dir", default=str(BASE_DIR / "public" / "data"), help="Directory containing raw CSV files")
    parser.add_argument("--out-dir", default=str(BASE_DIR / "public" / "data" / "agg"), help="Directory for aggregated JSON output")
    args = parser.parse_args()

    data_dir = Path(args.data_dir)
    out_dir = Path(args.out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    full_manifest = {}
    for file_name, prefix in DATASETS.items():
        source = data_dir / file_name
        if not source.exists():
            continue
        if pd is not None:
            manifest = process_with_pandas(source, out_dir, prefix)
        else:
            manifest = process_with_csv_module(source, out_dir, prefix)
        full_manifest[prefix] = manifest
        print(f"Processed {file_name} -> {len(manifest)} session files")

    (out_dir / "manifest.json").write_text(json.dumps(full_manifest, indent=2), encoding="utf-8")
    print(f"Wrote manifest to {out_dir / 'manifest.json'}")


if __name__ == "__main__":
    main()
