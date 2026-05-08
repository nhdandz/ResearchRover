"""add research profile and user alerts

Revision ID: g1h2i3j4k5l6
Revises: f7a8b9c0d1e2
Create Date: 2026-04-27 10:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "g1h2i3j4k5l6"
down_revision: Union[str, None] = "f7a8b9c0d1e2"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ── 1. Thêm research profile fields vào bảng users ──
    op.add_column("users", sa.Column(
        "research_interests",
        postgresql.ARRAY(sa.String(100)),
        nullable=True
    ))
    op.add_column("users", sa.Column(
        "expertise_level", sa.String(50), nullable=True
    ))
    op.add_column("users", sa.Column(
        "affiliation", sa.String(255), nullable=True
    ))
    op.add_column("users", sa.Column(
        "position", sa.String(100), nullable=True
    ))
    op.add_column("users", sa.Column(
        "bio", sa.Text(), nullable=True
    ))
    op.add_column("users", sa.Column(
        "preferred_language", sa.String(10), nullable=True, server_default="en"
    ))
    op.add_column("users", sa.Column(
        "preferred_sources",
        postgresql.ARRAY(sa.String(50)),
        nullable=True
    ))
    op.add_column("users", sa.Column(
        "preferred_llm", sa.String(20), nullable=True, server_default="ollama"
    ))
    op.add_column("users", sa.Column(
        "notification_preferences",
        postgresql.JSONB(astext_type=sa.Text()),
        nullable=True
    ))
    op.add_column("users", sa.Column(
        "dashboard_layout",
        postgresql.JSONB(astext_type=sa.Text()),
        nullable=True
    ))
    op.add_column("users", sa.Column(
        "onboarding_completed",
        sa.Boolean(),
        nullable=False,
        server_default=sa.text("false")
    ))

    # ── 2. Thêm reading_status vào bookmarks ──
    op.add_column("bookmarks", sa.Column(
        "reading_status",
        sa.String(20),
        nullable=False,
        server_default="saved"
    ))

    # ── 3. Tạo bảng user_alerts ──
    op.create_table(
        "user_alerts",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("user_id", sa.UUID(), nullable=False),
        sa.Column("alert_type", sa.String(50), nullable=False),
        sa.Column("label", sa.String(255), nullable=False),
        sa.Column(
            "config",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=sa.text("'{}'::jsonb")
        ),
        sa.Column("channel", sa.String(20), nullable=False, server_default="in_app"),
        sa.Column("frequency", sa.String(20), nullable=False, server_default="daily_digest"),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("last_triggered", sa.DateTime(), nullable=True),
        sa.Column("trigger_count", sa.Integer(), nullable=False, server_default=sa.text("0")),
        sa.Column("created_at", sa.DateTime(), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("idx_user_alerts_user_id", "user_alerts", ["user_id"])
    op.create_index("idx_user_alerts_type", "user_alerts", ["alert_type"])
    op.create_index("idx_user_alerts_active", "user_alerts", ["is_active"])


def downgrade() -> None:
    # Drop user_alerts
    op.drop_index("idx_user_alerts_active", table_name="user_alerts")
    op.drop_index("idx_user_alerts_type", table_name="user_alerts")
    op.drop_index("idx_user_alerts_user_id", table_name="user_alerts")
    op.drop_table("user_alerts")

    # Remove reading_status from bookmarks
    op.drop_column("bookmarks", "reading_status")

    # Remove research profile columns from users
    op.drop_column("users", "onboarding_completed")
    op.drop_column("users", "dashboard_layout")
    op.drop_column("users", "notification_preferences")
    op.drop_column("users", "preferred_llm")
    op.drop_column("users", "preferred_sources")
    op.drop_column("users", "preferred_language")
    op.drop_column("users", "bio")
    op.drop_column("users", "position")
    op.drop_column("users", "affiliation")
    op.drop_column("users", "expertise_level")
    op.drop_column("users", "research_interests")
