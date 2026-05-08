"""Collection tasks for gathering data from external sources."""

import asyncio
from datetime import date, datetime, timedelta

from src.core.config import get_settings
from src.core.logging import get_logger
from src.workers.celery_app import celery_app

logger = get_logger(__name__)


def _run_async(coro):
    loop = asyncio.new_event_loop()
    try:
        return loop.run_until_complete(coro)
    finally:
        loop.close()


@celery_app.task(name="src.workers.tasks.collection.collect_arxiv_papers")
def collect_arxiv_papers(categories: list[str] | None = None, max_results: int = 200):
    """Collect recent papers from ArXiv, then trigger processing."""
    _run_async(_collect_arxiv(categories, max_results))
    from src.workers.tasks.processing import process_unprocessed_papers
    process_unprocessed_papers.delay()


async def _collect_arxiv(categories: list[str] | None, max_results: int):
    from src.collectors.arxiv import ArxivCollector
    from src.storage.database import create_async_session_factory
    from src.storage.repositories.paper_repo import PaperRepository

    async_session_factory = create_async_session_factory()

    settings = get_settings()
    cats = categories or settings.ARXIV_CATEGORIES
    date_from = date.today() - timedelta(days=7)

    collected = 0
    async with ArxivCollector() as collector:
        async with async_session_factory() as session:
            repo = PaperRepository(session)
            async for result in collector.collect(
                categories=cats,
                date_from=date_from,
                max_results=max_results,
            ):
                paper = result.data
                await repo.upsert_by_arxiv_id(
                    {
                        "arxiv_id": paper.arxiv_id,
                        "title": paper.title,
                        "abstract": paper.abstract,
                        "authors": paper.authors,
                        "categories": paper.categories,
                        "published_date": paper.published_date,
                        "updated_date": paper.updated_date,
                        "pdf_url": paper.pdf_url,
                        "source": "arxiv",
                        "source_url": f"https://arxiv.org/abs/{paper.arxiv_id}",
                    }
                )
                collected += 1

            await session.commit()

    logger.info("ArXiv collection completed", collected=collected)


@celery_app.task(name="src.workers.tasks.collection.collect_github_trending")
def collect_github_trending(language: str | None = None):
    """Collect trending repositories from GitHub, then trigger processing."""
    _run_async(_collect_github(language))
    from src.workers.tasks.processing import process_unprocessed_repos
    process_unprocessed_repos.delay()


async def _collect_github(language: str | None):
    from src.collectors.github import GitHubCollector
    from src.storage.database import create_async_session_factory
    from src.storage.repositories.github_repo import GitHubRepository

    async_session_factory = create_async_session_factory()

    settings = get_settings()
    if not settings.GITHUB_TOKEN:
        logger.warning("No GitHub token configured, skipping collection")
        return

    collected = 0
    async with GitHubCollector(token=settings.GITHUB_TOKEN) as collector:
        async with async_session_factory() as session:
            repo_store = GitHubRepository(session)
            async for result in collector.get_trending(
                language=language, since="weekly"
            ):
                gh_repo = result.data
                await repo_store.upsert_by_full_name(
                    {
                        "github_id": gh_repo.github_id,
                        "full_name": gh_repo.full_name,
                        "name": gh_repo.name,
                        "owner": gh_repo.owner,
                        "description": gh_repo.description,
                        "html_url": gh_repo.html_url,
                        "homepage_url": gh_repo.homepage_url,
                        "primary_language": gh_repo.primary_language,
                        "languages": gh_repo.languages,
                        "topics": gh_repo.topics,
                        "stars_count": gh_repo.stars_count,
                        "forks_count": gh_repo.forks_count,
                        "watchers_count": gh_repo.watchers_count,
                        "open_issues_count": gh_repo.open_issues_count,
                        "readme_content": gh_repo.readme_content,
                        "has_readme": gh_repo.readme_content is not None,
                        "has_license": gh_repo.has_license,
                        "has_docker": gh_repo.has_dockerfile,
                        "last_commit_at": gh_repo.last_commit_at,
                        "last_release_tag": gh_repo.last_release_tag,
                        "last_release_at": gh_repo.last_release_at,
                        "dependencies": gh_repo.dependencies,
                        "repo_created_at": gh_repo.created_at,
                        "repo_updated_at": gh_repo.updated_at,
                    }
                )
                collected += 1

            await session.commit()

    logger.info("GitHub collection completed", collected=collected)


@celery_app.task(
    name="src.workers.tasks.collection.collect_github_comprehensive",
    soft_time_limit=7200,
    time_limit=7500,
)
def collect_github_comprehensive():
    """Collect 10,000-20,000+ repos from GitHub using diverse search strategies, then process."""
    _run_async(_collect_github_comprehensive())
    from src.workers.tasks.processing import process_unprocessed_repos
    process_unprocessed_repos.delay()


def _build_comprehensive_queries() -> list[dict]:
    """Build a diverse set of search queries to maximize unique repos.

    Strategy:
    1. Star range splits (bypass 1000/query limit) → ~7,000 repos
    2. AI/ML topics (30+ topics × 1000 each) → ~12,000 repos (after dedup)
    3. Language + AI keyword combos → ~3,000 repos
    4. Recently created/trending repos → ~2,000 repos
    Total unique estimate: 10,000-20,000+
    """
    queries = []

    # --- 1. General repos by star ranges (no topic filter) ---
    star_ranges = [
        "stars:>50000",
        "stars:10000..50000",
        "stars:5000..10000",
        "stars:1000..5000",
        "stars:500..1000",
        "stars:100..500",
        "stars:50..100",
    ]
    for sr in star_ranges:
        queries.append({"query": sr, "max_results": 1000})

    # --- 2. AI/ML topics (each up to 1000) ---
    ai_topics = [
        # Core ML
        "machine-learning", "deep-learning", "neural-network", "artificial-intelligence",
        # LLM & NLP
        "llm", "large-language-model", "natural-language-processing", "transformers",
        "chatgpt", "gpt", "langchain", "openai", "huggingface",
        # Computer Vision
        "computer-vision", "image-processing", "object-detection", "image-segmentation",
        # GenAI
        "generative-ai", "stable-diffusion", "diffusion-models", "text-to-image",
        # Data
        "data-science", "data-engineering", "analytics", "data-visualization",
        # Frameworks
        "pytorch", "tensorflow", "jax", "keras", "scikit-learn",
        # MLOps & infra
        "mlops", "model-serving", "feature-store", "vector-database",
        # Agents & RAG
        "ai-agents", "autonomous-agents", "rag", "retrieval-augmented-generation",
        # Other hot areas
        "reinforcement-learning", "recommendation-system", "time-series",
        "speech-recognition", "text-to-speech", "embedding", "fine-tuning",
        "automl", "federated-learning", "graph-neural-network",
    ]
    for topic in ai_topics:
        queries.append({"topics": [topic], "min_stars": 5, "max_results": 1000})

    # --- 3. Language + AI keyword combos ---
    lang_keywords = [
        ("Python", "machine learning"),
        ("Python", "deep learning"),
        ("Python", "llm"),
        ("Python", "data science"),
        ("TypeScript", "ai"),
        ("TypeScript", "llm"),
        ("Rust", "machine learning"),
        ("Rust", "ai"),
        ("Go", "machine learning"),
        ("C++", "deep learning"),
        ("Java", "machine learning"),
        ("Julia", "machine learning"),
    ]
    for lang, kw in lang_keywords:
        queries.append({"query": kw, "language": lang, "min_stars": 5, "max_results": 1000})

    # --- 4. Recently created repos (catch emerging projects) ---
    recent_date = date.today() - timedelta(days=90)
    queries.append({"created_after": recent_date, "min_stars": 20, "max_results": 1000})
    queries.append({"query": "AI", "created_after": recent_date, "min_stars": 10, "max_results": 1000})
    queries.append({"query": "LLM", "created_after": recent_date, "min_stars": 10, "max_results": 1000})

    # --- 5. Active repos (recently pushed) ---
    pushed_date = date.today() - timedelta(days=7)
    queries.append({"pushed_after": pushed_date, "min_stars": 100, "max_results": 1000})

    return queries


