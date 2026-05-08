import uuid
from datetime import datetime

from sqlalchemy import Boolean, String, Text
from sqlalchemy.dialects.postgresql import ARRAY, JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.sql import func

from src.storage.database import Base


class User(Base):
    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True, nullable=False)
    username: Mapped[str] = mapped_column(String(100), unique=True, nullable=False)
    hashed_password: Mapped[str] = mapped_column(String(255), nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)

    # ── Research Profile ──
    # Lĩnh vực nghiên cứu: ["NLP", "Computer Vision", "Federated Learning"]
    research_interests: Mapped[list[str] | None] = mapped_column(ARRAY(String(100)), nullable=True)
    # Cấp độ: student | phd | postdoc | faculty | industry | other
    expertise_level: Mapped[str | None] = mapped_column(String(50), nullable=True)
    # Tổ chức / Trường
    affiliation: Mapped[str | None] = mapped_column(String(255), nullable=True)
    # Vị trí: "PhD Student", "Associate Professor"
    position: Mapped[str | None] = mapped_column(String(100), nullable=True)
    # Mô tả ngắn về hướng nghiên cứu
    bio: Mapped[str | None] = mapped_column(Text, nullable=True)
    # Ngôn ngữ ưu tiên: "en" | "vi" | "both"
    preferred_language: Mapped[str | None] = mapped_column(String(10), nullable=True, server_default="en")
    # Nguồn dữ liệu ưu tiên: ["arxiv", "semantic_scholar", "openreview", ...]
    preferred_sources: Mapped[list[str] | None] = mapped_column(ARRAY(String(50)), nullable=True)
    # LLM ưu tiên: "ollama" | "openai"
    preferred_llm: Mapped[str | None] = mapped_column(String(20), nullable=True, server_default="ollama")
    # Cài đặt thông báo: {"email": true, "weekly_digest": true, "in_app": true}
    notification_preferences: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    # Layout dashboard tuỳ chỉnh (JSON)
    dashboard_layout: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    # Đã hoàn tất onboarding wizard chưa
    onboarding_completed: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")

    created_at: Mapped[datetime] = mapped_column(
        default=func.now(), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        default=func.now(), server_default=func.now(), onupdate=func.now()
    )
