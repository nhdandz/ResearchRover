from datetime import date, datetime
from uuid import UUID

from pydantic import BaseModel


class TopPaperItem(BaseModel):
    title: str
    arxiv_id: str | None = None
    citation_count: int = 0
    categories: list[str] = []


class TopRepoItem(BaseModel):
    full_name: str
    description: str | None = None
    stars_count: int = 0
    primary_language: str | None = None


class TrendingTopicItem(BaseModel):
    name: str
    count: int = 0
    trend: str = "stable"


class WeeklyReportResponse(BaseModel):
    id: str | None = None
    title: str
    summary: str | None = None
    content: str | None = None
    highlights: list[str] = []
    top_papers: list[TopPaperItem] = []
    top_repos: list[TopRepoItem] = []
    trending_topics: list[TrendingTopicItem] = []
    new_papers_count: int = 0
    new_repos_count: int = 0
    period_start: date
    period_end: date
    generated_at: datetime | None = None

    model_config = {"from_attributes": True}


class ReportGenerationRequest(BaseModel):
    topic: str | None = None
    date_from: date | None = None
    date_to: date | None = None
    format: str = "markdown"


class ReportGenerationResponse(BaseModel):
    report_id: str | None = None
    task_id: str | None = None
    status: str
    estimated_time_seconds: int = 30


class AlertResponse(BaseModel):
    id: UUID
    alert_type: str
    title: str
    description: str | None = None
    severity: str
    entity_type: str | None = None
    created_at: datetime
    is_sent: bool = False

    model_config = {"from_attributes": True}


class SubscribeRequest(BaseModel):
    email: str
    subscription_type: str
    target_value: str
    channels: list[str] = ["email"]
    frequency: str = "daily"


class SubscriptionResponse(BaseModel):
    id: UUID
    subscription_type: str
    target_value: str
    frequency: str
    is_active: bool

    model_config = {"from_attributes": True}
