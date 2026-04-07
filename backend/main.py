import os

import clickhouse_connect
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException

load_dotenv()

app = FastAPI(title="NEDI Backend")


def get_clickhouse_client():
    return clickhouse_connect.get_client(
        host=os.environ["CLICKHOUSE_HOST"],
        port=int(os.environ["CLICKHOUSE_PORT"]),
        username=os.environ["CLICKHOUSE_USER"],
        password=os.environ["CLICKHOUSE_PASSWORD"],
        database=os.environ["CLICKHOUSE_DATABASE"],
        secure=os.environ["CLICKHOUSE_SECURE"].lower() == "true",
    )


@app.get("/")
def read_root():
    return {"message": "NEDI backend is running"}


@app.get("/health")
def health():
    return {"status": "ok"}


@app.get("/clickhouse-health")
def clickhouse_health():
    try:
        client = get_clickhouse_client()
        result = client.query("SELECT version()")
        version = result.result_set[0][0]

        return {
            "status": "ok",
            "clickhouse_host": os.environ["CLICKHOUSE_HOST"],
            "clickhouse_database": os.environ["CLICKHOUSE_DATABASE"],
            "clickhouse_version": version,
        }
    except KeyError as exc:
        raise HTTPException(
            status_code=500,
            detail=f"Missing environment variable: {exc.args[0]}",
        )
    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=f"ClickHouse connection failed: {exc}",
        )


@app.get("/clickhouse-tables")
def clickhouse_tables():
    try:
        client = get_clickhouse_client()
        result = client.query("SHOW TABLES")
        tables = [row[0] for row in result.result_set]

        return {
            "database": os.environ["CLICKHOUSE_DATABASE"],
            "tables": tables,
        }
    except KeyError as exc:
        raise HTTPException(
            status_code=500,
            detail=f"Missing environment variable: {exc.args[0]}",
        )
    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=f"ClickHouse query failed: {exc}",
        )


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
