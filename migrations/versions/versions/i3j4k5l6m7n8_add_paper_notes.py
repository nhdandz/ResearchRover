"""add paper notes

Revision ID: i3j4k5l6m7n8
Revises: h2i3j4k5l6m7
Create Date: 2025-01-10 12:00:00.000000
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import ARRAY, UUID

revision = "i3j4k5l6m7n8"
down_revision = "h2i3j4k5l6m7"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "paper_notes",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("paper_id", UUID(as_uuid=True), sa.ForeignKey("papers.id", ondelete="CASCADE"), nullable=False),
        sa.Column("content", sa.Text, nullable=False),
        sa.Column("is_pinned", sa.Boolean, server_default="false", nullable=False),
        sa.Column("tags", ARRAY(sa.String(50)), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_paper_notes_user_id", "paper_notes", ["user_id"])
    op.create_index("ix_paper_notes_paper_id", "paper_notes", ["paper_id"])
    op.create_index("ix_paper_notes_user_paper", "paper_notes", ["user_id", "paper_id"])


def downgrade() -> None:
    op.drop_index("ix_paper_notes_user_paper", "paper_notes")
    op.drop_index("ix_paper_notes_paper_id", "paper_notes")
    op.drop_index("ix_paper_notes_user_id", "paper_notes")
    op.drop_table("paper_notes")
