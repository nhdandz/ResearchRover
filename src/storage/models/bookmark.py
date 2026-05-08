import uuid
from datetime import datetime

from sqlalchemy import ForeignKey, String, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.sql import func

from src.storage.database import Base


class Bookmark(Base):
    __tablename__ = "bookmarks"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False
    )
    folder_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("folders.id", ondelete="CASCADE"), index=True, nullable=False
    )
    item_type: Mapped[str] = mapped_column(String(20), nullable=False)  # paper, repo, huggingface, external
    item_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)
    external_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    external_title: Mapped[str | None] = mapped_column(String(500), nullable=True)
    external_metadata: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    note: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Trạng thái đọc:
    #   saved     — Đã lưu, chưa đọc (mặc định)
    #   reading   — Đang đọc
    #   completed — Đã đọc xong
    #   archived  — Bỏ qua, không đọc nữa
    reading_status: Mapped[str] = mapped_column(
        String(20), nullable=False, default="saved", server_default="saved"
    )

    created_at: Mapped[datetime] = mapped_column(
        default=func.now(), server_default=func.now()
    )

    __table_args__ = (
        UniqueConstraint(
            "user_id", "folder_id", "item_type", "item_id",
            name="uq_bookmark_user_folder_item"
        ),
    )
