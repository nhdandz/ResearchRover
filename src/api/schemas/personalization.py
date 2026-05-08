"""Schemas cho Phase 2: Feed, Digest, Saved Searches."""
import uuid
from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, Field


# ── Feed ──

class FeedItemResponse(BaseModel):
    id: uuid.UUID
    item_type: str           # "paper" | "repo"
    item_id: uuid.UUID
    relevance_score: float
    reason: str | None
    matched_interests: list[str] | None = None
    is_read: bool
    is_dismissed: bool
    created_at: datetime
    # Populated từ join (optional enrichment)
    title: str | None = None          # paper title or repo full_name
    full_name: str | None = None      # repo full_name alias
    description: str | None = None
    abstract: str | None = None
    authors: list[str] | None = None
    categories: list[str] | None = None
    published_date: date | None = None
    arxiv_id: str | None = None
    source_url: str | None = None
    stars_count: int | None = None    # for repos

    model_config = {"from_attributes": True}


class FeedMarkRequest(BaseModel):
    item_ids: list[uuid.UUID]
    action: Literal["read", "dismiss", "unread"]


class FeedSummary(BaseModel):
    unread_count: int
    total_count: int
    total: int = 0           # alias so frontend can use data.total
    items: list[FeedItemResponse]

    def model_post_init(self, __context: object) -> None:
        if self.total == 0:
            object.__setattr__(self, "total", self.total_count)


# ── Saved Searches ──

class SavedSearchCreate(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    query: str = Field(min_length=2)
    search_type: Literal["semantic", "keyword"] = "semantic"
    filters: dict | None = None
    notify_new_results: bool = True
    frequency: Literal["daily", "weekly"] = "daily"


class SavedSearchUpdate(BaseModel):
    name: str | None = None
    notify_new_results: bool | None = None
    frequency: Literal["daily", "weekly"] | None = None
    is_active: bool | None = None


class SavedSearchResponse(BaseModel):
    id: uuid.UUID
    name: str
    query: str
    search_type: str
    filters: dict | None
    notify_new_results: bool
    frequency: str
    last_run_at: datetime | None
    last_result_count: int
    new_results_since_last_view: int
    is_active: bool
    created_at: datetime

    model_config = {"from_attributes": True}


class SavedSearchRunResult(BaseModel):
    search_id: uuid.UUID
    query: str
    result_count: int
    new_results: int
    results: list[dict]


# ── User Weekly Digest ──

class DigestPaperItem(BaseModel):
    id: str
    title: str
    arxiv_id: str | None
    categories: list[str]
    relevance_score: float
    matched_interests: list[str]
    source_url: str | None = None


class DigestRepoItem(BaseModel):
    id: str
    full_name: str
    description: str | None
    stars_count: int
    primary_language: str | None
    relevance_score: float
    matched_interests: list[str]


class UserDigestResponse(BaseModel):
    id: uuid.UUID
    period_start: date
    period_end: date
    new_papers_count: int
    new_repos_count: int
    unread_bookmarks_count: int
    new_papers_in_interests: list[DigestPaperItem] | None = None
    new_repos_in_interests: list[DigestRepoItem] | None = None
    unread_bookmarks: list[dict] | None = None
    recommended_papers: list[dict] | None = None
    saved_search_updates: list[dict] | None = None
    highlights: list[str] | None = None
    content_md: str | None = None
    created_at: datetime

    model_config = {"from_attributes": True}
