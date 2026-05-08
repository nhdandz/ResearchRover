"""
Notification engine — đánh giá tất cả UserAlert và sinh ra Notification tương ứng.

Chạy hàng giờ. Logic per alert_type:
  - keyword: vector search query → so với papers/repos mới trong window
  - author: scan papers/repos/openreview của tác giả
  - citation: query Semantic Scholar cho paper bookmarked
  - venue: papers mới của venue (e.g. ICLR 2025)
  - repo_milestone: repo cụ thể đạt mốc stars / có release mới
"""
import asyncio
import json
import uuid
from datetime import datetime, timedelta
from functools import partial

from src.core.logging import get_logger
from src.workers.celery_app import celery_app

logger = get_logger(__name__)


def _run_async(coro):
    loop = asyncio.new_event_loop()
    try:
        return loop.run_until_complete(coro)
    finally:
        loop.close()


# ════════════════════════════════════════════════
# Entry: evaluate_all_user_alerts (hourly)
# ════════════════════════════════════════════════

@celery_app.task(name="src.workers.tasks.notifications.evaluate_all_user_alerts")
def evaluate_all_user_alerts():
    """Đánh giá tất cả active alerts và sinh ra notifications."""
    return _run_async(_evaluate_all())


async def _evaluate_all():
    from sqlalchemy import select
    from src.storage.database import create_async_session_factory
    from src.storage.models.user import User
    from src.storage.models.user_alert import UserAlert

    factory = create_async_session_factory()
    async with factory() as session:
        result = await session.execute(
            select(UserAlert)
            .where(UserAlert.is_active == True)  # noqa: E712
        )
        alerts = result.scalars().all()

    logger.info("Evaluating user alerts", count=len(alerts))
    triggered = 0
    for alert in alerts:
        try:
            count = await _evaluate_single_alert(alert.id)
            triggered += count
        except Exception as e:
            logger.warning("Alert evaluation failed", alert_id=str(alert.id), error=str(e))

    logger.info("User alerts evaluation done", triggered_total=triggered)
    return {"triggered": triggered}


@celery_app.task(name="src.workers.tasks.notifications.evaluate_alert")
def evaluate_alert(alert_id: str):
    """Đánh giá một alert cụ thể (có thể trigger thủ công từ API)."""
    return _run_async(_evaluate_single_alert(uuid.UUID(alert_id)))


async def _evaluate_single_alert(alert_id: uuid.UUID) -> int:
    """Trả về số lượng notification được tạo."""
    from sqlalchemy import select, update
    from src.storage.database import create_async_session_factory
    from src.storage.models.user import User
    from src.storage.models.user_alert import UserAlert

    factory = create_async_session_factory()
    async with factory() as session:
        alert = (
            await session.execute(select(UserAlert).where(UserAlert.id == alert_id))
        ).scalar_one_or_none()
        if not alert or not alert.is_active:
            return 0
        user = (
            await session.execute(select(User).where(User.id == alert.user_id))
        ).scalar_one_or_none()
        if not user or not user.is_active:
            return 0

        # Window: chỉ check items được tạo từ last_triggered (hoặc 24h nếu chưa từng trigger)
        since = alert.last_triggered or (datetime.utcnow() - timedelta(hours=24))

        handler = {
            "keyword": _evaluate_keyword,
            "author": _evaluate_author,
            "citation": _evaluate_citation,
            "venue": _evaluate_venue,
            "repo_milestone": _evaluate_repo_milestone,
        }.get(alert.alert_type)

        if not handler:
            return 0

        notifications_created = await handler(session, alert, user, since)

        if notifications_created > 0:
            await session.execute(
                update(UserAlert)
                .where(UserAlert.id == alert.id)
                .values(
                    last_triggered=datetime.utcnow(),
                    trigger_count=(alert.trigger_count or 0) + notifications_created,
                )
            )

        await session.commit()
        return notifications_created


