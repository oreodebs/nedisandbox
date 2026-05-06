import os
from contextlib import asynccontextmanager
from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from auth_store import bootstrap_admin_user, bootstrap_minister_user, init_auth_database
from routers.audit import router as audit_router
from routers.auth import router as auth_router
from routers.clickhouse import router as clickhouse_router
from routers.system import router as system_router
from routers.users import router as users_router

BASE_DIR = Path(__file__).resolve().parent
load_dotenv(BASE_DIR / ".env")


def _cors_allow_origins() -> list[str]:
    configured_origins = os.getenv("CORS_ALLOW_ORIGINS")
    if configured_origins:
        return [
            origin.strip().rstrip("/")
            for origin in configured_origins.split(",")
            if origin.strip()
        ]

    default_origins = {
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    }

    app_base_url = os.getenv("APP_BASE_URL")
    if app_base_url:
        default_origins.add(app_base_url.rstrip("/"))

    return sorted(default_origins)


@asynccontextmanager
async def lifespan(_: FastAPI):
    init_auth_database()
    bootstrap_admin_user()
    bootstrap_minister_user()
    yield


app = FastAPI(title="NEDI Backend", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_allow_origins(),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


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
app.include_router(users_router)
app.include_router(audit_router)
app.include_router(clickhouse_router)
app.include_router(system_router)


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