def _repo_data_from_gh(gh_repo) -> dict:
    """Extract DB-compatible dict from a GitHubRepo dataclass."""
    return {
        "github_id": gh_repo.github_id,
        "full_name": gh_repo.full_name,
        "name": gh_repo.name,
        "owner": gh_repo.owner,
        "description": gh_repo.description,
        "html_url": gh_repo.html_url,
        "homepage_url": gh_repo.homepage_url,
        "primary_language": gh_repo.primary_language,
        "languages": gh_repo.languages,
        "topics": gh_repo.topics,
        "stars_count": gh_repo.stars_count,
        "forks_count": gh_repo.forks_count,
        "watchers_count": gh_repo.watchers_count,
        "open_issues_count": gh_repo.open_issues_count,
        "readme_content": gh_repo.readme_content,
        "has_readme": gh_repo.readme_content is not None,
        "has_license": gh_repo.has_license,
        "has_docker": gh_repo.has_dockerfile,
        "last_commit_at": gh_repo.last_commit_at,
        "last_release_tag": gh_repo.last_release_tag,
        "last_release_at": gh_repo.last_release_at,
        "dependencies": gh_repo.dependencies,
        "repo_created_at": gh_repo.created_at,
        "repo_updated_at": gh_repo.updated_at,
    }


async def _collect_github_comprehensive():
    from src.collectors.github import GitHubCollector
    from src.storage.database import create_async_session_factory
    from src.storage.repositories.github_repo import GitHubRepository

    async_session_factory = create_async_session_factory()

    settings = get_settings()
    if not settings.GITHUB_TOKEN:
        logger.warning("No GitHub token configured, skipping collection")
        return

    queries = _build_comprehensive_queries()
    total_collected = 0
    seen_names: set[str] = set()

    logger.info("Starting comprehensive collection", total_queries=len(queries))

    async with GitHubCollector(token=settings.GITHUB_TOKEN) as collector:
        for idx, q in enumerate(queries, 1):
            collected = 0
            try:
                async with async_session_factory() as session:
                    repo_store = GitHubRepository(session)
                    async for result in collector.search(**q):
                        gh_repo = result.data
                        if gh_repo.full_name in seen_names:
                            continue
                        seen_names.add(gh_repo.full_name)
                        await repo_store.upsert_by_full_name(
                            _repo_data_from_gh(gh_repo)
                        )
                        collected += 1
                    await session.commit()
            except Exception:
                logger.exception("Error collecting query", query_idx=idx, query=q)
            total_collected += collected
            logger.info(
                "Query batch done",
                query_idx=idx,
                total_queries=len(queries),
                batch_collected=collected,
                total_collected=total_collected,
                unique_repos=len(seen_names),
            )

    logger.info(
        "Comprehensive GitHub collection completed",
        total_collected=total_collected,
        unique_repos=len(seen_names),
    )


@celery_app.task(name="src.workers.tasks.collection.update_existing_repos")
def update_existing_repos():
    """Update metrics for all existing repos in the database."""
    _run_async(_update_existing_repos())


async def _update_existing_repos():
    import asyncio as _asyncio

    from src.collectors.github import GitHubCollector
    from src.storage.database import create_async_session_factory
    from src.storage.repositories.github_repo import GitHubRepository
    from src.storage.repositories.metrics_repo import MetricsRepository

    async_session_factory = create_async_session_factory()

    settings = get_settings()
    if not settings.GITHUB_TOKEN:
        logger.warning("No GitHub token configured, skipping update")
        return

    # Get all repo full_names
    async with async_session_factory() as session:
        repo_store = GitHubRepository(session)
        full_names = await repo_store.list_all_full_names()

    logger.info("Starting repo update", total_repos=len(full_names))

    batch_size = 50
    updated = 0
    snapshots_recorded = 0

    async with GitHubCollector(token=settings.GITHUB_TOKEN) as collector:
        for i in range(0, len(full_names), batch_size):
            batch = full_names[i : i + batch_size]
            async with async_session_factory() as session:
                repo_store = GitHubRepository(session)
                metrics_repo = MetricsRepository(session)

                for full_name in batch:
                    try:
                        owner, name = full_name.split("/", 1)
                        gh_repo = await collector.get_repo(owner, name)
                        if not gh_repo:
                            logger.warning("Repo not found on GitHub", repo=full_name)
                            continue

                        existing = await repo_store.get_by_full_name(full_name)
                        if not existing:
                            continue

                        # Check if metrics changed
                        stars_changed = existing.stars_count != gh_repo.stars_count
                        forks_changed = existing.forks_count != gh_repo.forks_count

                        # Update repo data
                        await repo_store.upsert_by_full_name(
                            {
                                "full_name": full_name,
                                "stars_count": gh_repo.stars_count,
                                "forks_count": gh_repo.forks_count,
                                "watchers_count": gh_repo.watchers_count,
                                "open_issues_count": gh_repo.open_issues_count,
                                "last_commit_at": gh_repo.last_commit_at,
                                "last_release_tag": gh_repo.last_release_tag,
                                "last_release_at": gh_repo.last_release_at,
                                "repo_updated_at": gh_repo.updated_at,
                            }
                        )

                        # Record daily metrics snapshot for trend analysis
                        await metrics_repo.upsert_daily_snapshot(
                            entity_type="repo",
                            entity_id=existing.id,
                            metrics={
                                "stars_count": gh_repo.stars_count,
                                "forks_count": gh_repo.forks_count,
                                "watchers_count": gh_repo.watchers_count,
                                "open_issues_count": gh_repo.open_issues_count,
                            },
                        )
                        snapshots_recorded += 1

                        if stars_changed or forks_changed:
                            existing.is_processed = False

                        updated += 1
                    except Exception:
                        logger.exception("Error updating repo", repo=full_name)

                await session.commit()

            logger.info(
                "Batch updated",
                batch=i // batch_size + 1,
                total_batches=(len(full_names) + batch_size - 1) // batch_size,
                updated=updated,
                snapshots=snapshots_recorded,
            )
            # Small delay between batches to avoid rate limiting
            await _asyncio.sleep(2)

    logger.info(
        "Repo update completed",
        updated=updated,
        snapshots=snapshots_recorded,
        total=len(full_names),
    )


