"""rri collect - Collect papers, models, and repos from various sources."""

from datetime import date, timedelta
from pathlib import Path
from typing import Annotated, Optional

import typer

from src.cli._async import run
from src.cli._output import (
    console,
    create_progress,
    print_hf_models_table,
    print_papers_table,
    write_json,
    write_markdown,
)

app = typer.Typer(no_args_is_help=True)


@app.command()
def arxiv(
    query: Annotated[str, typer.Option(help="Search query")] = "",
    category: Annotated[Optional[list[str]], typer.Option(help="ArXiv categories")] = None,
    days: Annotated[int, typer.Option(help="Collect papers from last N days")] = 7,
    max_results: Annotated[int, typer.Option(help="Maximum results")] = 100,
    output: Annotated[Optional[Path], typer.Option(help="Output directory")] = None,
    save_db: Annotated[bool, typer.Option(help="Save to database")] = False,
) -> None:
    """Collect papers from ArXiv."""
    run(_collect_arxiv(query, category, days, max_results, output, save_db))


async def _collect_arxiv(
    query: str,
    category: list[str] | None,
    days: int,
    max_results: int,
    output: Path | None,
    save_db: bool,
) -> None:
    from src.collectors.arxiv import ArxivCollector

    date_from = date.today() - timedelta(days=days)
    categories = category or ["cs.AI", "cs.CL", "cs.CV", "cs.LG"]

    papers = []
    async with ArxivCollector() as collector:
        with create_progress() as progress:
            task = progress.add_task("Collecting from ArXiv...", total=max_results)
            async for result in collector.collect(
                categories=categories,
                search_query=query or None,
                date_from=date_from,
                max_results=max_results,
            ):
                p = result.data
                papers.append({
                    "id": p.arxiv_id,
                    "title": p.title,
                    "abstract": p.abstract,
                    "authors": p.authors,
                    "categories": p.categories,
                    "date": str(p.published_date),
                    "pdf_url": p.pdf_url,
                })
                progress.update(task, advance=1)

    console.print(f"\n[green]Collected {len(papers)} papers from ArXiv[/green]")

    if papers:
        print_papers_table(papers)

    if save_db and papers:
        await _save_papers_to_db(papers)

    if papers:
        if output:
            write_json(output / "arxiv_papers.json", papers)
        else:
            write_json("arxiv_papers.json", papers)


async def _save_papers_to_db(papers: list[dict]) -> None:
    from src.cli._context import get_session_factory

    factory = get_session_factory()
    if not factory:
        return

    from src.storage.repositories.paper_repo import PaperRepository

    async with factory() as session:
        repo = PaperRepository(session)
        saved = 0
        for p in papers:
            try:
                await repo.upsert_by_arxiv_id({
                    "arxiv_id": p["id"],
                    "title": p["title"],
                    "abstract": p["abstract"],
                    "authors": p["authors"],
                    "categories": p["categories"],
                    "published_date": p["date"],
                    "pdf_url": p["pdf_url"],
                    "source": "arxiv",
                })
                saved += 1
            except Exception as e:
                console.print(f"[yellow]Skip {p['id']}: {e}[/yellow]")
        await session.commit()
        console.print(f"[green]Saved {saved} papers to database[/green]")


@app.command()
def openalex(
    query: Annotated[str, typer.Option(help="Search query")] = "",
    from_year: Annotated[Optional[int], typer.Option(help="From publication year")] = None,
    max_results: Annotated[int, typer.Option(help="Maximum results")] = 50,
    output: Annotated[Optional[Path], typer.Option(help="Output directory")] = None,
) -> None:
    """Collect papers from OpenAlex."""
    run(_collect_openalex(query, from_year, max_results, output))


