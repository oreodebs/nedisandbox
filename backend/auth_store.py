import os
import sqlite3
from contextlib import contextmanager
from datetime import datetime, timedelta, timezone
from pathlib import Path

from security import generate_secure_token, hash_password, hash_token, verify_password

BASE_DIR = Path(__file__).resolve().parent
TOKEN_PURPOSES = {"setup_password", "forgot_password"}
DEFAULT_SESSION_IDLE_TIMEOUT_MINUTES = 30
DEFAULT_SESSION_ABSOLUTE_TIMEOUT_HOURS = 8

CREATE_USERS_TABLE_SQL = """
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT NOT NULL UNIQUE,
    full_name TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'USER',
    password_hash TEXT NOT NULL,
    is_active INTEGER NOT NULL DEFAULT 1,
    is_admin INTEGER NOT NULL DEFAULT 0,
    must_change_password INTEGER NOT NULL DEFAULT 1,
    password_changed_at TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
)
"""

CREATE_PASSWORD_TOKENS_TABLE_SQL = """
CREATE TABLE IF NOT EXISTS password_tokens (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    token_hash TEXT NOT NULL UNIQUE,
    purpose TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    used_at TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
)
"""

CREATE_PASSWORD_TOKENS_HASH_INDEX_SQL = """
CREATE INDEX IF NOT EXISTS idx_password_tokens_token_hash
ON password_tokens(token_hash)
"""

CREATE_AUTH_SESSIONS_TABLE_SQL = """
CREATE TABLE IF NOT EXISTS auth_sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    token_hash TEXT NOT NULL UNIQUE,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_seen_at TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    revoked_at TEXT,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
)
"""

CREATE_AUTH_SESSIONS_HASH_INDEX_SQL = """
CREATE INDEX IF NOT EXISTS idx_auth_sessions_token_hash
ON auth_sessions(token_hash)
"""

USER_SELECT_COLUMNS = """
id,
email,
full_name,
is_active,
is_admin,
must_change_password,
password_changed_at,
created_at,
updated_at
"""


def _database_path() -> Path:
    raw_path = Path(os.getenv("AUTH_DB_PATH", "./data/auth.db"))
    return raw_path if raw_path.is_absolute() else (BASE_DIR / raw_path).resolve()


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _timestamp(value: datetime | None = None) -> str:
    return (value or _utcnow()).isoformat()


def _parse_timestamp(value: str) -> datetime:
    parsed = datetime.fromisoformat(value)
    return parsed if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)


def _session_idle_timeout_minutes() -> int:
    return int(
        os.getenv(
            "SESSION_IDLE_TIMEOUT_MINUTES",
            str(DEFAULT_SESSION_IDLE_TIMEOUT_MINUTES),
        )
    )


def _session_absolute_timeout_hours() -> int:
    return int(
        os.getenv(
            "SESSION_ABSOLUTE_TIMEOUT_HOURS",
            str(DEFAULT_SESSION_ABSOLUTE_TIMEOUT_HOURS),
        )
    )


def init_auth_database() -> None:
    db_path = _database_path()
    db_path.parent.mkdir(parents=True, exist_ok=True)

    with sqlite3.connect(db_path) as connection:
        connection.execute("PRAGMA foreign_keys = ON")
        connection.execute(CREATE_USERS_TABLE_SQL)
        _migrate_users_table(connection)
        connection.execute(CREATE_PASSWORD_TOKENS_TABLE_SQL)
        connection.execute(CREATE_PASSWORD_TOKENS_HASH_INDEX_SQL)
        connection.execute(CREATE_AUTH_SESSIONS_TABLE_SQL)
        connection.execute(CREATE_AUTH_SESSIONS_HASH_INDEX_SQL)
        connection.commit()