@celery_app.task(name="src.workers.tasks.collection.collect_semantic_scholar")
def collect_semantic_scholar(query: str = "machine learning", max_results: int = 100):
    """Enrich papers with Semantic Scholar data."""
    _run_async(_collect_s2(query, max_results))


async def _collect_s2(query: str, max_results: int):
    from src.collectors.semantic_scholar import SemanticScholarCollector
    from src.storage.database import create_async_session_factory
    from src.storage.repositories.paper_repo import PaperRepository

    async_session_factory = create_async_session_factory()

    settings = get_settings()

    collected = 0
    async with SemanticScholarCollector(
        api_key=settings.SEMANTIC_SCHOLAR_API_KEY
    ) as collector:
        async with async_session_factory() as session:
            repo = PaperRepository(session)
            async for result in collector.search(
                query=query, max_results=max_results
            ):
                paper = result.data
                if paper.arxiv_id:
                    await repo.upsert_by_arxiv_id(
                        {
                            "arxiv_id": paper.arxiv_id,
                            "semantic_scholar_id": paper.s2_id,
                            "doi": paper.doi,
                            "citation_count": paper.citation_count,
                            "influential_citation_count": paper.influential_citation_count,
                        }
                    )
                    collected += 1

            await session.commit()

    logger.info("S2 enrichment completed", collected=collected)


# ============================================================
# Comprehensive Paper Collection (Maximum coverage)
# ============================================================

def _build_paper_arxiv_queries() -> list[dict]:
    """Build ArXiv queries to collect the MAXIMUM number of papers.

    Strategy:
    - ALL relevant ArXiv categories (CS, stat, eess, math, q-fin, q-bio)
    - Each category split by YEAR to bypass the ~10k result limit per query
    - Years from 2010 to 2026 for major categories, recent years for smaller ones
    - Additional broad keyword searches to catch cross-category papers
    - max_results=10000 per query (ArXiv practical limit)
    """
    queries = []

    # ── ALL relevant categories ──
    # Major CS categories (split by year for maximum coverage)
    major_categories = [
        "cs.AI", "cs.LG", "cs.CL", "cs.CV", "cs.IR", "cs.NE",
        "cs.RO", "cs.CR", "cs.SE", "cs.DC", "cs.DB", "cs.DS",
        "cs.HC", "cs.MM", "cs.NI", "cs.PL", "cs.SY", "cs.IT",
        "stat.ML",
    ]

    # Secondary categories (fewer papers, still split by year chunks)
    secondary_categories = [
        "cs.MA", "cs.SI", "cs.GT", "cs.CG", "cs.CC", "cs.CE",
        "cs.DL", "cs.DM", "cs.ET", "cs.FL", "cs.GR", "cs.AR",
        "cs.LO", "cs.MS", "cs.NA", "cs.OH", "cs.OS", "cs.PF",
        "cs.SC", "cs.SD",
        # Statistics
        "stat.TH", "stat.ME", "stat.CO", "stat.AP",
        # Electrical engineering / signal processing
        "eess.AS", "eess.IV", "eess.SP", "eess.SY",
        # Math (relevant to ML)
        "math.OC", "math.ST", "math.NA", "math.PR",
        # Quantitative biology / finance (uses ML)
        "q-bio.QM", "q-bio.NC", "q-bio.GN",
        "q-fin.CP", "q-fin.ST", "q-fin.RM",
        # Physics (ML applications)
        "physics.data-an", "physics.comp-ph",
    ]

    # Year ranges for splitting queries
    all_years = list(range(2010, 2027))  # 2010..2026

    # Major categories: query each year separately
    for cat in major_categories:
        for year in all_years:
            queries.append({
                "categories": [cat],
                "date_from": date(year, 1, 1),
                "date_to": date(year, 12, 31),
                "max_results": 10000,
            })

    # Secondary categories: query in 3-year chunks
    year_chunks = [
        (2010, 2014), (2015, 2017), (2018, 2019),
        (2020, 2021), (2022, 2023), (2024, 2026),
    ]
    for cat in secondary_categories:
        for y_from, y_to in year_chunks:
            queries.append({
                "categories": [cat],
                "date_from": date(y_from, 1, 1),
                "date_to": date(y_to, 12, 31),
                "max_results": 10000,
            })

    # ── Broad keyword searches (catch papers not in above categories) ──
    keywords = [
        # Core AI/ML
        "deep learning", "machine learning", "neural network",
        "artificial intelligence", "large language model",
        "transformer", "attention mechanism",
        # NLP
        "natural language processing", "text generation",
        "sentiment analysis", "machine translation",
        "question answering", "named entity recognition",
        "text classification", "language model",
        # Computer Vision
        "object detection", "image segmentation",
        "image classification", "face recognition",
        "video understanding", "image generation",
        "visual question answering", "scene understanding",
        # Generative models
        "diffusion model", "generative adversarial",
        "variational autoencoder", "text to image",
        "image synthesis", "generative model",
        # RL
        "reinforcement learning", "multi-agent",
        "reward model", "policy optimization",
        # Graphs / Knowledge
        "graph neural network", "knowledge graph",
        "knowledge distillation", "graph learning",
        # Training techniques
        "self-supervised learning", "contrastive learning",
        "transfer learning", "few-shot learning",
        "meta-learning", "curriculum learning",
        "data augmentation", "semi-supervised",
        # Systems / Efficiency
        "federated learning", "model compression",
        "neural architecture search", "pruning",
        "quantization", "edge computing",
        # Applications
        "recommendation system", "speech recognition",
        "autonomous driving", "medical imaging",
        "drug discovery", "protein structure",
        "time series", "anomaly detection",
        "robotics", "point cloud",
    ]

    for kw in keywords:
        queries.append({
            "search_query": kw,
            "max_results": 10000,
        })

    return queries


@celery_app.task(
    name="src.workers.tasks.collection.collect_papers_comprehensive",
    soft_time_limit=86400,   # 24 hours
    time_limit=90000,        # 25 hours hard limit
)
def collect_papers_comprehensive():
    """Collect papers from ArXiv + trigger S2 collection in parallel, then process."""
    # Trigger S2 as a separate task so they run in parallel
    collect_papers_s2.delay()
    _run_async(_collect_papers_arxiv())
    from src.workers.tasks.processing import process_unprocessed_papers
    process_unprocessed_papers.delay()


@celery_app.task(
    name="src.workers.tasks.collection.collect_papers_s2",
    soft_time_limit=86400,
    time_limit=90000,
)
def collect_papers_s2():
    """Collect papers from Semantic Scholar (runs in parallel with ArXiv)."""
    _run_async(_collect_papers_s2())


