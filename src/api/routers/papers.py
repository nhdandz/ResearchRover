import csv
import io
import re
import unicodedata
from datetime import date
from uuid import UUID

from fastapi import APIRouter, HTTPException, Query, UploadFile

from fastapi import Body

from src.api.deps import DbSession, PaginatedResponse
from src.api.schemas.paper import (
    AuthorAnalyticsResponse,
    AuthorComparisonResponse,
    CategoryHeatmapResponse,
    CitationTimelineResponse,
    CoAuthorNetworkResponse,
    ImportResultResponse,
    InstitutionRankingResponse,
    KeywordAnalyticsResponse,
    KeywordTrendResponse,
    PaperDetailResponse,
    PaperResponse,
    PaperStatsResponse,
    ResearchLandscapeResponse,
    TopicCoOccurrenceResponse,
    TopicCorrelationResponse,
)
from src.storage.models.paper import Paper
from src.storage.repositories.paper_repo import PaperRepository
from src.workers.tasks.collection import collect_arxiv_papers, collect_papers_comprehensive, collect_papers_s2, enrich_paper_citations

router = APIRouter(prefix="/papers", tags=["Papers"])


@router.get("/", response_model=PaginatedResponse[PaperResponse])
async def list_papers(
    db: DbSession,
    skip: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=100),
    category: str | None = None,
    topic: str | None = None,
    search: str | None = None,
    source: str | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
    has_code: bool | None = None,
    is_vietnamese: bool | None = None,
    sort_by: str = Query("published_date"),
    sort_order: str = Query("desc"),
):
    repo = PaperRepository(db)
    papers, total = await repo.list_papers(
        skip=skip,
        limit=limit,
        category=category,
        topic=topic,
        search=search,
        source=source,
        date_from=date_from,
        date_to=date_to,
        has_code=has_code,
        is_vietnamese=is_vietnamese,
        sort_by=sort_by,
        sort_order=sort_order,
    )

    return PaginatedResponse(
        items=[PaperResponse.model_validate(p) for p in papers],
        total=total,
        skip=skip,
        limit=limit,
    )


@router.get("/stats", response_model=PaperStatsResponse)
async def get_paper_stats(
    db: DbSession,
    category: str | None = None,
    topic: str | None = None,
    search: str | None = None,
    source: str | None = None,
):
    repo = PaperRepository(db)
    stats = await repo.get_stats(
        category=category,
        topic=topic,
        search=search,
        source=source,
    )
    return PaperStatsResponse(**stats)


@router.get("/categories")
async def list_paper_categories(db: DbSession):
    """Return all known paper categories from the database."""
    repo = PaperRepository(db)
    stats = await repo.get_stats()
    categories = sorted(stats["category_distribution"].keys())
    return {"categories": categories}


@router.post("/collect")
async def trigger_collect_papers():
    """Trigger comprehensive paper collection from ArXiv + Semantic Scholar."""
    task = collect_papers_comprehensive.delay()
    return {"task_id": task.id, "status": "started", "message": "Comprehensive paper collection started (ArXiv + Semantic Scholar)"}


@router.post("/collect-s2")
async def trigger_collect_s2():
    """Trigger Semantic Scholar paper collection separately."""
    task = collect_papers_s2.delay()
    return {"task_id": task.id, "status": "started", "message": "Semantic Scholar paper collection started (960 queries)"}


@router.post("/enrich-citations")
async def trigger_enrich_citations():
    """Enrich papers with citation data from Semantic Scholar."""
    task = enrich_paper_citations.delay()
    return {"task_id": task.id, "status": "started", "message": "Citation enrichment started via Semantic Scholar Batch API"}


def _normalize_title(title: str) -> str:
    title = unicodedata.normalize("NFKD", title)
    title = title.lower().strip()
    title = re.sub(r"[^a-z0-9\s]", "", title)
    title = re.sub(r"\s+", " ", title)
    return title


@router.get("/analytics/authors", response_model=AuthorAnalyticsResponse)
async def get_author_analytics(
    db: DbSession,
    limit: int = Query(20, ge=1, le=100),
    category: str | None = None,
):
    repo = PaperRepository(db)
    data = await repo.get_author_analytics(limit=limit, category=category)
    return AuthorAnalyticsResponse(**data)


