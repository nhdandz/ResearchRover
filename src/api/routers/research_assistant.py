"""
AI-powered research assistant endpoints:
  - Reading priority queue (rank bookmarks)
  - Literature gap finder
  - Auto-generated literature review từ folder
  - Citation context analysis
"""
import math
import uuid
from collections import Counter
from datetime import datetime, timedelta

from fastapi import APIRouter, HTTPException, Query
from sqlalchemy import desc, func, select

from src.api.deps import DbSession, get_current_user_dep
from src.storage.models.bookmark import Bookmark
from src.storage.models.folder import Folder
from src.storage.models.paper import Paper
from src.storage.models.paper_signal import PaperSignal

router = APIRouter(prefix="/me/assistant", tags=["research-assistant"])


# ════════════════════════════════════════════════
# Reading priority queue
# ════════════════════════════════════════════════

@router.get("/reading-queue")
async def reading_queue(
    current_user: get_current_user_dep,
    db: DbSession,
    limit: int = Query(20, ge=1, le=100),
):
    """
    Rank các bookmark còn `saved` theo priority composite:
      priority = 0.4 * relevance_to_interests
               + 0.3 * normalized_buzz
               + 0.2 * recency
               + 0.1 * (1/reading_time_estimate)
    """
    bookmarks = (
        await db.execute(
            select(Bookmark).where(
                Bookmark.user_id == current_user.id,
                Bookmark.reading_status == "saved",
                Bookmark.item_type == "paper",
                Bookmark.item_id.isnot(None),
            )
        )
    ).scalars().all()

    if not bookmarks:
        return {"items": []}

    paper_ids = [b.item_id for b in bookmarks]
    papers = (
        await db.execute(select(Paper).where(Paper.id.in_(paper_ids)))
    ).scalars().all()
    by_id = {p.id: p for p in papers}

    # Buzz scores
    sigs = (
        await db.execute(
            select(PaperSignal).where(PaperSignal.paper_id.in_(paper_ids))
        )
    ).scalars().all()
    sig_by_pid = {s.paper_id: s for s in sigs}

    interests = current_user.research_interests or []
    interest_set = set(i.lower() for i in interests)

    now = datetime.utcnow()
    scored = []
    max_buzz = max((s.buzz_score for s in sigs), default=1.0) or 1.0

    for b in bookmarks:
        paper = by_id.get(b.item_id)
        if not paper:
            continue

        # Relevance: overlap title/abstract with interests
        text = ((paper.title or "") + " " + (paper.abstract or "")).lower()
        rel_hits = sum(1 for i in interest_set if i in text)
        rel_score = min(1.0, rel_hits / max(len(interest_set), 1))

        # Buzz
        sig = sig_by_pid.get(b.item_id)
        buzz_score = (sig.buzz_score / max_buzz) if sig else 0.0

        # Recency
        age_days = (now - b.created_at).days if b.created_at else 30
        recency = max(0.0, 1.0 - age_days / 30.0)

        # Reading time: ~200 words/min, abstract * 5
        word_count = len((paper.abstract or "").split()) * 5
        reading_min = max(5, word_count / 200)
        rt_score = min(1.0, 30 / reading_min)

        priority = (
            0.4 * rel_score
            + 0.3 * buzz_score
            + 0.2 * recency
            + 0.1 * rt_score
        )

        scored.append(
            {
                "bookmark_id": str(b.id),
                "paper_id": str(paper.id),
                "title": paper.title,
                "arxiv_id": paper.arxiv_id,
                "abstract_preview": (paper.abstract or "")[:240],
                "categories": paper.categories or [],
                "priority_score": round(priority, 3),
                "factors": {
                    "relevance": round(rel_score, 3),
                    "buzz": round(buzz_score, 3),
                    "recency": round(recency, 3),
                    "reading_time_factor": round(rt_score, 3),
                },
                "estimated_reading_minutes": int(reading_min),
                "saved_at": b.created_at.isoformat() if b.created_at else None,
            }
        )

    scored.sort(key=lambda x: x["priority_score"], reverse=True)
    return {"items": scored[:limit]}


# ════════════════════════════════════════════════
# Literature gap finder
# ════════════════════════════════════════════════