def _build_paper_s2_queries() -> list[dict]:
    """Build Semantic Scholar queries for maximum paper coverage.

    S2 has ~200M papers. Search API returns max 1000 per query,
    so we use many search terms x year ranges to maximize.
    """
    queries = []

    search_terms = [
        # Core AI/ML
        "deep learning", "machine learning", "neural network",
        "artificial intelligence", "representation learning",
        # NLP / LLM
        "natural language processing", "large language model",
        "transformer", "text generation", "sentiment analysis",
        "machine translation", "question answering",
        "named entity recognition", "text classification",
        "language model", "word embedding", "text mining",
        "information extraction", "dialogue system",
        "summarization", "relation extraction",
        # Computer Vision
        "computer vision", "object detection", "image segmentation",
        "image classification", "face recognition", "video understanding",
        "image generation", "visual question answering",
        "scene understanding", "pose estimation", "action recognition",
        "image super resolution", "optical flow",
        # Generative models
        "diffusion model", "generative adversarial network",
        "variational autoencoder", "text to image",
        "image synthesis", "generative model", "autoregressive model",
        # RL / Multi-agent
        "reinforcement learning", "multi-agent system",
        "reward model", "policy optimization", "imitation learning",
        # Graphs / Knowledge
        "graph neural network", "knowledge graph",
        "knowledge distillation", "graph learning",
        "link prediction", "node classification",
        # Training techniques
        "self-supervised learning", "contrastive learning",
        "transfer learning", "few-shot learning",
        "meta-learning", "curriculum learning",
        "data augmentation", "semi-supervised learning",
        "active learning", "continual learning",
        "domain adaptation", "multi-task learning",
        # Systems / Efficiency
        "federated learning", "model compression",
        "neural architecture search", "pruning neural network",
        "quantization neural network", "edge computing",
        "distributed training", "model parallelism",
        # Applications
        "recommendation system", "speech recognition",
        "autonomous driving", "medical imaging",
        "drug discovery", "protein structure prediction",
        "time series forecasting", "anomaly detection",
        "robotics", "point cloud", "bioinformatics",
        "financial machine learning", "climate prediction",
        "remote sensing", "natural language understanding",
        "code generation", "program synthesis",
        # Specific hot topics
        "attention mechanism", "BERT", "GPT",
        "convolutional neural network", "recurrent neural network",
        "batch normalization", "dropout regularization",
        "neural ordinary differential equation",
        "graph transformer", "vision transformer",
        "multimodal learning", "cross-modal",
        "neuro-symbolic", "causal inference machine learning",
    ]

    # Split into fine-grained year ranges for max results
    year_ranges = [
        (2010, 2012), (2013, 2014), (2015, 2016),
        (2017, 2017), (2018, 2018), (2019, 2019),
        (2020, 2020), (2021, 2021), (2022, 2022),
        (2023, 2023), (2024, 2024), (2025, 2026),
    ]

    for term in search_terms:
        for yr_from, yr_to in year_ranges:
            queries.append({
                "query": term,
                "year_range": (yr_from, yr_to),
                "max_results": 1000,
            })

    return queries


async def _collect_papers_arxiv():
    """ArXiv collection - runs as its own task."""
    import asyncio as _asyncio

    from src.collectors.arxiv import ArxivCollector
    from src.storage.database import create_async_session_factory
    from src.storage.repositories.paper_repo import PaperRepository

    async_session_factory = create_async_session_factory()

    total_collected = 0
    total_skipped = 0
    seen_arxiv_ids: set[str] = set()
    commit_every = 100

    arxiv_queries = _build_paper_arxiv_queries()
    logger.info("Starting MAXIMUM ArXiv collection", total_queries=len(arxiv_queries))

    async with ArxivCollector() as collector:
        for idx, q in enumerate(arxiv_queries, 1):
            batch_collected = 0
            batch_skipped = 0
            pending = 0
            try:
                async with async_session_factory() as session:
                    repo = PaperRepository(session)
                    async for result in collector.collect(**q):
                        paper = result.data
                        if paper.arxiv_id in seen_arxiv_ids:
                            batch_skipped += 1
                            continue
                        seen_arxiv_ids.add(paper.arxiv_id)
                        await repo.upsert_by_arxiv_id(
                            {
                                "arxiv_id": paper.arxiv_id,
                                "title": paper.title,
                                "abstract": paper.abstract,
                                "authors": paper.authors,
                                "categories": paper.categories,
                                "published_date": paper.published_date,
                                "updated_date": paper.updated_date,
                                "pdf_url": paper.pdf_url,
                                "source": "arxiv",
                                "source_url": f"https://arxiv.org/abs/{paper.arxiv_id}",
                            }
                        )
                        batch_collected += 1
                        pending += 1
                        if pending >= commit_every:
                            await session.commit()
                            pending = 0
                    if pending > 0:
                        await session.commit()
            except Exception:
                logger.exception("Error in ArXiv query", query_idx=idx, query=q)

            total_collected += batch_collected
            total_skipped += batch_skipped
            if batch_collected > 0 or idx % 50 == 0:
                logger.info(
                    "ArXiv query done",
                    query_idx=idx,
                    total_queries=len(arxiv_queries),
                    batch=batch_collected,
                    skipped=batch_skipped,
                    total=total_collected,
                    unique_seen=len(seen_arxiv_ids),
                )
            await _asyncio.sleep(0.5)

    logger.info(
        "ArXiv collection completed",
        total_collected=total_collected,
        total_skipped=total_skipped,
        unique_papers=len(seen_arxiv_ids),
    )


async def _collect_papers_s2():
    """Semantic Scholar collection - runs as its own task in parallel with ArXiv."""
    import asyncio as _asyncio

    from src.collectors.semantic_scholar import SemanticScholarCollector
    from src.storage.database import create_async_session_factory
    from src.storage.repositories.paper_repo import PaperRepository

    async_session_factory = create_async_session_factory()
    settings = get_settings()

    s2_collected = 0
    commit_every = 100

    s2_queries = _build_paper_s2_queries()
    logger.info("Starting Semantic Scholar collection", total_queries=len(s2_queries))

    async with SemanticScholarCollector(
        api_key=settings.SEMANTIC_SCHOLAR_API_KEY
    ) as collector:
        for idx, q in enumerate(s2_queries, 1):
            batch_collected = 0
            pending = 0
            try:
                async with async_session_factory() as session:
                    repo = PaperRepository(session)
                    async for result in collector.search(**q):
                        paper = result.data
                        paper_data = {
                            "semantic_scholar_id": paper.s2_id,
                            "title": paper.title,
                            "abstract": paper.abstract,
                            "authors": paper.authors,
                            "doi": paper.doi,
                            "citation_count": paper.citation_count,
                            "influential_citation_count": paper.influential_citation_count,
                            "source": "semantic_scholar",
                        }
                        if paper.arxiv_id:
                            paper_data["arxiv_id"] = paper.arxiv_id
                            paper_data["source_url"] = f"https://arxiv.org/abs/{paper.arxiv_id}"
                            paper_data["pdf_url"] = f"https://arxiv.org/pdf/{paper.arxiv_id}.pdf"
                        if paper.year:
                            paper_data["published_date"] = date(paper.year, 1, 1)
                        if paper.fields_of_study:
                            paper_data["categories"] = paper.fields_of_study

                        await repo.upsert_by_s2_id(paper_data)
                        batch_collected += 1
                        pending += 1
                        if pending >= commit_every:
                            await session.commit()
                            pending = 0
                    if pending > 0:
                        await session.commit()
            except Exception:
                logger.exception("Error in S2 query", query_idx=idx, query=q)

            s2_collected += batch_collected
            if batch_collected > 0 or idx % 50 == 0:
                logger.info(
                    "S2 query done",
                    query_idx=idx,
                    total_queries=len(s2_queries),
                    batch=batch_collected,
                    total_s2=s2_collected,
                )
            await _asyncio.sleep(1)

    logger.info(
        "Semantic Scholar collection completed",
        total_s2=s2_collected,
    )


