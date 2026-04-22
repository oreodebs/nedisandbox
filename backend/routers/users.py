from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field

from auth_store import create_password_token, create_user, list_users
from email_service import build_password_setup_url, send_password_setup_email
from routers.auth import AuthUser, require_admin_user


class CreateUserRequest(BaseModel):
    email: str = Field(min_length=5, max_length=255)
    full_name: str = Field(min_length=2, max_length=120)


class CreateUserResponse(BaseModel):
    message: str
    user: AuthUser
    setup_url: str


router = APIRouter(prefix="/api/v1/users", tags=["users"])


@router.post("", response_model=CreateUserResponse, status_code=status.HTTP_201_CREATED)
def create_user_from_admin(
    payload: CreateUserRequest,
    _: dict[str, object] = Depends(require_admin_user),
) -> CreateUserResponse:
    try:
        user = create_user(
            email=payload.email,
            full_name=payload.full_name,
            must_change_password=True,
        )
        token = create_password_token(int(user["id"]), "setup_password", expires_minutes=24 * 60)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc

    setup_url = build_password_setup_url(token)
    send_password_setup_email(
        to_email=str(user["email"]),
        full_name=str(user["full_name"]),
        setup_url=setup_url,
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
