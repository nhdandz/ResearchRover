"""ConceptTrend — time-series tracking của 1 concept/keyword."""
import uuid
from datetime import date, datetime

from sqlalchemy import Date, Float, Index, Integer, String
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.sql import func

from src.storage.database import Base


class ConceptTrend(Base):
    """
    Snapshot trạng thái 1 concept/keyword tại thời điểm period_end.
    Được populate weekly bởi worker. data_points lưu time series.
    """
    __tablename__ = "concept_trends"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )

    concept: Mapped[str] = mapped_column(String(255), nullable=False)
    normalized_concept: Mapped[str] = mapped_column(String(255), nullable=False, index=True)

    period_start: Mapped[date] = mapped_column(Date, nullable=False)
    period_end: Mapped[date] = mapped_column(Date, nullable=False)

    paper_count: Mapped[int] = mapped_column(Integer, default=0, server_default="0")

    # Δ% so với period trước
    growth_rate: Mapped[float] = mapped_column(Float, default=0.0, server_default="0")

    # Phân loại main category (CS / Bio / Math / ...)
    category: Mapped[str | None] = mapped_column(String(100), nullable=True)

    # status: hot | rising | stable | declining | stale
    status: Mapped[str] = mapped_column(String(20), default="stable", server_default="stable")

    # Time series points: [{period: "2026-W18", count: 42}, ...]
    data_points: Mapped[dict | None] = mapped_column(JSONB, nullable=True)

    computed_at: Mapped[datetime] = mapped_column(
        default=func.now(), server_default=func.now()
    )

    __table_args__ = (
        Index("idx_concept_trends_concept_period", "normalized_concept", "period_end"),
        Index("idx_concept_trends_status", "status"),
    )