# ============================================================
# Citation Enrichment via Semantic Scholar Batch API
# ============================================================

@celery_app.task(
    name="src.workers.tasks.collection.enrich_paper_citations",
    soft_time_limit=7200,
    time_limit=7500,
)
def enrich_paper_citations():
    """Enrich existing papers with citation data from Semantic Scholar Batch API."""
    _run_async(_enrich_paper_citations())


def _enrich_paper_from_s2(paper, s2_paper):
    """Fill missing fields on a Paper from Semantic Scholar data."""
    paper.citation_count = s2_paper.citation_count
    paper.influential_citation_count = s2_paper.influential_citation_count
    if not paper.semantic_scholar_id:
        paper.semantic_scholar_id = s2_paper.s2_id
    if not paper.abstract and s2_paper.abstract:
        paper.abstract = s2_paper.abstract
    if (not paper.authors or paper.authors == []) and s2_paper.authors:
        paper.authors = s2_paper.authors
    if not paper.topics and s2_paper.fields_of_study:
        paper.topics = s2_paper.fields_of_study


async def _enrich_paper_citations():
    import asyncio as _asyncio

    from src.collectors.semantic_scholar import SemanticScholarCollector
    from src.storage.database import create_async_session_factory
    from src.storage.repositories.paper_repo import PaperRepository

    async_session_factory = create_async_session_factory()
    settings = get_settings()

    enriched = 0
    failed = 0
    batch_size = 100  # smaller batches for reliability

    # Get all papers with arxiv_id that have 0 citations
    async with async_session_factory() as session:
        from sqlalchemy import select
        from src.storage.models.paper import Paper

        result = await session.execute(
            select(Paper.id, Paper.arxiv_id)
            .where(Paper.arxiv_id.isnot(None))
            .where(Paper.citation_count == 0)
        )
        papers_to_enrich = [(row.id, row.arxiv_id) for row in result.all()]

    logger.info("Starting citation enrichment", total_papers=len(papers_to_enrich))

    if not papers_to_enrich:
        logger.info("No papers need citation enrichment")
        return

    async with SemanticScholarCollector(
        api_key=settings.SEMANTIC_SCHOLAR_API_KEY
    ) as collector:
        import re

        def strip_version(arxiv_id: str) -> str:
            return re.sub(r"v\d+$", "", arxiv_id)

        for i in range(0, len(papers_to_enrich), batch_size):
            batch = papers_to_enrich[i : i + batch_size]
            arxiv_ids = [f"arxiv:{strip_version(aid)}" for _, aid in batch]
            id_map = {strip_version(aid): pid for pid, aid in batch}

            try:
                s2_papers = await collector.get_papers_batch(arxiv_ids)

                async with async_session_factory() as session:
                    repo = PaperRepository(session)
                    for s2_paper in s2_papers:
                        s2_aid = strip_version(s2_paper.arxiv_id) if s2_paper.arxiv_id else None
                        if s2_aid and s2_aid in id_map:
                            paper = await repo.get_by_id(id_map[s2_aid])
                            if paper:
                                _enrich_paper_from_s2(paper, s2_paper)
                                if s2_paper.doi and not paper.doi:
                                    existing = await session.execute(
                                        select(Paper).where(Paper.doi == s2_paper.doi)
                                    )
                                    existing_paper = existing.scalar_one_or_none()
                                    if existing_paper:
                                        _enrich_paper_from_s2(existing_paper, s2_paper)
                                    else:
                                        paper.doi = s2_paper.doi
                                enriched += 1
                    await session.commit()

            except Exception:
                logger.exception(
                    "Error enriching batch",
                    batch_start=i,
                    batch_size=len(batch),
                )
                failed += len(batch)

            logger.info(
                "Enrichment batch done",
                batch=i // batch_size + 1,
                total_batches=(len(papers_to_enrich) + batch_size - 1) // batch_size,
                enriched=enriched,
                failed=failed,
            )
            await _asyncio.sleep(1)

    logger.info(
        "Citation enrichment completed",
        enriched=enriched,
        failed=failed,
        total=len(papers_to_enrich),
    )


# ============================================================
# HuggingFace Collection
# ============================================================

POPULAR_PIPELINE_TAGS = [
    "text-generation", "text-classification", "token-classification",
    "question-answering", "summarization", "translation", "fill-mask",
    "text2text-generation", "image-classification", "object-detection",
    "image-segmentation", "image-to-text", "text-to-image",
    "text-to-speech", "automatic-speech-recognition", "audio-classification",
    "feature-extraction", "sentence-similarity", "zero-shot-classification",
    "reinforcement-learning",
]

HF_API_BASE = "https://huggingface.co/api"


@celery_app.task(
    name="src.workers.tasks.collection.collect_hf_models",
    soft_time_limit=3600,
    time_limit=3900,
)
def collect_hf_models():
    """Collect trending models from HuggingFace API and store in DB."""
    _run_async(_collect_hf_models())


