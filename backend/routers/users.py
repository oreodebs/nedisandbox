from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field

from auth_store import (
    create_password_token,
    create_user,
    delete_user,
    get_user_by_id,
    list_users,
    record_audit_event,
    set_user_active,
    update_user,
)
from email_service import build_password_setup_url, send_password_setup_email
from routers.auth import AuthUser, MessageResponse, require_admin_user

UserRole = Literal["SYSTEM_ADMIN", "MINISTER", "STATE_ADMIN"]


class CreateUserRequest(BaseModel):
    email: str = Field(min_length=5, max_length=255)
    first_name: str = Field(min_length=2, max_length=80)
    last_name: str = Field(min_length=2, max_length=80)
    role: UserRole
    assigned_state: str | None = Field(default=None, max_length=100)


class UpdateUserRequest(CreateUserRequest):
    pass


class UpdateUserStatusRequest(BaseModel):
    is_active: bool


class CreateUserResponse(BaseModel):
    message: str
    user: AuthUser
    setup_url: str


class UserResponse(BaseModel):
    message: str
    user: AuthUser


router = APIRouter(prefix="/api/v1/users", tags=["users"])


def _send_setup_email(user: dict[str, object], *, expires_minutes: int = 24 * 60) -> str:
    token = create_password_token(
        int(user["id"]),
        "setup_password",
        expires_minutes=expires_minutes,
    )
    setup_url = build_password_setup_url(token)
    send_password_setup_email(
        to_email=str(user["email"]),
        first_name=str(user["first_name"]),
        last_name=str(user["last_name"]),
        setup_url=setup_url,
    )
    return setup_url


@router.post("", response_model=CreateUserResponse, status_code=status.HTTP_201_CREATED)
def create_user_from_admin(
    payload: CreateUserRequest,
    current_user: dict[str, object] = Depends(require_admin_user),
) -> CreateUserResponse:
    try:
        user = create_user(
            email=payload.email,
            first_name=payload.first_name,
            last_name=payload.last_name,
            role=payload.role,
            assigned_state=payload.assigned_state,
            must_change_password=True,
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc

    setup_url = _send_setup_email(user)
    record_audit_event(
        "ACTIVITY",
        "User Management",
        "User created",
        actor_user_id=int(current_user["id"]),
        subject_user_id=int(user["id"]),
    )
    record_audit_event(
        "ACTIVITY",
        "Invite",
        "Setup invite sent",
        actor_user_id=int(current_user["id"]),
        subject_user_id=int(user["id"]),
    )

    return CreateUserResponse(
        message="User created and password setup email sent.",
        user=AuthUser(**user),
        setup_url=setup_url,
    )


@router.get("", response_model=list[AuthUser])
def get_users(
    _: dict[str, object] = Depends(require_admin_user),
) -> list[AuthUser]:
    return [AuthUser(**user) for user in list_users()]


@router.patch("/{user_id}", response_model=UserResponse)
def update_user_from_admin(
    user_id: int,
    payload: UpdateUserRequest,
    current_user: dict[str, object] = Depends(require_admin_user),
) -> UserResponse:
    existing_user = get_user_by_id(user_id)
    if existing_user is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User account was not found.",
        )

    try:
        user = update_user(
            user_id,
            email=payload.email,
            first_name=payload.first_name,
            last_name=payload.last_name,
            role=payload.role,
            assigned_state=payload.assigned_state,
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc

    if existing_user["role"] != user["role"]:
        record_audit_event(
            "ACTIVITY",
            "Role Change",
            "Role updated",
            actor_user_id=int(current_user["id"]),
            subject_user_id=int(user["id"]),
        )

    return UserResponse(message="User updated successfully.", user=AuthUser(**user))


@router.post("/{user_id}/status", response_model=UserResponse)
def update_user_status(
    user_id: int,
    payload: UpdateUserStatusRequest,
    current_user: dict[str, object] = Depends(require_admin_user),
) -> UserResponse:
    try:
        user = set_user_active(user_id, payload.is_active)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc

    record_audit_event(
        "ACTIVITY",
        "User Management",
        "User reactivated" if payload.is_active else "User deactivated",
        actor_user_id=int(current_user["id"]),
        subject_user_id=int(user["id"]),
    )
    if not payload.is_active:
        record_audit_event(
            "SECURITY",
            "Session",
            "Session revoked",
            actor_user_id=int(current_user["id"]),
            subject_user_id=int(user["id"]),
        )

    return UserResponse(
        message="User status updated successfully.",
        user=AuthUser(**user),
    )


@router.post("/{user_id}/resend-setup", response_model=CreateUserResponse)
def resend_setup_invite(
    user_id: int,
    current_user: dict[str, object] = Depends(require_admin_user),
) -> CreateUserResponse:
    user = get_user_by_id(user_id)
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User account was not found.",
        )

    if not bool(user["is_active"]):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Reactivate this account before resending setup.",
        )

    setup_url = _send_setup_email(user)
    record_audit_event(
        "ACTIVITY",
        "Invite",
        "Setup invite resent",
        actor_user_id=int(current_user["id"]),
        subject_user_id=int(user["id"]),
    )

    return CreateUserResponse(
        message="Setup invitation sent again.",
        user=AuthUser(**user),
        setup_url=setup_url,
    )


@router.delete("/{user_id}", response_model=MessageResponse)
def delete_user_from_admin(
    user_id: int,
    current_user: dict[str, object] = Depends(require_admin_user),
) -> MessageResponse:
    existing_user = get_user_by_id(user_id)
    if existing_user is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User account was not found.",
        )

    try:
        delete_user(user_id)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc

    record_audit_event(
        "ACTIVITY",
        "User Management",
        "User deleted",
        actor_user_id=int(current_user["id"]),
        subject_name=f"{existing_user['first_name']} {existing_user['last_name']}".strip(),
        subject_role=str(existing_user["role"]),
    )

    return MessageResponse(message="User deleted successfully.")