async def _collect_openalex(
    query: str,
    from_year: int | None,
    max_results: int,
    output: Path | None,
) -> None:
    from src.collectors.openalex import OpenAlexCollector

    papers = []
    async with OpenAlexCollector() as collector:
        with create_progress() as progress:
            task = progress.add_task("Collecting from OpenAlex...", total=max_results)
            async for result in collector.search(
                query=query,
                from_year=from_year,
                max_results=max_results,
            ):
                w = result.data
                papers.append({
                    "id": w.openalex_id,
                    "title": w.title,
                    "abstract": w.abstract or "",
                    "authors": w.authors,
                    "categories": [c["name"] for c in w.concepts[:5]],
                    "date": str(w.publication_year or ""),
                    "citations": w.cited_by_count,
                    "doi": w.doi,
                    "open_access": w.is_open_access,
                })
                progress.update(task, advance=1)

    console.print(f"\n[green]Collected {len(papers)} papers from OpenAlex[/green]")

    if papers:
        print_papers_table(papers)

    if papers:
        if output:
            write_json(output / "openalex_papers.json", papers)
        else:
            write_json("openalex_papers.json", papers)


@app.command()
def huggingface(
    query: Annotated[str, typer.Option(help="Search query")] = "",
    type: Annotated[str, typer.Option(help="Type: models or datasets")] = "models",
    max_results: Annotated[int, typer.Option(help="Maximum results")] = 20,
    output: Annotated[Optional[Path], typer.Option(help="Output directory")] = None,
) -> None:
    """Collect models/datasets from HuggingFace."""
    run(_collect_huggingface(query, type, max_results, output))


async def _collect_huggingface(
    query: str,
    type_: str,
    max_results: int,
    output: Path | None,
) -> None:
    from src.cli._context import get_cli_settings
    from src.collectors.huggingface import HuggingFaceCollector

    settings = get_cli_settings()
    items = []

    async with HuggingFaceCollector(token=settings.HUGGINGFACE_TOKEN) as collector:
        with create_progress() as progress:
            task = progress.add_task(f"Collecting {type_} from HuggingFace...", total=max_results)

            if type_ == "datasets":
                async for result in collector.search_datasets(
                    query=query or None, max_results=max_results
                ):
                    ds = result.data
                    items.append({
                        "model_id": ds.dataset_id,
                        "pipeline_tag": "dataset",
                        "downloads": ds.downloads,
                        "likes": ds.likes,
                    })
                    progress.update(task, advance=1)
            else:
                async for result in collector.search_models(
                    query=query or None, max_results=max_results
                ):
                    m = result.data
                    items.append({
                        "model_id": m.model_id,
                        "pipeline_tag": m.pipeline_tag,
                        "downloads": m.downloads,
                        "likes": m.likes,
                        "library": m.library_name,
                        "arxiv_ids": m.linked_arxiv_ids,
                    })
                    progress.update(task, advance=1)

    console.print(f"\n[green]Collected {len(items)} {type_} from HuggingFace[/green]")

    if items:
        print_hf_models_table(items)

    if items:
        if output:
            write_json(output / f"huggingface_{type_}.json", items)
        else:
            write_json(f"huggingface_{type_}.json", items)


@app.command()
def repo(
    url: Annotated[str, typer.Argument(help="GitHub repository URL")],
    output: Annotated[Optional[Path], typer.Option(help="Output directory")] = None,
) -> None:
    """Ingest a GitHub repository."""
    run(_collect_repo(url, output))


async def _collect_repo(url: str, output: Path | None) -> None:
    from src.services.repo_ingestion import ingest_repo

    with create_progress() as progress:
        progress.add_task("Ingesting repository...", total=None)
        repo_content = await ingest_repo(url)

    console.print(f"\n[green]Ingested repo:[/green] {repo_content.repo_name}")
    console.print(f"  Summary length: {len(repo_content.summary)} chars")
    console.print(f"  Tree length: {len(repo_content.tree)} chars")
    console.print(f"  Content length: {len(repo_content.content)} chars")

    content = f"# {repo_content.repo_name}\n\n"
    content += f"## Summary\n{repo_content.summary}\n\n"
    content += f"## File Tree\n```\n{repo_content.tree}\n```\n\n"
    repo_data = {
        "name": repo_content.repo_name,
        "summary": repo_content.summary,
        "tree": repo_content.tree,
        "content_length": len(repo_content.content),
    }
    if output:
        write_markdown(output / f"repo_{repo_content.repo_name}.md", content)
        write_json(output / f"repo_{repo_content.repo_name}.json", repo_data)
    else:
        write_markdown(f"repo_{repo_content.repo_name}.md", content)
        write_json(f"repo_{repo_content.repo_name}.json", repo_data)