# ════════════════════════════════════════════════
# Per-type handlers
# ════════════════════════════════════════════════

async def _evaluate_keyword(session, alert, user, since: datetime) -> int:
    """
    Keyword alert: dùng semantic search (Qdrant) tìm papers/repos mới khớp query.
    """
    config = alert.config or {}
    query = config.get("query")
    if not query:
        return 0

    min_relevance = float(config.get("min_relevance", 0.55))
    sources_filter = config.get("sources") or []

    # Encode query → search vector DB
    try:
        from src.processors.embedding import EmbeddingGenerator
        from src.storage.vector.qdrant_client import VectorStore
    except ImportError:
        return 0

    gen = EmbeddingGenerator()
    loop = asyncio.get_running_loop()
    embedding = await loop.run_in_executor(None, partial(gen.embed, query))

    vs = VectorStore()
    collections = ["papers", "repositories"]
    if config.get("type") == "paper":
        collections = ["papers"]
    elif config.get("type") in ("repo", "repository"):
        collections = ["repositories"]

    matched_count = 0
    for col in collections:
        try:
            hits = vs.search(collection=col, query_vector=embedding, limit=20)
        except Exception:
            continue

        for h in hits:
            score = h.get("score", 0.0)
            if score < min_relevance:
                continue
            payload = h.get("payload", {})

            # Lọc theo source nếu có
            if sources_filter and payload.get("source") not in sources_filter:
                continue

            # Chỉ alert cho item mới
            created_at_ts = payload.get("created_at")
            if created_at_ts:
                try:
                    item_time = datetime.fromisoformat(created_at_ts.replace("Z", "+00:00"))
                    if item_time.replace(tzinfo=None) < since:
                        continue
                except Exception:
                    pass

            item_id = h.get("id")
            item_type = "paper" if col == "papers" else "repo"
            title = payload.get("title") or payload.get("full_name") or ""
            url = payload.get("source_url") or payload.get("url")

            created = await _create_notification(
                session,
                user_id=alert.user_id,
                alert_id=alert.id,
                notification_type="alert_keyword",
                severity="info",
                title=f"🔔 New match: {title[:140]}",
                body=f'Query "{query}" matched with score {score:.2f}',
                link=f"/{'papers' if item_type == 'paper' else 'repos'}/{item_id}",
                data={
                    "query": query,
                    "score": score,
                    "item_type": item_type,
                    "item_id": str(item_id),
                    "title": title,
                    "url": url,
                },
                dedup_key=f"alert:{alert.id}:{item_type}:{item_id}",
            )
            if created:
                matched_count += 1

    return matched_count


async def _evaluate_author(session, alert, user, since: datetime) -> int:
    """Author alert: scan papers/repos mới có author này."""
    from sqlalchemy import select
    from src.storage.models.paper import Paper

    config = alert.config or {}
    author_name = (config.get("author_name") or "").strip().lower()
    if not author_name:
        return 0

    result = await session.execute(
        select(Paper)
        .where(Paper.created_at >= since)
        .order_by(Paper.created_at.desc())
        .limit(200)
    )
    papers = result.scalars().all()

    matched = 0
    for paper in papers:
        authors = paper.authors or []
        if not isinstance(authors, list):
            continue
        names = []
        for a in authors:
            if isinstance(a, dict):
                names.append((a.get("name") or "").lower())
            else:
                names.append(str(a).lower())

        if not any(author_name in n for n in names):
            continue

        created = await _create_notification(
            session,
            user_id=alert.user_id,
            alert_id=alert.id,
            notification_type="alert_author",
            severity="info",
            title=f"📝 {config['author_name']} published: {paper.title[:120]}",
            body=(paper.abstract or "")[:300],
            link=f"/papers/{paper.id}",
            data={
                "author_name": config["author_name"],
                "paper_id": str(paper.id),
                "title": paper.title,
                "arxiv_id": paper.arxiv_id,
            },
            dedup_key=f"alert:{alert.id}:paper:{paper.id}",
        )
        if created:
            matched += 1

    return matched


