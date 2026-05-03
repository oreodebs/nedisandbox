import os
import sqlite3
from datetime import datetime, timezone
from pathlib import Path

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from routers.auth import require_admin_user
from routers.clickhouse import get_clickhouse_client

BACKEND_BASE_DIR = Path(__file__).resolve().parent.parent


class SystemComponent(BaseModel):
    key: str
    label: str
    status: str
    detail: str
    checked_at: str
    meta: dict[str, str]


class SystemConfigurationEntry(BaseModel):
    label: str
    value: str


class SystemHealthResponse(BaseModel):
    checked_at: str
    components: list[SystemComponent]
    configuration: list[SystemConfigurationEntry]


router = APIRouter(prefix="/api/v1/system", tags=["system"])


def _checked_at() -> str:
    return datetime.now(timezone.utc).isoformat()


def _auth_db_path() -> Path:
    raw_path = Path(os.getenv("AUTH_DB_PATH", "./data/auth.db"))
    return raw_path if raw_path.is_absolute() else (BACKEND_BASE_DIR / raw_path).resolve()


def _backend_component(checked_at: str) -> SystemComponent:
    return SystemComponent(
        key="backend",
        label="Backend API",
        status="healthy",
        detail="FastAPI responded successfully to the system health check.",
        checked_at=checked_at,
        meta={
            "service": "FastAPI",
            "docs": "/docs",
        },
    )


def _auth_db_component(checked_at: str) -> SystemComponent:
    db_path = _auth_db_path()

    with sqlite3.connect(db_path) as connection:
        connection.execute("SELECT 1").fetchone()

    stat = db_path.stat()
    return SystemComponent(
        key="auth_db",
        label="Auth Database",
        status="healthy",
        detail="SQLite auth database is reachable and responding.",
        checked_at=checked_at,
        meta={
            "path": str(db_path),
            "size_mb": f"{stat.st_size / (1024 * 1024):.2f} MB",
            "updated": datetime.fromtimestamp(stat.st_mtime, timezone.utc).isoformat(),
        },
    )


def _clickhouse_component(checked_at: str) -> SystemComponent:
    client = get_clickhouse_client()
    version = str(client.query("SELECT version()").result_set[0][0])

    return SystemComponent(
        key="clickhouse",
        label="ClickHouse",
        status="healthy",
        detail=f"Live query succeeded against {os.getenv('CLICKHOUSE_DATABASE', 'unknown database')}.",
        checked_at=checked_at,
        meta={
            "host": os.getenv("CLICKHOUSE_HOST", "Not configured"),
            "port": os.getenv("CLICKHOUSE_PORT", "Not configured"),
            "database": os.getenv("CLICKHOUSE_DATABASE", "Not configured"),
            "version": version,
        },
    )


def _email_component(checked_at: str) -> SystemComponent:
    smtp_host = os.getenv("SMTP_HOST")
    smtp_from = os.getenv("SMTP_FROM", "noreply@nedi.local")
    smtp_port = os.getenv("SMTP_PORT", "587")
    smtp_starttls = os.getenv("SMTP_STARTTLS", "true").lower() == "true"

    if not smtp_host:
        return SystemComponent(
            key="email",
            label="Email Service",
            status="warning",
            detail="SMTP host is not configured, so emails stay in development mode.",
            checked_at=checked_at,
            meta={
                "sender": smtp_from,
                "mode": "Development",
                "starttls": "Enabled" if smtp_starttls else "Disabled",
            },
        )

    return SystemComponent(
        key="email",
        label="Email Service",
        status="configured",
        detail=f"SMTP is configured for {smtp_from}.",
        checked_at=checked_at,
        meta={
            "host": smtp_host,
            "port": smtp_port,
            "sender": smtp_from,
            "starttls": "Enabled" if smtp_starttls else "Disabled",
        },
    )


def _error_component_meta(key: str) -> dict[str, str]:
    if key == "clickhouse":
        return {
            "host": os.getenv("CLICKHOUSE_HOST", "Not configured"),
            "port": os.getenv("CLICKHOUSE_PORT", "Not configured"),
            "database": os.getenv("CLICKHOUSE_DATABASE", "Not configured"),
        }
    if key == "email":
        return {
            "sender": os.getenv("SMTP_FROM", "noreply@nedi.local"),
            "host": os.getenv("SMTP_HOST", "Not configured"),
        }
    if key == "auth_db":
        return {
            "path": str(_auth_db_path()),
        }
    if key == "backend":
        return {
            "service": "FastAPI",
        }
    return {}


def _error_component_detail(key: str, exc: Exception) -> str:
    if key == "clickhouse":
        host = os.getenv("CLICKHOUSE_HOST", "unknown host")
        port = os.getenv("CLICKHOUSE_PORT", "unknown port")
        database = os.getenv("CLICKHOUSE_DATABASE", "unknown database")
        return (
            f"Live connection to {host}:{port} for {database} could not be established."
        )

    if key == "auth_db":
        return "SQLite auth database check failed."

    if key == "email":
        return "Email configuration could not be inspected."

    if key == "backend":
        return "Backend health check failed."

    return str(exc)


@router.get("/health", response_model=SystemHealthResponse)
def system_health(
    _: dict[str, object] = Depends(require_admin_user),
) -> SystemHealthResponse:
    checked_at = _checked_at()
    components: list[SystemComponent] = []

    for component_loader in (
        _backend_component,
        _auth_db_component,
        _clickhouse_component,
        _email_component,
    ):
        try:
            components.append(component_loader(checked_at))
        except Exception as exc:
            key = component_loader.__name__.replace("_component", "").lstrip("_")
            label = {
                "backend": "Backend API",
                "auth_db": "Auth Database",
                "clickhouse": "ClickHouse",
                "email": "Email Service",
            }.get(key, "System Check")
            components.append(
                SystemComponent(
                    key=key,
                    label=label,
                    status="error",
                    detail=_error_component_detail(key, exc),
                    checked_at=checked_at,
                    meta=_error_component_meta(key),
                )
            )

    configuration = [
        SystemConfigurationEntry(
            label="Frontend app URL",
            value=os.getenv("APP_BASE_URL", "http://localhost:5173"),
        ),
        SystemConfigurationEntry(
            label="Auth database file",
            value=_auth_db_path().name,
        ),
        SystemConfigurationEntry(
            label="Sign out after inactivity",
            value=f"{os.getenv('SESSION_IDLE_TIMEOUT_MINUTES', '30')} minutes",
        ),
        SystemConfigurationEntry(
            label="Maximum signed-in time",
            value=f"{os.getenv('SESSION_ABSOLUTE_TIMEOUT_HOURS', '8')} hours",
        ),
        SystemConfigurationEntry(
            label="ClickHouse database",
            value=os.getenv("CLICKHOUSE_DATABASE", "Not configured"),
        ),
        SystemConfigurationEntry(
            label="Email sender",
            value=os.getenv("SMTP_FROM", "noreply@nedi.local"),
        ),
    ]

    return SystemHealthResponse(
        checked_at=checked_at,
        components=components,
        configuration=configuration,
    )
