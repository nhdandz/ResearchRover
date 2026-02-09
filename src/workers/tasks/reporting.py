"""Reporting tasks for generating weekly digests and alerts."""

import asyncio
from datetime import date, timedelta

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


@celery_app.task(name="src.workers.tasks.reporting.generate_weekly_report")
def generate_weekly_report():
    """Generate weekly digest report and persist to DB."""
    _run_async(_generate_report())


async def _generate_report():
    from sqlalchemy import func, select

    from src.llm.ollama_client import OllamaClient
    from src.llm.prompts.analysis import WEEKLY_REPORT_PROMPT
    from src.storage.database import create_async_session_factory
    from src.storage.models.paper import Paper
    from src.storage.models.repository import Repository
    from src.storage.models.weekly_report import WeeklyReport
    from src.storage.repositories.metrics_repo import MetricsRepository
    from src.storage.repositories.paper_repo import PaperRepository

    async_session_factory = create_async_session_factory()

    settings = get_settings()
    llm = OllamaClient(base_url=settings.LOCAL_LLM_URL, model=settings.LOCAL_LLM_MODEL)

    period_end = date.today()
    period_start = period_end - timedelta(days=7)

    async with async_session_factory() as session:
        paper_repo = PaperRepository(session)
        metrics_repo = MetricsRepository(session)

        # Get papers from this week
        papers, paper_count = await paper_repo.list_papers(
            date_from=period_start,
            date_to=period_end,
            limit=100,
        )

        # Build summaries for LLM
        papers_summary = "\n".join(
            f"- {p.title} [{', '.join(p.categories or [])}]"
            for p in papers[:20]
        )

        # Get trending repos
        trending, _ = await metrics_repo.get_trending(
            entity_type="repository", limit=15
        )
        repos_summary = ""
        top_repos_data = []
        if trending:
            repo_ids = [t.entity_id for t in trending]
            repo_result = await session.execute(
                select(Repository).where(Repository.id.in_(repo_ids))
            )
            repos_map = {r.id: r for r in repo_result.scalars().all()}
            repo_lines = []
            for t in trending[:10]:
                repo = repos_map.get(t.entity_id)
                if repo:
                    repo_lines.append(
                        f"- {repo.full_name} ({repo.primary_language or 'N/A'}): "
                        f"{repo.stars_count} stars, score={t.total_score:.1f}"
                    )
                    top_repos_data.append({
                        "full_name": repo.full_name,
                        "description": repo.description or "",
                        "stars_count": repo.stars_count or 0,
                        "primary_language": repo.primary_language,
                    })
            repos_summary = "\n".join(repo_lines)

        # Build top papers data
        top_papers_data = []
        for p in papers[:10]:
            top_papers_data.append({
                "title": p.title,
                "arxiv_id": p.arxiv_id,
                "citation_count": p.citation_count or 0,
                "categories": (p.categories or [])[:3],
            })

        # Build trending topics
        trending_topics_data = []
        topic_result = await session.execute(
            select(
                func.unnest(Repository.topics).label("topic"),
                func.count().label("count"),
            )
            .where(Repository.topics.isnot(None))
            .group_by("topic")
            .order_by(func.count().desc())
            .limit(10)
        )
        for r in topic_result.all():
            trending_topics_data.append({
                "name": r.topic,
                "count": r.count,
                "trend": "up",
            })

        # Generate report with LLM
        prompt = WEEKLY_REPORT_PROMPT.format(
            period_start=period_start,
            period_end=period_end,
            paper_count=paper_count,
            papers_summary=papers_summary or "No new papers this week.",
            repo_count=len(trending),
            repos_summary=repos_summary or "No trending repos this week.",
            changes_summary="No notable changes detected.",
        )

        report_json = await llm.generate_json(
            prompt, max_tokens=4000, temperature=0.5
        )

        # Extract structured data from LLM response
        title = report_json.get("title", "")
        summary = report_json.get("summary", "")
        highlights = report_json.get("highlights", [])
        content = report_json.get("content", "")

        # Fallback: if JSON parse failed (empty dict), generate plain text report
        if not title and not summary and not content:
            logger.warning("LLM JSON parse failed, falling back to plain text generation")
            plain_prompt = (
                f"Write a concise weekly AI research digest for {period_start} to {period_end}.\n\n"
                f"Papers ({paper_count} total):\n{papers_summary or 'None'}\n\n"
                f"Repos ({len(trending)} trending):\n{repos_summary or 'None'}\n\n"
                "Cover: key highlights, trending topics, notable papers, active repos. Format as markdown."
            )
            content = await llm.generate(plain_prompt, max_tokens=2000, temperature=0.5)
            title = f"Weekly AI Research Digest: {period_start} - {period_end}"
            summary = f"This week saw {paper_count} new papers and {len(trending)} trending repositories across AI/ML research."
            # Auto-generate highlights from top papers
            highlights = [p.title for p in papers[:5]]

        if not title:
            title = f"Weekly AI Research Digest: {period_start} - {period_end}"

        # Ensure highlights is a list of strings
        if not isinstance(highlights, list):
            highlights = []
        highlights = [str(h) for h in highlights[:10]]

        # Count repos
        repo_count_result = await session.execute(
            select(func.count(Repository.id)).where(
                Repository.created_at >= period_start
            )
        )
        new_repos_count = repo_count_result.scalar() or 0

        # Save to DB
        report = WeeklyReport(
            title=title,
            summary=summary,
            content=content,
            highlights=highlights,
            top_papers=top_papers_data,
            top_repos=top_repos_data,
            trending_topics=trending_topics_data,
            new_papers_count=paper_count,
            new_repos_count=new_repos_count,
            period_start=period_start,
            period_end=period_end,
        )
        session.add(report)
        await session.commit()

        logger.info(
            "Weekly report generated and saved",
            report_id=str(report.id),
            papers=paper_count,
            repos=new_repos_count,
            period=f"{period_start} to {period_end}",
        )