async def _collect_hf_models():
    import httpx

    from src.storage.database import create_async_session_factory
    from src.storage.repositories.hf_repo import HFModelRepository

    async_session_factory = create_async_session_factory()
    collected = 0
    seen_ids: set[str] = set()

    async with httpx.AsyncClient(timeout=30) as client:
        # Collect for each pipeline tag + overall top
        queries: list[dict] = []

        # Overall top by downloads and likes
        queries.append({"sort": "downloads", "direction": "-1", "limit": 50, "full": "true"})
        queries.append({"sort": "likes", "direction": "-1", "limit": 50, "full": "true"})

        # Per pipeline tag
        for tag in POPULAR_PIPELINE_TAGS:
            queries.append({"filter": tag, "sort": "downloads", "direction": "-1", "limit": 50, "full": "true"})
            queries.append({"filter": tag, "sort": "likes", "direction": "-1", "limit": 50, "full": "true"})

        for params in queries:
            try:
                resp = await client.get(f"{HF_API_BASE}/models", params=params)
                resp.raise_for_status()
                raw = resp.json()

                async with async_session_factory() as session:
                    repo = HFModelRepository(session)
                    for m in raw:
                        mid = m.get("modelId") or m.get("id", "")
                        if not mid or mid in seen_ids:
                            continue
                        seen_ids.add(mid)

                        architecture = None
                        config = m.get("config") or {}
                        architectures = config.get("architectures")
                        if architectures and isinstance(architectures, list):
                            architecture = architectures[0]

                        model_type = config.get("model_type")

                        parameter_count = None
                        safetensors = m.get("safetensors")
                        if safetensors and isinstance(safetensors, dict):
                            total = safetensors.get("total")
                            if total:
                                parameter_count = total

                        tags = m.get("tags") or []
                        languages = [t.replace("language:", "") for t in tags if t.startswith("language:")]

                        license_val = None
                        card_data = m.get("cardData") or {}
                        license_val = card_data.get("license") or m.get("license")

                        author = m.get("author") or (mid.split("/")[0] if "/" in mid else None)

                        def _parse_iso(val):
                            if not val or not isinstance(val, str):
                                return val
                            try:
                                return datetime.fromisoformat(val.replace("Z", "+00:00")).replace(tzinfo=None)
                            except (ValueError, TypeError):
                                return None

                        await repo.upsert_by_model_id({
                            "model_id": mid,
                            "author": author,
                            "downloads": m.get("downloads", 0),
                            "likes": m.get("likes", 0),
                            "pipeline_tag": m.get("pipeline_tag"),
                            "architecture": architecture,
                            "model_type": model_type,
                            "library_name": m.get("library_name"),
                            "tags": tags[:50] if tags else None,
                            "languages": languages[:20] if languages else None,
                            "license": license_val,
                            "parameter_count": parameter_count,
                            "created_at_hf": _parse_iso(m.get("createdAt")),
                            "last_modified_hf": _parse_iso(m.get("lastModified")),
                        })
                        collected += 1
                    await session.commit()
            except Exception:
                logger.exception("Error collecting HF models", params=params)

    logger.info("HuggingFace model collection completed", collected=collected, unique=len(seen_ids))


@celery_app.task(name="src.workers.tasks.collection.collect_hf_daily_papers")
def collect_hf_daily_papers():
    """Collect daily papers from HuggingFace API and store in DB."""
    _run_async(_collect_hf_daily_papers())


async def _collect_hf_daily_papers():
    import httpx

    from src.storage.database import create_async_session_factory
    from src.storage.repositories.hf_repo import HFPaperRepository

    async_session_factory = create_async_session_factory()
    collected = 0
    today = date.today()

    async with httpx.AsyncClient(timeout=15) as client:
        try:
            resp = await client.get(f"{HF_API_BASE}/daily_papers")
            resp.raise_for_status()
            raw = resp.json()

            async with async_session_factory() as session:
                repo = HFPaperRepository(session)
                for item in raw:
                    paper = item.get("paper") or {}
                    arxiv_id = paper.get("id")
                    if not arxiv_id:
                        continue

                    title = item.get("title") or paper.get("title", "")
                    authors_raw = paper.get("authors") or []
                    authors = [a.get("name", "") for a in authors_raw if a.get("name")]

                    pub_at = paper.get("publishedAt")
                    if pub_at and isinstance(pub_at, str):
                        try:
                            pub_at = datetime.fromisoformat(pub_at.replace("Z", "+00:00")).replace(tzinfo=None)
                        except (ValueError, TypeError):
                            pub_at = None

                    await repo.upsert_by_arxiv_id({
                        "arxiv_id": arxiv_id,
                        "title": title,
                        "authors": authors,
                        "upvotes": paper.get("upvotes", 0),
                        "published_at": pub_at,
                        "collected_date": today,
                    })
                    collected += 1
                await session.commit()
        except Exception:
            logger.exception("Error collecting HF daily papers")

    logger.info("HuggingFace daily papers collection completed", collected=collected)


# ============================================================
# Community Posts Collection (HN, Dev.to, Mastodon, Lemmy)
# ============================================================

@celery_app.task(name="src.workers.tasks.collection.collect_hackernews")
def collect_hackernews():
    """Collect AI-related stories from Hacker News."""
    _run_async(_collect_hackernews())


async def _collect_hackernews():
    from src.services.hackernews_service import fetch_all_hn_ai_stories
    from src.storage.database import create_async_session_factory
    from src.storage.repositories.community_repo import CommunityPostRepository

    async_session_factory = create_async_session_factory()
    collected = 0

    try:
        posts = await fetch_all_hn_ai_stories()
        async with async_session_factory() as session:
            repo = CommunityPostRepository(session)
            for post_data in posts:
                post_data["collected_at"] = datetime.now()
                await repo.upsert_by_platform_id(post_data)
                collected += 1
            await session.commit()
    except Exception:
        logger.exception("Error collecting Hacker News")

    logger.info("HN collection completed", collected=collected)


@celery_app.task(name="src.workers.tasks.collection.collect_devto")
def collect_devto():
    """Collect AI-related articles from Dev.to."""
    _run_async(_collect_devto())


async def _collect_devto():
    from src.services.devto_service import fetch_all_devto_ai_articles
    from src.storage.database import create_async_session_factory
    from src.storage.repositories.community_repo import CommunityPostRepository

    async_session_factory = create_async_session_factory()
    collected = 0

    try:
        posts = await fetch_all_devto_ai_articles()
        async with async_session_factory() as session:
            repo = CommunityPostRepository(session)
            for post_data in posts:
                post_data["collected_at"] = datetime.now()
                await repo.upsert_by_platform_id(post_data)
                collected += 1
            await session.commit()
    except Exception:
        logger.exception("Error collecting Dev.to")

    logger.info("Dev.to collection completed", collected=collected)


@celery_app.task(name="src.workers.tasks.collection.collect_mastodon")
def collect_mastodon():
    """Collect AI-related posts from Mastodon instances."""
    _run_async(_collect_mastodon())


async def _collect_mastodon():
    from src.services.mastodon_service import fetch_all_mastodon_ai_posts
    from src.storage.database import create_async_session_factory
    from src.storage.repositories.community_repo import CommunityPostRepository

    async_session_factory = create_async_session_factory()
    collected = 0

    try:
        posts = await fetch_all_mastodon_ai_posts()
        async with async_session_factory() as session:
            repo = CommunityPostRepository(session)
            for post_data in posts:
                post_data["collected_at"] = datetime.now()
                await repo.upsert_by_platform_id(post_data)
                collected += 1
            await session.commit()
    except Exception:
        logger.exception("Error collecting Mastodon")

    logger.info("Mastodon collection completed", collected=collected)


@celery_app.task(name="src.workers.tasks.collection.collect_lemmy")
def collect_lemmy():
    """Collect AI-related posts from Lemmy instances."""
    _run_async(_collect_lemmy())


