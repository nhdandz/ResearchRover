"""PaperSignal — tổng hợp signal từ nhiều nguồn cho 1 paper."""
import uuid
from datetime import datetime

from sqlalchemy import Boolean, Float, ForeignKey, Index, Integer
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.sql import func

from src.storage.database import Base


class PaperSignal(Base):
    """
    Signal aggregation table — populated daily by intelligence worker.
    1 paper = 1 row. buzz_score = log(arxiv_views) + hn_score + hf_upvotes + ...
    """
    __tablename__ = "paper_signals"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    paper_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("papers.id", ondelete="CASCADE"),
        unique=True,
        nullable=False,
    )

    # Boolean: paper có mặt trên ArXiv?
    arxiv_present: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")
    hf_upvotes: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    hn_score: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    hn_comments: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    github_repo_stars: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    github_repo_count: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    openreview_rating: Mapped[float | None] = mapped_column(Float, nullable=True)
    citation_count: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    twitter_mentions: Mapped[int] = mapped_column(Integer, default=0, server_default="0")

    # Final composite score
    buzz_score: Mapped[float] = mapped_column(Float, default=0.0, server_default="0")

    # Velocity (Δ score per ngày)
    buzz_velocity: Mapped[float] = mapped_column(Float, default=0.0, server_default="0")

    # Chi tiết breakdown để FE hiển thị
    source_breakdown: Mapped[dict | None] = mapped_column(JSONB, nullable=True)

    computed_at: Mapped[datetime] = mapped_column(
        default=func.now(), server_default=func.now()
    )

    __table_args__ = (
        Index("idx_paper_signals_buzz", "buzz_score"),
        Index("idx_paper_signals_velocity", "buzz_velocity"),
    )
