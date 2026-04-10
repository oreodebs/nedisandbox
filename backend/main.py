from contextlib import asynccontextmanager

from dotenv import load_dotenv
from fastapi import FastAPI

from auth_store import init_auth_database

load_dotenv()

from routers.auth import router as auth_router
from routers.clickhouse import router as clickhouse_router


@asynccontextmanager
async def lifespan(_: FastAPI):
    init_auth_database()
    yield


app = FastAPI(title="NEDI Backend", lifespan=lifespan)


@app.get("/")
def read_root() -> dict[str, str]:
    return {
        "message": "NEDI backend is running",
        "docs": "/docs",
        "api_base": "/api/v1",
    }


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


app.include_router(auth_router)
app.include_router(clickhouse_router)


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
