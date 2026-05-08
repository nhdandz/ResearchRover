"""add notifications, authors, paper_signals, concept_trends

Revision ID: j4k5l6m7n8o9
Revises: i3j4k5l6m7n8
Create Date: 2026-05-07 12:00:00.000000
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import ARRAY, JSONB, UUID

revision = "j4k5l6m7n8o9"
down_revision = "i3j4k5l6m7n8"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ── notifications ──
    op.create_table(
        "notifications",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "user_id",
            UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "alert_id",
            UUID(as_uuid=True),
            sa.ForeignKey("user_alerts.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("notification_type", sa.String(50), nullable=False),
        sa.Column("severity", sa.String(20), nullable=False, server_default="info"),
        sa.Column("title", sa.String(500), nullable=False),
        sa.Column("body", sa.Text, nullable=True),
        sa.Column("link", sa.Text, nullable=True),
        sa.Column("data", JSONB, nullable=True),
        sa.Column("dedup_key", sa.String(255), nullable=True),
        sa.Column("is_read", sa.Boolean, server_default="false", nullable=False),
        sa.Column("read_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "delivered_in_app", sa.Boolean, server_default="true", nullable=False
        ),
        sa.Column(
            "delivered_email", sa.Boolean, server_default="false", nullable=False
        ),
        sa.Column(
            "delivered_webhook", sa.Boolean, server_default="false", nullable=False
        ),
        sa.Column("delivery_error", sa.Text, nullable=True),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now()
        ),
    )
    op.create_index(
        "idx_notif_user_unread", "notifications", ["user_id", "is_read"]
    )
    op.create_index(
        "idx_notif_user_created", "notifications", ["user_id", "created_at"]
    )
    op.create_index(
        "idx_notif_dedup", "notifications", ["user_id", "dedup_key"]
    )

    # ── authors ──
    op.create_table(
        "authors",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("normalized_name", sa.String(255), nullable=False),
        sa.Column("semantic_scholar_id", sa.String(50), nullable=True, unique=True),
        sa.Column("orcid", sa.String(50), nullable=True, unique=True),
        sa.Column("dblp_id", sa.String(100), nullable=True),
        sa.Column("google_scholar_id", sa.String(50), nullable=True),
        sa.Column("affiliations", ARRAY(sa.String(255)), nullable=True),
        sa.Column("homepage", sa.Text, nullable=True),
        sa.Column("h_index", sa.Integer, nullable=True),
        sa.Column("citation_count", sa.Integer, server_default="0"),
        sa.Column("paper_count", sa.Integer, server_default="0"),
        sa.Column("topics", ARRAY(sa.String(100)), nullable=True),
        sa.Column("country", sa.String(100), nullable=True),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now()
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()
        ),
    )
    op.create_index("ix_authors_normalized_name", "authors", ["normalized_name"])
    op.create_index(
        "ix_authors_h_index", "authors", ["h_index"], postgresql_using="btree"
    )

    # ── author_papers (junction) ──
    op.create_table(
        "author_papers",
        sa.Column(
            "author_id",
            UUID(as_uuid=True),
            sa.ForeignKey("authors.id", ondelete="CASCADE"),
            primary_key=True,
        ),
        sa.Column(
            "paper_id",
            UUID(as_uuid=True),
            sa.ForeignKey("papers.id", ondelete="CASCADE"),
            primary_key=True,
        ),
        sa.Column("position", sa.Integer, server_default="0"),
        sa.Column("is_corresponding", sa.Boolean, server_default="false"),
    )
    op.create_index(
        "ix_author_papers_paper", "author_papers", ["paper_id"]
    )

    # ── paper_signals (cross-source aggregation) ──
    op.create_table(
        "paper_signals",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "paper_id",
            UUID(as_uuid=True),
            sa.ForeignKey("papers.id", ondelete="CASCADE"),
            nullable=False,
            unique=True,
        ),
        sa.Column("arxiv_present", sa.Boolean, server_default="false"),
        sa.Column("hf_upvotes", sa.Integer, server_default="0"),
        sa.Column("hn_score", sa.Integer, server_default="0"),
        sa.Column("hn_comments", sa.Integer, server_default="0"),
        sa.Column("github_repo_stars", sa.Integer, server_default="0"),
        sa.Column("github_repo_count", sa.Integer, server_default="0"),
        sa.Column("openreview_rating", sa.Float, nullable=True),
        sa.Column("citation_count", sa.Integer, server_default="0"),
        sa.Column("twitter_mentions", sa.Integer, server_default="0"),
        sa.Column("buzz_score", sa.Float, server_default="0"),
        sa.Column("buzz_velocity", sa.Float, server_default="0"),
        sa.Column("source_breakdown", JSONB, nullable=True),
        sa.Column("computed_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index(
        "idx_paper_signals_buzz", "paper_signals", ["buzz_score"]
    )
    op.create_index(
        "idx_paper_signals_velocity", "paper_signals", ["buzz_velocity"]
    )

    # ── concept_trends ──
    op.create_table(
        "concept_trends",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("concept", sa.String(255), nullable=False),
        sa.Column("normalized_concept", sa.String(255), nullable=False),
        sa.Column("period_start", sa.Date, nullable=False),
        sa.Column("period_end", sa.Date, nullable=False),
        sa.Column("paper_count", sa.Integer, server_default="0"),
        sa.Column("growth_rate", sa.Float, server_default="0"),
        sa.Column("category", sa.String(100), nullable=True),
        sa.Column("status", sa.String(20), server_default="stable"),
        sa.Column("data_points", JSONB, nullable=True),
        sa.Column("computed_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index(
        "idx_concept_trends_concept_period",
        "concept_trends",
        ["normalized_concept", "period_end"],
    )
    op.create_index(
        "idx_concept_trends_status", "concept_trends", ["status"]
    )


def downgrade() -> None:
    op.drop_index("idx_concept_trends_status", "concept_trends")
    op.drop_index("idx_concept_trends_concept_period", "concept_trends")
    op.drop_table("concept_trends")

    op.drop_index("idx_paper_signals_velocity", "paper_signals")
    op.drop_index("idx_paper_signals_buzz", "paper_signals")
    op.drop_table("paper_signals")

    op.drop_index("ix_author_papers_paper", "author_papers")
    op.drop_table("author_papers")

    op.drop_index("ix_authors_h_index", "authors")
    op.drop_index("ix_authors_normalized_name", "authors")
    op.drop_table("authors")

    op.drop_index("idx_notif_dedup", "notifications")
    op.drop_index("idx_notif_user_created", "notifications")
    op.drop_index("idx_notif_user_unread", "notifications")
    op.drop_table("notifications")
