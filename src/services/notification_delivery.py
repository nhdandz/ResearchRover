"""
Notification delivery service — gửi notification qua email/Slack/Discord/Telegram webhook.

In-app notification đã được lưu trong DB qua model Notification.
Service này chỉ làm phần delivery ngoài.
"""
import asyncio
import os
from typing import Any

import httpx

from src.core.logging import get_logger
from src.storage.models.notification import Notification

logger = get_logger(__name__)


async def deliver_notification(notification: Notification, user: Any) -> None:
    """
    Dispatch notification tới các kênh đã bật trong user.notification_preferences.
    Cập nhật trực tiếp các flag delivered_* trên notification.
    """
    prefs = user.notification_preferences or {}

    # Email (SMTP)
    if prefs.get("email") and user.email:
        try:
            await _send_email(user.email, notification)
            notification.delivered_email = True
        except Exception as e:
            logger.warning("Email delivery failed", error=str(e), user_id=str(user.id))
            notification.delivery_error = (notification.delivery_error or "") + f" email: {e}"

    # Webhook (Slack/Discord/Telegram)
    webhook_targets = []
    if prefs.get("slack_webhook"):
        webhook_targets.append(("slack", prefs["slack_webhook"]))
    if prefs.get("discord_webhook"):
        webhook_targets.append(("discord", prefs["discord_webhook"]))
    if prefs.get("telegram_bot_token") and prefs.get("telegram_chat_id"):
        tg_url = (
            f"https://api.telegram.org/bot{prefs['telegram_bot_token']}/sendMessage"
        )
        webhook_targets.append(("telegram", tg_url, prefs["telegram_chat_id"]))

    if webhook_targets:
        async with httpx.AsyncClient(timeout=10.0) as client:
            for target in webhook_targets:
                try:
                    if target[0] == "slack":
                        await _send_slack(client, target[1], notification)
                    elif target[0] == "discord":
                        await _send_discord(client, target[1], notification)
                    elif target[0] == "telegram":
                        await _send_telegram(client, target[1], target[2], notification)
                    notification.delivered_webhook = True
                except Exception as e:
                    logger.warning(f"{target[0]} webhook failed", error=str(e))
                    notification.delivery_error = (
                        (notification.delivery_error or "")
                        + f" {target[0]}: {e}"
                    )


async def _send_email(to_email: str, notification: Notification) -> None:
    """SMTP email — cấu hình qua env: SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM."""
    smtp_host = os.environ.get("SMTP_HOST")
    if not smtp_host:
        raise RuntimeError("SMTP_HOST not configured")

    smtp_port = int(os.environ.get("SMTP_PORT", "587"))
    smtp_user = os.environ.get("SMTP_USER", "")
    smtp_pass = os.environ.get("SMTP_PASS", "")
    smtp_from = os.environ.get("SMTP_FROM", smtp_user or "noreply@rri.local")
    use_tls = os.environ.get("SMTP_TLS", "true").lower() == "true"

    # aiosmtplib is optional; fallback to running smtplib in executor
    try:
        import aiosmtplib  # type: ignore
        from email.message import EmailMessage

        msg = EmailMessage()
        msg["From"] = smtp_from
        msg["To"] = to_email
        msg["Subject"] = f"[RRI] {notification.title}"
        body = notification.body or notification.title
        if notification.link:
            body += f"\n\n{notification.link}"
        msg.set_content(body)

        await aiosmtplib.send(
            msg,
            hostname=smtp_host,
            port=smtp_port,
            username=smtp_user or None,
            password=smtp_pass or None,
            start_tls=use_tls,
        )
    except ImportError:
        # Fallback synchronous smtplib via run_in_executor
        import smtplib
        from email.message import EmailMessage

        msg = EmailMessage()
        msg["From"] = smtp_from
        msg["To"] = to_email
        msg["Subject"] = f"[RRI] {notification.title}"
        body = notification.body or notification.title
        if notification.link:
            body += f"\n\n{notification.link}"
        msg.set_content(body)

        def _send():
            with smtplib.SMTP(smtp_host, smtp_port) as s:
                if use_tls:
                    s.starttls()
                if smtp_user:
                    s.login(smtp_user, smtp_pass)
                s.send_message(msg)

        loop = asyncio.get_event_loop()
        await loop.run_in_executor(None, _send)


async def _send_slack(client: httpx.AsyncClient, webhook: str, n: Notification) -> None:
    color = {
        "info": "#3498db",
        "success": "#2ecc71",
        "warning": "#f39c12",
        "critical": "#e74c3c",
    }.get(n.severity, "#3498db")

    payload = {
        "attachments": [
            {
                "color": color,
                "title": n.title,
                "text": n.body or "",
                "title_link": n.link,
                "footer": "RRI Research Intelligence",
            }
        ]
    }
    r = await client.post(webhook, json=payload)
    r.raise_for_status()


async def _send_discord(client: httpx.AsyncClient, webhook: str, n: Notification) -> None:
    color_int = {
        "info": 0x3498DB,
        "success": 0x2ECC71,
        "warning": 0xF39C12,
        "critical": 0xE74C3C,
    }.get(n.severity, 0x3498DB)

    embed = {
        "title": n.title[:256],
        "description": (n.body or "")[:2000],
        "color": color_int,
    }
    if n.link:
        embed["url"] = n.link

    payload = {"embeds": [embed]}
    r = await client.post(webhook, json=payload)
    r.raise_for_status()


async def _send_telegram(
    client: httpx.AsyncClient, url: str, chat_id: str, n: Notification
) -> None:
    text = f"*{n.title}*\n{n.body or ''}"
    if n.link:
        text += f"\n{n.link}"
    payload = {
        "chat_id": chat_id,
        "text": text[:4000],
        "parse_mode": "Markdown",
        "disable_web_page_preview": False,
    }
    r = await client.post(url, json=payload)
    r.raise_for_status()
