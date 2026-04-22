import os
import smtplib
from email.message import EmailMessage


def _app_base_url() -> str:
    return os.getenv("APP_BASE_URL", "http://localhost:5173").rstrip("/")


def build_password_setup_url(token: str) -> str:
    return f"{_app_base_url()}/setup-password?token={token}"


def build_password_reset_url(token: str) -> str:
    return f"{_app_base_url()}/reset-password?token={token}"


def _send_email(to_email: str, subject: str, body: str) -> None:
    smtp_host = os.getenv("SMTP_HOST")
    from_email = os.getenv("SMTP_FROM", "noreply@nedi.local")

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
    *, to_email: str, full_name: str, setup_url: str
) -> None:
    body = (
        f"Hello {full_name},\n\n"
        "An account has been created for you on NEDI.\n"
        "Use the secure link below to set your password:\n\n"
        f"{setup_url}\n\n"
        "This link is temporary. If you did not expect this email, you can ignore it.\n"
    )
    _send_email(to_email, "Set up your NEDI password", body)


def send_forgot_password_email(
    *, to_email: str, full_name: str, reset_url: str
) -> None:
    body = (
        f"Hello {full_name},\n\n"
        "We received a request to reset your NEDI password.\n"
        "Use the secure link below to choose a new password:\n\n"
        f"{reset_url}\n\n"
        "If you did not request this, you can ignore this email.\n"
    )
    _send_email(to_email, "Reset your NEDI password", body)
