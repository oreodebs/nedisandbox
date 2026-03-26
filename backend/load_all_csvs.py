from __future__ import annotations

import argparse
import csv
import os
import re
from pathlib import Path
from typing import Dict, List, Tuple, Optional

import psycopg2
from psycopg2 import sql
from dotenv import load_dotenv


# -----------------------------
# ENV
# -----------------------------
def load_env():
    base_dir = Path(__file__).resolve().parent
    load_dotenv(base_dir / ".env")


def get_db_url() -> str:
    load_env()
    db_url = os.getenv("DATABASE_URL")
    if not db_url:
        raise RuntimeError("DATABASE_URL not set. Put it in backend/.env")
    return db_url.replace("postgresql+psycopg2://", "postgresql://")


def connect_pg():
    return psycopg2.connect(get_db_url())


# -----------------------------
# HELPERS
# -----------------------------
_BAD_IDENT = re.compile(r"[^a-zA-Z0-9_]+")


def sanitize_identifier(name: str) -> str:
    name = (name or "").strip().replace("\ufeff", "")
    name = name.lower()
    name = _BAD_IDENT.sub("_", name).strip("_")
    if not name:
        name = "unnamed"
    if name[0].isdigit():
        name = f"c_{name}"
    return name


def csv_header(path: Path) -> List[str]:
    with path.open("r", encoding="utf-8-sig", newline="") as f:
        r = csv.reader(f)
        hdr = next(r, None)
        if not hdr:
            raise RuntimeError(f"{path.name} has no header row.")
        return [sanitize_identifier(h) for h in hdr]


def list_csvs(csv_dir: Path) -> List[Path]:
    return sorted([p for p in csv_dir.glob("*.csv") if p.is_file()])


# -----------------------------
# POSTGRES INTROSPECTION
# -----------------------------
def table_exists(cur, schema: str, table: str) -> bool:
    cur.execute(
        """
        SELECT 1
        FROM information_schema.tables
        WHERE table_schema=%s AND table_name=%s
        LIMIT 1
        """,
        (schema, table),
    )
    return cur.fetchone() is not None


def get_table_columns(cur, schema: str, table: str) -> List[Tuple[str, str, str, str]]:
    cur.execute(
        """
        SELECT column_name, data_type, udt_name, is_nullable
        FROM information_schema.columns
        WHERE table_schema=%s AND table_name=%s
        ORDER BY ordinal_position
        """,
        (schema, table),
    )
    rows = cur.fetchall()
    return [(r[0].lower(), r[1], r[2], r[3]) for r in rows]


def get_pk_columns(cur, schema: str, table: str) -> List[str]:
    cur.execute(
        """
        SELECT kcu.column_name
        FROM information_schema.table_constraints tc
        JOIN information_schema.key_column_usage kcu
          ON tc.constraint_name = kcu.constraint_name
         AND tc.table_schema = kcu.table_schema
        WHERE tc.table_schema = %s
          AND tc.table_name = %s
          AND tc.constraint_type = 'PRIMARY KEY'
        ORDER BY kcu.ordinal_position
        """,
        (schema, table),
    )
    return [r[0].lower() for r in cur.fetchall()]


def truncate(cur, schema: str, table: str):
    cur.execute(sql.SQL("TRUNCATE TABLE {}.{};").format(sql.Identifier(schema), sql.Identifier(table)))


def enum_labels(cur, enum_type_name: str) -> List[str]:
    cur.execute(
        """
        SELECT e.enumlabel
        FROM pg_type t
        JOIN pg_enum e ON e.enumtypid = t.oid
        WHERE t.typname = %s
        ORDER BY e.enumsortorder
        """,
        (enum_type_name,),
    )
    return [r[0] for r in cur.fetchall()]


def choose_enum_default(labels: List[str], preferred: Optional[List[str]] = None) -> Optional[str]:
    if not labels:
        return None
    preferred = preferred or []
    upper_map = {l.upper(): l for l in labels}  # preserve exact stored label
    for p in preferred:
        if p.upper() in upper_map:
            return upper_map[p.upper()]
    return labels[0]


# -----------------------------
# STAGING
# -----------------------------
def create_temp_staging(cur, stage_name: str, cols: List[str]):
    col_defs = [sql.SQL("{} TEXT").format(sql.Identifier(c)) for c in cols]
    cur.execute(sql.SQL("DROP TABLE IF EXISTS {};").format(sql.Identifier(stage_name)))
    cur.execute(
        sql.SQL("CREATE TEMP TABLE {} ({});").format(
            sql.Identifier(stage_name),
            sql.SQL(", ").join(col_defs),
        )
    )


