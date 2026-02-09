from datetime import date
from typing import Any

from pydantic import BaseModel


class SearchResult(BaseModel):
    id: str
    type: str  # paper, repository
    title: str
    description: str | None = None
    url: str | None = None
    score: float
    metadata: dict[str, Any] = {}


class SearchResponse(BaseModel):
    query: str
    results: list[SearchResult]
    total: int


class ChatRequest(BaseModel):
    question: str
    filters: dict | None = None


class ChatResponse(BaseModel):
    answer: str
    sources: list[dict]
    confidence: float


class TrendingPaperResponse(BaseModel):
    id: str
    title: str
    arxiv_id: str | None = None
    citation_count: int = 0
    trending_score: float
    category: str | None = None
    primary_category: str | None = None


class TrendingRepoResponse(BaseModel):
    id: str
    full_name: str
    description: str | None = None
    stars_count: int = 0
    forks_count: int = 0
    trending_score: float
    primary_language: str | None = None


class TrendingFiltersResponse(BaseModel):
    categories: list[str] = []
    languages: list[str] = []
    topics: list[str] = []


class TechRadarItem(BaseModel):
    name: str
    reason: str


class TechRadarResponse(BaseModel):
    adopt: list[TechRadarItem] = []
    trial: list[TechRadarItem] = []
    assess: list[TechRadarItem] = []
    hold: list[TechRadarItem] = []
