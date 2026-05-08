import uuid
from datetime import datetime

from sqlalchemy import Boolean, ForeignKey, Index, Integer, String, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.sql import func

from src.storage.database import Base


class SavedSearch(Base):
    """
    Một search query được user lưu lại.
    Celery task chạy lại định kỳ và notify khi có kết quả mới.
    """
    __tablename__ = "saved_searches"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"),
        index=True, nullable=False
    )

    # Tên do user đặt
    name: Mapped[str] = mapped_column(String(255), nullable=False)

    # Query string gốc
    query: Mapped[str] = mapped_column(Text, nullable=False)

    # Search type: "semantic" | "keyword"
    search_type: Mapped[str] = mapped_column(String(20), nullable=False, server_default="semantic")

    # Filters dạng JSON: {"category": "cs.CL", "date_from": "2025-01-01", "type": "paper"}
    filters: Mapped[dict | None] = mapped_column(JSONB, nullable=True)

    # Notify khi có kết quả mới
    notify_new_results: Mapped[bool] = mapped_column(Boolean, default=True, server_default="true")

    # Tần suất chạy lại: "daily" | "weekly"
    frequency: Mapped[str] = mapped_column(String(20), nullable=False, server_default="daily")

    # Tracking kết quả
    last_run_at: Mapped[datetime | None] = mapped_column(nullable=True)
    last_result_count: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    new_results_since_last_view: Mapped[int] = mapped_column(Integer, default=0, server_default="0")

    is_active: Mapped[bool] = mapped_column(Boolean, default=True, server_default="true")

    created_at: Mapped[datetime] = mapped_column(
        default=func.now(), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        default=func.now(), server_default=func.now(), onupdate=func.now()
    )

    __table_args__ = (
        Index("idx_saved_searches_user_id", "user_id"),
        Index("idx_saved_searches_active", "is_active"),
    )
