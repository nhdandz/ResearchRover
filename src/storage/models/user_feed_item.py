import uuid
from datetime import datetime

from sqlalchemy import Boolean, Float, ForeignKey, Index, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.sql import func

from src.storage.database import Base


class UserFeedItem(Base):
    """
    Một item trong personal feed của researcher.
    Được tạo hàng ngày bởi Celery task: match papers/repos mới
    với research_interests của từng user.
    """
    __tablename__ = "user_feed_items"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"),
        index=True, nullable=False
    )

    # Loại item: "paper" | "repo"
    item_type: Mapped[str] = mapped_column(String(20), nullable=False)
    item_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)

    # Điểm liên quan (0-1) — tính từ overlap interests vs categories/topics
    relevance_score: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)

    # Lý do được đề xuất: "Matches your interest in NLP"
    reason: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Matched interests: ["NLP", "Machine Learning"]
    matched_interests: Mapped[str | None] = mapped_column(Text, nullable=True)  # JSON string

    is_read: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")
    is_dismissed: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")

    created_at: Mapped[datetime] = mapped_column(
        default=func.now(), server_default=func.now()
    )

    __table_args__ = (
        Index("idx_feed_user_id", "user_id"),
        Index("idx_feed_item", "item_type", "item_id"),
        Index("idx_feed_unread", "user_id", "is_read", "is_dismissed"),
        Index("idx_feed_created", "created_at"),
    )
