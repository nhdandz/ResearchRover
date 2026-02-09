import os

from celery import Celery
from celery.schedules import crontab

from src.core.config import get_settings

settings = get_settings()

celery_app = Celery(
    "osint_research",
    broker=settings.REDIS_URL,
    backend=settings.REDIS_URL,
)

celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="UTC",
    enable_utc=True,
    task_track_started=True,
    task_acks_late=True,
    worker_prefetch_multiplier=1,
    task_default_queue="default",
    task_queues={
        "default": {"exchange": "default", "routing_key": "default"},
        "collection": {"exchange": "collection", "routing_key": "collection"},
        "processing": {"exchange": "processing", "routing_key": "processing"},
        "reporting": {"exchange": "reporting", "routing_key": "reporting"},
    },
)

_beat_schedule = {
    # ── Papers ──
    # Collect NEW papers from ArXiv every 6 hours (recent papers only)
    "collect-arxiv-papers": {
        "task": "src.workers.tasks.collection.collect_arxiv_papers",
        "schedule": crontab(minute=0, hour="*/6"),
        "options": {"queue": "collection"},
    },
    # Full comprehensive collection every Saturday (catch anything missed)
    "collect-papers-comprehensive": {
        "task": "src.workers.tasks.collection.collect_papers_comprehensive",
        "schedule": crontab(minute=0, hour=0, day_of_week=6),
        "options": {"queue": "collection"},
    },
    # Enrich paper citations every Sunday
    "enrich-paper-citations": {
        "task": "src.workers.tasks.collection.enrich_paper_citations",
        "schedule": crontab(minute=0, hour=2, day_of_week=0),
        "options": {"queue": "collection"},
    },

    # ── Processing ──
    # Process unprocessed papers (runs 30 min after each ArXiv collection)
    "process-papers": {
        "task": "src.workers.tasks.processing.process_unprocessed_papers",
        "schedule": crontab(minute=30, hour="*/6"),
        "options": {"queue": "processing"},
    },
    # Process unprocessed repos (every 12 hours)
    "process-repos": {
        "task": "src.workers.tasks.processing.process_unprocessed_repos",
        "schedule": crontab(minute=0, hour="1,13"),
        "options": {"queue": "processing"},
    },
    # Calculate trending scores daily
    "calculate-trending": {
        "task": "src.workers.tasks.processing.calculate_trending_scores",
        "schedule": crontab(minute=0, hour=3),
        "options": {"queue": "processing"},
    },

    # ── Reports ──
    # Generate weekly report on Mondays
    "weekly-report": {
        "task": "src.workers.tasks.reporting.generate_weekly_report",
        "schedule": crontab(minute=0, hour=8, day_of_week=1),
        "options": {"queue": "reporting"},
    },
    # Generate tech radar on Mondays (after weekly report)
    "generate-tech-radar": {
        "task": "src.workers.tasks.reporting.generate_tech_radar",
        "schedule": crontab(minute=30, hour=8, day_of_week=1),
        "options": {"queue": "reporting"},
    },
}

# GitHub/Repo schedules - disabled by default during initial collection
# Set ENABLE_GITHUB_SCHEDULE=true to enable
if os.environ.get("ENABLE_GITHUB_SCHEDULE", "false").lower() == "true":
    _beat_schedule.update({
        # Collect trending repos daily
        "collect-github-trending": {
            "task": "src.workers.tasks.collection.collect_github_trending",
            "schedule": crontab(minute=0, hour=2),
            "options": {"queue": "collection"},
        },
        # Update existing repos stats every 12 hours
        "update-existing-repos": {
            "task": "src.workers.tasks.collection.update_existing_repos",
            "schedule": crontab(minute=0, hour="*/12"),
            "options": {"queue": "collection"},
        },
        # Comprehensive GitHub collection every Sunday
        "collect-github-comprehensive": {
            "task": "src.workers.tasks.collection.collect_github_comprehensive",
            "schedule": crontab(minute=0, hour=0, day_of_week=0),
            "options": {"queue": "collection"},
        },
    })

celery_app.conf.beat_schedule = _beat_schedule

celery_app.autodiscover_tasks([
    "src.workers.tasks.collection",
    "src.workers.tasks.processing",
    "src.workers.tasks.reporting",
])
