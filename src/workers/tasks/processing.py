"""Processing tasks for classifying, summarizing, and embedding."""

import asyncio
from datetime import date

from src.core.logging import get_logger
from src.workers.celery_app import celery_app

logger = get_logger(__name__)


def _run_async(coro):
    loop = asyncio.new_event_loop()
    try:
        return loop.run_until_complete(coro)
    finally:
        loop.close()


@celery_app.task(name="src.workers.tasks.processing.process_unprocessed_papers")
def process_unprocessed_papers(batch_size: int = 50):
    """Process unprocessed papers: embed + upsert to Qdrant."""
    _run_async(_process_papers(batch_size))


async def _process_papers(batch_size: int):
    from src.processors.embedding import EmbeddingGenerator
    from src.storage.database import create_async_session_factory
    from src.storage.repositories.paper_repo import PaperRepository
    from src.storage.vector.qdrant_client import VectorStore

    async_session_factory = create_async_session_factory()
    embedding_gen = EmbeddingGenerator()
    vector_store = VectorStore()

    async with async_session_factory() as session:
        repo = PaperRepository(session)
        papers = await repo.get_unprocessed(limit=batch_size)

        if not papers:
            logger.info("No unprocessed papers found")
            return

        logger.info("Processing papers", count=len(papers))

        # Batch embed all papers at once
        texts = [
            f"{paper.title}\n\n{paper.abstract or ''}"
            for paper in papers
        ]
        embeddings = embedding_gen.embed_batch(texts)

        points = []
        for paper, embedding in zip(papers, embeddings):
            try:
                points.append({
                    "id": str(paper.id),
                    "vector": embedding,
                    "payload": {
                        "arxiv_id": paper.arxiv_id,
                        "title": paper.title,
                        "abstract": (paper.abstract or "")[:500],
                        "categories": paper.categories or [],
                        "topics": paper.topics or [],
                        "keywords": paper.keywords or [],
                        "published_date": str(paper.published_date) if paper.published_date else None,
                        "citation_count": paper.citation_count,
                        "source_type": "paper",
                        "url": paper.source_url,
                    },
                })
                paper.is_processed = True
            except Exception as e:
                logger.error(
                    "Failed to process paper",
                    arxiv_id=paper.arxiv_id,
                    error=str(e),
                )

        if points:
            vector_store.upsert_batch(collection="papers", points=points)

        await session.commit()

    logger.info("Paper processing completed", processed=len(papers))


@celery_app.task(name="src.workers.tasks.processing.process_unprocessed_repos")
def process_unprocessed_repos(batch_size: int = 50):
    """Process unprocessed repositories: embed + upsert to Qdrant."""
    _run_async(_process_repos(batch_size))


async def _process_repos(batch_size: int):
    from src.processors.embedding import EmbeddingGenerator
    from src.storage.database import create_async_session_factory
    from src.storage.repositories.github_repo import GitHubRepository
    from src.storage.vector.qdrant_client import VectorStore

    async_session_factory = create_async_session_factory()
    embedding_gen = EmbeddingGenerator()
    vector_store = VectorStore()

    async with async_session_factory() as session:
        repo_store = GitHubRepository(session)
        repos = await repo_store.get_unprocessed(limit=batch_size)

        if not repos:
            return

        # Batch embed all repos at once
        texts = []
        for r in repos:
            parts = [r.name, r.description or ""]
            if r.readme_content:
                parts.append(r.readme_content[:2000])
            texts.append("\n\n".join(parts))
        embeddings = embedding_gen.embed_batch(texts)

        points = []
        for repository, embedding in zip(repos, embeddings):
            try:
                points.append({
                    "id": str(repository.id),
                    "vector": embedding,
                    "payload": {
                        "full_name": repository.full_name,
                        "title": repository.name,
                        "description": repository.description or "",
                        "content": repository.description or "",
                        "primary_language": repository.primary_language,
                        "topics": repository.topics or [],
                        "frameworks": repository.frameworks or [],
                        "stars_count": repository.stars_count,
                        "source_type": "repository",
                        "url": repository.html_url,
                    },
                })
                repository.is_processed = True
            except Exception as e:
                logger.error(
                    "Failed to process repo",
                    full_name=repository.full_name,
                    error=str(e),
                )

        if points:
            vector_store.upsert_batch(collection="repositories", points=points)

        await session.commit()


@celery_app.task(name="src.workers.tasks.processing.calculate_trending_scores")
def calculate_trending_scores():
    """Calculate trending scores for all entities."""
    _run_async(_calculate_trending())


async def _calculate_trending():
    from datetime import datetime

    from src.processors.trending import TrendingCalculator
    from src.storage.database import create_async_session_factory
    from src.storage.repositories.github_repo import GitHubRepository
    from src.storage.repositories.metrics_repo import MetricsRepository
    from src.storage.repositories.paper_repo import PaperRepository

    async_session_factory = create_async_session_factory()
    async with async_session_factory() as session:
        metrics_repo = MetricsRepository(session)
        paper_repo = PaperRepository(session)
        github_repo = GitHubRepository(session)
        calculator = TrendingCalculator(metrics_repo)

        # Calculate for recent papers
        papers, _ = await paper_repo.list_papers(limit=500, sort_by="published_date")

        for paper in papers:
            try:
                scores = await calculator.calculate_paper_score(
                    paper_id=paper.id,
                    citation_count=paper.citation_count,
                    influential_citation_count=paper.influential_citation_count,
                    published_date=datetime.combine(
                        paper.published_date, datetime.min.time()
                    )
                    if paper.published_date
                    else None,
                )

                await metrics_repo.upsert_trending_score(
                    {
                        "entity_type": "paper",
                        "entity_id": paper.id,
                        "activity_score": scores.activity_score,
                        "community_score": scores.community_score,
                        "academic_score": scores.academic_score,
                        "recency_score": scores.recency_score,
                        "total_score": scores.total_score,
                        "category": (paper.topics[0] if paper.topics else None),
                        "period_start": date.today(),
                        "period_end": date.today(),
                    }
                )
            except Exception as e:
                logger.error("Failed to calculate paper trending", paper_id=str(paper.id), error=str(e))

        # Calculate for repositories
        repos, _ = await github_repo.list_repos(limit=500, sort_by="stars_count")

        for repo in repos:
            try:
                scores = await calculator.calculate_repo_score(
                    repo_id=repo.id,
                    stars_count=repo.stars_count,
                    forks_count=repo.forks_count,
                    open_issues_count=repo.open_issues_count,
                    commit_count_30d=repo.commit_count_30d,
                    last_commit_at=repo.last_commit_at,
                )

                await metrics_repo.upsert_trending_score(
                    {
                        "entity_type": "repository",
                        "entity_id": repo.id,
                        "activity_score": scores.activity_score,
                        "community_score": scores.community_score,
                        "academic_score": scores.academic_score,
                        "recency_score": scores.recency_score,
                        "total_score": scores.total_score,
                        "category": (repo.topics[0] if repo.topics else None),
                        "period_start": date.today(),
                        "period_end": date.today(),
                    }
                )
            except Exception as e:
                logger.error("Failed to calculate repo trending", repo_id=str(repo.id), error=str(e))

        await session.commit()

    logger.info("Trending scores calculated")
