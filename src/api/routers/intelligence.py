"""
OSINT intelligence endpoints — buzz papers, concept trends, comparative analytics, geographic.
"""
import math
import uuid
from collections import Counter
from datetime import date, datetime, timedelta

from fastapi import APIRouter, HTTPException, Query
from sqlalchemy import desc, func, select

from src.api.deps import DbSession
from src.storage.models.author import Author, AuthorPaper
from src.storage.models.concept_trend import ConceptTrend
from src.storage.models.paper import Paper
from src.storage.models.paper_signal import PaperSignal

router = APIRouter(prefix="/intelligence", tags=["intelligence"])


# ════════════════════════════════════════════════
# Buzz papers — cross-source ranking
# ════════════════════════════════════════════════

@router.get("/buzz")
async def get_buzz_papers(
    db: DbSession,
    period: str = Query("week", pattern="^(day|week|month|all)$"),
    sort: str = Query("buzz_score", pattern="^(buzz_score|buzz_velocity)$"),
    limit: int = Query(20, ge=1, le=100),
    skip: int = Query(0, ge=0),
):
    """Papers có buzz cao nhất qua nhiều nguồn (cross-source)."""
    sort_col = {
        "buzz_score": PaperSignal.buzz_score,
        "buzz_velocity": PaperSignal.buzz_velocity,
    }[sort]

    query = (
        select(PaperSignal, Paper)
        .join(Paper, Paper.id == PaperSignal.paper_id)
        .where(PaperSignal.buzz_score > 0)
    )

    # Filter by signal computed window (paper's recency reflected in velocity instead)
    if period != "all":
        days = {"day": 1, "week": 7, "month": 30}[period]
        since = datetime.utcnow() - timedelta(days=days)
        query = query.where(PaperSignal.computed_at >= since)

    rows = (
        await db.execute(
            query.order_by(desc(sort_col)).offset(skip).limit(limit)
        )
    ).all()

    items = []
    for sig, paper in rows:
        items.append(
            {
                "paper_id": str(paper.id),
                "title": paper.title,
                "arxiv_id": paper.arxiv_id,
                "categories": paper.categories or [],
                "published_date": paper.published_date.isoformat() if paper.published_date else None,
                "buzz_score": round(sig.buzz_score, 3),
                "buzz_velocity": round(sig.buzz_velocity, 3),
                "source_breakdown": sig.source_breakdown or {},
                "computed_at": sig.computed_at.isoformat() if sig.computed_at else None,
            }
        )
    return {"items": items, "period": period, "sort": sort}


@router.get("/papers/{paper_id}/signals")
async def get_paper_signals(paper_id: uuid.UUID, db: DbSession):
    """Detail signal của 1 paper."""
    sig = (
        await db.execute(
            select(PaperSignal).where(PaperSignal.paper_id == paper_id)
        )
    ).scalar_one_or_none()
    if not sig:
        raise HTTPException(404, "No signals computed yet for this paper")

    return {
        "paper_id": str(paper_id),
        "buzz_score": round(sig.buzz_score, 3),
        "buzz_velocity": round(sig.buzz_velocity, 3),
        "hf_upvotes": sig.hf_upvotes,
        "hn_score": sig.hn_score,
        "hn_comments": sig.hn_comments,
        "github_repo_stars": sig.github_repo_stars,
        "github_repo_count": sig.github_repo_count,
        "openreview_rating": sig.openreview_rating,
        "citation_count": sig.citation_count,
        "twitter_mentions": sig.twitter_mentions,
        "source_breakdown": sig.source_breakdown,
        "computed_at": sig.computed_at.isoformat() if sig.computed_at else None,
    }


# ════════════════════════════════════════════════
# Concept trends
# ════════════════════════════════════════════════

