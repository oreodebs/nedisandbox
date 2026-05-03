from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel, Field

from auth_store import (
    AuthenticationError,
    authenticate_user,
    change_user_password,
    create_auth_session,
    record_audit_event,
    consume_password_token,
    create_password_token,
    get_user_by_email,
    get_user_by_session_token,
    revoke_auth_session,
    set_user_password,
)
from email_service import build_password_reset_url, send_forgot_password_email


class AuthUser(BaseModel):
    id: int
    email: str
    first_name: str
    last_name: str
    role: str
    assigned_state: str | None = None
    is_active: bool
    is_admin: bool
    must_change_password: bool
    password_changed_at: str | None = None
    created_at: str | None = None
    updated_at: str | None = None


class LoginRequest(BaseModel):
    email: str = Field(min_length=5, max_length=255)
    password: str = Field(min_length=8, max_length=128)


class LoginResponse(BaseModel):
    message: str
    access_token: str
    token_type: str = "bearer"
    user: AuthUser


class AuthResponse(BaseModel):
    message: str
    user: AuthUser


class MessageResponse(BaseModel):
    message: str


class ChangePasswordRequest(BaseModel):
    current_password: str = Field(min_length=8, max_length=128)
    new_password: str = Field(min_length=8, max_length=128)


class ForgotPasswordRequest(BaseModel):
    email: str = Field(min_length=5, max_length=255)


class ResetPasswordRequest(BaseModel):
    token: str = Field(min_length=20)
    new_password: str = Field(min_length=8, max_length=128)


class SetupPasswordRequest(BaseModel):
    token: str = Field(min_length=20)
    new_password: str = Field(min_length=8, max_length=128)


router = APIRouter(prefix="/api/v1/auth", tags=["auth"])
bearer_scheme = HTTPBearer(auto_error=False)


def _auth_user(user: dict[str, object]) -> AuthUser:
    return AuthUser(**user)


def _bearer_token(credentials: HTTPAuthorizationCredentials | None) -> str:
    if credentials is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing authorization header.",
        )

    if credentials.scheme.lower() != "bearer" or not credentials.credentials:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Use a Bearer access token.",
        )

    return credentials.credentials


def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
) -> dict[str, object]:
    try:
        user = get_user_by_session_token(_bearer_token(credentials))
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=str(exc),
        ) from exc

    return user


def require_admin_user(
    current_user: dict[str, object] = Depends(get_current_user),
) -> dict[str, object]:
    if not bool(current_user["is_admin"]):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access is required.",
        )

    return current_user


@router.post("/login", response_model=LoginResponse)
def login_user(payload: LoginRequest) -> LoginResponse:
    try:
        user = authenticate_user(payload.email, payload.password)
    except AuthenticationError as exc:
        raise HTTPException(status_code=exc.status_code, detail=str(exc)) from exc

    access_token = create_auth_session(int(user["id"]))
    record_audit_event(
        "SECURITY",
        "Authentication",
        "Login successful",
        subject_user_id=int(user["id"]),
    )

    return LoginResponse(
        message="Login successful",
        access_token=access_token,
        user=_auth_user(user),
    )


@router.post("/logout", response_model=MessageResponse)
def logout_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
    current_user: dict[str, object] = Depends(get_current_user),
) -> MessageResponse:
    revoke_auth_session(_bearer_token(credentials))
    record_audit_event(
        "SECURITY",
        "Authentication",
        "Logout successful",
        subject_user_id=int(current_user["id"]),
    )
    record_audit_event(
        "SECURITY",
        "Session",
        "Session revoked",
        subject_user_id=int(current_user["id"]),
    )
    return MessageResponse(message="Logged out successfully")


@router.get("/me", response_model=AuthUser)
def get_me(current_user: dict[str, object] = Depends(get_current_user)) -> AuthUser:
    return _auth_user(current_user)


@router.post("/change-password", response_model=AuthResponse)
def change_password(
    payload: ChangePasswordRequest,
    current_user: dict[str, object] = Depends(get_current_user),
) -> AuthResponse:
    try:
        user = change_user_password(
            int(current_user["id"]),
            payload.current_password,
            payload.new_password,
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc

    record_audit_event(
        "SECURITY",
        "Password",
        "Password changed",
        subject_user_id=int(current_user["id"]),
    )
    return AuthResponse(message="Password changed successfully", user=_auth_user(user))


@router.post("/setup-password", response_model=AuthResponse)
def setup_password(payload: SetupPasswordRequest) -> AuthResponse:
    try:
        user = consume_password_token(payload.token, "setup_password")
        updated_user = set_user_password(int(user["id"]), payload.new_password)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc

    record_audit_event(
        "ACTIVITY",
        "Invite",
        "Setup invite completed",
        subject_user_id=int(updated_user["id"]),
    )
    record_audit_event(
        "SECURITY",
        "Password",
        "Password setup completed",
        subject_user_id=int(updated_user["id"]),
    )
    return AuthResponse(message="Password set successfully", user=_auth_user(updated_user))


@router.post("/forgot-password", response_model=MessageResponse)
def forgot_password(payload: ForgotPasswordRequest) -> MessageResponse:
    user = get_user_by_email(payload.email)

    if user is not None and bool(user["is_active"]):
        token = create_password_token(int(user["id"]), "forgot_password")
        reset_url = build_password_reset_url(token)
        send_forgot_password_email(
            to_email=str(user["email"]),
            first_name=str(user["first_name"]),
            last_name=str(user["last_name"]),
            reset_url=reset_url,
        )

    return MessageResponse(
        message="If an account exists for this email, a reset link has been sent."
    )


@router.post("/reset-password", response_model=AuthResponse)
def reset_password(payload: ResetPasswordRequest) -> AuthResponse:
    try:
        user = consume_password_token(payload.token, "forgot_password")
        updated_user = set_user_password(int(user["id"]), payload.new_password)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc

    record_audit_event(
        "SECURITY",
        "Password",
        "Password reset completed",
        subject_user_id=int(updated_user["id"]),
    )
    return AuthResponse(message="Password reset successfully", user=_auth_user(updated_user))
