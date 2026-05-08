import uuid
from datetime import date, datetime

from sqlalchemy import Boolean, Date, ForeignKey, Index, Integer, String, Text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.sql import func

from src.storage.database import Base


class UserWeeklyDigest(Base):
    """
    Weekly digest cá nhân hoá cho từng researcher.
    Khác với WeeklyReport toàn hệ thống — digest này
    được lọc và cá nhân hoá theo research_interests của user.
    """
    __tablename__ = "user_weekly_digests"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"),
        index=True, nullable=False
    )

    period_start: Mapped[date] = mapped_column(Date, nullable=False)
    period_end: Mapped[date] = mapped_column(Date, nullable=False)

    # Papers mới khớp với interests của user
    new_papers_in_interests: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    new_papers_count: Mapped[int] = mapped_column(Integer, default=0)

    # Repos mới khớp
    new_repos_in_interests: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    new_repos_count: Mapped[int] = mapped_column(Integer, default=0)

    # Bookmarks chưa đọc (reminder)
    unread_bookmarks: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    unread_bookmarks_count: Mapped[int] = mapped_column(Integer, default=0)

    # Paper được AI gợi ý dựa trên reading history
    recommended_papers: Mapped[dict | None] = mapped_column(JSONB, nullable=True)

    # Saved searches có kết quả mới
    saved_search_updates: Mapped[dict | None] = mapped_column(JSONB, nullable=True)

    # Nội dung markdown do LLM sinh
    content_md: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Highlights tóm tắt
    highlights: Mapped[dict | None] = mapped_column(JSONB, nullable=True)

    is_sent: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")
    sent_at: Mapped[datetime | None] = mapped_column(nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        default=func.now(), server_default=func.now()
    )

    __table_args__ = (
        Index("idx_user_digest_user_id", "user_id"),
        Index("idx_user_digest_period", "period_start", "period_end"),
        Index("idx_user_digest_created", "created_at"),
    )
