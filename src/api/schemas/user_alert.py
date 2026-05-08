import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

AlertType = Literal["keyword", "author", "citation", "venue", "repo_milestone"]
AlertChannel = Literal["in_app", "email"]
AlertFrequency = Literal["instant", "daily_digest", "weekly_digest"]


class UserAlertCreate(BaseModel):
    alert_type: AlertType
    label: str = Field(min_length=1, max_length=255)
    config: dict = Field(default_factory=dict)
    channel: AlertChannel = "in_app"
    frequency: AlertFrequency = "daily_digest"


class UserAlertUpdate(BaseModel):
    label: str | None = None
    config: dict | None = None
    channel: AlertChannel | None = None
    frequency: AlertFrequency | None = None
    is_active: bool | None = None


class UserAlertResponse(BaseModel):
    id: uuid.UUID
    alert_type: str
    label: str
    config: dict
    channel: str
    frequency: str
    is_active: bool
    last_triggered: datetime | None
    trigger_count: int
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