async def _collect_lemmy():
    from src.services.lemmy_service import fetch_all_lemmy_ai_posts
    from src.storage.database import create_async_session_factory
    from src.storage.repositories.community_repo import CommunityPostRepository

    async_session_factory = create_async_session_factory()
    collected = 0

    try:
        posts = await fetch_all_lemmy_ai_posts()
        async with async_session_factory() as session:
            repo = CommunityPostRepository(session)
            for post_data in posts:
                post_data["collected_at"] = datetime.now()
                await repo.upsert_by_platform_id(post_data)
                collected += 1
            await session.commit()
    except Exception:
        logger.exception("Error collecting Lemmy")

    logger.info("Lemmy collection completed", collected=collected)


@celery_app.task(name="src.workers.tasks.collection.collect_all_community")
def collect_all_community():
    """Trigger collection from all community platforms in parallel."""
    collect_hackernews.delay()
    collect_devto.delay()
    collect_mastodon.delay()
    collect_lemmy.delay()
    logger.info("Triggered all community collection tasks")


# ============================================================
# GitHub Discussions Collection
# ============================================================

@celery_app.task(
    name="src.workers.tasks.collection.collect_github_discussions",
    soft_time_limit=3600,
    time_limit=3900,
)
def collect_github_discussions():
    """Collect discussions from AI-related GitHub repositories."""
    _run_async(_collect_github_discussions())


async def _collect_github_discussions():
    from src.services.github_discussions_service import fetch_github_discussions
    from src.storage.database import create_async_session_factory
    from src.storage.repositories.github_discussion_repo import GitHubDiscussionRepository

    async_session_factory = create_async_session_factory()
    settings = get_settings()

    if not settings.GITHUB_TOKEN:
        logger.warning("No GitHub token configured, skipping discussions collection")
        return

    collected = 0

    try:
        discussions = await fetch_github_discussions(
            token=settings.GITHUB_TOKEN,
            query="AI OR LLM OR machine learning",
            limit=200,
        )
        async with async_session_factory() as session:
            repo = GitHubDiscussionRepository(session)
            for disc_data in discussions:
                disc_data["collected_at"] = datetime.now()
                await repo.upsert_by_discussion_id(disc_data)
                collected += 1
            await session.commit()
    except Exception:
        logger.exception("Error collecting GitHub Discussions")

    logger.info("GitHub Discussions collection completed", collected=collected)


# ============================================================
# OpenReview Collection (papers + reviews + paper linking)
# ============================================================

@celery_app.task(
    name="src.workers.tasks.collection.collect_openreview",
    soft_time_limit=14400,
    time_limit=15000,
)
def collect_openreview():
    """Collect ALL papers from OpenReview venues (paginated, no reviews).
    After papers are collected, triggers review enrichment and paper linking.
    """
    _run_async(_collect_openreview_papers())
    enrich_openreview_reviews.delay()
    link_openreview_papers.delay()


async def _collect_openreview_papers():
    import asyncio as _asyncio

    from src.services.openreview_service import DEFAULT_VENUES, fetch_openreview_notes_paginated
    from src.storage.database import create_async_session_factory
    from src.storage.repositories.openreview_repo import OpenReviewRepository

    async_session_factory = create_async_session_factory()
    total_collected = 0
    commit_every = 200

    for venue_id in DEFAULT_VENUES:
        try:
            notes = await fetch_openreview_notes_paginated(venue_id=venue_id)
            pending = 0
            async with async_session_factory() as session:
                repo = OpenReviewRepository(session)
                for note_data in notes:
                    note_data["collected_at"] = datetime.now()
                    await repo.upsert_by_note_id(note_data)
                    total_collected += 1
                    pending += 1
                    if pending >= commit_every:
                        await session.commit()
                        pending = 0
                if pending > 0:
                    await session.commit()
            logger.info("OpenReview venue done", venue=venue_id, collected=len(notes))
        except Exception:
            logger.exception("Error collecting OpenReview venue", venue=venue_id)
        await _asyncio.sleep(1)

    logger.info("OpenReview paper collection completed", total=total_collected)


@celery_app.task(
    name="src.workers.tasks.collection.enrich_openreview_reviews",
    soft_time_limit=14400,
    time_limit=15000,
)
def enrich_openreview_reviews():
    """Fetch reviews for OpenReview papers that don't have reviews yet."""
    _run_async(_enrich_openreview_reviews())


async def _enrich_openreview_reviews():
    import asyncio as _asyncio

    from sqlalchemy import select

    from src.services.openreview_service import fetch_reviews_batch
    from src.storage.database import create_async_session_factory
    from src.storage.models.openreview_note import OpenReviewNote

    async_session_factory = create_async_session_factory()

    # Get all notes without reviews
    async with async_session_factory() as session:
        result = await session.execute(
            select(OpenReviewNote.id, OpenReviewNote.forum_id)
            .where(OpenReviewNote.reviews_fetched == False)  # noqa: E712
            .order_by(OpenReviewNote.created_at.asc())
        )
        notes_to_enrich = [(row.id, row.forum_id) for row in result.all()]

    logger.info("Starting OpenReview review enrichment", total=len(notes_to_enrich))

    if not notes_to_enrich:
        return

    batch_size = 20
    enriched = 0

    for i in range(0, len(notes_to_enrich), batch_size):
        batch = notes_to_enrich[i : i + batch_size]
        forum_ids = [fid for _, fid in batch]
        id_map = {fid: uid for uid, fid in batch}

        try:
            reviews_map = await fetch_reviews_batch(forum_ids)

            async with async_session_factory() as session:
                for fid, reviews in reviews_map.items():
                    note_uuid = id_map.get(fid)
                    if not note_uuid:
                        continue

                    result = await session.execute(
                        select(OpenReviewNote).where(OpenReviewNote.id == note_uuid)
                    )
                    note = result.scalar_one_or_none()
                    if not note:
                        continue

                    ratings_with_values = [r for r in reviews if r.get("rating") is not None]
                    if ratings_with_values:
                        avg_rating = sum(r["rating"] for r in ratings_with_values) / len(ratings_with_values)
                        note.average_rating = round(avg_rating, 2)
                        note.review_count = len(ratings_with_values)
                        note.ratings = ratings_with_values
                    else:
                        note.average_rating = None
                        note.review_count = 0
                        note.ratings = []

                    note.reviews_fetched = True
                    enriched += 1

                await session.commit()
        except Exception:
            logger.exception("Error enriching reviews batch", batch_start=i)

        logger.info(
            "Review enrichment batch done",
            batch=i // batch_size + 1,
            total_batches=(len(notes_to_enrich) + batch_size - 1) // batch_size,
            enriched=enriched,
        )
        await _asyncio.sleep(3)

    logger.info("OpenReview review enrichment completed", enriched=enriched)


@celery_app.task(name="src.workers.tasks.collection.link_openreview_papers")
def link_openreview_papers():
    """Link OpenReview notes to existing papers in DB by matching normalized titles."""
    _run_async(_link_openreview_papers())