async def _evaluate_citation(session, alert, user, since: datetime) -> int:
    """Citation alert: paper bookmarked nhận citation mới (so sánh citation_count)."""
    from sqlalchemy import select
    from src.storage.models.paper import Paper

    config = alert.config or {}
    paper_id_str = config.get("paper_id")
    if not paper_id_str:
        return 0

    try:
        paper_id = uuid.UUID(paper_id_str)
    except Exception:
        return 0

    paper = (
        await session.execute(select(Paper).where(Paper.id == paper_id))
    ).scalar_one_or_none()
    if not paper:
        return 0

    last_known_count = config.get("last_known_count", 0)
    current_count = paper.citation_count or 0

    if current_count <= last_known_count:
        return 0

    delta = current_count - last_known_count

    created = await _create_notification(
        session,
        user_id=alert.user_id,
        alert_id=alert.id,
        notification_type="alert_citation",
        severity="success",
        title=f"📈 +{delta} citations: {paper.title[:120]}",
        body=f"Paper now has {current_count} citations (was {last_known_count}).",
        link=f"/papers/{paper.id}",
        data={
            "paper_id": str(paper.id),
            "previous_count": last_known_count,
            "current_count": current_count,
            "delta": delta,
        },
        dedup_key=f"alert:{alert.id}:citation:{current_count}",
    )

    # Cập nhật last_known_count vào config
    new_config = dict(config)
    new_config["last_known_count"] = current_count
    alert.config = new_config

    return 1 if created else 0


async def _evaluate_venue(session, alert, user, since: datetime) -> int:
    """Venue alert: OpenReview notes mới của venue cụ thể."""
    from sqlalchemy import select
    from src.storage.models.openreview_note import OpenReviewNote

    config = alert.config or {}
    venue_name = config.get("venue_name")
    if not venue_name:
        return 0

    result = await session.execute(
        select(OpenReviewNote)
        .where(
            OpenReviewNote.venue.ilike(f"%{venue_name}%"),
            OpenReviewNote.created_at >= since,
        )
        .order_by(OpenReviewNote.average_rating.desc().nulls_last())
        .limit(20)
    )
    notes = result.scalars().all()

    matched = 0
    for note in notes:
        rating_str = (
            f" (avg rating: {note.average_rating:.1f})" if note.average_rating else ""
        )
        created = await _create_notification(
            session,
            user_id=alert.user_id,
            alert_id=alert.id,
            notification_type="alert_venue",
            severity="info",
            title=f"🏛️ New {venue_name} paper: {note.title[:120]}{rating_str}",
            body=(note.abstract or note.tldr or "")[:300],
            link=f"/openreview/{note.note_id}",
            data={
                "venue": venue_name,
                "note_id": note.note_id,
                "title": note.title,
                "average_rating": note.average_rating,
            },
            dedup_key=f"alert:{alert.id}:venue:{note.note_id}",
        )
        if created:
            matched += 1

    return matched


