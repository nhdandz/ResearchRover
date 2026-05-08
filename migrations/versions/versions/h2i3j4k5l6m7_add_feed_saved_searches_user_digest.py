"""add user feed, saved searches, user weekly digest

Revision ID: h2i3j4k5l6m7
Revises: g1h2i3j4k5l6
Create Date: 2026-04-27 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "h2i3j4k5l6m7"
down_revision: Union[str, None] = "g1h2i3j4k5l6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ── 1. user_feed_items ──
    op.create_table(
        "user_feed_items",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("user_id", sa.UUID(), nullable=False),
        sa.Column("item_type", sa.String(20), nullable=False),
        sa.Column("item_id", sa.UUID(), nullable=False),
        sa.Column("relevance_score", sa.Float(), nullable=False, server_default="0.0"),
        sa.Column("reason", sa.Text(), nullable=True),
        sa.Column("matched_interests", sa.Text(), nullable=True),
        sa.Column("is_read", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("is_dismissed", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("created_at", sa.DateTime(), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("idx_feed_user_id", "user_feed_items", ["user_id"])
    op.create_index("idx_feed_item", "user_feed_items", ["item_type", "item_id"])
    op.create_index("idx_feed_unread", "user_feed_items", ["user_id", "is_read", "is_dismissed"])
    op.create_index("idx_feed_created", "user_feed_items", ["created_at"])

    # ── 2. saved_searches ──
    op.create_table(
        "saved_searches",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("user_id", sa.UUID(), nullable=False),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("query", sa.Text(), nullable=False),
        sa.Column("search_type", sa.String(20), nullable=False, server_default="semantic"),
        sa.Column("filters", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("notify_new_results", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("frequency", sa.String(20), nullable=False, server_default="daily"),
        sa.Column("last_run_at", sa.DateTime(), nullable=True),
        sa.Column("last_result_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("new_results_since_last_view", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("created_at", sa.DateTime(), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("idx_saved_searches_user_id", "saved_searches", ["user_id"])
    op.create_index("idx_saved_searches_active", "saved_searches", ["is_active"])

    # ── 3. user_weekly_digests ──
    op.create_table(
        "user_weekly_digests",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("user_id", sa.UUID(), nullable=False),
        sa.Column("period_start", sa.Date(), nullable=False),
        sa.Column("period_end", sa.Date(), nullable=False),
        sa.Column("new_papers_in_interests", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("new_papers_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("new_repos_in_interests", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("new_repos_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("unread_bookmarks", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("unread_bookmarks_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("recommended_papers", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("saved_search_updates", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("content_md", sa.Text(), nullable=True),
        sa.Column("highlights", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("is_sent", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("sent_at", sa.DateTime(), nullable=True),
        sa.Column("created_at", sa.DateTime(), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("idx_user_digest_user_id", "user_weekly_digests", ["user_id"])
    op.create_index("idx_user_digest_period", "user_weekly_digests", ["period_start", "period_end"])
    op.create_index("idx_user_digest_created", "user_weekly_digests", ["created_at"])


def downgrade() -> None:
    op.drop_index("idx_user_digest_created", table_name="user_weekly_digests")
    op.drop_index("idx_user_digest_period", table_name="user_weekly_digests")
    op.drop_index("idx_user_digest_user_id", table_name="user_weekly_digests")
    op.drop_table("user_weekly_digests")

    op.drop_index("idx_saved_searches_active", table_name="saved_searches")
    op.drop_index("idx_saved_searches_user_id", table_name="saved_searches")
    op.drop_table("saved_searches")

    op.drop_index("idx_feed_created", table_name="user_feed_items")
    op.drop_index("idx_feed_unread", table_name="user_feed_items")
    op.drop_index("idx_feed_item", table_name="user_feed_items")
    op.drop_index("idx_feed_user_id", table_name="user_feed_items")
    op.drop_table("user_feed_items")
