from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel

from auth_store import list_audit_events
from routers.auth import require_admin_user

AuditStream = Literal["ACTIVITY", "SECURITY"]


class AuditEventResponse(BaseModel):
    id: int
    stream: AuditStream
    category: str
    event: str
    user_name: str
    user_role: str | None = None
    created_at: str


router = APIRouter(prefix="/api/v1/audit", tags=["audit"])


@router.get("", response_model=list[AuditEventResponse])
def get_audit_events(
    stream: AuditStream,
    _: dict[str, object] = Depends(require_admin_user),
) -> list[AuditEventResponse]:
    try:
        events = list_audit_events(stream)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc

    return [AuditEventResponse(**event) for event in events]