@router.get("/analytics/keywords", response_model=KeywordAnalyticsResponse)
async def get_keyword_analytics(
    db: DbSession,
    limit: int = Query(50, ge=1, le=200),
    category: str | None = None,
    year: int | None = None,
):
    repo = PaperRepository(db)
    data = await repo.get_keyword_analytics(limit=limit, category=category, year=year)
    return KeywordAnalyticsResponse(**data)


@router.get("/analytics/network", response_model=CoAuthorNetworkResponse)
async def get_coauthor_network(
    db: DbSession,
    min_collabs: int = Query(2, ge=1),
    limit: int = Query(100, ge=1, le=500),
    category: str | None = None,
):
    repo = PaperRepository(db)
    data = await repo.get_coauthor_network(
        min_collabs=min_collabs, limit=limit, category=category
    )
    return CoAuthorNetworkResponse(**data)


@router.get("/analytics/trends", response_model=KeywordTrendResponse)
async def get_keyword_trends(
    db: DbSession,
    top_n: int = Query(10, ge=1, le=30),
    category: str | None = None,
):
    repo = PaperRepository(db)
    data = await repo.get_keyword_trends(top_n=top_n, category=category)
    return KeywordTrendResponse(**data)


@router.get("/analytics/topic-network", response_model=TopicCoOccurrenceResponse)
async def get_topic_cooccurrence(
    db: DbSession,
    limit: int = Query(80, ge=1, le=300),
    min_cooccurrence: int = Query(5, ge=1),
    category: str | None = None,
):
    repo = PaperRepository(db)
    data = await repo.get_topic_cooccurrence(
        limit=limit, min_cooccurrence=min_cooccurrence, category=category
    )
    return TopicCoOccurrenceResponse(**data)


@router.get("/analytics/citation-timeline", response_model=CitationTimelineResponse)
async def get_citation_timeline(
    db: DbSession,
    limit: int = Query(8, ge=1, le=20),
    category: str | None = None,
):
    repo = PaperRepository(db)
    data = await repo.get_citation_timeline(limit=limit, category=category)
    return CitationTimelineResponse(**data)


@router.get("/analytics/category-heatmap", response_model=CategoryHeatmapResponse)
async def get_category_heatmap(
    db: DbSession,
    category: str | None = None,
):
    repo = PaperRepository(db)
    data = await repo.get_category_heatmap(category=category)
    return CategoryHeatmapResponse(**data)


@router.get("/analytics/topic-correlation", response_model=TopicCorrelationResponse)
async def get_topic_correlation(
    db: DbSession,
    limit: int = Query(15, ge=5, le=30),
    min_cooccurrence: int = Query(10, ge=1),
    category: str | None = None,
):
    repo = PaperRepository(db)
    data = await repo.get_topic_correlation(
        limit=limit, min_cooccurrence=min_cooccurrence, category=category
    )
    return TopicCorrelationResponse(**data)


@router.get("/analytics/institutions", response_model=InstitutionRankingResponse)
async def get_institution_ranking(
    db: DbSession,
    limit: int = Query(30, ge=1, le=100),
    category: str | None = None,
):
    repo = PaperRepository(db)
    data = await repo.get_institution_ranking(limit=limit, category=category)
    return InstitutionRankingResponse(**data)


@router.post("/analytics/author-comparison", response_model=AuthorComparisonResponse)
async def compare_authors(
    db: DbSession,
    author_names: list[str] = Body(..., embed=True),
):
    if len(author_names) > 5:
        raise HTTPException(400, "Maximum 5 authors for comparison")
    repo = PaperRepository(db)
    data = await repo.get_author_comparison(author_names)
    return AuthorComparisonResponse(**data)


@router.get("/analytics/landscape", response_model=ResearchLandscapeResponse)
async def get_research_landscape(
    db: DbSession,
    limit: int = Query(50, ge=10, le=100),
    category: str | None = None,
):
    repo = PaperRepository(db)
    data = await repo.get_research_landscape(limit=limit, category=category)
    return ResearchLandscapeResponse(**data)


@router.get("/{paper_id}/similar", response_model=list[PaperResponse])
async def get_similar_papers(
    paper_id: UUID,
    db: DbSession,
    limit: int = Query(10, ge=1, le=30),
):
    repo = PaperRepository(db)
    papers = await repo.get_similar_papers(paper_id=paper_id, limit=limit)
    return [PaperResponse.model_validate(p) for p in papers]


