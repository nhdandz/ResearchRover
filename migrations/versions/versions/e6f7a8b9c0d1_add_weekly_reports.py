"""add weekly_reports table

Revision ID: e6f7a8b9c0d1
Revises: d5e6f7a8b9c0
Create Date: 2026-02-08 10:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "e6f7a8b9c0d1"
down_revision: Union[str, None] = "d5e6f7a8b9c0"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "weekly_reports",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("title", sa.String(500), nullable=False),
        sa.Column("summary", sa.Text(), nullable=True),
        sa.Column("content", sa.Text(), nullable=True),
        sa.Column("highlights", postgresql.ARRAY(sa.String(1000)), nullable=True),
        sa.Column("top_papers", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("top_repos", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("trending_topics", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("new_papers_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("new_repos_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("period_start", sa.Date(), nullable=False),
        sa.Column("period_end", sa.Date(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("idx_weekly_reports_created", "weekly_reports", ["created_at"])
    op.create_index(
        "idx_weekly_reports_period", "weekly_reports", ["period_start", "period_end"]
    )


def downgrade() -> None:
    op.drop_index("idx_weekly_reports_period", table_name="weekly_reports")
    op.drop_index("idx_weekly_reports_created", table_name="weekly_reports")
    op.drop_table("weekly_reports")
