from datetime import date, timedelta

from fastapi import APIRouter, Query, Response
from sqlalchemy import select

from src.api.deps import DbSession
from src.api.schemas.report import (
    ReportGenerationResponse,
    TopPaperItem,
    TopRepoItem,
    TrendingTopicItem,
    WeeklyReportResponse,
)
from src.storage.models.weekly_report import WeeklyReport

router = APIRouter(prefix="/reports", tags=["Reports"])


@router.get("/weekly", response_model=WeeklyReportResponse)
async def get_weekly_report(
    db: DbSession,
    week: date | None = None,
    topics: list[str] | None = Query(None),
):
    """Get the latest (or specific week's) weekly report."""
    query = select(WeeklyReport).order_by(WeeklyReport.created_at.desc())

    if week:
        query = query.where(
            WeeklyReport.period_start <= week,
            WeeklyReport.period_end >= week,
        )

    query = query.limit(1)
    result = await db.execute(query)
    report = result.scalar_one_or_none()

    if not report:
        report_date = week or date.today()
        return WeeklyReportResponse(
            title="No Report Available",
            period_start=report_date - timedelta(days=7),
            period_end=report_date,
        )

    return WeeklyReportResponse(
        id=str(report.id),
        title=report.title,
        summary=report.summary,
        content=report.content,
        highlights=report.highlights or [],
        top_papers=[TopPaperItem(**p) for p in (report.top_papers or [])],
        top_repos=[TopRepoItem(**r) for r in (report.top_repos or [])],
        trending_topics=[TrendingTopicItem(**t) for t in (report.trending_topics or [])],
        new_papers_count=report.new_papers_count,
        new_repos_count=report.new_repos_count,
        period_start=report.period_start,
        period_end=report.period_end,
        generated_at=report.created_at,
    )


@router.get("/history", response_model=list[WeeklyReportResponse])
async def get_report_history(
    db: DbSession,
    limit: int = Query(10, ge=1, le=50),
):
    """Get past weekly reports."""
    result = await db.execute(
        select(WeeklyReport)
        .order_by(WeeklyReport.created_at.desc())
        .limit(limit)
    )
    reports = result.scalars().all()

    return [
        WeeklyReportResponse(
            id=str(r.id),
            title=r.title,
            summary=r.summary,
            highlights=r.highlights or [],
            new_papers_count=r.new_papers_count,
            new_repos_count=r.new_repos_count,
            period_start=r.period_start,
            period_end=r.period_end,
            generated_at=r.created_at,
        )
        for r in reports
    ]


@router.post("/generate", response_model=ReportGenerationResponse)
async def generate_report():
    """Trigger weekly report generation via Celery."""
    from src.workers.tasks.reporting import generate_weekly_report

    task = generate_weekly_report.delay()
    return ReportGenerationResponse(
        task_id=str(task.id),
        status="queued",
        estimated_time_seconds=60,
    )


@router.get("/{report_id}/download")
async def download_report(
    db: DbSession,
    report_id: str,
    format: str = Query("markdown"),
):
    """Download a specific report as markdown."""
    result = await db.execute(
        select(WeeklyReport).where(WeeklyReport.id == report_id)
    )
    report = result.scalar_one_or_none()

    if not report:
        content = f"# Report Not Found\n\nReport {report_id} does not exist."
    else:
        content = f"# {report.title}\n\n"
        if report.summary:
            content += f"## Summary\n\n{report.summary}\n\n"
        if report.highlights:
            content += "## Highlights\n\n"
            for h in report.highlights:
                content += f"- {h}\n"
            content += "\n"
        if report.content:
            content += f"## Full Report\n\n{report.content}\n"

    media_type = "text/markdown"
    filename = f"report_{report_id}.md"

    return Response(
        content=content,
        media_type=media_type,
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )
