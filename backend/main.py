from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.routers import kpis_direct, kpis_overview, filters

app = FastAPI(title="NEDI KPI API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(filters.router)

# ✅ Mount direct KPIs under /kpis/direct
app.include_router(kpis_direct.router, prefix="/kpis/direct", tags=["kpis_direct"])

# overview already has prefix="/kpis/overview" inside the file
app.include_router(kpis_overview.router)