@celery_app.task(name="src.workers.tasks.reporting.generate_tech_radar")
def generate_tech_radar():
    """Generate tech radar snapshot using LLM analysis."""
    _run_async(_generate_tech_radar())


async def _generate_tech_radar():
    from sqlalchemy import func, select

    from src.llm.ollama_client import OllamaClient
    from src.llm.prompts.analysis import TECH_RADAR_PROMPT
    from src.storage.database import create_async_session_factory
    from src.storage.models.repository import Repository
    from src.storage.models.tech_radar import TechRadarSnapshot
    from src.storage.repositories.metrics_repo import MetricsRepository

    async_session_factory = create_async_session_factory()
    settings = get_settings()
    llm = OllamaClient(base_url=settings.LOCAL_LLM_URL, model=settings.LOCAL_LLM_MODEL)

    period_end = date.today()
    period_start = period_end - timedelta(days=7)

    async with async_session_factory() as session:
        from src.storage.models.paper import Paper

        metrics_repo = MetricsRepository(session)

        # Top frameworks used in repos (the most relevant signal)
        framework_result = await session.execute(
            select(
                func.unnest(Repository.frameworks).label("framework"),
                func.count().label("count"),
                func.avg(Repository.stars_count).label("avg_stars"),
            )
            .where(Repository.frameworks.isnot(None))
            .group_by("framework")
            .order_by(func.count().desc())
            .limit(25)
        )
        frameworks_data = [
            f"- {r.framework}: used in {r.count} repos, avg {r.avg_stars:.0f} stars"
            for r in framework_result.all()
        ]

        # Top topics from repos (technologies, not languages)
        topic_result = await session.execute(
            select(
                func.unnest(Repository.topics).label("topic"),
                func.count().label("count"),
            )
            .where(Repository.topics.isnot(None))
            .group_by("topic")
            .order_by(func.count().desc())
            .limit(30)
        )
        topics_data = [
            f"- {r.topic}: {r.count} repos"
            for r in topic_result.all()
        ]

        # Top paper keywords/topics (research trends)
        paper_keyword_result = await session.execute(
            select(
                func.unnest(Paper.keywords).label("keyword"),
                func.count().label("count"),
            )
            .where(Paper.keywords.isnot(None))
            .group_by("keyword")
            .order_by(func.count().desc())
            .limit(25)
        )
        paper_keywords_data = [
            f"- {r.keyword}: {r.count} papers"
            for r in paper_keyword_result.all()
        ]

        paper_topic_result = await session.execute(
            select(
                func.unnest(Paper.topics).label("topic"),
                func.count().label("count"),
            )
            .where(Paper.topics.isnot(None))
            .group_by("topic")
            .order_by(func.count().desc())
            .limit(20)
        )
        paper_topics_data = [
            f"- {r.topic}: {r.count} papers"
            for r in paper_topic_result.all()
        ]

        # Top trending repos with actual names
        trending_repos, _ = await metrics_repo.get_trending(
            entity_type="repository", limit=15
        )
        if trending_repos:
            repo_ids = [t.entity_id for t in trending_repos]
            repo_result = await session.execute(
                select(Repository).where(Repository.id.in_(repo_ids))
            )
            repos_map = {r.id: r for r in repo_result.scalars().all()}
            trending_repos_data = []
            for t in trending_repos:
                repo = repos_map.get(t.entity_id)
                if repo:
                    frameworks_str = ", ".join(repo.frameworks[:3]) if repo.frameworks else "N/A"
                    topics_str = ", ".join(repo.topics[:3]) if repo.topics else "N/A"
                    trending_repos_data.append(
                        f"- {repo.full_name} ({repo.primary_language or 'N/A'}): "
                        f"{repo.stars_count} stars, score={t.total_score:.1f}, "
                        f"frameworks=[{frameworks_str}], topics=[{topics_str}]"
                    )
        else:
            trending_repos_data = []

        # Top trending papers with titles
        trending_papers, _ = await metrics_repo.get_trending(
            entity_type="paper", limit=15
        )
        if trending_papers:
            paper_ids = [t.entity_id for t in trending_papers]
            paper_result = await session.execute(
                select(Paper).where(Paper.id.in_(paper_ids))
            )
            papers_map = {p.id: p for p in paper_result.scalars().all()}
            trending_papers_data = []
            for t in trending_papers:
                paper = papers_map.get(t.entity_id)
                if paper:
                    cats = ", ".join(paper.categories[:2]) if paper.categories else "N/A"
                    trending_papers_data.append(
                        f"- \"{paper.title}\" [{cats}]: "
                        f"{paper.citation_count} citations, score={t.total_score:.1f}"
                    )
        else:
            trending_papers_data = []

        # Format data for LLM
        data_text = (
            "## Frameworks & Libraries (from repositories)\n"
            + "\n".join(frameworks_data or ["No data"])
            + "\n\n## Repository Topics (technology tags)\n"
            + "\n".join(topics_data or ["No data"])
            + "\n\n## Research Paper Keywords\n"
            + "\n".join(paper_keywords_data or ["No data"])
            + "\n\n## Research Paper Topics\n"
            + "\n".join(paper_topics_data or ["No data"])
            + "\n\n## Top Trending Repositories\n"
            + "\n".join(trending_repos_data or ["No data"])
            + "\n\n## Top Trending Papers\n"
            + "\n".join(trending_papers_data or ["No data"])
        )

        prompt = TECH_RADAR_PROMPT.format(data=data_text)
        radar_data = await llm.generate_json(prompt, max_tokens=2000, temperature=0.3)

        # Validate structure
        for ring in ("adopt", "trial", "assess", "hold"):
            if ring not in radar_data:
                radar_data[ring] = []

        snapshot = TechRadarSnapshot(
            data=radar_data,
            period_start=period_start,
            period_end=period_end,
        )
        session.add(snapshot)
        await session.commit()

        logger.info(
            "Tech radar generated",
            adopt=len(radar_data.get("adopt", [])),
            trial=len(radar_data.get("trial", [])),
            assess=len(radar_data.get("assess", [])),
            hold=len(radar_data.get("hold", [])),
        )


@celery_app.task(name="src.workers.tasks.reporting.send_alerts")
def send_alerts():
    """Send pending alerts to subscribers."""
    _run_async(_send_pending_alerts())


async def _send_pending_alerts():
    from sqlalchemy import select

    from src.storage.database import create_async_session_factory
    from src.storage.models.alert import Alert

    async_session_factory = create_async_session_factory()
    async with async_session_factory() as session:
        result = await session.execute(
            select(Alert).where(Alert.is_sent == False).limit(100)  # noqa: E712
        )
        alerts = result.scalars().all()

        for alert in alerts:
            try:
                # Here you would integrate with email/Slack/Telegram
                logger.info("Would send alert", title=alert.title, type=alert.alert_type)
                alert.is_sent = True
            except Exception as e:
                logger.error("Failed to send alert", error=str(e))

        await session.commit()

    logger.info("Alert sending completed", count=len(alerts))
