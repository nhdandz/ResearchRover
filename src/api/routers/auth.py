from fastapi import APIRouter, HTTPException, status
from sqlalchemy import select, update

from src.api.deps import DbSession, get_current_user_dep
from src.api.schemas.auth import (
    DATA_SOURCES,
    EXPERTISE_LEVELS,
    RESEARCH_AREAS,
    LoginRequest,
    OnboardingMetaResponse,
    OnboardingRequest,
    RefreshRequest,
    RegisterRequest,
    TokenResponse,
    UserProfileUpdate,
    UserResponse,
)
from src.core.security import (
    create_access_token,
    create_refresh_token,
    decode_token,
    hash_password,
    verify_password,
)
from src.storage.models.user import User

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/register", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
async def register(body: RegisterRequest, db: DbSession):
    result = await db.execute(select(User).where(User.email == body.email))
    if result.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Email already registered")

    result = await db.execute(select(User).where(User.username == body.username))
    if result.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Username already taken")

    user = User(
        email=body.email,
        username=body.username,
        hashed_password=hash_password(body.password),
    )
    db.add(user)
    await db.flush()
    await db.refresh(user)
    return user


@router.post("/login", response_model=TokenResponse)
async def login(body: LoginRequest, db: DbSession):
    result = await db.execute(select(User).where(User.email == body.email))
    user = result.scalar_one_or_none()
    if not user or not verify_password(body.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    if not user.is_active:
        raise HTTPException(status_code=403, detail="Account is deactivated")

    return TokenResponse(
        access_token=create_access_token(str(user.id)),
        refresh_token=create_refresh_token(str(user.id)),
    )


@router.post("/refresh", response_model=TokenResponse)
async def refresh(body: RefreshRequest, db: DbSession):
    payload = decode_token(body.refresh_token)
    if not payload or payload.get("type") != "refresh":
        raise HTTPException(status_code=401, detail="Invalid refresh token")

    user_id = payload.get("sub")
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user or not user.is_active:
        raise HTTPException(status_code=401, detail="User not found or inactive")

    return TokenResponse(
        access_token=create_access_token(str(user.id)),
        refresh_token=create_refresh_token(str(user.id)),
    )


@router.get("/me", response_model=UserResponse)
async def me(current_user: get_current_user_dep):
    return current_user


# ── Research Profile ──

@router.patch("/me/profile", response_model=UserResponse)
async def update_profile(
    body: UserProfileUpdate,
    current_user: get_current_user_dep,
    db: DbSession,
):
    """Cập nhật research profile của user đang đăng nhập."""
    update_data = body.model_dump(exclude_unset=True)
    if not update_data:
        return current_user

    await db.execute(
        update(User).where(User.id == current_user.id).values(**update_data)
    )
    await db.flush()
    await db.refresh(current_user)
    return current_user


# ── Onboarding ──

@router.get("/onboarding-meta", response_model=OnboardingMetaResponse)
async def get_onboarding_meta():
    """Trả về danh sách lựa chọn cho onboarding wizard (public endpoint)."""
    return OnboardingMetaResponse(
        research_areas=RESEARCH_AREAS,
        expertise_levels=EXPERTISE_LEVELS,
        data_sources=DATA_SOURCES,
    )


@router.post("/me/onboarding", response_model=UserResponse)
async def complete_onboarding(
    body: OnboardingRequest,
    current_user: get_current_user_dep,
    db: DbSession,
):
    """Hoàn tất onboarding wizard — lưu toàn bộ preferences và đánh dấu onboarding_completed = True."""
    if current_user.onboarding_completed:
        raise HTTPException(status_code=400, detail="Onboarding already completed")

    update_data = {
        "research_interests": body.research_interests,
        "expertise_level": body.expertise_level,
        "affiliation": body.affiliation,
        "position": body.position,
        "preferred_language": body.preferred_language,
        "preferred_sources": body.preferred_sources,
        "preferred_llm": body.preferred_llm,
        "notification_preferences": body.notification_preferences,
        "onboarding_completed": True,
    }

    await db.execute(
        update(User).where(User.id == current_user.id).values(**update_data)
    )
    await db.flush()
    await db.refresh(current_user)
    return current_user