@router.get("/concepts/trending")
async def get_trending_concepts(
    db: DbSession,
    status: str | None = Query(None, pattern="^(hot|rising|stable|declining|stale)$"),
    limit: int = Query(30, ge=1, le=200),
):
    """Top concepts theo status với time-series data."""
    base = (
        select(ConceptTrend)
        .order_by(desc(ConceptTrend.computed_at), desc(ConceptTrend.paper_count))
    )
    if status:
        base = base.where(ConceptTrend.status == status)

    # Lấy snapshot mới nhất per concept
    latest_period = (
        await db.execute(
            select(func.max(ConceptTrend.period_end))
        )
    ).scalar()
    if latest_period:
        base = base.where(ConceptTrend.period_end == latest_period)

    rows = (await db.execute(base.limit(limit))).scalars().all()

    return {
        "period_end": latest_period.isoformat() if latest_period else None,
        "items": [
            {
                "concept": c.concept,
                "paper_count": c.paper_count,
                "growth_rate": round(c.growth_rate, 3),
                "status": c.status,
                "data_points": c.data_points or [],
            }
            for c in rows
        ],
    }


@router.get("/concepts/{concept}/timeline")
async def get_concept_timeline(concept: str, db: DbSession):
    """Time series cho 1 concept."""
    normalized = concept.lower().strip()
    rows = (
        await db.execute(
            select(ConceptTrend)
            .where(ConceptTrend.normalized_concept == normalized)
            .order_by(desc(ConceptTrend.period_end))
            .limit(1)
        )
    ).scalars().all()
    if not rows:
        raise HTTPException(404, f"No trend data for concept '{concept}'")

    latest = rows[0]
    return {
        "concept": latest.concept,
        "current_count": latest.paper_count,
        "growth_rate": latest.growth_rate,
        "status": latest.status,
        "data_points": latest.data_points or [],
    }


# ════════════════════════════════════════════════
# Comparative analytics
# ════════════════════════════════════════════════

@router.get("/compare/authors")
async def compare_authors_pair(
    db: DbSession,
    a: uuid.UUID = Query(..., description="First author ID"),
    b: uuid.UUID = Query(..., description="Second author ID"),
):
    """So sánh 2 authors side-by-side."""
    a1 = (await db.execute(select(Author).where(Author.id == a))).scalar_one_or_none()
    b1 = (await db.execute(select(Author).where(Author.id == b))).scalar_one_or_none()
    if not a1 or not b1:
        raise HTTPException(404, "One or both authors not found")

    # Get papers for each
    async def _author_summary(author):
        paper_ids = [
            r[0]
            for r in (
                await db.execute(
                    select(AuthorPaper.paper_id).where(
                        AuthorPaper.author_id == author.id
                    )
                )
            ).all()
        ]
        topics = Counter()
        years = Counter()
        if paper_ids:
            papers = (
                await db.execute(select(Paper).where(Paper.id.in_(paper_ids)))
            ).scalars().all()
            for p in papers:
                for c in (p.categories or [])[:3]:
                    topics[c] += 1
                if p.published_date:
                    years[p.published_date.year] += 1

        return {
            "id": str(author.id),
            "name": author.name,
            "h_index": author.h_index,
            "citation_count": author.citation_count,
            "paper_count": author.paper_count,
            "affiliations": author.affiliations or [],
            "top_topics": [
                {"topic": t, "count": c} for t, c in topics.most_common(8)
            ],
            "papers_per_year": [
                {"year": y, "count": c} for y, c in sorted(years.items())
            ],
        }

    return {
        "a": await _author_summary(a1),
        "b": await _author_summary(b1),
        "shared_topics": list(
            set([t["topic"] for t in (await _author_summary(a1))["top_topics"]])
            & set([t["topic"] for t in (await _author_summary(b1))["top_topics"]])
        ),
    }


@router.get("/compare/concepts")
async def compare_concepts(
    db: DbSession,
    a: str = Query(..., description="First concept"),
    b: str = Query(..., description="Second concept"),
):
    """So sánh time series của 2 concepts."""

    async def _trend(concept: str):
        normalized = concept.lower().strip()
        row = (
            await db.execute(
                select(ConceptTrend)
                .where(ConceptTrend.normalized_concept == normalized)
                .order_by(desc(ConceptTrend.period_end))
                .limit(1)
            )
        ).scalar_one_or_none()
        if not row:
            return None
        return {
            "concept": row.concept,
            "current_count": row.paper_count,
            "growth_rate": row.growth_rate,
            "status": row.status,
            "data_points": row.data_points or [],
        }

    return {
        "a": await _trend(a),
        "b": await _trend(b),
    }


# ════════════════════════════════════════════════
# Geographic distribution
# ════════════════════════════════════════════════

