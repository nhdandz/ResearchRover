"""
Saved Searches router — lưu query và tự động chạy lại định kỳ.
"""
import asyncio
import uuid
from functools import partial

from fastapi import APIRouter, HTTPException, status
from sqlalchemy import delete, select, update

from src.api.deps import DbSession, get_current_user_dep
from src.api.schemas.personalization import (
    SavedSearchCreate,
    SavedSearchResponse,
    SavedSearchRunResult,
    SavedSearchUpdate,
)
from src.storage.models.saved_search import SavedSearch

router = APIRouter(prefix="/me/saved-searches", tags=["saved-searches"])


@router.get("", response_model=list[SavedSearchResponse])
async def list_saved_searches(
    current_user: get_current_user_dep,
    db: DbSession,
):
    """Lấy tất cả saved searches của user."""
    result = await db.execute(
        select(SavedSearch)
        .where(SavedSearch.user_id == current_user.id)
        .order_by(SavedSearch.created_at.desc())
    )
    return list(result.scalars().all())


@router.post("", response_model=SavedSearchResponse, status_code=status.HTTP_201_CREATED)
async def create_saved_search(
    body: SavedSearchCreate,
    current_user: get_current_user_dep,
    db: DbSession,
):
    """Lưu một search query."""
    saved = SavedSearch(
        user_id=current_user.id,
        name=body.name,
        query=body.query,
        search_type=body.search_type,
        filters=body.filters,
        notify_new_results=body.notify_new_results,
        frequency=body.frequency,
    )
    db.add(saved)
    await db.flush()
    await db.refresh(saved)
    return saved


@router.patch("/{search_id}", response_model=SavedSearchResponse)
async def update_saved_search(
    search_id: uuid.UUID,
    body: SavedSearchUpdate,
    current_user: get_current_user_dep,
    db: DbSession,
):
    """Cập nhật tên, tần suất, hoặc bật/tắt notification."""
    result = await db.execute(
        select(SavedSearch).where(
            SavedSearch.id == search_id,
            SavedSearch.user_id == current_user.id,
        )
    )
    saved = result.scalar_one_or_none()
    if not saved:
        raise HTTPException(status_code=404, detail="Saved search not found")

    update_data = body.model_dump(exclude_unset=True)
    if update_data:
        await db.execute(
            update(SavedSearch).where(SavedSearch.id == search_id).values(**update_data)
        )
        await db.flush()
        await db.refresh(saved)
    return saved


@router.delete("/{search_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_saved_search(
    search_id: uuid.UUID,
    current_user: get_current_user_dep,
    db: DbSession,
):
    """Xoá một saved search."""
    result = await db.execute(
        select(SavedSearch).where(
            SavedSearch.id == search_id,
            SavedSearch.user_id == current_user.id,
        )
    )
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Saved search not found")
    await db.execute(delete(SavedSearch).where(SavedSearch.id == search_id))


@router.post("/{search_id}/run", response_model=SavedSearchRunResult)
async def run_saved_search(
    search_id: uuid.UUID,
    current_user: get_current_user_dep,
    db: DbSession,
):
    """Chạy lại một saved search ngay lập tức và trả về kết quả."""
    result = await db.execute(
        select(SavedSearch).where(
            SavedSearch.id == search_id,
            SavedSearch.user_id == current_user.id,
        )
    )
    saved = result.scalar_one_or_none()
    if not saved:
        raise HTTPException(status_code=404, detail="Saved search not found")

    # Thực thi tìm kiếm
    search_results = await _execute_search(saved.query, saved.search_type, saved.filters or {})
    new_count = max(0, len(search_results) - saved.last_result_count)

    # Cập nhật tracking
    from datetime import datetime
    await db.execute(
        update(SavedSearch)
        .where(SavedSearch.id == search_id)
        .values(
            last_run_at=datetime.utcnow(),
            last_result_count=len(search_results),
            new_results_since_last_view=0,
        )
    )
    await db.flush()

    return SavedSearchRunResult(
        search_id=search_id,
        query=saved.query,
        result_count=len(search_results),
        new_results=new_count,
        results=search_results[:20],
    )


@router.post("/{search_id}/viewed", status_code=status.HTTP_204_NO_CONTENT)
async def mark_search_viewed(
    search_id: uuid.UUID,
    current_user: get_current_user_dep,
    db: DbSession,
):
    """Reset counter new_results_since_last_view sau khi user xem kết quả."""
    await db.execute(
        update(SavedSearch)
        .where(
            SavedSearch.id == search_id,
            SavedSearch.user_id == current_user.id,
        )
        .values(new_results_since_last_view=0)
    )
    await db.flush()


# ── Helper ──

async def _execute_search(query: str, search_type: str, filters: dict) -> list[dict]:
    """Thực thi search và trả về list kết quả dạng dict."""
    try:
        from src.processors.embedding import EmbeddingGenerator
        from src.storage.vector.qdrant_client import VectorStore

        gen = EmbeddingGenerator()
        loop = asyncio.get_event_loop()
        embedding = await loop.run_in_executor(None, partial(gen.embed, query))

        vs = VectorStore()
        item_type = filters.get("type")
        if item_type == "paper":
            collections = ["papers"]
        elif item_type in ("repo", "repository"):
            collections = ["repositories"]
        else:
            collections = ["papers", "repositories"]

        results = []
        for col in collections:
            hits = vs.search(collection=col, query_vector=embedding, limit=20)
            for h in hits:
                payload = h.get("payload", {})
                results.append({
                    "id": str(h["id"]),
                    "type": col.rstrip("s"),
                    "title": payload.get("title", ""),
                    "score": round(h["score"], 3),
                    "url": payload.get("url") or payload.get("source_url"),
                })

        results.sort(key=lambda x: x["score"], reverse=True)
        return results[:20]
    except Exception:
        return []
