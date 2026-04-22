import base64
import hashlib
import hmac
import os
import secrets

PBKDF2_ALGORITHM = "sha256"
PBKDF2_ITERATIONS = 390_000
SALT_BYTES = 16
AUTH_TOKEN_SECRET_ENV = "AUTH_TOKEN_SECRET"
DEV_TOKEN_SECRET = "dev-only-change-me"


def hash_password(password: str) -> str:
    salt = os.urandom(SALT_BYTES)
    digest = hashlib.pbkdf2_hmac(
        PBKDF2_ALGORITHM,
        password.encode("utf-8"),
        salt,
        PBKDF2_ITERATIONS,
    )

    return (
        "pbkdf2_sha256"
        f"${PBKDF2_ITERATIONS}"
        f"${base64.b64encode(salt).decode('utf-8')}"
        f"${base64.b64encode(digest).decode('utf-8')}"
    )


def verify_password(password: str, stored_hash: str) -> bool:
    try:
        scheme, iterations, salt_b64, digest_b64 = stored_hash.split("$", 3)
    except ValueError:
        return False

    if scheme != "pbkdf2_sha256":
        return False

    salt = base64.b64decode(salt_b64.encode("utf-8"))
    expected_digest = base64.b64decode(digest_b64.encode("utf-8"))
    candidate_digest = hashlib.pbkdf2_hmac(
        PBKDF2_ALGORITHM,
        password.encode("utf-8"),
        salt,
        int(iterations),
    )

    return hmac.compare_digest(candidate_digest, expected_digest)


def generate_secure_token(byte_count: int = 32) -> str:
    return secrets.token_urlsafe(byte_count)


def _token_secret() -> bytes:
    return os.getenv(AUTH_TOKEN_SECRET_ENV, DEV_TOKEN_SECRET).encode("utf-8")


def hash_token(token: str) -> str:
    return hmac.new(_token_secret(), token.encode("utf-8"), hashlib.sha256).hexdigest()
