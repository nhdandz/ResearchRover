"""
Per-user paper notes router.

Researchers can add private notes/annotations to any paper:
  - Create, read, update, delete notes
  - Pin important notes
  - Tag notes for organisation
  - List notes for a specific paper or all notes
"""
import uuid

from fastapi import APIRouter, HTTPException, Query, status
from sqlalchemy import delete, select, update

from src.api.deps import DbSession, get_current_user_dep
from src.api.schemas.paper_note import PaperNoteCreate, PaperNoteResponse, PaperNoteUpdate
from src.storage.models.paper_note import PaperNote
from src.storage.models.paper import Paper

router = APIRouter(prefix="/me/notes", tags=["paper-notes"])


@router.get("", response_model=list[PaperNoteResponse])
async def list_notes(
    current_user: get_current_user_dep,
    db: DbSession,
    paper_id: uuid.UUID | None = Query(None, description="Filter by paper"),
    item_id: uuid.UUID | None = Query(None, description="Generic item id (paper or repo)"),
    pinned_only: bool = Query(False),
    tag: str | None = Query(None, description="Filter by tag"),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
):
    """Return all notes for the current user, optionally filtered."""
    stmt = select(PaperNote).where(PaperNote.user_id == current_user.id)
    # Support both ?paper_id= (legacy) and ?item_id= (generic)
    filter_id = paper_id or item_id
    if filter_id:
        stmt = stmt.where(PaperNote.paper_id == filter_id)
    if pinned_only:
        stmt = stmt.where(PaperNote.is_pinned.is_(True))
    if tag:
        stmt = stmt.where(PaperNote.tags.any(tag))
    stmt = stmt.order_by(PaperNote.is_pinned.desc(), PaperNote.updated_at.desc())
    stmt = stmt.offset(skip).limit(limit)
    result = await db.execute(stmt)
    return result.scalars().all()


@router.post("", response_model=PaperNoteResponse, status_code=status.HTTP_201_CREATED)
async def create_note(
    current_user: get_current_user_dep,
    db: DbSession,
    body: PaperNoteCreate,
):
    """Create a new note on a paper or repository."""
    resolved_id = body.resolved_item_id
    if not resolved_id:
        raise HTTPException(status_code=422, detail="Either paper_id or item_id is required")

    # Verify the item exists (paper or repo)
    from src.storage.models.repository import Repository
    item = await db.get(Paper, resolved_id)
    if not item:
        item = await db.get(Repository, resolved_id)
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")

    note = PaperNote(
        user_id=current_user.id,
        paper_id=resolved_id,
        content=body.content,
        is_pinned=body.is_pinned,
        tags=body.tags or [],
    )
    db.add(note)
    await db.commit()
    await db.refresh(note)
    return note


@router.get("/{note_id}", response_model=PaperNoteResponse)
async def get_note(
    current_user: get_current_user_dep,
    db: DbSession,
    note_id: uuid.UUID,
):
    note = await db.get(PaperNote, note_id)
    if not note or note.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="Note not found")
    return note


@router.patch("/{note_id}", response_model=PaperNoteResponse)
async def update_note(
    current_user: get_current_user_dep,
    db: DbSession,
    note_id: uuid.UUID,
    body: PaperNoteUpdate,
):
    note = await db.get(PaperNote, note_id)
    if not note or note.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="Note not found")

    values = body.model_dump(exclude_unset=True)
    if values:
        await db.execute(
            update(PaperNote).where(PaperNote.id == note_id).values(**values)
        )
        await db.commit()
        await db.refresh(note)
    return note


@router.delete("/{note_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_note(
    current_user: get_current_user_dep,
    db: DbSession,
    note_id: uuid.UUID,
):
    note = await db.get(PaperNote, note_id)
    if not note or note.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="Note not found")
    await db.execute(delete(PaperNote).where(PaperNote.id == note_id))
    await db.commit()
