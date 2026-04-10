from typing import Literal

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, Field

from auth_store import authenticate_user, create_user, list_users

Role = Literal["MINISTER", "EXECUTIVE", "IT_SUPPORT", "PUBLIC"]


class AuthUser(BaseModel):
    id: int
    email: str
    full_name: str
    role: Role
    is_active: bool


class RegisterRequest(BaseModel):
    email: str = Field(min_length=5, max_length=255)
    full_name: str = Field(min_length=2, max_length=120)
    password: str = Field(min_length=8, max_length=128)
    role: Role = "PUBLIC"


class LoginRequest(BaseModel):
    email: str = Field(min_length=5, max_length=255)
    password: str = Field(min_length=8, max_length=128)


class AuthResponse(BaseModel):
    message: str
    user: AuthUser


router = APIRouter(prefix="/api/v1/auth", tags=["auth"])


@router.post("/register", response_model=AuthResponse, status_code=status.HTTP_201_CREATED)
def register_user(payload: RegisterRequest) -> AuthResponse:
    try:
        user = create_user(
            email=payload.email,
            full_name=payload.full_name,
            password=payload.password,
            role=payload.role,
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc

    return AuthResponse(message="User registered successfully", user=AuthUser(**user))


@router.post("/login", response_model=AuthResponse)
def login_user(payload: LoginRequest) -> AuthResponse:
    try:
        user = authenticate_user(payload.email, payload.password)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=str(exc)) from exc

    return AuthResponse(message="Login successful", user=AuthUser(**user))


@router.get("/users", response_model=list[AuthUser])
def get_users() -> list[AuthUser]:
    return [AuthUser(**user) for user in list_users()]