def copy_csv_into(cur, schema: str, table: str, csv_path: Path):
    copy_stmt = sql.SQL(
        """
        COPY {}.{} FROM STDIN WITH (
            FORMAT csv,
            HEADER true,
            DELIMITER ',',
            QUOTE '"',
            ESCAPE '"',
            NULL '',
            ENCODING 'UTF8'
        );
        """
    ).format(sql.Identifier(schema), sql.Identifier(table))

    with csv_path.open("r", encoding="utf-8-sig", newline="") as f:
        cur.copy_expert(copy_stmt.as_string(cur.connection), f)


# -----------------------------
# CASTING / NORMALIZATION
# -----------------------------
def enum_cast_expr(staging_col_sql: sql.SQL, enum_type_name: str) -> sql.SQL:
    return sql.SQL(
        """(
            SELECT e.enumlabel
            FROM pg_type t
            JOIN pg_enum e ON e.enumtypid = t.oid
            WHERE t.typname = {enum_type}
              AND LOWER(e.enumlabel) = LOWER(BTRIM({val}))
            LIMIT 1
        )::{enum_ident}"""
    ).format(
        enum_type=sql.Literal(enum_type_name),
        val=staging_col_sql,
        enum_ident=sql.Identifier(enum_type_name),
    )


def school_level_infer_text(school_name_sql: sql.SQL) -> sql.SQL:
    return sql.SQL(
        """CASE
            WHEN {n} IS NULL OR BTRIM({n}) = '' THEN NULL
            WHEN LOWER({n}) LIKE '%primary%' THEN 'PRIMARY'
            WHEN LOWER({n}) LIKE '%secondary%' THEN 'SECONDARY'
            WHEN LOWER({n}) LIKE '%grammar%' THEN 'SECONDARY'
            WHEN LOWER({n}) LIKE '%college%' THEN 'SECONDARY'
            WHEN LOWER({n}) LIKE '%poly%' THEN 'TERTIARY'
            WHEN LOWER({n}) LIKE '%university%' THEN 'TERTIARY'
            WHEN LOWER({n}) LIKE '%college of education%' THEN 'TERTIARY'
            ELSE NULL
        END"""
    ).format(n=school_name_sql)


def infer_school_type_text(school_name_sql: sql.SQL) -> sql.SQL:
    """
    Best-effort inference from name. Returns one of: RELIGIOUS/PRIVATE/PUBLIC (text), or NULL.
    Your enum might use different labels; we still cast case-insensitive, and fallback to DB-safe default.
    """
    return sql.SQL(
        """CASE
            WHEN {n} IS NULL OR BTRIM({n}) = '' THEN NULL

            -- religious / mission hints
            WHEN LOWER({n}) LIKE '%st.%' THEN 'RELIGIOUS'
            WHEN LOWER({n}) LIKE '%saint%' THEN 'RELIGIOUS'
            WHEN LOWER({n}) LIKE '%mary%' THEN 'RELIGIOUS'
            WHEN LOWER({n}) LIKE '%catholic%' THEN 'RELIGIOUS'
            WHEN LOWER({n}) LIKE '%anglican%' THEN 'RELIGIOUS'
            WHEN LOWER({n}) LIKE '%methodist%' THEN 'RELIGIOUS'
            WHEN LOWER({n}) LIKE '%baptist%' THEN 'RELIGIOUS'
            WHEN LOWER({n}) LIKE '%church%' THEN 'RELIGIOUS'
            WHEN LOWER({n}) LIKE '%mission%' THEN 'RELIGIOUS'
            WHEN LOWER({n}) LIKE '%islam%' THEN 'RELIGIOUS'
            WHEN LOWER({n}) LIKE '%muslim%' THEN 'RELIGIOUS'
            WHEN LOWER({n}) LIKE '%quran%' THEN 'RELIGIOUS'

            -- private hints
            WHEN LOWER({n}) LIKE '%private%' THEN 'PRIVATE'
            WHEN LOWER({n}) LIKE '%academy%' THEN 'PRIVATE'
            WHEN LOWER({n}) LIKE '%international%' THEN 'PRIVATE'

            ELSE 'PUBLIC'
        END"""
    ).format(n=school_name_sql)


