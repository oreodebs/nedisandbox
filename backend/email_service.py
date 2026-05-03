import os
import smtplib
from email.message import EmailMessage

import requests


def _mail_api_provider() -> str:
    return os.getenv("EMAIL_API_PROVIDER", "").strip().lower()


def _app_base_url() -> str:
    return os.getenv("APP_BASE_URL", "http://localhost:5173").rstrip("/")


def build_password_setup_url(token: str) -> str:
    return f"{_app_base_url()}/setup-password?token={token}"


def build_password_reset_url(token: str) -> str:
    return f"{_app_base_url()}/reset-password?token={token}"


def _send_email_via_mailtrap_api(to_email: str, subject: str, body: str) -> bool:
    token = os.getenv("MAILTRAP_API_TOKEN", "").strip()
    if not token:
        return False

    from_email = os.getenv("SMTP_FROM", "noreply@nedi.local")
    from_name = os.getenv("MAIL_FROM_NAME", "NEDI")

    response = requests.post(
        "https://send.api.mailtrap.io/api/send",
        headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
        },
        json={
            "from": {"email": from_email, "name": from_name},
            "to": [{"email": to_email}],
            "subject": subject,
            "text": body,
            "category": "nedi-auth",
        },
        timeout=30,
    )
    response.raise_for_status()
    return True


def _send_email(to_email: str, subject: str, body: str) -> None:
    from_email = os.getenv("SMTP_FROM", "noreply@nedi.local")
    provider = _mail_api_provider()

    if provider == "mailtrap":
        if _send_email_via_mailtrap_api(to_email, subject, body):
            return

    smtp_host = os.getenv("SMTP_HOST")

    if not smtp_host:
        print("\n--- NEDI DEV EMAIL ---")
        print(f"To: {to_email}")
        print(f"Subject: {subject}")
        print(body)
        print("--- END NEDI DEV EMAIL ---\n")
        return

    message = EmailMessage()
    message["From"] = from_email
    message["To"] = to_email
    message["Subject"] = subject
    message.set_content(body)

    smtp_port = int(os.getenv("SMTP_PORT", "587"))
    smtp_username = os.getenv("SMTP_USERNAME")
    smtp_password = os.getenv("SMTP_PASSWORD")
    smtp_starttls = os.getenv("SMTP_STARTTLS", "true").lower() == "true"

    with smtplib.SMTP(smtp_host, smtp_port) as smtp:
        if smtp_starttls:
            smtp.starttls()
        if smtp_username and smtp_password:
            smtp.login(smtp_username, smtp_password)
        smtp.send_message(message)


def send_password_setup_email(
    *, to_email: str, first_name: str, last_name: str, setup_url: str
) -> None:
    display_name = " ".join(part for part in [first_name.strip(), last_name.strip()] if part).strip()
    body = (
        f"Hello {display_name or first_name},\n\n"
        "An account has been created for you on NEDI.\n"
        "Use the secure link below to set your password:\n\n"
        f"{setup_url}\n\n"
        "This link is temporary. If you did not expect this email, you can ignore it.\n"
    )
    _send_email(to_email, "Set up your NEDI password", body)


def send_forgot_password_email(
    *, to_email: str, first_name: str, last_name: str, reset_url: str
) -> None:
    display_name = " ".join(part for part in [first_name.strip(), last_name.strip()] if part).strip()
    body = (
        f"Hello {display_name or first_name},\n\n"
        "We received a request to reset your NEDI password.\n"
        "Use the secure link below to choose a new password:\n\n"
        f"{reset_url}\n\n"
        "If you did not request this, you can ignore this email.\n"
    )
    _send_email(to_email, "Reset your NEDI password", body)
