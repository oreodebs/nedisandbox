import os
import sqlite3
from contextlib import contextmanager
from datetime import datetime, timedelta, timezone
from math import ceil
from pathlib import Path

from security import generate_secure_token, hash_password, hash_token, verify_password

BASE_DIR = Path(__file__).resolve().parent
TOKEN_PURPOSES = {"setup_password", "forgot_password"}
DEFAULT_SESSION_IDLE_TIMEOUT_MINUTES = 30
DEFAULT_SESSION_ABSOLUTE_TIMEOUT_HOURS = 8
DEFAULT_LOGIN_FAILURE_WINDOW_MINUTES = 15
DEFAULT_LOGIN_MAX_FAILURES = 5
DEFAULT_LOGIN_LOCKOUT_MINUTES = 15
ALLOWED_USER_ROLES = {"SYSTEM_ADMIN", "MINISTER", "STATE_ADMIN"}
LEGACY_ROLE_MAP = {"ADMIN": "SYSTEM_ADMIN", "USER": "MINISTER"}
AUDIT_STREAMS = {"ACTIVITY", "SECURITY"}

CREATE_USERS_TABLE_SQL = """
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT NOT NULL UNIQUE,
    first_name TEXT NOT NULL,
    last_name TEXT NOT NULL,
    full_name TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'USER',
    assigned_state TEXT,
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

CREATE_AUDIT_EVENTS_TABLE_SQL = """
CREATE TABLE IF NOT EXISTS audit_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    stream TEXT NOT NULL,
    category TEXT NOT NULL,
    event TEXT NOT NULL,
    actor_user_id INTEGER,
    actor_name TEXT,
    actor_role TEXT,
    subject_user_id INTEGER,
    subject_name TEXT NOT NULL,
    subject_role TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (actor_user_id) REFERENCES users(id) ON DELETE SET NULL,
    FOREIGN KEY (subject_user_id) REFERENCES users(id) ON DELETE SET NULL
)
"""

CREATE_AUDIT_EVENTS_STREAM_INDEX_SQL = """
CREATE INDEX IF NOT EXISTS idx_audit_events_stream_created_at
ON audit_events(stream, created_at DESC, id DESC)
"""

CREATE_LOGIN_PROTECTION_TABLE_SQL = """
CREATE TABLE IF NOT EXISTS login_protection (
    email TEXT PRIMARY KEY,
    failed_attempts INTEGER NOT NULL DEFAULT 0,
    first_failed_at TEXT,
    last_failed_at TEXT,
    locked_until TEXT,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
)
"""

CREATE_LOGIN_PROTECTION_LOCK_INDEX_SQL = """
CREATE INDEX IF NOT EXISTS idx_login_protection_locked_until
ON login_protection(locked_until)
"""

USER_SELECT_COLUMNS = """
id,
email,
first_name,
last_name,
role,
assigned_state,
is_active,
is_admin,
must_change_password,
password_changed_at,
created_at,
updated_at
"""


class AuthenticationError(ValueError):
    def __init__(self, message: str, *, status_code: int = 401):
        super().__init__(message)
        self.status_code = status_code


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


def _login_failure_window_minutes() -> int:
    return int(
        os.getenv(
            "LOGIN_FAILURE_WINDOW_MINUTES",
            str(DEFAULT_LOGIN_FAILURE_WINDOW_MINUTES),
        )
    )


def _login_max_failures() -> int:
    return int(os.getenv("LOGIN_MAX_FAILURES", str(DEFAULT_LOGIN_MAX_FAILURES)))


def _login_lockout_minutes() -> int:
    return int(
        os.getenv("LOGIN_LOCKOUT_MINUTES", str(DEFAULT_LOGIN_LOCKOUT_MINUTES))
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
        connection.execute(CREATE_AUDIT_EVENTS_TABLE_SQL)
        connection.execute(CREATE_AUDIT_EVENTS_STREAM_INDEX_SQL)
        connection.execute(CREATE_LOGIN_PROTECTION_TABLE_SQL)
        connection.execute(CREATE_LOGIN_PROTECTION_LOCK_INDEX_SQL)
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

    if "first_name" not in existing_columns:
        connection.execute(
            "ALTER TABLE users ADD COLUMN first_name TEXT NOT NULL DEFAULT ''"
        )
    if "last_name" not in existing_columns:
        connection.execute(
            "ALTER TABLE users ADD COLUMN last_name TEXT NOT NULL DEFAULT ''"
        )
    if "role" not in existing_columns:
        connection.execute("ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'USER'")
    if "assigned_state" not in existing_columns:
        connection.execute("ALTER TABLE users ADD COLUMN assigned_state TEXT")
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

    connection.execute(
        """
        UPDATE users
        SET role = 'SYSTEM_ADMIN'
        WHERE UPPER(role) = 'ADMIN'
           OR (is_admin = 1 AND UPPER(role) NOT IN ('SYSTEM_ADMIN', 'MINISTER', 'STATE_ADMIN'))
        """
    )
    connection.execute(
        """
        UPDATE users
        SET role = 'MINISTER'
        WHERE role IS NULL
           OR TRIM(role) = ''
           OR UPPER(role) = 'USER'
        """
    )
    connection.execute(
        """
        UPDATE users
        SET is_admin = CASE WHEN role = 'SYSTEM_ADMIN' THEN 1 ELSE 0 END,
            assigned_state = CASE WHEN role = 'STATE_ADMIN' THEN assigned_state ELSE NULL END
        """
    )
    connection.execute(
        """
        UPDATE users
        SET full_name = TRIM(COALESCE(full_name, ''))
        WHERE full_name IS NULL
           OR full_name != TRIM(COALESCE(full_name, ''))
        """
    )

    rows_to_split = connection.execute(
        """
        SELECT id, full_name
        FROM users
        WHERE TRIM(COALESCE(first_name, '')) = ''
           OR TRIM(COALESCE(last_name, '')) = ''
        """
    ).fetchall()
    for row in rows_to_split:
        first_name, last_name = _split_full_name(row[1] or "")
        connection.execute(
            """
            UPDATE users
            SET first_name = ?,
                last_name = ?,
                full_name = ?
            WHERE id = ?
            """,
            (first_name, last_name, _display_name(first_name, last_name), row[0]),
        )


def _normalize_email(email: str) -> str:
    return email.strip().lower()


def _split_full_name(full_name: str) -> tuple[str, str]:
    cleaned = " ".join(full_name.split())
    if not cleaned:
        return "", ""

    parts = cleaned.split(" ", 1)
    first_name = parts[0]
    last_name = parts[1] if len(parts) > 1 else ""
    return first_name, last_name


def _display_name(first_name: str, last_name: str) -> str:
    return " ".join(part for part in [first_name.strip(), last_name.strip()] if part).strip()


def _normalize_name_parts(first_name: str, last_name: str) -> tuple[str, str, str]:
    cleaned_first_name = " ".join(first_name.split()).strip()
    cleaned_last_name = " ".join(last_name.split()).strip()

    if not cleaned_first_name:
        raise ValueError("First name is required.")
    if not cleaned_last_name:
        raise ValueError("Last name is required.")

    return (
        cleaned_first_name,
        cleaned_last_name,
        _display_name(cleaned_first_name, cleaned_last_name),
    )


def _normalize_role(role: str | None) -> str:
    normalized = (role or "").strip().upper().replace("-", "_").replace(" ", "_")
    normalized = LEGACY_ROLE_MAP.get(normalized, normalized)

    if normalized not in ALLOWED_USER_ROLES:
        raise ValueError("Invalid role. Choose System Admin, Minister, or State Admin.")

    return normalized


def _normalize_assigned_state(assigned_state: str | None, role: str) -> str | None:
    cleaned_state = " ".join((assigned_state or "").split()) or None

    if role == "STATE_ADMIN":
        if not cleaned_state:
            raise ValueError("State Admin users must have an assigned state.")
        return cleaned_state

    return None


def _select_login_protection(
    connection: sqlite3.Connection, normalized_email: str
) -> sqlite3.Row | None:
    return connection.execute(
        """
        SELECT email, failed_attempts, first_failed_at, last_failed_at, locked_until
        FROM login_protection
        WHERE email = ?
        """,
        (normalized_email,),
    ).fetchone()


def _clear_login_failures(
    connection: sqlite3.Connection, normalized_email: str
) -> None:
    connection.execute(
        """
        DELETE FROM login_protection
        WHERE email = ?
        """,
        (normalized_email,),
    )
    connection.commit()


def _lockout_message(locked_until: datetime, *, now: datetime | None = None) -> str:
    remaining_seconds = max(
        0,
        int((locked_until - (now or _utcnow())).total_seconds()),
    )
    remaining_minutes = max(1, ceil(remaining_seconds / 60))
    unit = "minute" if remaining_minutes == 1 else "minutes"
    return f"Too many failed sign-in attempts. Try again in {remaining_minutes} {unit}."


def _record_login_blocked(normalized_email: str, user: sqlite3.Row | None) -> None:
    if user is not None:
        record_audit_event(
            "SECURITY",
            "Authentication",
            "Login blocked",
            subject_user_id=int(user["id"]),
        )
    else:
        record_audit_event(
            "SECURITY",
            "Authentication",
            "Login blocked",
            subject_name=normalized_email,
        )


def _ensure_login_allowed(
    connection: sqlite3.Connection, normalized_email: str, user: sqlite3.Row | None
) -> None:
    protection = _select_login_protection(connection, normalized_email)
    if protection is None or not protection["locked_until"]:
        return

    locked_until = _parse_timestamp(protection["locked_until"])
    now = _utcnow()
    if locked_until <= now:
        connection.execute(
            """
            DELETE FROM login_protection
            WHERE email = ?
            """,
            (normalized_email,),
        )
        connection.commit()
        return

    _record_login_blocked(normalized_email, user)
    raise AuthenticationError(
        _lockout_message(locked_until, now=now),
        status_code=429,
    )


def _register_failed_login(
    connection: sqlite3.Connection, normalized_email: str
) -> datetime | None:
    now = _utcnow()
    window = timedelta(minutes=_login_failure_window_minutes())
    max_failures = max(1, _login_max_failures())
    lockout_period = timedelta(minutes=max(1, _login_lockout_minutes()))
    protection = _select_login_protection(connection, normalized_email)

    failed_attempts = 1
    first_failed_at = now
    locked_until: datetime | None = None

    if protection is not None and protection["last_failed_at"]:
        last_failed_at = _parse_timestamp(protection["last_failed_at"])
        if last_failed_at + window >= now:
            failed_attempts = int(protection["failed_attempts"] or 0) + 1
            first_failed_at = (
                _parse_timestamp(protection["first_failed_at"])
                if protection["first_failed_at"]
                else now
            )

    if failed_attempts >= max_failures:
        locked_until = now + lockout_period

    connection.execute(
        """
        INSERT INTO login_protection (
            email,
            failed_attempts,
            first_failed_at,
            last_failed_at,
            locked_until,
            updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(email) DO UPDATE SET
            failed_attempts = excluded.failed_attempts,
            first_failed_at = excluded.first_failed_at,
            last_failed_at = excluded.last_failed_at,
            locked_until = excluded.locked_until,
            updated_at = excluded.updated_at
        """,
        (
            normalized_email,
            failed_attempts,
            _timestamp(first_failed_at),
            _timestamp(now),
            _timestamp(locked_until) if locked_until else None,
            _timestamp(now),
        ),
    )
    connection.commit()
    return locked_until


def _row_to_user(row: sqlite3.Row) -> dict[str, object]:
    return {
        "id": row["id"],
        "email": row["email"],
        "first_name": row["first_name"],
        "last_name": row["last_name"],
        "role": row["role"],
        "assigned_state": row["assigned_state"],
        "is_active": bool(row["is_active"]),
        "is_admin": bool(row["is_admin"]),
        "must_change_password": bool(row["must_change_password"]),
        "password_changed_at": row["password_changed_at"],
        "created_at": row["created_at"],
        "updated_at": row["updated_at"],
    }


def _user_snapshot(
    connection: sqlite3.Connection, user_id: int
) -> tuple[str, str | None] | None:
    row = _select_user_by_id(connection, user_id)
    if row is None:
        return None
    return (_display_name(row["first_name"], row["last_name"]), row["role"])


def record_audit_event(
    stream: str,
    category: str,
    event: str,
    *,
    actor_user_id: int | None = None,
    actor_name: str | None = None,
    actor_role: str | None = None,
    subject_user_id: int | None = None,
    subject_name: str | None = None,
    subject_role: str | None = None,
) -> None:
    normalized_stream = stream.strip().upper()
    if normalized_stream not in AUDIT_STREAMS:
        raise ValueError("Invalid audit stream.")

    with get_connection() as connection:
        actor_snapshot = (
            _user_snapshot(connection, actor_user_id) if actor_user_id is not None else None
        )
        subject_snapshot = (
            _user_snapshot(connection, subject_user_id)
            if subject_user_id is not None
            else None
        )

        resolved_actor_name = actor_name or (actor_snapshot[0] if actor_snapshot else None)
        resolved_actor_role = actor_role or (actor_snapshot[1] if actor_snapshot else None)
        resolved_subject_name = (
            subject_name
            or (subject_snapshot[0] if subject_snapshot else None)
            or resolved_actor_name
            or "Unknown User"
        )
        resolved_subject_role = (
            subject_role
            or (subject_snapshot[1] if subject_snapshot else None)
            or resolved_actor_role
        )

        connection.execute(
            """
            INSERT INTO audit_events (
                stream,
                category,
                event,
                actor_user_id,
                actor_name,
                actor_role,
                subject_user_id,
                subject_name,
                subject_role,
                created_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                normalized_stream,
                category.strip(),
                event.strip(),
                actor_user_id,
                resolved_actor_name,
                resolved_actor_role,
                subject_user_id,
                resolved_subject_name,
                resolved_subject_role,
                _timestamp(),
            ),
        )
        connection.commit()


