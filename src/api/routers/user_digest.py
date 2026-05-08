"""
Personal Weekly Digest router.
"""
import uuid
from datetime import date, timedelta

from fastapi import APIRouter, HTTPException
from sqlalchemy import select

from src.api.deps import DbSession, get_current_user_dep
from src.api.schemas.personalization import (
    DigestPaperItem,
    DigestRepoItem,
    UserDigestResponse,
)
from src.storage.models.user_weekly_digest import UserWeeklyDigest

router = APIRouter(prefix="/me/digest", tags=["personal-digest"])


@router.get("/latest", response_model=UserDigestResponse)
async def get_latest_digest(
    current_user: get_current_user_dep,
    db: DbSession,
):
    """Lấy digest cá nhân mới nhất của user."""
    result = await db.execute(
        select(UserWeeklyDigest)
        .where(UserWeeklyDigest.user_id == current_user.id)
        .order_by(UserWeeklyDigest.created_at.desc())
        .limit(1)
    )
    digest = result.scalar_one_or_none()
    if not digest:
        raise HTTPException(status_code=404, detail="No digest available yet. Check back after Sunday.")
    return _to_response(digest)


@router.get("/history", response_model=list[UserDigestResponse])
async def get_digest_history(
    current_user: get_current_user_dep,
    db: DbSession,
    limit: int = 10,
):
    """Lấy lịch sử digests của user."""
    result = await db.execute(
        select(UserWeeklyDigest)
        .where(UserWeeklyDigest.user_id == current_user.id)
        .order_by(UserWeeklyDigest.created_at.desc())
        .limit(limit)
    )
    return [_to_response(d) for d in result.scalars().all()]


@router.get("/{digest_id}", response_model=UserDigestResponse)
async def get_digest(
    digest_id: uuid.UUID,
    current_user: get_current_user_dep,
    db: DbSession,
):
    """Lấy một digest cụ thể."""
    result = await db.execute(
        select(UserWeeklyDigest).where(
            UserWeeklyDigest.id == digest_id,
            UserWeeklyDigest.user_id == current_user.id,
        )
    )
    digest = result.scalar_one_or_none()
    if not digest:
        raise HTTPException(status_code=404, detail="Digest not found")
    return _to_response(digest)


@router.post("/generate", response_model=UserDigestResponse)
async def trigger_digest_generation(
    current_user: get_current_user_dep,
    db: DbSession,
):
    """Trigger tạo digest ngay lập tức (không cần chờ Celery schedule)."""
    from src.workers.tasks.personalization import generate_user_digest_for
    generate_user_digest_for.delay(str(current_user.id))

    # Trả về digest mới nhất trong khi chờ task hoàn thành
    result = await db.execute(
        select(UserWeeklyDigest)
        .where(UserWeeklyDigest.user_id == current_user.id)
        .order_by(UserWeeklyDigest.created_at.desc())
        .limit(1)
    )
    digest = result.scalar_one_or_none()
    if not digest:
        raise HTTPException(
            status_code=202,
            detail="Digest generation triggered. Check back in a few minutes."
        )
    return _to_response(digest)


# ── Helper ──

def _to_response(digest: UserWeeklyDigest) -> UserDigestResponse:
    papers_raw = digest.new_papers_in_interests or []
    repos_raw = digest.new_repos_in_interests or []

    papers = []
    for p in papers_raw:
        try:
            papers.append(DigestPaperItem(**p))
        except Exception:
            pass

    repos = []
    for r in repos_raw:
        try:
            repos.append(DigestRepoItem(**r))
        except Exception:
            pass

    highlights = digest.highlights
    if isinstance(highlights, dict):
        highlights = highlights.get("items", [])
    elif not isinstance(highlights, list):
        highlights = []

    return UserDigestResponse(
        id=digest.id,
        period_start=digest.period_start,
        period_end=digest.period_end,
        new_papers_count=digest.new_papers_count,
        new_repos_count=digest.new_repos_count,
        unread_bookmarks_count=digest.unread_bookmarks_count,
        new_papers_in_interests=papers,
        new_repos_in_interests=repos,
        unread_bookmarks=digest.unread_bookmarks,
        recommended_papers=digest.recommended_papers,
        saved_search_updates=digest.saved_search_updates,
        highlights=highlights,
        content_md=digest.content_md,
        created_at=digest.created_at,
    )