async def _link_openreview_papers():
    import re

    from sqlalchemy import select

    from src.storage.database import create_async_session_factory
    from src.storage.models.openreview_note import OpenReviewNote
    from src.storage.models.paper import Paper

    async_session_factory = create_async_session_factory()

    def clean_for_search(t: str) -> str:
        """Remove special chars for ILIKE search."""
        return t.replace("%", "").replace("_", "").replace("\\", "")

    # Get unlinked openreview notes
    async with async_session_factory() as session:
        result = await session.execute(
            select(OpenReviewNote.id, OpenReviewNote.title)
            .where(OpenReviewNote.paper_id.is_(None))
            .where(OpenReviewNote.title.isnot(None))
        )
        unlinked = [(row.id, row.title) for row in result.all()]

    logger.info("Starting paper linking", unlinked=len(unlinked))

    if not unlinked:
        return

    linked = 0
    batch_size = 100

    for i in range(0, len(unlinked), batch_size):
        batch = unlinked[i : i + batch_size]

        async with async_session_factory() as session:
            for note_uuid, title in batch:
                if not title or len(title.strip()) < 10:
                    continue

                paper_row = None

                # Strategy 1: ILIKE with first 50 chars as substring
                search_term = clean_for_search(title[:50].strip())
                if len(search_term) >= 15:
                    result = await session.execute(
                        select(Paper.id).where(
                            Paper.title.ilike(f"%{search_term}%")
                        ).limit(1)
                    )
                    paper_row = result.first()

                # Strategy 2: If no match, try shorter prefix (30 chars)
                if not paper_row:
                    search_term = clean_for_search(title[:30].strip())
                    if len(search_term) >= 15:
                        result = await session.execute(
                            select(Paper.id).where(
                                Paper.title.ilike(f"{search_term}%")
                            ).limit(1)
                        )
                        paper_row = result.first()

                if paper_row:
                    note_result = await session.execute(
                        select(OpenReviewNote).where(OpenReviewNote.id == note_uuid)
                    )
                    note = note_result.scalar_one_or_none()
                    if note:
                        note.paper_id = paper_row.id
                        linked += 1

            await session.commit()

        logger.info(
            "Paper linking batch done",
            batch=i // batch_size + 1,
            total_batches=(len(unlinked) + batch_size - 1) // batch_size,
            linked=linked,
        )

    logger.info("Paper linking completed", linked=linked, total=len(unlinked))


# ════════════════════════════════════════════════
# bioRxiv / medRxiv collection (P2)
# ════════════════════════════════════════════════

@celery_app.task(name="src.workers.tasks.collection.collect_biorxiv")
def collect_biorxiv(server: str = "biorxiv", max_results: int = 200, days: int = 7):
    """Collect recent papers from bioRxiv or medRxiv."""
    _run_async(_collect_biorxiv(server, max_results, days))


async def _collect_biorxiv(server: str, max_results: int, days: int):
    from src.collectors.biorxiv import BiorxivCollector
    from src.storage.database import create_async_session_factory
    from src.storage.repositories.paper_repo import PaperRepository

    factory = create_async_session_factory()
    date_from = date.today() - timedelta(days=days)
    collected = 0

    async with BiorxivCollector(server=server) as collector:
        async with factory() as session:
            repo = PaperRepository(session)
            async for result in collector.collect(
                date_from=date_from, max_results=max_results
            ):
                p = result.data
                try:
                    await repo.upsert_by_s2_id(
                        {
                            "doi": p.doi,
                            "title": p.title,
                            "abstract": p.abstract,
                            "authors": p.authors,
                            "categories": p.categories,
                            "published_date": p.published_date,
                            "source": server,
                            "source_url": f"https://www.{server}.org/content/{p.doi}",
                            "pdf_url": p.pdf_url,
                        }
                    )
                    collected += 1
                except Exception as e:
                    logger.warning(f"{server} upsert failed", error=str(e), doi=p.doi)
            await session.commit()

    logger.info(f"{server} collection done", collected=collected)


# ════════════════════════════════════════════════
# ACL Anthology collection (P2)
# ════════════════════════════════════════════════

@celery_app.task(name="src.workers.tasks.collection.collect_acl_anthology")
def collect_acl_anthology(year: int | None = None, max_results: int = 200):
    """Collect papers from ACL Anthology."""
    _run_async(_collect_acl(year, max_results))


async def _collect_acl(year: int | None, max_results: int):
    from src.collectors.acl_anthology import ACLAnthologyCollector
    from src.storage.database import create_async_session_factory
    from src.storage.repositories.paper_repo import PaperRepository

    factory = create_async_session_factory()
    collected = 0

    async with ACLAnthologyCollector() as collector:
        async with factory() as session:
            repo = PaperRepository(session)
            async for result in collector.collect(year=year, max_results=max_results):
                p = result.data
                try:
                    await repo.upsert_by_s2_id(
                        {
                            "title": p.title,
                            "abstract": p.abstract,
                            "authors": p.authors,
                            "categories": [f"acl.{p.venue.lower()}"],
                            "published_date": date(p.year, 1, 1),
                            "source": "acl_anthology",
                            "source_url": f"https://aclanthology.org/{p.anthology_id}/",
                            "pdf_url": p.pdf_url,
                        }
                    )
                    collected += 1
                except Exception as e:
                    logger.warning("ACL upsert failed", error=str(e), aid=p.anthology_id)
            await session.commit()

    logger.info("ACL Anthology collection done", collected=collected)


# ════════════════════════════════════════════════
# Retraction Watch collection (P2)
# ════════════════════════════════════════════════

@celery_app.task(name="src.workers.tasks.collection.collect_retraction_watch")
def collect_retraction_watch(max_results: int = 50):
    """Pull retraction notices and flag matching papers."""
    _run_async(_collect_retractions(max_results))


async def _collect_retractions(max_results: int):
    from sqlalchemy import select
    from src.collectors.retraction_watch import RetractionWatchCollector
    from src.storage.database import create_async_session_factory
    from src.storage.models.paper import Paper

    factory = create_async_session_factory()
    flagged = 0
    items_seen = 0

    async with RetractionWatchCollector() as collector:
        async with factory() as session:
            async for result in collector.collect(max_results=max_results):
                items_seen += 1
                item = result.data
                if not item.paper_doi:
                    continue
                paper = (
                    await session.execute(
                        select(Paper).where(Paper.doi == item.paper_doi)
                    )
                ).scalar_one_or_none()
                if not paper:
                    continue

                # Mark via vietnam_entities (reuse JSONB) or summary field
                marker = paper.vietnam_entities or {}
                marker.update(
                    {
                        "retraction": {
                            "retracted_at": item.published_at.isoformat(),
                            "reason": item.reason,
                            "source_url": item.link,
                            "title": item.title,
                        }
                    }
                )
                paper.vietnam_entities = marker
                paper.is_relevant = False
                flagged += 1

            await session.commit()

    logger.info("Retraction watch done", items_seen=items_seen, papers_flagged=flagged)
