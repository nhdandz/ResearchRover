from datetime import date, datetime
from uuid import UUID

from pydantic import BaseModel


class PaperResponse(BaseModel):
    id: UUID
    arxiv_id: str | None = None
    doi: str | None = None
    title: str
    abstract: str | None = None
    summary: str | None = None
    authors: list[dict] | None = None
    categories: list[str] | None = None
    topics: list[str] | None = None
    keywords: list[str] | None = None
    published_date: date | None = None
    source: str
    source_url: str | None = None
    pdf_url: str | None = None
    citation_count: int = 0
    influential_citation_count: int = 0
    is_vietnamese: bool = False
    created_at: datetime

    model_config = {"from_attributes": True}


class PaperStatsResponse(BaseModel):
    total_papers: int = 0
    total_citations: int = 0
    avg_citations: float = 0.0
    recent_papers: int = 0
    category_distribution: dict[str, int] = {}
    source_distribution: dict[str, int] = {}
    year_distribution: dict[str, int] = {}


class PaperDetailResponse(BaseModel):
    paper: PaperResponse
    linked_repos: list[dict] = []


class LinkResponse(BaseModel):
    id: UUID
    repo_id: UUID
    link_type: str
    confidence_score: float
    discovered_via: str | None = None

    model_config = {"from_attributes": True}


# ── Analytics ──

class AuthorEntry(BaseModel):
    name: str
    affiliation: str | None = None
    paper_count: int
    total_citations: int


class AuthorAnalyticsResponse(BaseModel):
    top_by_papers: list[AuthorEntry]
    top_by_citations: list[AuthorEntry]
    affiliation_distribution: dict[str, int]


class KeywordFrequency(BaseModel):
    keyword: str
    count: int


class KeywordAnalyticsResponse(BaseModel):
    keywords: list[KeywordFrequency]
    topics: list[KeywordFrequency]


# ── Network ──

class NetworkNode(BaseModel):
    id: str
    label: str
    paper_count: int
    affiliation: str | None = None


class NetworkEdge(BaseModel):
    source: str
    target: str
    weight: int


class CoAuthorNetworkResponse(BaseModel):
    nodes: list[NetworkNode]
    edges: list[NetworkEdge]


# ── Trends ──

class TrendPoint(BaseModel):
    period: str
    keyword: str
    count: int


class EmergingKeyword(BaseModel):
    keyword: str
    recent_count: int
    previous_count: int
    growth_rate: float


class KeywordTrendResponse(BaseModel):
    trends: list[TrendPoint]
    top_keywords: list[str]
    emerging: list[EmergingKeyword]


# ── Topic Co-occurrence Network ──

class TopicCoOccurrenceResponse(BaseModel):
    nodes: list[NetworkNode]
    edges: list[NetworkEdge]


# ── Citation Timeline ──

class CitationTimelinePoint(BaseModel):
    year: str
    author: str
    citations: int


class CitationTimelineResponse(BaseModel):
    data: list[CitationTimelinePoint]
    authors: list[str]


# ── Category Heatmap ──

class CategoryYearCell(BaseModel):
    category: str
    year: str
    count: int


class CategoryHeatmapResponse(BaseModel):
    cells: list[CategoryYearCell]
    categories: list[str]
    years: list[str]


# ── Topic Correlation ──

class TopicCorrelationCell(BaseModel):
    topic_a: str
    topic_b: str
    count: int


class TopicCorrelationResponse(BaseModel):
    cells: list[TopicCorrelationCell]
    topics: list[str]


# ── Institution Ranking ──

class InstitutionEntry(BaseModel):
    name: str
    paper_count: int
    total_citations: int
    avg_citations: float
    author_count: int


class InstitutionRankingResponse(BaseModel):
    institutions: list[InstitutionEntry]


# ── Author Comparison ──

class AuthorProfile(BaseModel):
    name: str
    paper_count: int
    total_citations: int
    avg_citations: float
    topics: list[str]
    first_year: int | None = None
    last_year: int | None = None
    affiliation: str | None = None


class AuthorComparisonResponse(BaseModel):
    authors: list[AuthorProfile]


# ── Research Landscape ──

class LandscapePoint(BaseModel):
    topic: str
    avg_year: float
    avg_citations: float
    paper_count: int


class ResearchLandscapeResponse(BaseModel):
    points: list[LandscapePoint]


# ── Import ──

class ImportResultResponse(BaseModel):
    imported: int
    skipped: int
    errors: list[str]
