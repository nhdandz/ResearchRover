from fastapi import APIRouter, Query
from sqlalchemy import select

from src.api.deps import DbSession, PaginatedResponse
from src.api.schemas.search import (
    TechRadarResponse,
    TrendingFiltersResponse,
    TrendingPaperResponse,
    TrendingRepoResponse,
)
from src.storage.models.paper import Paper
from src.storage.models.repository import Repository
from src.storage.models.tech_radar import TechRadarSnapshot
from src.storage.repositories.metrics_repo import MetricsRepository

router = APIRouter(prefix="/trending", tags=["Trending"])


@router.get("/filters", response_model=TrendingFiltersResponse)
async def get_trending_filters(db: DbSession):
    metrics = MetricsRepository(db)
    filters = await metrics.get_trending_filters()
    return TrendingFiltersResponse(**filters)


@router.get("/papers", response_model=PaginatedResponse[TrendingPaperResponse])
async def get_trending_papers(
    db: DbSession,
    period: str = Query("week"),
    category: str | None = None,
    search: str | None = None,
    skip: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=100),
):
    metrics = MetricsRepository(db)

    if search:
        rows, total = await metrics.get_trending_papers_with_search(
            category=category, search=search, skip=skip, limit=limit
        )
        if not rows:
            return PaginatedResponse(items=[], total=total, skip=skip, limit=limit)

        items = [
            TrendingPaperResponse(
                id=str(t.entity_id),
                title=paper.title,
                arxiv_id=paper.arxiv_id,
                citation_count=paper.citation_count,
                trending_score=t.total_score,
                category=t.category,
                primary_category=paper.categories[0] if paper.categories else None,
            )
            for t, paper in rows
        ]
        return PaginatedResponse(items=items, total=total, skip=skip, limit=limit)

    trending, total = await metrics.get_trending(
        entity_type="paper", category=category, skip=skip, limit=limit
    )

    if not trending:
        return PaginatedResponse(items=[], total=total, skip=skip, limit=limit)

    entity_ids = [t.entity_id for t in trending]
    result = await db.execute(
        select(Paper).where(Paper.id.in_(entity_ids))
    )
    papers_map = {p.id: p for p in result.scalars().all()}

    items = []
    for t in trending:
        paper = papers_map.get(t.entity_id)
        if not paper:
            continue
        primary_category = paper.categories[0] if paper.categories else None
        items.append(
            TrendingPaperResponse(
                id=str(t.entity_id),
                title=paper.title,
                arxiv_id=paper.arxiv_id,
                citation_count=paper.citation_count,
                trending_score=t.total_score,
                category=t.category,
                primary_category=primary_category,
            )
        )
    return PaginatedResponse(items=items, total=total, skip=skip, limit=limit)


@router.get("/repos", response_model=PaginatedResponse[TrendingRepoResponse])
async def get_trending_repos(
    db: DbSession,
    period: str = Query("week"),
    language: str | None = None,
    topic: str | None = None,
    search: str | None = None,
    skip: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=100),
):
    metrics = MetricsRepository(db)
    topics_list = [t.strip() for t in topic.split(",") if t.strip()] if topic else None

    if language or topics_list or search:
        rows, total = await metrics.get_trending_with_language(
            language=language, topics=topics_list, search=search, skip=skip, limit=limit
        )
        if not rows:
            return PaginatedResponse(items=[], total=total, skip=skip, limit=limit)

        items = [
            TrendingRepoResponse(
                id=str(t.entity_id),
                full_name=repo.full_name,
                description=repo.description,
                stars_count=repo.stars_count,
                forks_count=repo.forks_count,
                trending_score=t.total_score,
                primary_language=repo.primary_language,
            )
            for t, repo in rows
        ]
        return PaginatedResponse(items=items, total=total, skip=skip, limit=limit)

    trending, total = await metrics.get_trending(
        entity_type="repository", skip=skip, limit=limit
    )

    if not trending:
        return PaginatedResponse(items=[], total=total, skip=skip, limit=limit)

    entity_ids = [t.entity_id for t in trending]
    result = await db.execute(
        select(Repository).where(Repository.id.in_(entity_ids))
    )
    repos_map = {r.id: r for r in result.scalars().all()}

    items = []
    for t in trending:
        repo = repos_map.get(t.entity_id)
        if not repo:
            continue
        items.append(
            TrendingRepoResponse(
                id=str(t.entity_id),
                full_name=repo.full_name,
                description=repo.description,
                stars_count=repo.stars_count,
                forks_count=repo.forks_count,
                trending_score=t.total_score,
                primary_language=repo.primary_language,
            )
        )
    return PaginatedResponse(items=items, total=total, skip=skip, limit=limit)


@router.get("/tech-radar", response_model=TechRadarResponse)
async def get_tech_radar(db: DbSession):
    result = await db.execute(
        select(TechRadarSnapshot)
        .order_by(TechRadarSnapshot.created_at.desc())
        .limit(1)
    )
    snapshot = result.scalar_one_or_none()

    if not snapshot:
        return TechRadarResponse(adopt=[], trial=[], assess=[], hold=[])

    return TechRadarResponse(**snapshot.data)


@router.post("/tech-radar/generate")
async def trigger_tech_radar_generate():
    from src.workers.tasks.reporting import generate_tech_radar

    task = generate_tech_radar.delay()
    return {"task_id": str(task.id), "status": "queued"}
