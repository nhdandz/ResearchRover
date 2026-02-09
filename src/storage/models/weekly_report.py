import uuid
from datetime import date, datetime

from sqlalchemy import Date, Index, Integer, String, Text
from sqlalchemy.dialects.postgresql import ARRAY, JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.sql import func

from src.storage.database import Base


class WeeklyReport(Base):
    __tablename__ = "weekly_reports"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )

    title: Mapped[str] = mapped_column(String(500), nullable=False)
    summary: Mapped[str | None] = mapped_column(Text)
    content: Mapped[str | None] = mapped_column(Text)

    highlights: Mapped[list[str] | None] = mapped_column(ARRAY(String(1000)))
    top_papers: Mapped[dict | None] = mapped_column(JSONB)
    top_repos: Mapped[dict | None] = mapped_column(JSONB)
    trending_topics: Mapped[dict | None] = mapped_column(JSONB)

    new_papers_count: Mapped[int] = mapped_column(Integer, default=0)
    new_repos_count: Mapped[int] = mapped_column(Integer, default=0)

    period_start: Mapped[date] = mapped_column(Date, nullable=False)
    period_end: Mapped[date] = mapped_column(Date, nullable=False)

    created_at: Mapped[datetime] = mapped_column(
        default=func.now(), server_default=func.now()
    )

    __table_args__ = (
        Index("idx_weekly_reports_created", "created_at"),
        Index("idx_weekly_reports_period", "period_start", "period_end"),
    )