def safe_cast_expr(
    cur,
    col: str,
    data_type: str,
    udt_name: str,
    is_nullable: str,
    table: str,
    all_stage_cols: List[str],
) -> sql.SQL:
    s_col = sql.SQL("s.{}").format(sql.Identifier(col))
    trimmed = sql.SQL("NULLIF(BTRIM({}), '')").format(s_col)
    dt = (data_type or "").lower()

    # -----------------------------
    # SPECIAL: dim_school.school_level (NOT NULL) FIX
    # -----------------------------
    if table == "dim_school" and col == "school_level":
        labels = enum_labels(cur, udt_name) if dt == "user-defined" else []
        default_label = choose_enum_default(
            labels,
            preferred=["SECONDARY", "PRIMARY", "TERTIARY", "UNKNOWN", "OTHER", "UNSPECIFIED"],
        ) or "SECONDARY"

        name_col = "school_name" if "school_name" in all_stage_cols else None
        inferred_text = (
            school_level_infer_text(sql.SQL("s.{}").format(sql.Identifier(name_col)))
            if name_col
            else sql.SQL("NULL")
        )

        if dt == "user-defined":
            direct_enum = enum_cast_expr(s_col, udt_name)
            inferred_enum = enum_cast_expr(inferred_text, udt_name)
            fallback_enum = enum_cast_expr(sql.Literal(default_label), udt_name)
            return sql.SQL("COALESCE({direct}, {inf}, {fallback})").format(
                direct=direct_enum, inf=inferred_enum, fallback=fallback_enum
            )

        return sql.SQL("COALESCE({direct}, {inf}, {fallback})").format(
            direct=trimmed, inf=inferred_text, fallback=sql.Literal(default_label)
        )

    # -----------------------------
    # SPECIAL: dim_school.school_type (NOT NULL) FIX
    # -----------------------------
    if table == "dim_school" and col == "school_type":
        labels = enum_labels(cur, udt_name) if dt == "user-defined" else []
        default_label = choose_enum_default(
            labels,
            preferred=["PUBLIC", "PRIVATE", "RELIGIOUS", "MISSION", "GOVERNMENT", "UNKNOWN", "OTHER", "UNSPECIFIED"],
        ) or "PUBLIC"

        name_col = "school_name" if "school_name" in all_stage_cols else None
        inferred_text = (
            infer_school_type_text(sql.SQL("s.{}").format(sql.Identifier(name_col)))
            if name_col
            else sql.SQL("NULL")
        )

        if dt == "user-defined":
            direct_enum = enum_cast_expr(s_col, udt_name)
            inferred_enum = enum_cast_expr(inferred_text, udt_name)
            fallback_enum = enum_cast_expr(sql.Literal(default_label), udt_name)
            return sql.SQL("COALESCE({direct}, {inf}, {fallback})").format(
                direct=direct_enum, inf=inferred_enum, fallback=fallback_enum
            )

        return sql.SQL("COALESCE({direct}, {inf}, {fallback})").format(
            direct=trimmed, inf=inferred_text, fallback=sql.Literal(default_label)
        )

    # -----------------------------
    # ENUM (general)
    # -----------------------------
    if dt == "user-defined":
        return enum_cast_expr(s_col, udt_name)

    # BOOLEAN
    if dt == "boolean":
        return sql.SQL(
            """CASE
                WHEN {v} IS NULL THEN NULL
                WHEN LOWER({v}) IN ('true','t','1','yes','y') THEN TRUE
                WHEN LOWER({v}) IN ('false','f','0','no','n') THEN FALSE
                ELSE NULL
            END"""
        ).format(v=trimmed)

    # INTs
    if dt in ("integer", "bigint", "smallint"):
        cleaned = sql.SQL("NULLIF(regexp_replace(BTRIM({}), '[, ]', '', 'g'), '')").format(s_col)
        return sql.SQL(
            """CASE
                WHEN {c} ~ '^-?\\d+$' THEN ({c})::{t}
                ELSE NULL
            END"""
        ).format(c=cleaned, t=sql.SQL(dt))

    # NUMERIC / FLOAT
    if dt in ("numeric", "double precision", "real", "decimal"):
        cleaned = sql.SQL("NULLIF(regexp_replace(BTRIM({}), '[, ]', '', 'g'), '')").format(s_col)
        pg_type = "double precision" if dt == "double precision" else dt
        return sql.SQL(
            """CASE
                WHEN {c} ~ '^-?\\d+(\\.\\d+)?$' THEN ({c})::{t}
                ELSE NULL
            END"""
        ).format(c=cleaned, t=sql.SQL(pg_type))

    # DATE / TIMESTAMP
    if dt in ("date", "timestamp without time zone", "timestamp with time zone"):
        pg_type = "timestamp" if "timestamp" in dt else "date"
        return sql.SQL(
            """CASE
                WHEN {v} IS NULL THEN NULL
                ELSE ({v})::{t}
            END"""
        ).format(v=trimmed, t=sql.SQL(pg_type))

    # DEFAULT
    return sql.SQL("({v})::{t}").format(v=trimmed, t=sql.SQL(dt))