def list_audit_events(stream: str) -> list[dict[str, object]]:
    normalized_stream = stream.strip().upper()
    if normalized_stream not in AUDIT_STREAMS:
        raise ValueError("Invalid audit stream.")

    with get_connection() as connection:
        rows = connection.execute(
            """
            SELECT
                id,
                stream,
                category,
                event,
                subject_name,
                subject_role,
                created_at
            FROM audit_events
            WHERE stream = ?
            ORDER BY created_at DESC, id DESC
            """,
            (normalized_stream,),
        ).fetchall()

    normalized_events: list[dict[str, object]] = []
    for row in rows:
        category = row["category"]
        if normalized_stream == "ACTIVITY":
            if category == "Access":
                continue
            if category == "User Update":
                category = "User Management"

        normalized_events.append(
            {
                "id": row["id"],
                "stream": row["stream"],
                "category": category,
                "event": row["event"],
                "user_name": row["subject_name"],
                "user_role": row["subject_role"],
                "created_at": row["created_at"],
            }
        )

    return normalized_events


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
    first_name: str,
    last_name: str,
    password: str | None = None,
    *,
    role: str = "MINISTER",
    assigned_state: str | None = None,
    must_change_password: bool = True,
) -> dict[str, object]:
    normalized_email = _normalize_email(email)
    cleaned_first_name, cleaned_last_name, cleaned_full_name = _normalize_name_parts(
        first_name, last_name
    )
    normalized_role = _normalize_role(role)
    normalized_state = _normalize_assigned_state(assigned_state, normalized_role)

    password_to_hash = password or generate_secure_token()
    is_admin = normalized_role == "SYSTEM_ADMIN"

    with get_connection() as connection:
        existing_user = _select_user_by_email(connection, normalized_email)
        if existing_user:
            raise ValueError("A user with this email already exists.")

        cursor = connection.execute(
            """
            INSERT INTO users (
                email,
                first_name,
                last_name,
                full_name,
                role,
                assigned_state,
                password_hash,
                is_admin,
                must_change_password,
                password_changed_at,
                updated_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
            """,
            (
                normalized_email,
                cleaned_first_name,
                cleaned_last_name,
                cleaned_full_name,
                normalized_role,
                normalized_state,
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
    first_name = os.getenv("NEDI_ADMIN_FIRST_NAME") or os.getenv("ADMIN_FIRST_NAME")
    last_name = os.getenv("NEDI_ADMIN_LAST_NAME") or os.getenv("ADMIN_LAST_NAME")
    legacy_full_name = (
        os.getenv("NEDI_ADMIN_FULL_NAME") or os.getenv("ADMIN_FULL_NAME") or "NEDI Admin"
    )
    if not first_name or not last_name:
        derived_first_name, derived_last_name = _split_full_name(legacy_full_name)
        first_name = first_name or derived_first_name or "NEDI"
        last_name = last_name or derived_last_name or "Admin"

    if not email or not password:
        return None

    normalized_email = _normalize_email(email)

    with get_connection() as connection:
        existing_user = _select_user_by_email(connection, normalized_email)
        if existing_user:
            connection.execute(
                """
                UPDATE users
                SET role = 'SYSTEM_ADMIN',
                    first_name = ?,
                    last_name = ?,
                    full_name = ?,
                    assigned_state = NULL,
                    is_admin = 1,
                    is_active = 1,
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = ?
                """,
                (
                    first_name,
                    last_name,
                    _display_name(first_name, last_name),
                    existing_user["id"],
                ),
            )
            connection.commit()
            updated_user = _select_user_by_id(connection, existing_user["id"])
            return _row_to_user(updated_user)

    return create_user(
        email=normalized_email,
        first_name=first_name,
        last_name=last_name,
        password=password,
        role="SYSTEM_ADMIN",
        must_change_password=False,
    )


def bootstrap_minister_user() -> dict[str, object] | None:
    email = os.getenv("NEDI_MINISTER_EMAIL") or os.getenv("MINISTER_EMAIL")
    password = os.getenv("NEDI_MINISTER_PASSWORD") or os.getenv("MINISTER_PASSWORD")
    first_name = os.getenv("NEDI_MINISTER_FIRST_NAME") or os.getenv("MINISTER_FIRST_NAME")
    last_name = os.getenv("NEDI_MINISTER_LAST_NAME") or os.getenv("MINISTER_LAST_NAME")
    legacy_full_name = (
        os.getenv("NEDI_MINISTER_FULL_NAME") or os.getenv("MINISTER_FULL_NAME") or "NEDI Minister"
    )
    if not first_name or not last_name:
        derived_first_name, derived_last_name = _split_full_name(legacy_full_name)
        first_name = first_name or derived_first_name or "NEDI"
        last_name = last_name or derived_last_name or "Minister"

    if not email or not password:
        return None

    normalized_email = _normalize_email(email)

    with get_connection() as connection:
        existing_user = _select_user_by_email(connection, normalized_email)
        if existing_user:
            if bool(existing_user["is_admin"]):
                return _row_to_user(existing_user)

            connection.execute(
                """
                UPDATE users
                SET role = 'MINISTER',
                    first_name = ?,
                    last_name = ?,
                    full_name = ?,
                    assigned_state = NULL,
                    password_hash = ?,
                    is_admin = 0,
                    is_active = 1,
                    must_change_password = 0,
                    password_changed_at = ?,
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = ?
                """,
                (
                    first_name,
                    last_name,
                    _display_name(first_name, last_name),
                    hash_password(password),
                    _timestamp(),
                    existing_user["id"],
                ),
            )
            connection.commit()
            updated_user = _select_user_by_id(connection, existing_user["id"])
            return _row_to_user(updated_user)

    return create_user(
        email=normalized_email,
        first_name=first_name,
        last_name=last_name,
        password=password,
        role="MINISTER",
        must_change_password=False,
    )


def authenticate_user(email: str, password: str) -> dict[str, object]:
    normalized_email = _normalize_email(email)

    with get_connection() as connection:
        user = connection.execute(
            f"""
            SELECT {USER_SELECT_COLUMNS}, password_hash
            FROM users
            WHERE email = ?
            """,
            (normalized_email,),
        ).fetchone()

        _ensure_login_allowed(connection, normalized_email, user)

    if user is None:
        with get_connection() as connection:
            locked_until = _register_failed_login(connection, normalized_email)

        record_audit_event(
            "SECURITY",
            "Authentication",
            "Login failed",
            subject_name=normalized_email,
        )
        if locked_until is not None:
            _record_login_blocked(normalized_email, None)
            raise AuthenticationError(
                _lockout_message(locked_until),
                status_code=429,
            )
        raise AuthenticationError("Invalid email or password.", status_code=401)

    if not bool(user["is_active"]):
        _record_login_blocked(normalized_email, user)
        raise AuthenticationError(
            "This user account is inactive.",
            status_code=403,
        )

    if not verify_password(password, user["password_hash"]):
        with get_connection() as connection:
            locked_until = _register_failed_login(connection, normalized_email)

        record_audit_event(
            "SECURITY",
            "Authentication",
            "Login failed",
            subject_user_id=int(user["id"]),
        )
        if locked_until is not None:
            _record_login_blocked(normalized_email, user)
            raise AuthenticationError(
                _lockout_message(locked_until),
                status_code=429,
            )
        raise AuthenticationError("Invalid email or password.", status_code=401)

    with get_connection() as connection:
        _clear_login_failures(connection, normalized_email)

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

    record_audit_event(
        "SECURITY",
        "Session",
        "Session started",
        subject_user_id=user_id,
    )
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
                users.first_name,
                users.last_name,
                users.role,
                users.assigned_state,
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
            record_audit_event(
                "SECURITY",
                "Session",
                "Session revoked",
                subject_user_id=int(session["id"]),
            )
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
            record_audit_event(
                "SECURITY",
                "Session",
                "Session timed out",
                subject_user_id=int(session["id"]),
            )
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


def update_user(
    user_id: int,
    *,
    email: str,
    first_name: str,
    last_name: str,
    role: str,
    assigned_state: str | None = None,
) -> dict[str, object]:
    normalized_email = _normalize_email(email)
    cleaned_first_name, cleaned_last_name, cleaned_full_name = _normalize_name_parts(
        first_name, last_name
    )
    normalized_role = _normalize_role(role)
    normalized_state = _normalize_assigned_state(assigned_state, normalized_role)

    with get_connection() as connection:
        user = _select_user_by_id(connection, user_id)
        if user is None:
            raise ValueError("User account was not found.")

        existing_user = connection.execute(
            """
            SELECT id
            FROM users
            WHERE email = ?
              AND id != ?
            """,
            (normalized_email, user_id),
        ).fetchone()
        if existing_user is not None:
            raise ValueError("A user with this email already exists.")

        connection.execute(
            """
            UPDATE users
            SET email = ?,
                first_name = ?,
                last_name = ?,
                full_name = ?,
                role = ?,
                assigned_state = ?,
                is_admin = ?,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
            """,
            (
                normalized_email,
                cleaned_first_name,
                cleaned_last_name,
                cleaned_full_name,
                normalized_role,
                normalized_state,
                1 if normalized_role == "SYSTEM_ADMIN" else 0,
                user_id,
            ),
        )
        connection.commit()
        updated_user = _select_user_by_id(connection, user_id)

    return _row_to_user(updated_user)


def set_user_active(user_id: int, is_active: bool) -> dict[str, object]:
    with get_connection() as connection:
        user = _select_user_by_id(connection, user_id)
        if user is None:
            raise ValueError("User account was not found.")

        connection.execute(
            """
            UPDATE users
            SET is_active = ?,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
            """,
            (1 if is_active else 0, user_id),
        )
        if not is_active:
            connection.execute(
                """
                UPDATE auth_sessions
                SET revoked_at = COALESCE(revoked_at, CURRENT_TIMESTAMP)
                WHERE user_id = ?
                  AND revoked_at IS NULL
                """,
                (user_id,),
            )
        connection.commit()
        updated_user = _select_user_by_id(connection, user_id)

    return _row_to_user(updated_user)


def delete_user(user_id: int) -> None:
    with get_connection() as connection:
        user = _select_user_by_id(connection, user_id)
        if user is None:
            raise ValueError("User account was not found.")

        connection.execute(
            """
            DELETE FROM users
            WHERE id = ?
            """,
            (user_id,),
        )
        connection.commit()


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

    if purpose == "forgot_password":
        record_audit_event(
            "SECURITY",
            "Token",
            "Password reset token issued",
            subject_user_id=user_id,
        )
    elif purpose == "setup_password":
        record_audit_event(
            "SECURITY",
            "Token",
            "Setup token issued",
            subject_user_id=user_id,
        )

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

    if purpose == "forgot_password":
        record_audit_event(
            "SECURITY",
            "Token",
            "Password reset token used",
            subject_user_id=int(user["id"]),
        )
    elif purpose == "setup_password":
        record_audit_event(
            "SECURITY",
            "Token",
            "Setup token used",
            subject_user_id=int(user["id"]),
        )

    return _row_to_user(user)
