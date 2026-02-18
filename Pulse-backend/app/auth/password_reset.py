"""Password reset helper utilities."""

import hashlib
import logging
import secrets
from datetime import datetime, timedelta

import requests

from app.core.config import settings

logger = logging.getLogger(__name__)

RESEND_API_URL = "https://api.resend.com/emails"


def hash_reset_token(token: str) -> str:
    """Hash the raw reset token before persistence/lookup."""
    if not token:
        raise ValueError("Reset token is required")
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def generate_password_reset_token() -> tuple[str, str]:
    """Generate a secure one-time token and return raw + hashed values."""
    raw_token = secrets.token_urlsafe(32)
    return raw_token, hash_reset_token(raw_token)


def get_reset_token_expiry() -> datetime:
    """Calculate reset token expiry timestamp."""
    return datetime.utcnow() + timedelta(minutes=settings.reset_token_expiry_minutes)


def build_password_reset_link(raw_token: str) -> str:
    """Build password reset URL for frontend."""
    if not raw_token:
        raise ValueError("Reset token is required")

    frontend_url = settings.frontend_url.rstrip("/")
    if not frontend_url:
        raise ValueError("FRONTEND_URL is not configured")

    return f"{frontend_url}/reset-password?token={raw_token}"


def _build_password_reset_html(reset_link: str) -> str:
    return (
        "<div style=\"font-family: Arial, sans-serif; max-width: 560px; margin: 0 auto;\">"
        "<h2>Reset Your Password</h2>"
        "<p>We received a request to reset your password.</p>"
        f"<p><a href=\"{reset_link}\">Click here to reset your password</a></p>"
        f"<p>This link expires in {settings.reset_token_expiry_minutes} minutes.</p>"
        "<p>If you did not request this, you can ignore this message.</p>"
        "</div>"
    )


def send_reset_email_with_resend(recipient_email: str, reset_link: str) -> None:
    """Send password reset email via Resend HTTP API."""
    if not settings.resend_api_key:
        raise ValueError("RESEND_API_KEY is not configured")
    if not settings.email_from:
        raise ValueError("EMAIL_FROM is not configured")

    payload = {
        "from": settings.email_from,
        "to": [recipient_email],
        "subject": "Reset Your Password",
        "html": _build_password_reset_html(reset_link),
    }
    headers = {
        "Authorization": f"Bearer {settings.resend_api_key}",
        "Content-Type": "application/json",
    }

    response = requests.post(
        RESEND_API_URL,
        headers=headers,
        json=payload,
        timeout=10,
    )

    if response.status_code >= 400:
        raise RuntimeError(
            f"Resend request failed with status {response.status_code}: {response.text}"
        )


def send_reset_email_with_resend_safe(recipient_email: str, reset_link: str) -> None:
    """Best-effort Resend sender for background tasks."""
    try:
        send_reset_email_with_resend(recipient_email, reset_link)
    except Exception as exc:
        logger.exception("Failed to send password reset email via Resend: %s", exc)
