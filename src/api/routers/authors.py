"""
Authors router — search, profile, co-authorship graph.
"""
import uuid
from collections import Counter, defaultdict

from fastapi import APIRouter, HTTPException, Query
from sqlalchemy import desc, func, select

from src.api.deps import DbSession, PaginatedResponse
from src.storage.models.author import Author, AuthorPaper
from src.storage.models.paper import Paper

router = APIRouter(prefix="/authors", tags=["authors"])


@router.get("", response_model=dict)
async def list_authors(
    db: DbSession,
    search: str | None = Query(None),
    sort: str = Query("paper_count"),  # paper_count | citation_count | h_index
    skip: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=100),
):
    """Liệt kê authors với sort + search."""
    sort_col = {
        "paper_count": Author.paper_count,
        "citation_count": Author.citation_count,
        "h_index": Author.h_index,
    }.get(sort, Author.paper_count)

    base = select(Author)
    if search:
        base = base.where(Author.normalized_name.ilike(f"%{search.lower()}%"))

    total_q = select(func.count(Author.id))
    if search:
        total_q = total_q.where(Author.normalized_name.ilike(f"%{search.lower()}%"))
    total = (await db.execute(total_q)).scalar() or 0

    rows = (
        await db.execute(
            base.order_by(desc(sort_col).nullslast()).offset(skip).limit(limit)
        )
    ).scalars().all()

    return {
        "items": [
            {
                "id": str(a.id),
                "name": a.name,
                "affiliations": a.affiliations or [],
                "h_index": a.h_index,
                "citation_count": a.citation_count,
                "paper_count": a.paper_count,
                "topics": a.topics or [],
                "country": a.country,
            }
            for a in rows
        ],
        "total": total,
        "skip": skip,
        "limit": limit,
    }


@router.get("/{author_id}")
async def get_author(author_id: uuid.UUID, db: DbSession):
    """Profile chi tiết: papers, top topics, co-authors."""
    author = (
        await db.execute(select(Author).where(Author.id == author_id))
    ).scalar_one_or_none()
    if not author:
        raise HTTPException(404, "Author not found")

    # Lấy papers
    paper_rows = (
        await db.execute(
            select(Paper, AuthorPaper.position)
            .join(AuthorPaper, AuthorPaper.paper_id == Paper.id)
            .where(AuthorPaper.author_id == author_id)
            .order_by(desc(Paper.published_date))
            .limit(50)
        )
    ).all()

    papers = [
        {
            "id": str(p.id),
            "title": p.title,
            "arxiv_id": p.arxiv_id,
            "published_date": p.published_date.isoformat() if p.published_date else None,
            "categories": p.categories or [],
            "citation_count": p.citation_count,
            "position": pos,
        }
        for p, pos in paper_rows
    ]

    # Topic distribution
    topic_counter: Counter = Counter()
    for p, _ in paper_rows:
        for cat in (p.categories or [])[:3]:
            topic_counter[cat] += 1

    return {
        "id": str(author.id),
        "name": author.name,
        "affiliations": author.affiliations or [],
        "homepage": author.homepage,
        "orcid": author.orcid,
        "semantic_scholar_id": author.semantic_scholar_id,
        "h_index": author.h_index,
        "citation_count": author.citation_count,
        "paper_count": author.paper_count,
        "topics": author.topics or [],
        "country": author.country,
        "papers": papers,
        "topic_distribution": [
            {"topic": t, "count": c} for t, c in topic_counter.most_common(10)
        ],
    }


@router.get("/{author_id}/coauthors")
async def get_coauthors(
    author_id: uuid.UUID,
    db: DbSession,
    limit: int = Query(20, ge=1, le=100),
):
    """Trả về top co-authors (researcher đã viết chung paper)."""
    paper_ids = [
        row[0]
        for row in (
            await db.execute(
                select(AuthorPaper.paper_id).where(AuthorPaper.author_id == author_id)
            )
        ).all()
    ]
    if not paper_ids:
        return {"author_id": str(author_id), "coauthors": []}

    coauthor_rows = (
        await db.execute(
            select(AuthorPaper.author_id, AuthorPaper.paper_id).where(
                AuthorPaper.paper_id.in_(paper_ids),
                AuthorPaper.author_id != author_id,
            )
        )
    ).all()

    counter: Counter = Counter(r[0] for r in coauthor_rows)
    top_ids = [aid for aid, _ in counter.most_common(limit)]

    if not top_ids:
        return {"author_id": str(author_id), "coauthors": []}

    authors = (
        await db.execute(select(Author).where(Author.id.in_(top_ids)))
    ).scalars().all()
    by_id = {a.id: a for a in authors}

    return {
        "author_id": str(author_id),
        "coauthors": [
            {
                "id": str(aid),
                "name": by_id[aid].name if aid in by_id else "Unknown",
                "shared_papers": count,
                "affiliations": by_id[aid].affiliations or [] if aid in by_id else [],
                "paper_count": by_id[aid].paper_count if aid in by_id else 0,
                "h_index": by_id[aid].h_index if aid in by_id else None,
            }
            for aid, count in counter.most_common(limit)
        ],
    }


@router.get("/{author_id}/network")
async def get_network(
    author_id: uuid.UUID,
    db: DbSession,
    depth: int = Query(1, ge=1, le=2),
):
    """
    Co-authorship network for force-graph: trả về nodes + links.
    depth=1: chỉ co-authors trực tiếp.
    depth=2: thêm co-authors của co-authors (cẩn thận với scale).
    """
    author = (
        await db.execute(select(Author).where(Author.id == author_id))
    ).scalar_one_or_none()
    if not author:
        raise HTTPException(404, "Author not found")

    nodes: dict[str, dict] = {
        str(author.id): {
            "id": str(author.id),
            "name": author.name,
            "size": author.paper_count or 1,
            "isFocus": True,
        }
    }
    links: list[dict] = []

    async def expand_for(aid: uuid.UUID, level: int):
        paper_ids = [
            r[0]
            for r in (
                await db.execute(
                    select(AuthorPaper.paper_id).where(AuthorPaper.author_id == aid)
                )
            ).all()
        ]
        if not paper_ids:
            return

        coauthors_rows = (
            await db.execute(
                select(AuthorPaper.author_id, AuthorPaper.paper_id).where(
                    AuthorPaper.paper_id.in_(paper_ids),
                    AuthorPaper.author_id != aid,
                )
            )
        ).all()

        counter: Counter = Counter(r[0] for r in coauthors_rows)
        top = [oid for oid, _ in counter.most_common(15)]
        if not top:
            return

        co_authors = (
            await db.execute(select(Author).where(Author.id.in_(top)))
        ).scalars().all()
        by_id = {a.id: a for a in co_authors}

        for oid, count in counter.most_common(15):
            if str(oid) not in nodes:
                a = by_id.get(oid)
                if not a:
                    continue
                nodes[str(oid)] = {
                    "id": str(oid),
                    "name": a.name,
                    "size": a.paper_count or 1,
                    "isFocus": False,
                }
            links.append(
                {
                    "source": str(aid),
                    "target": str(oid),
                    "value": count,
                }
            )

            if level < depth:
                await expand_for(oid, level + 1)

    await expand_for(author_id, 1)

    return {"nodes": list(nodes.values()), "links": links}
