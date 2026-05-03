import os

from fastapi import APIRouter, Depends, HTTPException, status

from routers.auth import require_admin_user

router = APIRouter(tags=["clickhouse"])


def get_clickhouse_client():
    try:
        import clickhouse_connect
    except ModuleNotFoundError as exc:
        raise RuntimeError(
            "clickhouse-connect is not installed in the active Python environment."
        ) from exc

    return clickhouse_connect.get_client(
        host=os.environ["CLICKHOUSE_HOST"],
        port=int(os.environ["CLICKHOUSE_PORT"]),
        username=os.environ["CLICKHOUSE_USER"],
        password=os.environ["CLICKHOUSE_PASSWORD"],
        database=os.environ["CLICKHOUSE_DATABASE"],
        secure=os.environ["CLICKHOUSE_SECURE"].lower() == "true",
    )


def _clickhouse_health_payload() -> dict[str, object]:
    client = get_clickhouse_client()
    version = client.query("SELECT version()").result_set[0][0]

    return {
        "status": "ok",
        "clickhouse_host": os.environ["CLICKHOUSE_HOST"],
        "clickhouse_database": os.environ["CLICKHOUSE_DATABASE"],
        "clickhouse_version": version,
    }


def _clickhouse_tables_payload() -> dict[str, object]:
    client = get_clickhouse_client()
    tables = [row[0] for row in client.query("SHOW TABLES").result_set]

    return {
        "database": os.environ["CLICKHOUSE_DATABASE"],
        "tables": tables,
    }


@router.get("/api/v1/clickhouse/health")
@router.get("/clickhouse-health", include_in_schema=False)
def clickhouse_health(
    _: dict[str, object] = Depends(require_admin_user),
) -> dict[str, object]:
    try:
        return _clickhouse_health_payload()
    except KeyError as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Missing environment variable: {exc.args[0]}",
        ) from exc
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"ClickHouse connection failed: {exc}",
        ) from exc


@router.get("/api/v1/clickhouse/tables")
@router.get("/clickhouse-tables", include_in_schema=False)
def clickhouse_tables(
    _: dict[str, object] = Depends(require_admin_user),
) -> dict[str, object]:
    try:
        return _clickhouse_tables_payload()
    except KeyError as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Missing environment variable: {exc.args[0]}",
        ) from exc
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"ClickHouse query failed: {exc}",
        ) from exc