@contextmanager
def get_connection():
    db_path = _database_path()
    db_path.parent.mkdir(parents=True, exist_ok=True)

    connection = sqlite3.connect(db_path)
    connection.execute("PRAGMA foreign_keys = ON")
    connection.row_factory = sqlite3.Row
    try:
        yield connection
    finally:
        connection.close()


def _migrate_users_table(connection: sqlite3.Connection) -> None:
    existing_columns = {
        row[1]
        for row in connection.execute("PRAGMA table_info(users)").fetchall()
    }

    if "role" not in existing_columns:
        connection.execute("ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'USER'")
    if "is_admin" not in existing_columns:
        connection.execute("ALTER TABLE users ADD COLUMN is_admin INTEGER NOT NULL DEFAULT 0")
    if "must_change_password" not in existing_columns:
        connection.execute(
            "ALTER TABLE users ADD COLUMN must_change_password INTEGER NOT NULL DEFAULT 0"
        )
    if "password_changed_at" not in existing_columns:
        connection.execute("ALTER TABLE users ADD COLUMN password_changed_at TEXT")
    if "updated_at" not in existing_columns:
        connection.execute("ALTER TABLE users ADD COLUMN updated_at TEXT")
        connection.execute(
            """
            UPDATE users
            SET updated_at = COALESCE(updated_at, created_at, CURRENT_TIMESTAMP)
            """
        )


def _normalize_email(email: str) -> str:
    return email.strip().lower()


def _row_to_user(row: sqlite3.Row) -> dict[str, object]:
    return {
        "id": row["id"],
        "email": row["email"],
        "full_name": row["full_name"],
        "is_active": bool(row["is_active"]),
        "is_admin": bool(row["is_admin"]),
        "must_change_password": bool(row["must_change_password"]),
        "password_changed_at": row["password_changed_at"],
        "created_at": row["created_at"],
        "updated_at": row["updated_at"],
    }


def _select_user_by_id(connection: sqlite3.Connection, user_id: int) -> sqlite3.Row | None:
    return connection.execute(
        f"""
        SELECT {USER_SELECT_COLUMNS}
        FROM users
        WHERE id = ?
        """,
        (user_id,),
    ).fetchone()


def _select_user_by_email(
    connection: sqlite3.Connection, email: str
) -> sqlite3.Row | None:
    return connection.execute(
        f"""
        SELECT {USER_SELECT_COLUMNS}
        FROM users
        WHERE email = ?
        """,
        (_normalize_email(email),),
    ).fetchone()


def get_user_by_id(user_id: int) -> dict[str, object] | None:
    with get_connection() as connection:
        user = _select_user_by_id(connection, user_id)

    return _row_to_user(user) if user else None


def get_user_by_email(email: str) -> dict[str, object] | None:
    with get_connection() as connection:
        user = _select_user_by_email(connection, email)

    return _row_to_user(user) if user else None


def create_user(
    email: str,
    full_name: str,
    password: str | None = None,
    *,
    is_admin: bool = False,
    must_change_password: bool = True,
) -> dict[str, object]:
    normalized_email = _normalize_email(email)
    cleaned_name = full_name.strip()

    if not cleaned_name:
        raise ValueError("Full name is required.")

    password_to_hash = password or generate_secure_token()
    role_value = "ADMIN" if is_admin else "USER"

    with get_connection() as connection:
        existing_user = _select_user_by_email(connection, normalized_email)
        if existing_user:
            raise ValueError("A user with this email already exists.")

        cursor = connection.execute(
            """
            INSERT INTO users (
                email,
                full_name,
                role,
                password_hash,
                is_admin,
                must_change_password,
                password_changed_at,
                updated_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
            """,
            (
                normalized_email,
                cleaned_name,
                role_value,
                hash_password(password_to_hash),
                1 if is_admin else 0,
                1 if must_change_password else 0,
                None if must_change_password else _timestamp(),
            ),
        )
        connection.commit()
        created_user = _select_user_by_id(connection, cursor.lastrowid)

    return _row_to_user(created_user)


