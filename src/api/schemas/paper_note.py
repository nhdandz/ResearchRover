from __future__ import annotations

import uuid
from datetime import datetime
from typing import List

from pydantic import BaseModel


class PaperNoteCreate(BaseModel):
    paper_id: uuid.UUID | None = None   # legacy: paper notes
    item_id: uuid.UUID | None = None    # generic: paper or repo notes
    content: str
    is_pinned: bool = False
    tags: List[str] = []

    @property
    def resolved_item_id(self) -> uuid.UUID | None:
        return self.paper_id or self.item_id


class PaperNoteUpdate(BaseModel):
    content: str | None = None
    is_pinned: bool | None = None
    tags: List[str] | None = None


class PaperNoteResponse(BaseModel):
    model_config = {"from_attributes": True}

    id: uuid.UUID
    user_id: uuid.UUID
    paper_id: uuid.UUID
    content: str
    is_pinned: bool
    tags: List[str]
    created_at: datetime
    updated_at: datetime
