"""
Per-user alerts router.

Mỗi researcher có thể tạo alerts riêng để theo dõi:
  - keyword   : paper/repo mới chứa từ khoá
  - author    : tác giả X publish paper mới
  - citation  : paper đã bookmark được cite thêm
  - venue     : conference/journal có bài mới
  - repo_milestone : repo đạt mốc stars / có release mới
"""
import uuid

from fastapi import APIRouter, HTTPException, status
from sqlalchemy import delete, select, update

from src.api.deps import DbSession, get_current_user_dep
from src.api.schemas.user_alert import (
    UserAlertCreate,
    UserAlertResponse,
    UserAlertUpdate,
)
from src.storage.models.user_alert import UserAlert

router = APIRouter(prefix="/me/alerts", tags=["user-alerts"])


@router.get("", response_model=list[UserAlertResponse])
async def list_user_alerts(
    current_user: get_current_user_dep,
    db: DbSession,
    alert_type: str | None = None,
    is_active: bool | None = None,
):
    """Lấy danh sách tất cả alerts của user hiện tại."""
    query = (
        select(UserAlert)
        .where(UserAlert.user_id == current_user.id)
        .order_by(UserAlert.created_at.desc())
    )
    if alert_type is not None:
        query = query.where(UserAlert.alert_type == alert_type)
    if is_active is not None:
        query = query.where(UserAlert.is_active == is_active)

    result = await db.execute(query)
    return list(result.scalars().all())


@router.post("", response_model=UserAlertResponse, status_code=status.HTTP_201_CREATED)
async def create_user_alert(
    body: UserAlertCreate,
    current_user: get_current_user_dep,
    db: DbSession,
):
    """Tạo alert mới cho user."""
    _validate_alert_config(body.alert_type, body.config)

    alert = UserAlert(
        user_id=current_user.id,
        alert_type=body.alert_type,
        label=body.label,
        config=body.config,
        channel=body.channel,
        frequency=body.frequency,
    )
    db.add(alert)
    await db.flush()
    await db.refresh(alert)
    return alert


@router.get("/{alert_id}", response_model=UserAlertResponse)
async def get_user_alert(
    alert_id: uuid.UUID,
    current_user: get_current_user_dep,
    db: DbSession,
):
    """Lấy chi tiết một alert."""
    result = await db.execute(
        select(UserAlert).where(
            UserAlert.id == alert_id,
            UserAlert.user_id == current_user.id,
        )
    )
    alert = result.scalar_one_or_none()
    if not alert:
        raise HTTPException(status_code=404, detail="Alert not found")
    return alert


@router.patch("/{alert_id}", response_model=UserAlertResponse)
async def update_user_alert(
    alert_id: uuid.UUID,
    body: UserAlertUpdate,
    current_user: get_current_user_dep,
    db: DbSession,
):
    """Cập nhật alert (label, config, channel, frequency, bật/tắt)."""
    result = await db.execute(
        select(UserAlert).where(
            UserAlert.id == alert_id,
            UserAlert.user_id == current_user.id,
        )
    )
    alert = result.scalar_one_or_none()
    if not alert:
        raise HTTPException(status_code=404, detail="Alert not found")

    update_data = body.model_dump(exclude_unset=True)
    if not update_data:
        return alert

    # Nếu cập nhật config, validate lại
    new_config = update_data.get("config")
    if new_config is not None:
        _validate_alert_config(alert.alert_type, new_config)

    await db.execute(
        update(UserAlert).where(UserAlert.id == alert_id).values(**update_data)
    )
    await db.flush()
    await db.refresh(alert)
    return alert


@router.delete("/{alert_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_user_alert(
    alert_id: uuid.UUID,
    current_user: get_current_user_dep,
    db: DbSession,
):
    """Xoá một alert."""
    result = await db.execute(
        select(UserAlert).where(
            UserAlert.id == alert_id,
            UserAlert.user_id == current_user.id,
        )
    )
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Alert not found")

    await db.execute(delete(UserAlert).where(UserAlert.id == alert_id))


# ── Bulk toggle ──

@router.patch("", response_model=list[UserAlertResponse])
async def toggle_all_alerts(
    is_active: bool,
    current_user: get_current_user_dep,
    db: DbSession,
):
    """Bật hoặc tắt tất cả alerts của user."""
    await db.execute(
        update(UserAlert)
        .where(UserAlert.user_id == current_user.id)
        .values(is_active=is_active)
    )
    await db.flush()

    result = await db.execute(
        select(UserAlert)
        .where(UserAlert.user_id == current_user.id)
        .order_by(UserAlert.created_at.desc())
    )
    return list(result.scalars().all())


# ── Helper ──

def _validate_alert_config(alert_type: str, config: dict) -> None:
    """Kiểm tra config có đủ trường bắt buộc theo từng loại alert."""
    required: dict[str, list[str]] = {
        "keyword": ["query"],
        "author": ["author_name"],
        "citation": ["paper_id"],
        "venue": ["venue_name"],
        "repo_milestone": ["repo_id", "milestone_type"],
    }
    missing = [k for k in required.get(alert_type, []) if k not in config]
    if missing:
        raise HTTPException(
            status_code=422,
            detail=f"Alert type '{alert_type}' requires config fields: {missing}",
        )
