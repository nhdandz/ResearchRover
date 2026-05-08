import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, EmailStr, Field


class RegisterRequest(BaseModel):
    email: EmailStr
    username: str
    password: str


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"


class RefreshRequest(BaseModel):
    refresh_token: str


# ── User responses ──

class UserResponse(BaseModel):
    id: uuid.UUID
    email: str
    username: str
    is_active: bool
    created_at: datetime
    # Research profile (có thể None với user cũ chưa onboard)
    research_interests: list[str] | None = None
    expertise_level: str | None = None
    affiliation: str | None = None
    position: str | None = None
    bio: str | None = None
    preferred_language: str | None = "en"
    preferred_sources: list[str] | None = None
    preferred_llm: str | None = "ollama"
    notification_preferences: dict | None = None
    dashboard_layout: dict | None = None
    onboarding_completed: bool = False

    model_config = {"from_attributes": True}


# ── Profile update ──

class UserProfileUpdate(BaseModel):
    """PATCH /auth/me/profile — chỉ gửi những trường muốn cập nhật."""
    research_interests: list[str] | None = None
    expertise_level: Literal[
        "student", "phd", "postdoc", "faculty", "industry", "other"
    ] | None = None
    affiliation: str | None = None
    position: str | None = None
    bio: str | None = None
    preferred_language: Literal["en", "vi", "both"] | None = None
    preferred_sources: list[str] | None = None
    preferred_llm: Literal["ollama", "openai"] | None = None
    notification_preferences: dict | None = None
    dashboard_layout: dict | None = None


# ── Onboarding ──

# Danh sách research areas chuẩn (map sang ArXiv categories)
RESEARCH_AREAS = [
    "Natural Language Processing",
    "Computer Vision",
    "Machine Learning",
    "Deep Learning",
    "Reinforcement Learning",
    "Robotics",
    "Computer Graphics",
    "Information Retrieval",
    "Bioinformatics",
    "Human-Computer Interaction",
    "Computer Networks",
    "Cybersecurity",
    "Distributed Systems",
    "Software Engineering",
    "Data Science",
    "Other",
]

EXPERTISE_LEVELS = [
    {"value": "student", "label": "Undergraduate / Graduate Student"},
    {"value": "phd", "label": "PhD Student / Candidate"},
    {"value": "postdoc", "label": "Postdoctoral Researcher"},
    {"value": "faculty", "label": "Faculty / Professor"},
    {"value": "industry", "label": "Industry Researcher / Engineer"},
    {"value": "other", "label": "Other"},
]

DATA_SOURCES = [
    {"value": "arxiv", "label": "ArXiv"},
    {"value": "semantic_scholar", "label": "Semantic Scholar"},
    {"value": "openreview", "label": "OpenReview (ICLR/NeurIPS)"},
    {"value": "github", "label": "GitHub"},
    {"value": "huggingface", "label": "HuggingFace"},
    {"value": "papers_with_code", "label": "Papers With Code"},
]


class OnboardingRequest(BaseModel):
    """POST /auth/me/onboarding — hoàn tất wizard."""
    research_interests: list[str] = Field(min_length=1)
    expertise_level: str
    affiliation: str | None = None
    position: str | None = None
    preferred_language: Literal["en", "vi", "both"] = "en"
    preferred_sources: list[str] = Field(
        default=["arxiv", "semantic_scholar", "github"]
    )
    preferred_llm: Literal["ollama", "openai"] = "ollama"
    notification_preferences: dict = Field(
        default_factory=lambda: {
            "in_app": True,
            "email": False,
            "weekly_digest": True,
        }
    )


class OnboardingMetaResponse(BaseModel):
    """GET /auth/onboarding-meta — trả về các lựa chọn cho wizard."""
    research_areas: list[str]
    expertise_levels: list[dict]
    data_sources: list[dict]
