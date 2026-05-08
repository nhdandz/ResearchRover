"""In-app notification model — kết quả của việc trigger UserAlert hoặc system event."""
import uuid
from datetime import datetime

from sqlalchemy import Boolean, ForeignKey, Index, String, Text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.sql import func

from src.storage.database import Base


class Notification(Base):
    """
    Notification gửi tới một user cụ thể.
    - Sinh ra bởi notification_engine khi UserAlert match.
    - Có dedup_key để tránh trùng lặp khi 1 paper trigger nhiều alert.
    - Có channel delivery state: in_app/email/webhook.
    """
    __tablename__ = "notifications"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"),
        index=True, nullable=False
    )
    alert_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("user_alerts.id", ondelete="SET NULL"),
        nullable=True
    )

    # Loại: alert_keyword | alert_author | alert_citation | alert_venue |
    #       alert_repo_milestone | digest_ready | feed_summary | system
    notification_type: Mapped[str] = mapped_column(String(50), nullable=False, index=True)

    # severity: info | success | warning | critical
    severity: Mapped[str] = mapped_column(String(20), nullable=False, server_default="info")

    title: Mapped[str] = mapped_column(String(500), nullable=False)
    body: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Link target: /papers/{id} | /repos/{id} | /me/digest/{id} ...
    link: Mapped[str | None] = mapped_column(Text, nullable=True)

    # payload tự do để FE render rich card
    data: Mapped[dict | None] = mapped_column(JSONB, nullable=True)

    # Dedup key — composite: alert_id + item_type + item_id
    # Tránh 1 paper trigger nhiều alert ⇒ nhiều notification trùng
    dedup_key: Mapped[str | None] = mapped_column(String(255), index=True, nullable=True)

    # Trạng thái đọc
    is_read: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")
    read_at: Mapped[datetime | None] = mapped_column(nullable=True)

    # Trạng thái delivery
    delivered_in_app: Mapped[bool] = mapped_column(Boolean, default=True, server_default="true")
    delivered_email: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")
    delivered_webhook: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")
    delivery_error: Mapped[str | None] = mapped_column(Text, nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        default=func.now(), server_default=func.now()
    )

    __table_args__ = (
        Index("idx_notif_user_unread", "user_id", "is_read"),
        Index("idx_notif_user_created", "user_id", "created_at"),
        Index("idx_notif_dedup", "user_id", "dedup_key", unique=False),
    )
