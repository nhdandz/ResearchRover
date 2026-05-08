"""Schemas cho Notification API."""
import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field


NotificationSeverity = Literal["info", "success", "warning", "critical"]


class NotificationResponse(BaseModel):
    id: uuid.UUID
    notification_type: str
    severity: str
    title: str
    body: str | None
    link: str | None
    data: dict | None
    dedup_key: str | None = None
    is_read: bool
    read_at: datetime | None
    delivered_in_app: bool
    delivered_email: bool
    delivered_webhook: bool
    created_at: datetime

    model_config = {"from_attributes": True}


class NotificationSummary(BaseModel):
    unread_count: int
    total_count: int
    items: list[NotificationResponse]


class NotificationMarkRequest(BaseModel):
    notification_ids: list[uuid.UUID] = Field(default_factory=list)
    action: Literal["read", "unread", "delete"]


class NotificationPreferences(BaseModel):
    """User preferences cho notification — lưu trong users.notification_preferences (JSONB)."""
    in_app: bool = True
    email: bool = False
    weekly_digest: bool = True
    daily_summary: bool = False
    instant_alerts: bool = True
    # Webhook URLs (optional)
    slack_webhook: str | None = None
    discord_webhook: str | None = None
    telegram_chat_id: str | None = None
    telegram_bot_token: str | None = None
