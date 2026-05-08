"""Author entity — tổng hợp identity của tác giả từ Semantic Scholar / ORCID / dblp."""
import uuid
from datetime import datetime

from sqlalchemy import Boolean, ForeignKey, Index, Integer, String, Text
from sqlalchemy.dialects.postgresql import ARRAY, UUID
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.sql import func

from src.storage.database import Base


class Author(Base):
    __tablename__ = "authors"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )

    name: Mapped[str] = mapped_column(String(255), nullable=False)
    # Lower-case, no diacritics — dùng cho lookup; UNIQUE để hỗ trợ ON CONFLICT
    normalized_name: Mapped[str] = mapped_column(
        String(255), nullable=False, unique=True, index=True
    )

    # External IDs
    semantic_scholar_id: Mapped[str | None] = mapped_column(String(50), unique=True, nullable=True)
    orcid: Mapped[str | None] = mapped_column(String(50), unique=True, nullable=True)
    dblp_id: Mapped[str | None] = mapped_column(String(100), nullable=True)
    google_scholar_id: Mapped[str | None] = mapped_column(String(50), nullable=True)

    affiliations: Mapped[list[str] | None] = mapped_column(ARRAY(String(255)), nullable=True)
    homepage: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Aggregate metrics
    h_index: Mapped[int | None] = mapped_column(Integer, nullable=True)
    citation_count: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    paper_count: Mapped[int] = mapped_column(Integer, default=0, server_default="0")

    topics: Mapped[list[str] | None] = mapped_column(ARRAY(String(100)), nullable=True)
    country: Mapped[str | None] = mapped_column(String(100), nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        default=func.now(), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        default=func.now(), server_default=func.now(), onupdate=func.now()
    )


class AuthorPaper(Base):
    """M2M giữa authors và papers."""
    __tablename__ = "author_papers"

    author_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("authors.id", ondelete="CASCADE"),
        primary_key=True,
    )
    paper_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("papers.id", ondelete="CASCADE"),
        primary_key=True,
    )
    position: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    is_corresponding: Mapped[bool] = mapped_column(
        Boolean, default=False, server_default="false"
    )

    __table_args__ = (
        Index("ix_author_papers_paper", "paper_id"),
    )
