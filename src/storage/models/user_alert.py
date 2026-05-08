import uuid
from datetime import datetime

from sqlalchemy import Boolean, ForeignKey, Index, Integer, String, Text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.sql import func

from src.storage.database import Base


class UserAlert(Base):
    """Alert cá nhân của từng researcher — khác với Alert toàn hệ thống."""
    __tablename__ = "user_alerts"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False
    )

    # Loại alert:
    #   keyword     — paper/repo mới chứa keyword này
    #   author      — tác giả X publish paper mới
    #   citation    — paper đã bookmark nhận citation mới
    #   venue       — venue (ICLR, NeurIPS...) có paper mới
    #   repo_milestone — repo đạt N stars / có release mới
    alert_type: Mapped[str] = mapped_column(String(50), nullable=False)

    # Nhãn hiển thị do user đặt
    label: Mapped[str] = mapped_column(String(255), nullable=False)

    # Cấu hình linh hoạt theo từng loại alert
    # keyword: {"query": "RAG Vietnamese", "min_relevance": 0.7, "sources": ["arxiv"]}
    # author:  {"author_name": "Yann LeCun", "semantic_scholar_id": "1234"}
    # citation: {"paper_id": "uuid-..."}
    # venue:   {"venue_name": "ICLR", "year": 2025}
    # repo_milestone: {"repo_id": "uuid-...", "milestone_type": "stars", "threshold": 1000}
    config: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)

    # Kênh gửi: "in_app" | "email"
    channel: Mapped[str] = mapped_column(String(20), nullable=False, server_default="in_app")

    # Tần suất: "instant" | "daily_digest" | "weekly_digest"
    frequency: Mapped[str] = mapped_column(String(20), nullable=False, server_default="daily_digest")

    is_active: Mapped[bool] = mapped_column(Boolean, default=True, server_default="true")

    last_triggered: Mapped[datetime | None] = mapped_column(nullable=True)
    trigger_count: Mapped[int] = mapped_column(Integer, default=0, server_default="0")

    created_at: Mapped[datetime] = mapped_column(
        default=func.now(), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        default=func.now(), server_default=func.now(), onupdate=func.now()
    )

    __table_args__ = (
        Index("idx_user_alerts_user_id", "user_id"),
        Index("idx_user_alerts_type", "alert_type"),
        Index("idx_user_alerts_active", "is_active"),
    )