async def _evaluate_repo_milestone(session, alert, user, since: datetime) -> int:
    """Repo milestone alert: repo cụ thể đạt N stars hoặc có release mới."""
    from sqlalchemy import select
    from src.storage.models.repository import Repository

    config = alert.config or {}
    repo_id_str = config.get("repo_id")
    milestone_type = config.get("milestone_type", "stars")  # stars | release
    threshold = int(config.get("threshold", 0))
    last_value = int(config.get("last_value", 0))

    if not repo_id_str:
        return 0

    try:
        repo_id = uuid.UUID(repo_id_str)
    except Exception:
        return 0

    repo = (
        await session.execute(select(Repository).where(Repository.id == repo_id))
    ).scalar_one_or_none()
    if not repo:
        return 0

    matched = 0

    if milestone_type == "stars":
        current = repo.stars_count or 0
        # Trigger khi vượt threshold lần đầu hoặc đã tăng đáng kể
        if current >= threshold > last_value:
            created = await _create_notification(
                session,
                user_id=alert.user_id,
                alert_id=alert.id,
                notification_type="alert_repo_milestone",
                severity="success",
                title=f"⭐ {repo.full_name} hit {threshold} stars!",
                body=f"Now at {current:,} stars.",
                link=f"/repos/{repo.id}",
                data={
                    "repo_id": str(repo.id),
                    "milestone": "stars",
                    "threshold": threshold,
                    "current": current,
                },
                dedup_key=f"alert:{alert.id}:milestone:stars:{threshold}",
            )
            new_config = dict(config)
            new_config["last_value"] = current
            alert.config = new_config
            if created:
                matched += 1

    elif milestone_type == "release":
        if repo.last_release_at and repo.last_release_at > since:
            created = await _create_notification(
                session,
                user_id=alert.user_id,
                alert_id=alert.id,
                notification_type="alert_repo_milestone",
                severity="info",
                title=f"🚀 New release: {repo.full_name} {repo.last_release_tag or ''}",
                body=f"Released at {repo.last_release_at.isoformat()}",
                link=f"/repos/{repo.id}",
                data={
                    "repo_id": str(repo.id),
                    "milestone": "release",
                    "release_tag": repo.last_release_tag,
                },
                dedup_key=f"alert:{alert.id}:release:{repo.last_release_tag}",
            )
            if created:
                matched += 1

    return matched


# ════════════════════════════════════════════════
# Helpers: create notification with dedup, schedule delivery
# ════════════════════════════════════════════════

async def _create_notification(
    session,
    *,
    user_id: uuid.UUID,
    alert_id: uuid.UUID | None,
    notification_type: str,
    severity: str,
    title: str,
    body: str,
    link: str | None,
    data: dict | None,
    dedup_key: str | None,
) -> bool:
    """Tạo notification, skip nếu dedup_key đã tồn tại trong 7 ngày qua."""
    from sqlalchemy import select
    from src.storage.models.notification import Notification

    if dedup_key:
        check = await session.execute(
            select(Notification).where(
                Notification.user_id == user_id,
                Notification.dedup_key == dedup_key,
                Notification.created_at >= datetime.utcnow() - timedelta(days=7),
            )
        )
        if check.scalar_one_or_none():
            return False

    notif = Notification(
        user_id=user_id,
        alert_id=alert_id,
        notification_type=notification_type,
        severity=severity,
        title=title[:500],
        body=body,
        link=link,
        data=data,
        dedup_key=dedup_key,
    )
    session.add(notif)
    await session.flush()

    # Trigger delivery (email/webhook) async — best effort
    try:
        from src.storage.models.user import User
        user = (await session.execute(select(User).where(User.id == user_id))).scalar_one()
        from src.services.notification_delivery import deliver_notification
        await deliver_notification(notif, user)
    except Exception as e:
        logger.warning("Notification delivery error", error=str(e))
        notif.delivery_error = str(e)

    return True


# ════════════════════════════════════════════════
# Cleanup task: xoá notifications cũ (>30 ngày, đã đọc)
# ════════════════════════════════════════════════

@celery_app.task(name="src.workers.tasks.notifications.cleanup_old_notifications")
def cleanup_old_notifications():
    return _run_async(_cleanup())


async def _cleanup():
    from sqlalchemy import delete
    from src.storage.database import create_async_session_factory
    from src.storage.models.notification import Notification

    factory = create_async_session_factory()
    cutoff = datetime.utcnow() - timedelta(days=30)
    async with factory() as session:
        result = await session.execute(
            delete(Notification).where(
                Notification.is_read == True,  # noqa: E712
                Notification.created_at < cutoff,
            )
        )
        await session.commit()
        logger.info("Cleaned up old notifications", deleted=result.rowcount)