def bootstrap_admin_user() -> dict[str, object] | None:
    email = os.getenv("NEDI_ADMIN_EMAIL") or os.getenv("ADMIN_EMAIL")
    password = os.getenv("NEDI_ADMIN_PASSWORD") or os.getenv("ADMIN_PASSWORD")
    full_name = (
        os.getenv("NEDI_ADMIN_FULL_NAME")
        or os.getenv("ADMIN_FULL_NAME")
        or "NEDI Admin"
    )

    if not email or not password:
        return None

    normalized_email = _normalize_email(email)

    with get_connection() as connection:
        existing_user = _select_user_by_email(connection, normalized_email)
        if existing_user:
            connection.execute(
                """
                UPDATE users
                SET is_admin = 1,
                    is_active = 1,
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = ?
                """,
                (existing_user["id"],),
            )
            connection.commit()
            updated_user = _select_user_by_id(connection, existing_user["id"])
            return _row_to_user(updated_user)

    return create_user(
        email=normalized_email,
        full_name=full_name,
        password=password,
        is_admin=True,
        must_change_password=False,
    )


def authenticate_user(email: str, password: str) -> dict[str, object]:
    with get_connection() as connection:
        user = connection.execute(
            f"""
            SELECT {USER_SELECT_COLUMNS}, password_hash
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


def create_auth_session(user_id: int) -> str:
    raw_token = generate_secure_token()
    now = _utcnow()
    expires_at = now + timedelta(hours=_session_absolute_timeout_hours())

    with get_connection() as connection:
        user = _select_user_by_id(connection, user_id)
        if user is None:
            raise ValueError("User account was not found.")

        connection.execute(
            """
            INSERT INTO auth_sessions (
                user_id,
                token_hash,
                last_seen_at,
                expires_at
            )
            VALUES (?, ?, ?, ?)
            """,
            (user_id, hash_token(raw_token), _timestamp(now), _timestamp(expires_at)),
        )
        connection.commit()

    return raw_token


def revoke_auth_session(raw_token: str) -> None:
    with get_connection() as connection:
        connection.execute(
            """
            UPDATE auth_sessions
            SET revoked_at = COALESCE(revoked_at, CURRENT_TIMESTAMP)
            WHERE token_hash = ?
            """,
            (hash_token(raw_token),),
        )
        connection.commit()


def get_user_by_session_token(raw_token: str) -> dict[str, object]:
    now = _utcnow()

    with get_connection() as connection:
        session = connection.execute(
            f"""
            SELECT
                auth_sessions.id AS session_id,
                auth_sessions.last_seen_at,
                auth_sessions.expires_at,
                auth_sessions.revoked_at,
                users.id,
                users.email,
                users.full_name,
                users.is_active,
                users.is_admin,
                users.must_change_password,
                users.password_changed_at,
                users.created_at,
                users.updated_at
            FROM auth_sessions
            JOIN users ON users.id = auth_sessions.user_id
            WHERE auth_sessions.token_hash = ?
            """,
            (hash_token(raw_token),),
        ).fetchone()

        if session is None:
            raise ValueError("Invalid or expired session.")

        if session["revoked_at"] is not None:
            raise ValueError("This session has been logged out.")

        if _parse_timestamp(session["expires_at"]) < now:
            connection.execute(
                """
                UPDATE auth_sessions
                SET revoked_at = CURRENT_TIMESTAMP
                WHERE id = ?
                """,
                (session["session_id"],),
            )
            connection.commit()
            raise ValueError("This session has expired.")

        last_seen_at = _parse_timestamp(session["last_seen_at"])
        idle_timeout = timedelta(minutes=_session_idle_timeout_minutes())
        if last_seen_at + idle_timeout < now:
            connection.execute(
                """
                UPDATE auth_sessions
                SET revoked_at = CURRENT_TIMESTAMP
                WHERE id = ?
                """,
                (session["session_id"],),
            )
            connection.commit()
            raise ValueError("This session timed out due to inactivity.")

        if not bool(session["is_active"]):
            raise ValueError("User account is not active.")

        connection.execute(
            """
            UPDATE auth_sessions
            SET last_seen_at = ?
            WHERE id = ?
            """,
            (_timestamp(now), session["session_id"]),
        )
        connection.commit()

    return _row_to_user(session)


def list_users() -> list[dict[str, object]]:
    with get_connection() as connection:
        rows = connection.execute(
            f"""
            SELECT {USER_SELECT_COLUMNS}
            FROM users
            ORDER BY created_at ASC, id ASC
            """
        ).fetchall()

    return [_row_to_user(row) for row in rows]


def set_user_password(user_id: int, new_password: str) -> dict[str, object]:
    with get_connection() as connection:
        user = _select_user_by_id(connection, user_id)
        if user is None:
            raise ValueError("User account was not found.")

        connection.execute(
            """
            UPDATE users
            SET password_hash = ?,
                must_change_password = 0,
                password_changed_at = ?,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
            """,
            (hash_password(new_password), _timestamp(), user_id),
        )
        connection.commit()
        updated_user = _select_user_by_id(connection, user_id)

    return _row_to_user(updated_user)


def change_user_password(
    user_id: int, current_password: str, new_password: str
) -> dict[str, object]:
    with get_connection() as connection:
        user = connection.execute(
            f"""
            SELECT {USER_SELECT_COLUMNS}, password_hash
            FROM users
            WHERE id = ?
            """,
            (user_id,),
        ).fetchone()

    if user is None:
        raise ValueError("User account was not found.")

    if not verify_password(current_password, user["password_hash"]):
        raise ValueError("Current password is incorrect.")

    return set_user_password(user_id, new_password)


def create_password_token(
    user_id: int,
    purpose: str,
    *,
    expires_minutes: int = 60,
) -> str:
    if purpose not in TOKEN_PURPOSES:
        raise ValueError("Invalid password token purpose.")

    raw_token = generate_secure_token()
    token_hash = hash_token(raw_token)
    expires_at = _timestamp(_utcnow() + timedelta(minutes=expires_minutes))

    with get_connection() as connection:
        user = _select_user_by_id(connection, user_id)
        if user is None:
            raise ValueError("User account was not found.")

        connection.execute(
            """
            UPDATE password_tokens
            SET used_at = CURRENT_TIMESTAMP
            WHERE user_id = ?
              AND purpose = ?
              AND used_at IS NULL
            """,
            (user_id, purpose),
        )
        connection.execute(
            """
            INSERT INTO password_tokens (user_id, token_hash, purpose, expires_at)
            VALUES (?, ?, ?, ?)
            """,
            (user_id, token_hash, purpose, expires_at),
        )
        connection.commit()

    return raw_token


def consume_password_token(raw_token: str, purpose: str) -> dict[str, object]:
    if purpose not in TOKEN_PURPOSES:
        raise ValueError("Invalid password token purpose.")

    with get_connection() as connection:
        token = connection.execute(
            """
            SELECT id, user_id, expires_at, used_at
            FROM password_tokens
            WHERE token_hash = ?
              AND purpose = ?
            """,
            (hash_token(raw_token), purpose),
        ).fetchone()

        if token is None:
            raise ValueError("Invalid or expired password link.")

        if token["used_at"] is not None:
            raise ValueError("This password link has already been used.")

        if _parse_timestamp(token["expires_at"]) < _utcnow():
            raise ValueError("This password link has expired.")

        connection.execute(
            """
            UPDATE password_tokens
            SET used_at = CURRENT_TIMESTAMP
            WHERE id = ?
            """,
            (token["id"],),
        )
        connection.commit()

        user = _select_user_by_id(connection, token["user_id"])

    if user is None:
        raise ValueError("User account was not found.")

    return _row_to_user(user)