@router.post("/import", response_model=ImportResultResponse)
async def import_papers(file: UploadFile, db: DbSession):
    if not file.filename:
        raise HTTPException(400, "No file provided")

    ext = file.filename.rsplit(".", 1)[-1].lower() if "." in file.filename else ""
    if ext not in ("csv", "bib"):
        raise HTTPException(400, "Unsupported format. Use .csv or .bib")

    content = (await file.read()).decode("utf-8", errors="replace")
    repo = PaperRepository(db)
    imported = 0
    skipped = 0
    errors: list[str] = []

    entries: list[dict] = []

    if ext == "csv":
        reader = csv.DictReader(io.StringIO(content))
        for i, row in enumerate(reader):
            try:
                title = row.get("title", "").strip()
                if not title:
                    errors.append(f"Row {i + 1}: missing title")
                    continue
                authors_raw = row.get("authors", "")
                authors = [
                    {"name": a.strip()} for a in authors_raw.split(";") if a.strip()
                ] if authors_raw else []
                keywords_raw = row.get("keywords", "")
                keywords = [
                    k.strip() for k in keywords_raw.split(";") if k.strip()
                ] if keywords_raw else None
                pub_date = None
                for field in ("published_date", "year", "date"):
                    val = row.get(field, "").strip()
                    if val:
                        if len(val) == 4 and val.isdigit():
                            pub_date = date(int(val), 1, 1)
                        else:
                            try:
                                pub_date = date.fromisoformat(val)
                            except ValueError:
                                pass
                        break

                entries.append({
                    "title": title,
                    "abstract": row.get("abstract", "").strip() or None,
                    "authors": authors,
                    "doi": row.get("doi", "").strip() or None,
                    "keywords": keywords,
                    "published_date": pub_date,
                    "source": "import-csv",
                })
            except Exception as e:
                errors.append(f"Row {i + 1}: {str(e)}")

    elif ext == "bib":
        try:
            import bibtexparser

            parser = bibtexparser.bparser.BibTexParser(common_strings=True)
            bib_db = bibtexparser.loads(content, parser=parser)
            for entry in bib_db.entries:
                try:
                    title_val = entry.get("title", "").strip()
                    if not title_val:
                        errors.append(f"Entry {entry.get('ID', '?')}: missing title")
                        continue
                    # Clean LaTeX braces
                    title_val = title_val.replace("{", "").replace("}", "")

                    author_raw = entry.get("author", "")
                    authors = []
                    if author_raw:
                        for a in author_raw.split(" and "):
                            authors.append({"name": a.strip()})

                    abstract_val = entry.get("abstract", "").strip() or None

                    pub_date = None
                    year_val = entry.get("year", "").strip()
                    if year_val:
                        try:
                            pub_date = date(int(year_val), 1, 1)
                        except ValueError:
                            pass

                    doi_val = entry.get("doi", "").strip() or None

                    kw_raw = entry.get("keywords", "")
                    keywords = None
                    if kw_raw:
                        keywords = [k.strip() for k in kw_raw.split(",") if k.strip()]

                    entries.append({
                        "title": title_val,
                        "abstract": abstract_val,
                        "authors": authors,
                        "doi": doi_val,
                        "keywords": keywords,
                        "published_date": pub_date,
                        "source": "import-bibtex",
                    })
                except Exception as e:
                    errors.append(f"Entry {entry.get('ID', '?')}: {str(e)}")
        except ImportError:
            raise HTTPException(500, "bibtexparser not installed")
        except Exception as e:
            raise HTTPException(400, f"Failed to parse BibTeX: {str(e)}")

    # Dedup and insert
    for entry in entries:
        try:
            title_norm = _normalize_title(entry["title"])
            entry["title_normalized"] = title_norm

            # Check existing by title_normalized or doi
            existing = await repo.get_by_title_normalized(title_norm)
            if not existing and entry.get("doi"):
                existing = await repo._get_by_doi(entry["doi"])

            if existing:
                skipped += 1
                continue

            paper = Paper(**entry)
            db.add(paper)
            await db.flush()
            imported += 1
        except Exception as e:
            errors.append(f"'{entry.get('title', '?')[:50]}': {str(e)}")

    await db.commit()
    return ImportResultResponse(imported=imported, skipped=skipped, errors=errors[:50])


@router.get("/{paper_id}", response_model=PaperDetailResponse)
async def get_paper(paper_id: UUID, db: DbSession):
    repo = PaperRepository(db)
    paper = await repo.get_by_id(paper_id)
    if not paper:
        raise HTTPException(status_code=404, detail="Paper not found")

    return PaperDetailResponse(
        paper=PaperResponse.model_validate(paper),
        linked_repos=[],
    )
