"""
Personal feed router — papers & repos mới khớp với research interests.
"""
import json
import uuid

from fastapi import APIRouter, HTTPException, Query, status
from sqlalchemy import select, update

from src.api.deps import DbSession, get_current_user_dep
from src.api.schemas.personalization import FeedItemResponse, FeedMarkRequest, FeedSummary
from src.storage.models.paper import Paper
from src.storage.models.repository import Repository
from src.storage.models.user_feed_item import UserFeedItem

router = APIRouter(prefix="/me/feed", tags=["personal-feed"])


@router.get("", response_model=FeedSummary)
async def get_feed(
    current_user: get_current_user_dep,
    db: DbSession,
    skip: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=100),
    unread_only: bool = Query(False),
    item_type: str | None = Query(None),
):
    """Lấy personal feed của user: papers & repos mới khớp với research interests."""
    query = (
        select(UserFeedItem)
        .where(
            UserFeedItem.user_id == current_user.id,
            UserFeedItem.is_dismissed == False,  # noqa: E712
        )
        .order_by(UserFeedItem.relevance_score.desc(), UserFeedItem.created_at.desc())
    )

    if unread_only:
        query = query.where(UserFeedItem.is_read == False)  # noqa: E712
    if item_type:
        query = query.where(UserFeedItem.item_type == item_type)

    # Count total (without pagination)
    from sqlalchemy import func
    count_q = select(func.count()).select_from(
        select(UserFeedItem).where(
            UserFeedItem.user_id == current_user.id,
            UserFeedItem.is_dismissed == False,  # noqa: E712
        ).subquery()
    )
    total_result = await db.execute(count_q)
    total = total_result.scalar() or 0

    unread_q = select(func.count()).select_from(
        select(UserFeedItem).where(
            UserFeedItem.user_id == current_user.id,
            UserFeedItem.is_read == False,  # noqa: E712
            UserFeedItem.is_dismissed == False,  # noqa: E712
        ).subquery()
    )
    unread_result = await db.execute(unread_q)
    unread_count = unread_result.scalar() or 0

    result = await db.execute(query.offset(skip).limit(limit))
    feed_items = result.scalars().all()

    # Enrich với paper/repo data
    enriched = []
    for fi in feed_items:
        item_dict = {
            "id": fi.id,
            "item_type": fi.item_type,
            "item_id": fi.item_id,
            "relevance_score": fi.relevance_score,
            "reason": fi.reason,
            "matched_interests": json.loads(fi.matched_interests) if fi.matched_interests else None,
            "is_read": fi.is_read,
            "is_dismissed": fi.is_dismissed,
            "created_at": fi.created_at,
        }
        # Lấy title từ paper/repo
        try:
            if fi.item_type == "paper":
                r = await db.execute(select(Paper).where(Paper.id == fi.item_id))
                p = r.scalar_one_or_none()
                if p:
                    item_dict["title"] = p.title
                    item_dict["abstract"] = (p.abstract or "")[:300] if p.abstract else None
                    item_dict["categories"] = p.categories or []
                    item_dict["published_date"] = p.published_date
                    item_dict["arxiv_id"] = p.arxiv_id
                    item_dict["source_url"] = p.source_url
                    authors = p.authors or []
                    if isinstance(authors, list):
                        item_dict["description"] = (p.abstract or "")[:200] if p.abstract else None
                    item_dict["authors"] = [
                            a.get("name", a) if isinstance(a, dict) else str(a)
                            for a in authors[:3]
                        ]
            elif fi.item_type == "repo":
                r = await db.execute(select(Repository).where(Repository.id == fi.item_id))
                repo = r.scalar_one_or_none()
                if repo:
                    item_dict["title"] = repo.full_name
                    item_dict["full_name"] = repo.full_name
                    item_dict["description"] = repo.description
                    item_dict["abstract"] = repo.description
                    item_dict["categories"] = repo.topics[:5] if repo.topics else []
                    item_dict["source_url"] = repo.url
                    item_dict["stars_count"] = repo.stars_count
        except Exception:
            pass

        enriched.append(FeedItemResponse(**item_dict))

    return FeedSummary(unread_count=unread_count, total_count=total, items=enriched)


@router.post("/mark", status_code=status.HTTP_204_NO_CONTENT)
async def mark_feed_items(
    body: FeedMarkRequest,
    current_user: get_current_user_dep,
    db: DbSession,
):
    """Đánh dấu một hoặc nhiều feed items là đã đọc / đã dismiss / chưa đọc."""
    if not body.item_ids:
        return

    values: dict
    if body.action == "read":
        values = {"is_read": True}
    elif body.action == "dismiss":
        values = {"is_dismissed": True}
    elif body.action == "unread":
        values = {"is_read": False}
    else:
        raise HTTPException(status_code=422, detail="Unknown action")

    await db.execute(
        update(UserFeedItem)
        .where(
            UserFeedItem.user_id == current_user.id,
            UserFeedItem.id.in_(body.item_ids),
        )
        .values(**values)
    )
    await db.flush()


@router.post("/mark-all-read", status_code=status.HTTP_204_NO_CONTENT)
async def mark_all_read(
    current_user: get_current_user_dep,
    db: DbSession,
):
    """Đánh dấu toàn bộ feed đã đọc."""
    await db.execute(
        update(UserFeedItem)
        .where(UserFeedItem.user_id == current_user.id, UserFeedItem.is_read == False)  # noqa: E712
        .values(is_read=True)
    )
    await db.flush()


@router.delete("/dismissed", status_code=status.HTTP_204_NO_CONTENT)
async def clear_dismissed(
    current_user: get_current_user_dep,
    db: DbSession,
):
    """Xoá toàn bộ feed items đã dismiss."""
    from sqlalchemy import delete
    await db.execute(
        delete(UserFeedItem).where(
            UserFeedItem.user_id == current_user.id,
            UserFeedItem.is_dismissed == True,  # noqa: E712
        )
    )
    await db.flush()
