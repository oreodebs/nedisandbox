import os
import sqlite3
from contextlib import contextmanager
from pathlib import Path

from security import hash_password, verify_password

BASE_DIR = Path(__file__).resolve().parent
ALLOWED_ROLES = {"MINISTER", "EXECUTIVE", "IT_SUPPORT", "PUBLIC"}

CREATE_USERS_TABLE_SQL = """
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT NOT NULL UNIQUE,
    full_name TEXT NOT NULL,
    role TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
)
"""


def _database_path() -> Path:
    raw_path = Path(os.getenv("AUTH_DB_PATH", "./data/auth.db"))
    return raw_path if raw_path.is_absolute() else (BASE_DIR / raw_path).resolve()


def init_auth_database() -> None:
    db_path = _database_path()
    db_path.parent.mkdir(parents=True, exist_ok=True)

    with sqlite3.connect(db_path) as connection:
        connection.execute(CREATE_USERS_TABLE_SQL)
        connection.commit()


@contextmanager
def get_connection():
    db_path = _database_path()
    db_path.parent.mkdir(parents=True, exist_ok=True)

    connection = sqlite3.connect(db_path)
    connection.row_factory = sqlite3.Row
    try:
        yield connection
    finally:
        connection.close()


def _normalize_email(email: str) -> str:
    return email.strip().lower()


def _row_to_user(row: sqlite3.Row) -> dict[str, object]:
    return {
        "id": row["id"],
        "email": row["email"],
        "full_name": row["full_name"],
        "role": row["role"],
        "is_active": bool(row["is_active"]),
    }


def create_user(email: str, full_name: str, password: str, role: str) -> dict[str, object]:
    normalized_email = _normalize_email(email)
    cleaned_role = role.strip().upper()

    if cleaned_role not in ALLOWED_ROLES:
        raise ValueError("Invalid user role supplied.")

    with get_connection() as connection:
        existing_user = connection.execute(
            "SELECT id FROM users WHERE email = ?",
            (normalized_email,),
        ).fetchone()
        if existing_user:
            raise ValueError("A user with this email already exists.")

        cursor = connection.execute(
            """
            INSERT INTO users (email, full_name, role, password_hash)
            VALUES (?, ?, ?, ?)
            """,
            (
                normalized_email,
                full_name.strip(),
                cleaned_role,
                hash_password(password),
            ),
        )
        connection.commit()

        created_user = connection.execute(
            """
            SELECT id, email, full_name, role, is_active
            FROM users
            WHERE id = ?
            """,
            (cursor.lastrowid,),
        ).fetchone()

    return _row_to_user(created_user)


def authenticate_user(email: str, password: str) -> dict[str, object]:
    with get_connection() as connection:
        user = connection.execute(
            """
            SELECT id, email, full_name, role, password_hash, is_active
            FROM users
            WHERE email = ?
            """,
            (_normalize_email(email),),
        ).fetchone()

    if user is None:
        raise ValueError("Invalid email or password.")

    if not bool(user["is_active"]):
        raise ValueError("This user account is inactive.")

    if not verify_password(password, user["password_hash"]):
        raise ValueError("Invalid email or password.")

    return _row_to_user(user)


def list_users() -> list[dict[str, object]]:
    with get_connection() as connection:
        rows = connection.execute(
            """
            SELECT id, email, full_name, role, is_active
            FROM users
            ORDER BY created_at ASC, id ASC
            """
        ).fetchall()

    return [_row_to_user(row) for row in rows]
