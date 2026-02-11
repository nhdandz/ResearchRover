"""rri export - Export reports and data."""

import csv
import io
from datetime import date, timedelta
from pathlib import Path
from typing import Annotated, Optional

import typer

from src.cli._async import run
from src.cli._output import console, create_progress, write_json, write_markdown

app = typer.Typer(no_args_is_help=True)


@app.command()
def report(
    period: Annotated[str, typer.Option(help="Period: weekly or monthly")] = "weekly",
    cloud: Annotated[bool, typer.Option(help="Use cloud LLM")] = False,
    format: Annotated[str, typer.Option(help="Output format: md or json")] = "md",
    output: Annotated[Optional[Path], typer.Option(help="Output directory")] = None,
) -> None:
    """Generate and export a research report."""
    run(_export_report(period, cloud, format, output))


async def _export_report(
    period: str,
    cloud: bool,
    format: str,
    output: Path | None,
) -> None:
    from src.cli._context import get_llm_client, get_session_factory
    from src.llm.prompts.analysis import WEEKLY_REPORT_PROMPT
    from src.storage.repositories.paper_repo import PaperRepository

    factory = get_session_factory()
    if not factory:
        console.print("[red]Database required for report generation[/red]")
        raise typer.Exit(1)

    days = 7 if period == "weekly" else 30
    period_end = date.today()
    period_start = period_end - timedelta(days=days)

    # Gather data
    async with factory() as session:
        repo = PaperRepository(session)

        papers, total = await repo.list_papers(
            skip=0,
            limit=50,
            date_from=period_start,
            date_to=period_end,
            sort_by="published_date",
            sort_order="desc",
        )

    if not papers:
        console.print("[yellow]No papers found for this period[/yellow]")
        raise typer.Exit(0)

    # Build summary
    papers_summary = "\n".join(
        f"- {p.title} (categories: {', '.join(p.categories or [])})"
        for p in papers[:20]
    )

    llm = get_llm_client(cloud=cloud)
    if not llm:
        console.print("[red]LLM client required for report generation[/red]")
        raise typer.Exit(1)

    with create_progress() as progress:
        progress.add_task("Generating report...", total=None)

        prompt = WEEKLY_REPORT_PROMPT.format(
            period_start=period_start,
            period_end=period_end,
            paper_count=total,
            papers_summary=papers_summary,
            repo_count=0,
            repos_summary="N/A",
            changes_summary="N/A",
        )

        report_data = await llm.generate_json(prompt, max_tokens=2000, temperature=0.3)

    if not report_data:
        # Fallback to plain text
        report_text = await llm.generate(prompt, max_tokens=2000, temperature=0.3)
        report_data = {
            "title": f"{period.title()} Research Report: {period_start} - {period_end}",
            "content": report_text,
            "highlights": [],
        }

    console.print(f"\n[green]Report generated: {report_data.get('title', 'Report')}[/green]")

    filename = f"report_{period}_{period_start}"

    if format == "json":
        if output:
            write_json(output / f"{filename}.json", report_data)
        else:
            write_json(f"{filename}.json", report_data)
    else:
        md = f"# {report_data.get('title', 'Report')}\n\n"
        if report_data.get("summary"):
            md += f"## Summary\n{report_data['summary']}\n\n"
        if report_data.get("highlights"):
            md += "## Highlights\n"
            for h in report_data["highlights"]:
                md += f"- {h}\n"
            md += "\n"
        if report_data.get("content"):
            md += report_data["content"]
        if output:
            write_markdown(output / f"{filename}.md", md)
        else:
            write_markdown(f"{filename}.md", md)

    if hasattr(llm, "close"):
        await llm.close()


@app.command()
def papers(
    query: Annotated[str, typer.Option(help="Search query")] = "",
    limit: Annotated[int, typer.Option(help="Maximum papers")] = 50,
    format: Annotated[str, typer.Option(help="Output format: csv, json, or md")] = "csv",
    output: Annotated[Optional[Path], typer.Option(help="Output file path")] = None,
) -> None:
    """Export papers data."""
    run(_export_papers(query, limit, format, output))


async def _export_papers(
    query: str,
    limit: int,
    format: str,
    output: Path | None,
) -> None:
    from src.cli._context import get_session_factory
    from src.services.paper_service import PaperService

    factory = get_session_factory()
    if not factory:
        console.print("[red]Database required for paper export[/red]")
        raise typer.Exit(1)

    async with factory() as session:
        svc = PaperService(session)
        filters = {"search": query} if query else None
        results, total = await svc.list_papers(skip=0, limit=limit, filters=filters)

    if not results:
        console.print("[yellow]No papers found[/yellow]")
        raise typer.Exit(0)

    console.print(f"[green]Exporting {len(results)} papers[/green]")

    paper_dicts = []
    for p in results:
        paper_dicts.append({
            "id": str(p.id),
            "arxiv_id": p.arxiv_id or "",
            "title": p.title,
            "authors": ", ".join(
                a.get("name", "") if isinstance(a, dict) else str(a)
                for a in (p.authors or [])
            ),
            "categories": ", ".join(p.categories or []),
            "published_date": str(p.published_date or ""),
            "summary": p.summary or "",
            "source": p.source or "",
        })

    from src.cli._output import ensure_reports_dir, REPORTS_DIR

    if format == "csv":
        if output:
            out_path = output
        else:
            ensure_reports_dir()
            out_path = REPORTS_DIR / "papers_export.csv"
        out_path.parent.mkdir(parents=True, exist_ok=True)
        buf = io.StringIO()
        if paper_dicts:
            writer = csv.DictWriter(buf, fieldnames=paper_dicts[0].keys())
            writer.writeheader()
            writer.writerows(paper_dicts)
        out_path.write_text(buf.getvalue(), encoding="utf-8")
        console.print(f"[green]Written:[/green] {out_path}")
    elif format == "json":
        if output:
            write_json(output, paper_dicts)
        else:
            write_json("papers_export.json", paper_dicts)
    else:
        md = "# Papers Export\n\n"
        for p in paper_dicts:
            md += f"## {p['title']}\n"
            md += f"- **ID:** {p['arxiv_id'] or p['id']}\n"
            md += f"- **Authors:** {p['authors']}\n"
            md += f"- **Date:** {p['published_date']}\n"
            md += f"- **Categories:** {p['categories']}\n"
            if p['summary']:
                md += f"\n{p['summary']}\n"
            md += "\n---\n\n"
        if output:
            write_markdown(output, md)
        else:
            write_markdown("papers_export.md", md)
