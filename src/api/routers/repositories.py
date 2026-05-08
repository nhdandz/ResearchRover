from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query

from src.api.deps import DbSession, PaginatedResponse
from src.api.schemas.repository import (
    RepositoryDetailResponse,
    RepositoryResponse,
    RepositoryStatsResponse,
)
from src.storage.repositories.github_repo import GitHubRepository
from src.workers.tasks.collection import collect_github_comprehensive, update_existing_repos

router = APIRouter(prefix="/repos", tags=["Repositories"])


@router.get("/", response_model=PaginatedResponse[RepositoryResponse])
async def list_repositories(
    db: DbSession,
    skip: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=100),
    language: str | None = None,
    topic: str | None = None,
    min_stars: int | None = None,
    search: str | None = None,
    sort_by: str = Query("stars_count"),
    sort_order: str = Query("desc"),
):
    repo = GitHubRepository(db)
    repos, total = await repo.list_repos(
        skip=skip,
        limit=limit,
        language=language,
        topic=topic,
        min_stars=min_stars,
        search=search,
        sort_by=sort_by,
        sort_order=sort_order,
    )

    return PaginatedResponse(
        items=[RepositoryResponse.model_validate(r) for r in repos],
        total=total,
        skip=skip,
        limit=limit,
    )


@router.get("/topics")
async def list_known_topics():
    """Return curated list of known AI/ML topics for filtering."""
    from src.core.constants import KNOWN_TOPICS

    return {"topics": KNOWN_TOPICS}


@router.get("/stats", response_model=RepositoryStatsResponse)
async def get_repository_stats(
    db: DbSession,
    language: str | None = None,
    topic: str | None = None,
    min_stars: int | None = None,
    search: str | None = None,
):
    repo = GitHubRepository(db)
    stats = await repo.get_stats(
        language=language,
        topic=topic,
        min_stars=min_stars,
        search=search,
    )
    return RepositoryStatsResponse(**stats)


@router.post("/collect")
async def trigger_collect_repos():
    """Trigger comprehensive GitHub repo collection (async via Celery)."""
    task = collect_github_comprehensive.delay()
    return {"task_id": task.id, "status": "started", "message": "Comprehensive collection started"}


@router.post("/update-all")
async def trigger_update_all_repos():
    """Trigger update of all existing repos (async via Celery)."""
    task = update_existing_repos.delay()
    return {"task_id": task.id, "status": "started", "message": "Repo update started"}


@router.get("/{repo_id}", response_model=RepositoryDetailResponse)
async def get_repository(repo_id: UUID, db: DbSession):
    repo_store = GitHubRepository(db)
    repository = await repo_store.get_by_id(repo_id)
    if not repository:
        raise HTTPException(status_code=404, detail="Repository not found")

    return RepositoryDetailResponse(
        repo=RepositoryResponse.model_validate(repository),
        linked_papers=[],
        readme_summary=repository.readme_summary,
    )


# ── Similar repos (Phase 3) ───────────────────────────────────────────────────

@router.get("/{repo_id}/similar")
async def get_similar_repos(
    repo_id: UUID,
    db: DbSession,
    limit: int = Query(6, ge=1, le=20),
):
    """Return repositories semantically similar to the given repo via Qdrant."""
    from src.storage.repositories.github_repo import GitHubRepository as RepoStore
    repo_store = RepoStore(db)
    repo = await repo_store.get_by_id(repo_id)
    if not repo:
        raise HTTPException(status_code=404, detail="Repository not found")

    try:
        from src.processors.embedding import EmbeddingGenerator
        from src.storage.vector.qdrant_client import VectorStore

        gen = EmbeddingGenerator()
        query_vec = gen.embed_repo(
            repo.full_name or "",
            repo.description or "",
            repo.readme_summary or None,
        )

        vs = VectorStore()
        hits = vs.search(
            collection="repositories",
            query_vector=query_vec,
            limit=limit + 1,
        )

        hit_ids = [h["id"] for h in hits if str(h["id"]) != str(repo_id)][:limit]

        if not hit_ids:
            return {"items": [], "total": 0}

        from sqlalchemy import select as _select
        from src.storage.models.repository import Repository as RepoModel

        stmt = _select(RepoModel).where(RepoModel.id.in_(hit_ids))
        result = await db.execute(stmt)
        similar = result.scalars().all()

        score_map = {str(h["id"]): h["score"] for h in hits}
        similar_sorted = sorted(similar, key=lambda r: score_map.get(str(r.id), 0), reverse=True)

        items = [
            {
                "id": str(r.id),
                "full_name": r.full_name,
                "description": r.description,
                "topics": r.topics[:5] if r.topics else [],
                "stars_count": r.stars_count or 0,
                "primary_language": r.primary_language,
                "score": score_map.get(str(r.id), 0),
            }
            for r in similar_sorted
        ]
        return {"items": items, "total": len(items)}

    except Exception:
        # Fallback: same primary_language repos
        from sqlalchemy import select as _select
        from src.storage.models.repository import Repository as RepoModel

        stmt = _select(RepoModel).where(RepoModel.id != repo_id)
        if repo.primary_language:
            stmt = stmt.where(RepoModel.primary_language == repo.primary_language)
        stmt = stmt.order_by(RepoModel.stars_count.desc()).limit(limit)
        result = await db.execute(stmt)
        similar = result.scalars().all()
        items = [
            {
                "id": str(r.id),
                "full_name": r.full_name,
                "description": r.description,
                "topics": r.topics[:5] if r.topics else [],
                "stars_count": r.stars_count or 0,
                "primary_language": r.primary_language,
                "score": None,
            }
            for r in similar
        ]
        return {"items": items, "total": len(items)}