# -----------------------------
# LOAD ONE CSV
# -----------------------------
def load_one_csv(cur, schema: str, table: str, csv_path: Path, mode: str) -> Dict[str, int]:
    if not table_exists(cur, schema, table):
        raise RuntimeError(f"Table {schema}.{table} does not exist.")

    if mode == "truncate":
        truncate(cur, schema, table)

    hdr = csv_header(csv_path)
    table_cols = get_table_columns(cur, schema, table)
    table_colnames = [c[0] for c in table_cols]

    common = [c for c in hdr if c in table_colnames]
    if not common:
        raise RuntimeError(f"{csv_path.name}: no matching columns between CSV and {schema}.{table}.")

    stage = f"stage_{table}"
    create_temp_staging(cur, stage, common)
    copy_csv_into(cur, "pg_temp", stage, csv_path)

    col_meta = {name: (dtype, udt, nullable) for (name, dtype, udt, nullable) in table_cols}

    insert_cols = [sql.Identifier(c) for c in common]
    select_exprs = [
        safe_cast_expr(cur, c, col_meta[c][0], col_meta[c][1], col_meta[c][2], table, common)
        for c in common
    ]

    pk_cols = get_pk_columns(cur, schema, table)

    base_insert = sql.SQL("INSERT INTO {}.{} ({}) SELECT {} FROM {} s").format(
        sql.Identifier(schema),
        sql.Identifier(table),
        sql.SQL(", ").join(insert_cols),
        sql.SQL(", ").join(select_exprs),
        sql.Identifier(stage),
    )

    if mode == "upsert" and pk_cols:
        pk_ident = [sql.Identifier(c) for c in pk_cols]
        update_cols = [c for c in common if c not in pk_cols]
        if update_cols:
            set_expr = sql.SQL(", ").join(
                sql.SQL("{} = EXCLUDED.{}").format(sql.Identifier(c), sql.Identifier(c)) for c in update_cols
            )
            insert_sql = sql.SQL("{} ON CONFLICT ({}) DO UPDATE SET {};").format(
                base_insert,
                sql.SQL(", ").join(pk_ident),
                set_expr,
            )
        else:
            insert_sql = sql.SQL("{} ON CONFLICT ({}) DO NOTHING;").format(
                base_insert,
                sql.SQL(", ").join(pk_ident),
            )
    else:
        insert_sql = sql.SQL("{};").format(base_insert)

    cur.execute(insert_sql)

    cur.execute(sql.SQL("SELECT COUNT(*) FROM {}.{};").format(sql.Identifier(schema), sql.Identifier(table)))
    total_after = cur.fetchone()[0]

    cur.execute(sql.SQL("SELECT COUNT(*) FROM {} s;").format(sql.Identifier(stage)))
    staged = cur.fetchone()[0]

    return {"staged_rows": staged, "table_rows_after": total_after}


# -----------------------------
# MAIN
# -----------------------------
def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--csv-dir", required=True)
    ap.add_argument("--schema", default="public")
    ap.add_argument(
        "--mode",
        choices=["truncate", "append", "upsert"],
        default="upsert",
        help="truncate=wipes table first; append=insert only; upsert=on conflict update (default)",
    )
    args = ap.parse_args()

    csv_dir = Path(args.csv_dir).resolve()
    csvs = list_csvs(csv_dir)
    if not csvs:
        raise RuntimeError(f"No CSV files found in {csv_dir}")

    conn = connect_pg()
    conn.autocommit = False

    loaded = 0
    failed = 0

    # Load dim_* first, then fact_* to avoid FK issues
    csvs_sorted = sorted(csvs, key=lambda p: (0 if p.stem.lower().startswith("dim_") else 1, p.name.lower()))

    try:
        with conn.cursor() as cur:
            for csv_path in csvs_sorted:
                table = sanitize_identifier(csv_path.stem)
                try:
                    stats = load_one_csv(cur, args.schema, table, csv_path, args.mode)
                    conn.commit()
                    loaded += 1
                    print(
                        f"✅ {csv_path.name} -> {args.schema}.{table} | staged={stats['staged_rows']} | table_rows_after={stats['table_rows_after']}"
                    )
                except Exception as e:
                    conn.rollback()
                    failed += 1
                    print(f"❌ FAILED {csv_path.name} -> {args.schema}.{table} | {e}")

    finally:
        conn.close()

    print("\n====================")
    print(f"Done. Loaded: {loaded} | Failed: {failed}")
    print("====================\n")


if __name__ == "__main__":
    main()