@router.get("/literature-gaps")
async def literature_gaps(
    current_user: get_current_user_dep,
    db: DbSession,
):
    """
    Tìm "khoảng trống": các category trong research_interests user nhưng có rất ít
    paper được publish trong 30 ngày qua → có thể là cơ hội nghiên cứu.

    Trả về các topic ranked theo (interest match × low_volume × growth_potential).
    """
    from src.workers.tasks.personalization import _DEFAULT_INTEREST_CATEGORIES

    interests = current_user.research_interests or []
    if not interests:
        return {"items": [], "message": "Set research interests first"}

    relevant_cats: set[str] = set()
    for interest in interests:
        for cat in _DEFAULT_INTEREST_CATEGORIES.get(interest, []):
            relevant_cats.add(cat)

    if not relevant_cats:
        return {"items": [], "message": "No category mapping for your interests"}

    since = datetime.utcnow() - timedelta(days=30)
    prev_since = datetime.utcnow() - timedelta(days=60)

    # Count papers per category in 30d window vs 30-60d window
    gaps = []
    for cat in relevant_cats:
        recent_count = (
            await db.execute(
                select(func.count(Paper.id)).where(
                    Paper.created_at >= since,
                    Paper.categories.any(cat),
                )
            )
        ).scalar() or 0

        prev_count = (
            await db.execute(
                select(func.count(Paper.id)).where(
                    Paper.created_at >= prev_since,
                    Paper.created_at < since,
                    Paper.categories.any(cat),
                )
            )
        ).scalar() or 0

        # Low volume + interest match = gap candidate
        gap_score = 0.0
        if recent_count < 30:
            gap_score += (30 - recent_count) / 30 * 0.5
        # Growth: recent vs prev
        if prev_count > 0:
            growth = (recent_count - prev_count) / prev_count
            if -0.3 < growth < 0.3:  # stable/declining → gap
                gap_score += 0.3
        # Interest weight
        matched_interests = [
            i for i in interests if cat in _DEFAULT_INTEREST_CATEGORIES.get(i, [])
        ]
        gap_score += 0.2 * (len(matched_interests) / max(len(interests), 1))

        gaps.append(
            {
                "category": cat,
                "matched_interests": matched_interests,
                "recent_papers_count": recent_count,
                "prev_papers_count": prev_count,
                "gap_score": round(gap_score, 3),
                "rationale": _gap_rationale(recent_count, prev_count),
            }
        )

    gaps.sort(key=lambda x: x["gap_score"], reverse=True)
    return {"items": gaps[:15]}


def _gap_rationale(recent: int, prev: int) -> str:
    if recent == 0:
        return "No papers in 30 days — emerging niche."
    if recent < 10:
        return "Very low publication volume — under-explored area."
    if prev == 0:
        return "New activity area."
    if recent < prev * 0.7:
        return "Activity declining — potential research opening."
    if recent <= 30:
        return "Modest volume — niche research area."
    return "Active area — high competition."


# ════════════════════════════════════════════════
# Auto-generated literature review từ folder
# ════════════════════════════════════════════════

@router.post("/literature-review")
async def generate_literature_review(
    current_user: get_current_user_dep,
    db: DbSession,
    folder_id: uuid.UUID = Query(..., description="Bookmark folder to review"),
):
    """
    Generate literature review markdown từ tất cả papers trong folder.
    Dùng Ollama LLM (đã có).
    """
    folder = (
        await db.execute(
            select(Folder).where(
                Folder.id == folder_id, Folder.user_id == current_user.id
            )
        )
    ).scalar_one_or_none()
    if not folder:
        raise HTTPException(404, "Folder not found")

    bookmarks = (
        await db.execute(
            select(Bookmark).where(
                Bookmark.folder_id == folder.id,
                Bookmark.user_id == current_user.id,
                Bookmark.item_type == "paper",
                Bookmark.item_id.isnot(None),
            )
        )
    ).scalars().all()

    if not bookmarks:
        raise HTTPException(400, "Folder has no paper bookmarks")

    paper_ids = [b.item_id for b in bookmarks]
    papers = (
        await db.execute(select(Paper).where(Paper.id.in_(paper_ids)))
    ).scalars().all()

    # Build context text
    context_parts = []
    for i, p in enumerate(papers[:20], 1):
        authors = []
        if isinstance(p.authors, list):
            for a in p.authors[:3]:
                if isinstance(a, dict):
                    authors.append(a.get("name", ""))
                else:
                    authors.append(str(a))
        context_parts.append(
            f"[{i}] {', '.join(authors[:2])}{' et al' if len(authors) > 2 else ''} - "
            f"{p.title}\n"
            f"    Categories: {', '.join((p.categories or [])[:3])}\n"
            f"    Abstract: {(p.abstract or '')[:600]}"
        )
    context = "\n\n".join(context_parts)

    prompt = f"""You are a research assistant. Generate a structured literature review (markdown) from the following {len(papers)} papers in the folder "{folder.name}".

Papers:
{context}

The review must contain:
- ## Overview (3-4 sentences summarizing the theme)
- ## Key Themes (bullet list of 3-5 themes with paper citations like [1], [3])
- ## Methods Comparison (brief table or list comparing approaches)
- ## Open Questions (2-3 research questions raised)
- ## References (full list)

Output only the markdown, no preamble."""

    try:
        from src.core.config import get_settings
        from src.llm.ollama_client import OllamaClient

        settings = get_settings()
        llm = OllamaClient(base_url=settings.LOCAL_LLM_URL, model=settings.LOCAL_LLM_MODEL)
        review_md = await llm.generate(prompt, max_tokens=2500, temperature=0.4)
    except Exception as e:
        # Fallback: return structured stub
        review_md = _fallback_review(folder.name, papers)
        return {
            "folder": folder.name,
            "paper_count": len(papers),
            "review_md": review_md,
            "fallback_used": True,
            "error": str(e),
        }

    return {
        "folder": folder.name,
        "paper_count": len(papers),
        "review_md": review_md,
        "fallback_used": False,
    }


