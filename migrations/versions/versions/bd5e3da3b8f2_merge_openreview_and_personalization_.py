"""merge openreview and personalization heads

Revision ID: bd5e3da3b8f2
Revises: d9e0f1a2b3c4, j4k5l6m7n8o9
Create Date: 2026-05-07 12:38:52.511302

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'bd5e3da3b8f2'
down_revision: Union[str, None] = ('d9e0f1a2b3c4', 'j4k5l6m7n8o9')
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
