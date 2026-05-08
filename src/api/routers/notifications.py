"""
Notification router — bell icon dropdown, mark read/unread, delete, preferences.
"""
import uuid

from fastapi import APIRouter, HTTPException, Query, status
from sqlalchemy import delete, func, select, update

from src.api.deps import DbSession, get_current_user_dep
from src.api.schemas.notification import (
    NotificationMarkRequest,
    NotificationPreferences,
    NotificationResponse,
    NotificationSummary,
)
from src.storage.models.notification import Notification

router = APIRouter(prefix="/me/notifications", tags=["notifications"])


@router.get("", response_model=NotificationSummary)
async def list_notifications(
    current_user: get_current_user_dep,
    db: DbSession,
    skip: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=100),
    unread_only: bool = Query(False),
    notification_type: str | None = Query(None),
):
    """Bell icon dropdown — list notifications của user."""
    base_filter = [Notification.user_id == current_user.id]
    if unread_only:
        base_filter.append(Notification.is_read == False)  # noqa: E712
    if notification_type:
        base_filter.append(Notification.notification_type == notification_type)

    total_q = select(func.count(Notification.id)).where(*base_filter)
    total = (await db.execute(total_q)).scalar() or 0

    unread_q = select(func.count(Notification.id)).where(
        Notification.user_id == current_user.id,
        Notification.is_read == False,  # noqa: E712
    )
    unread = (await db.execute(unread_q)).scalar() or 0

    items_q = (
        select(Notification)
        .where(*base_filter)
        .order_by(Notification.created_at.desc())
        .offset(skip)
        .limit(limit)
    )
    items = (await db.execute(items_q)).scalars().all()

    return NotificationSummary(
        unread_count=unread,
        total_count=total,
        items=[NotificationResponse.model_validate(n) for n in items],
    )


@router.get("/unread-count")
async def get_unread_count(
    current_user: get_current_user_dep,
    db: DbSession,
):
    """Endpoint nhẹ cho bell badge — chỉ trả số unread."""
    q = select(func.count(Notification.id)).where(
        Notification.user_id == current_user.id,
        Notification.is_read == False,  # noqa: E712
    )
    count = (await db.execute(q)).scalar() or 0
    return {"unread_count": count}


@router.post("/mark", status_code=status.HTTP_204_NO_CONTENT)
async def mark_notifications(
    body: NotificationMarkRequest,
    current_user: get_current_user_dep,
    db: DbSession,
):
    """Mark read/unread/delete một hoặc nhiều notifications."""
    if not body.notification_ids:
        return

    if body.action == "delete":
        await db.execute(
            delete(Notification).where(
                Notification.user_id == current_user.id,
                Notification.id.in_(body.notification_ids),
            )
        )
    else:
        from datetime import datetime
        values: dict
        if body.action == "read":
            values = {"is_read": True, "read_at": datetime.utcnow()}
        else:
            values = {"is_read": False, "read_at": None}
        await db.execute(
            update(Notification)
            .where(
                Notification.user_id == current_user.id,
                Notification.id.in_(body.notification_ids),
            )
            .values(**values)
        )
    await db.flush()


@router.post("/mark-all-read", status_code=status.HTTP_204_NO_CONTENT)
async def mark_all_notifications_read(
    current_user: get_current_user_dep,
    db: DbSession,
):
    """Đánh dấu toàn bộ notifications đã đọc."""
    from datetime import datetime
    await db.execute(
        update(Notification)
        .where(
            Notification.user_id == current_user.id,
            Notification.is_read == False,  # noqa: E712
        )
        .values(is_read=True, read_at=datetime.utcnow())
    )
    await db.flush()


@router.delete("/clear-read", status_code=status.HTTP_204_NO_CONTENT)
async def clear_read(
    current_user: get_current_user_dep,
    db: DbSession,
):
    """Xoá tất cả notifications đã đọc."""
    await db.execute(
        delete(Notification).where(
            Notification.user_id == current_user.id,
            Notification.is_read == True,  # noqa: E712
        )
    )
    await db.flush()


# ── Preferences ──

@router.get("/preferences", response_model=NotificationPreferences)
async def get_preferences(current_user: get_current_user_dep):
    prefs = current_user.notification_preferences or {}
    return NotificationPreferences(**prefs)


@router.put("/preferences", response_model=NotificationPreferences)
async def update_preferences(
    body: NotificationPreferences,
    current_user: get_current_user_dep,
    db: DbSession,
):
    from src.storage.models.user import User
    prefs_dict = body.model_dump()
    await db.execute(
        update(User)
        .where(User.id == current_user.id)
        .values(notification_preferences=prefs_dict)
    )
    await db.flush()
    return body


# ── Test endpoint ──

@router.post("/test")
async def send_test_notification(
    current_user: get_current_user_dep,
    db: DbSession,
):
    """Tạo 1 test notification để FE/email/webhook có thể verify."""
    notif = Notification(
        user_id=current_user.id,
        notification_type="system",
        severity="info",
        title="Test notification",
        body="Đây là notification thử nghiệm. Nếu bạn nhận được email/webhook, cấu hình đã đúng.",
        link="/me/notifications",
    )
    db.add(notif)
    await db.flush()

    # Trigger delivery sync
    try:
        from src.services.notification_delivery import deliver_notification
        await deliver_notification(notif, current_user)
    except Exception as e:
        notif.delivery_error = str(e)

    await db.flush()
    return {"id": str(notif.id), "delivered": True}