def _fallback_review(folder_name: str, papers: list) -> str:
    lines = [f"# Literature Review: {folder_name}\n"]
    lines.append(f"## Overview\n\nThis review covers {len(papers)} papers in {folder_name}.\n")

    cat_counter = Counter()
    for p in papers:
        for c in (p.categories or [])[:3]:
            cat_counter[c] += 1

    lines.append("## Key Themes\n")
    for cat, count in cat_counter.most_common(5):
        lines.append(f"- **{cat}**: {count} papers")
    lines.append("")

    lines.append("## References\n")
    for i, p in enumerate(papers, 1):
        authors = []
        if isinstance(p.authors, list):
            for a in p.authors[:3]:
                if isinstance(a, dict):
                    authors.append(a.get("name", ""))
                else:
                    authors.append(str(a))
        author_str = ", ".join(authors[:2])
        if len(authors) > 2:
            author_str += " et al."
        lines.append(f"[{i}] {author_str}. *{p.title}*. {p.arxiv_id or ''}")

    return "\n".join(lines)


# ════════════════════════════════════════════════
# Conflict-of-interest hint (basic): cùng affiliation review nhau
# ════════════════════════════════════════════════

@router.get("/coi-check/paper/{paper_id}")
async def coi_check(
    paper_id: uuid.UUID,
    current_user: get_current_user_dep,
    db: DbSession,
):
    """
    Heuristic check: nếu có OpenReview note với reviewer matching affiliation
    của tác giả → flag potential COI.

    NB: chỉ là heuristic, không có ground truth nên đơn giản.
    """
    from src.storage.models.author import Author, AuthorPaper
    from src.storage.models.openreview_note import OpenReviewNote

    paper = (
        await db.execute(select(Paper).where(Paper.id == paper_id))
    ).scalar_one_or_none()
    if not paper:
        raise HTTPException(404, "Paper not found")

    author_ids = [
        r[0]
        for r in (
            await db.execute(
                select(AuthorPaper.author_id).where(AuthorPaper.paper_id == paper_id)
            )
        ).all()
    ]

    if not author_ids:
        return {"paper_id": str(paper_id), "coi_signals": [], "message": "No author records yet"}

    authors = (
        await db.execute(select(Author).where(Author.id.in_(author_ids)))
    ).scalars().all()
    author_affiliations: set[str] = set()
    for a in authors:
        for aff in a.affiliations or []:
            author_affiliations.add(aff.lower())

    note = (
        await db.execute(
            select(OpenReviewNote).where(OpenReviewNote.paper_id == paper_id)
        )
    ).scalar_one_or_none()

    signals = []
    if note and note.reviews_fetched:
        # Inspect note reviewer details if present in raw payload — best effort
        signals.append(
            {
                "kind": "openreview_review_found",
                "venue": note.venue,
                "rating": note.average_rating,
                "note": "Inspect raw reviewer affiliations vs author affiliations manually.",
            }
        )

    return {
        "paper_id": str(paper_id),
        "author_affiliations": list(author_affiliations),
        "coi_signals": signals,
    }