@router.get("/geographic/affiliations")
async def get_affiliation_distribution(
    db: DbSession,
    limit: int = Query(50, ge=1, le=200),
):
    """Phân bố affiliations — dùng cho bản đồ và bar chart."""
    authors = (
        await db.execute(select(Author).where(Author.affiliations.isnot(None)))
    ).scalars().all()

    counter: Counter = Counter()
    for a in authors:
        for aff in (a.affiliations or [])[:1]:  # primary affiliation only
            counter[aff] += 1

    top = counter.most_common(limit)
    return {
        "items": [{"affiliation": aff, "author_count": count} for aff, count in top],
    }


# ════════════════════════════════════════════════
# Knowledge graph (multi-entity)
# ════════════════════════════════════════════════

@router.get("/knowledge-graph")
async def get_knowledge_graph(
    db: DbSession,
    seed_paper_id: uuid.UUID | None = Query(None),
    seed_concept: str | None = Query(None),
    max_nodes: int = Query(50, ge=10, le=200),
):
    """
    Multi-entity KG: paper ↔ author ↔ topic.
    Seed bằng paper hoặc concept; expand 1 hop.
    """
    nodes: dict[str, dict] = {}
    links: list[dict] = []

    paper_ids: list[uuid.UUID] = []

    if seed_paper_id:
        paper = (
            await db.execute(select(Paper).where(Paper.id == seed_paper_id))
        ).scalar_one_or_none()
        if not paper:
            raise HTTPException(404, "Seed paper not found")
        paper_ids = [paper.id]

    elif seed_concept:
        concept_lower = seed_concept.lower()
        # Match by category or in topics
        rows = (
            await db.execute(
                select(Paper)
                .where(
                    func.array_to_string(Paper.categories, ",").ilike(
                        f"%{concept_lower}%"
                    )
                    | Paper.title.ilike(f"%{seed_concept}%")
                )
                .order_by(desc(Paper.citation_count))
                .limit(20)
            )
        ).scalars().all()
        paper_ids = [p.id for p in rows]
    else:
        # Default: top cited recent papers
        rows = (
            await db.execute(
                select(Paper)
                .where(Paper.citation_count > 0)
                .order_by(desc(Paper.citation_count))
                .limit(20)
            )
        ).scalars().all()
        paper_ids = [p.id for p in rows]

    if not paper_ids:
        return {"nodes": [], "links": []}

    # Get papers
    papers = (
        await db.execute(select(Paper).where(Paper.id.in_(paper_ids)))
    ).scalars().all()

    for p in papers:
        nid = f"paper:{p.id}"
        nodes[nid] = {
            "id": nid,
            "label": p.title[:80],
            "type": "paper",
            "size": min(20, math.log1p(p.citation_count or 0) + 5),
        }

        # Topic nodes
        for cat in (p.categories or [])[:3]:
            tnid = f"topic:{cat}"
            if tnid not in nodes:
                nodes[tnid] = {
                    "id": tnid,
                    "label": cat,
                    "type": "topic",
                    "size": 8,
                }
            links.append({"source": nid, "target": tnid, "type": "has_topic"})

    # Get authors
    ap_rows = (
        await db.execute(
            select(AuthorPaper.author_id, AuthorPaper.paper_id).where(
                AuthorPaper.paper_id.in_(paper_ids)
            )
        )
    ).all()
    author_ids = list({r[0] for r in ap_rows})
    if author_ids:
        authors = (
            await db.execute(select(Author).where(Author.id.in_(author_ids[:max_nodes])))
        ).scalars().all()
        by_id = {a.id: a for a in authors}

        for aid, pid in ap_rows:
            if aid not in by_id:
                continue
            anid = f"author:{aid}"
            if anid not in nodes:
                a = by_id[aid]
                nodes[anid] = {
                    "id": anid,
                    "label": a.name,
                    "type": "author",
                    "size": min(15, math.log1p(a.paper_count or 0) + 4),
                }
            links.append(
                {
                    "source": anid,
                    "target": f"paper:{pid}",
                    "type": "authored",
                }
            )

    # Truncate to max_nodes (keep seed nodes)
    nodes_list = list(nodes.values())[:max_nodes]
    valid_ids = {n["id"] for n in nodes_list}
    links_list = [l for l in links if l["source"] in valid_ids and l["target"] in valid_ids]

    return {"nodes": nodes_list, "links": links_list}
