"""
OSINT intelligence tasks.

  1. compute_paper_signals      — tổng hợp buzz_score đa nguồn, daily
  2. build_author_profiles      — extract authors từ papers, daily
  3. update_concept_trends      — keyword frequency time series, weekly
"""
import asyncio
import math
import re
import uuid
from collections import Counter, defaultdict
from datetime import date, datetime, timedelta

from src.core.logging import get_logger
from src.workers.celery_app import celery_app

logger = get_logger(__name__)


def _run_async(coro):
    loop = asyncio.new_event_loop()
    try:
        return loop.run_until_complete(coro)
    finally:
        loop.close()


# ════════════════════════════════════════════════
# 1. Compute paper signals (cross-source buzz score)
# ════════════════════════════════════════════════

@celery_app.task(name="src.workers.tasks.intelligence.compute_paper_signals")
def compute_paper_signals():
    return _run_async(_compute_signals())


async def _compute_signals():
    """
    Cho mọi paper được create trong 30 ngày qua, tổng hợp signal:
      - HF Daily papers upvotes
      - Hacker News score (nếu URL chứa arxiv_id)
      - GitHub repos liên kết qua paper_repo_links
      - OpenReview rating
      - Citation count

    buzz_score = w1 * log(citations+1)
                + w2 * log(hn_score+1)
                + w3 * log(hf_upvotes+1)
                + w4 * log(repo_stars+1)
                + w5 * (openreview_rating / 10)
    """
    from sqlalchemy import select, or_, and_
    from sqlalchemy.dialects.postgresql import insert

    from src.storage.database import create_async_session_factory
    from src.storage.models.paper import Paper
    from src.storage.models.hf_paper import HFPaper
    from src.storage.models.community_post import CommunityPost
    from src.storage.models.openreview_note import OpenReviewNote
    from src.storage.models.paper_signal import PaperSignal
    from src.storage.models.link import PaperRepoLink
    from src.storage.models.repository import Repository

    factory = create_async_session_factory()
    cutoff = datetime.utcnow() - timedelta(days=30)

    async with factory() as session:
        papers = (
            await session.execute(
                select(Paper).where(Paper.created_at >= cutoff).limit(2000)
            )
        ).scalars().all()

        if not papers:
            logger.info("No recent papers to compute signals for")
            return

        # Build lookups (one query per source)
        arxiv_ids = [p.arxiv_id for p in papers if p.arxiv_id]
        paper_ids = [p.id for p in papers]

        # HF papers by arxiv_id
        hf_map: dict[str, int] = {}
        if arxiv_ids:
            hf_rows = (
                await session.execute(
                    select(HFPaper).where(HFPaper.arxiv_id.in_(arxiv_ids))
                )
            ).scalars().all()
            for h in hf_rows:
                hf_map[h.arxiv_id] = h.upvotes or 0

        # OpenReview by paper_id
        or_map: dict[uuid.UUID, float] = {}
        or_rows = (
            await session.execute(
                select(OpenReviewNote).where(OpenReviewNote.paper_id.in_(paper_ids))
            )
        ).scalars().all()
        for n in or_rows:
            if n.paper_id and n.average_rating:
                or_map[n.paper_id] = n.average_rating

        # PaperRepoLink → repos
        link_map: dict[uuid.UUID, list[uuid.UUID]] = defaultdict(list)
        link_rows = (
            await session.execute(
                select(PaperRepoLink).where(PaperRepoLink.paper_id.in_(paper_ids))
            )
        ).scalars().all()
        for l in link_rows:
            link_map[l.paper_id].append(l.repo_id)

        repo_ids_all = {r for ids in link_map.values() for r in ids}
        repo_stars_map: dict[uuid.UUID, int] = {}
        if repo_ids_all:
            repo_rows = (
                await session.execute(
                    select(Repository.id, Repository.stars_count).where(
                        Repository.id.in_(repo_ids_all)
                    )
                )
            ).all()
            for rid, stars in repo_rows:
                repo_stars_map[rid] = stars or 0

        # HN/community posts by URL substring (loose match)
        # Build set of arxiv_ids for fuzzy match
        hn_score_map: dict[str, int] = {}
        hn_comments_map: dict[str, int] = {}
        if arxiv_ids:
            hn_rows = (
                await session.execute(
                    select(CommunityPost).where(
                        CommunityPost.platform == "hackernews",
                        CommunityPost.published_at >= cutoff,
                    )
                )
            ).scalars().all()
            for post in hn_rows:
                text = ((post.url or "") + " " + (post.title or "") + " " + (post.body or ""))
                for aid in arxiv_ids:
                    if aid and aid in text:
                        hn_score_map[aid] = max(hn_score_map.get(aid, 0), post.score or 0)
                        hn_comments_map[aid] = max(
                            hn_comments_map.get(aid, 0), post.comments_count or 0
                        )
                        break

        # ── Compute scores ──
        upserted = 0
        previous_signals: dict[uuid.UUID, float] = {}

        # Lookup previous score for velocity calculation
        prev_rows = (
            await session.execute(
                select(PaperSignal.paper_id, PaperSignal.buzz_score).where(
                    PaperSignal.paper_id.in_(paper_ids)
                )
            )
        ).all()
        for pid, score in prev_rows:
            previous_signals[pid] = float(score or 0)

        for paper in papers:
            hf_up = hf_map.get(paper.arxiv_id or "", 0)
            hn_s = hn_score_map.get(paper.arxiv_id or "", 0)
            hn_c = hn_comments_map.get(paper.arxiv_id or "", 0)
            or_rating = or_map.get(paper.id)
            citations = paper.citation_count or 0

            linked_repos = link_map.get(paper.id, [])
            total_stars = sum(repo_stars_map.get(r, 0) for r in linked_repos)

            buzz = (
                1.5 * math.log1p(citations)
                + 1.0 * math.log1p(hn_s)
                + 1.2 * math.log1p(hf_up)
                + 0.8 * math.log1p(total_stars)
                + (0.3 * (or_rating / 10.0) if or_rating else 0)
                + 0.4 * math.log1p(hn_c)
            )

            prev = previous_signals.get(paper.id, 0.0)
            velocity = buzz - prev

            breakdown = {
                "citations": citations,
                "hf_upvotes": hf_up,
                "hn_score": hn_s,
                "hn_comments": hn_c,
                "repo_stars": total_stars,
                "repo_count": len(linked_repos),
                "openreview_rating": or_rating,
            }

            # Upsert (ON CONFLICT)
            stmt = insert(PaperSignal).values(
                paper_id=paper.id,
                arxiv_present=bool(paper.arxiv_id),
                hf_upvotes=hf_up,
                hn_score=hn_s,
                hn_comments=hn_c,
                github_repo_stars=total_stars,
                github_repo_count=len(linked_repos),
                openreview_rating=or_rating,
                citation_count=citations,
                buzz_score=buzz,
                buzz_velocity=velocity,
                source_breakdown=breakdown,
                computed_at=datetime.utcnow(),
            )
            stmt = stmt.on_conflict_do_update(
                index_elements=["paper_id"],
                set_={
                    "hf_upvotes": stmt.excluded.hf_upvotes,
                    "hn_score": stmt.excluded.hn_score,
                    "hn_comments": stmt.excluded.hn_comments,
                    "github_repo_stars": stmt.excluded.github_repo_stars,
                    "github_repo_count": stmt.excluded.github_repo_count,
                    "openreview_rating": stmt.excluded.openreview_rating,
                    "citation_count": stmt.excluded.citation_count,
                    "buzz_score": stmt.excluded.buzz_score,
                    "buzz_velocity": stmt.excluded.buzz_velocity,
                    "source_breakdown": stmt.excluded.source_breakdown,
                    "computed_at": stmt.excluded.computed_at,
                },
            )
            await session.execute(stmt)
            upserted += 1

        await session.commit()
        logger.info("Paper signals computed", count=upserted)


# ════════════════════════════════════════════════
# 2. Build author profiles
# ════════════════════════════════════════════════

@celery_app.task(name="src.workers.tasks.intelligence.build_author_profiles")
def build_author_profiles():
    return _run_async(_build_authors())


def _normalize_name(name: str) -> str:
    """Normalize tên cho lookup: lowercase, strip whitespace, remove diacritics."""
    import unicodedata
    s = unicodedata.normalize("NFKD", name).encode("ascii", "ignore").decode("ascii")
    s = re.sub(r"\s+", " ", s.lower()).strip()
    return s


async def _build_authors():
    """
    Quét papers, extract authors, tạo/update Author records và link AuthorPaper.
    """
    from sqlalchemy import select
    from sqlalchemy.dialects.postgresql import insert
    from src.storage.database import create_async_session_factory
    from src.storage.models.author import Author, AuthorPaper
    from src.storage.models.paper import Paper

    factory = create_async_session_factory()
    cutoff = datetime.utcnow() - timedelta(days=14)

    async with factory() as session:
        papers = (
            await session.execute(
                select(Paper).where(Paper.created_at >= cutoff).limit(5000)
            )
        ).scalars().all()

        # Track aggregations per author
        author_metrics: dict[str, dict] = defaultdict(lambda: {
            "name": "",
            "ss_id": None,
            "papers": [],
            "citations": 0,
            "topics": Counter(),
            "affiliations": set(),
        })

        for paper in papers:
            authors_raw = paper.authors or []
            if not isinstance(authors_raw, list):
                continue

            for pos, a in enumerate(authors_raw):
                if isinstance(a, dict):
                    name = a.get("name") or ""
                    ss_id = a.get("authorId") or a.get("semantic_scholar_id")
                    aff = a.get("affiliations") or []
                else:
                    name = str(a)
                    ss_id = None
                    aff = []

                name = name.strip()
                if not name or len(name) < 3:
                    continue

                norm = _normalize_name(name)
                bucket = author_metrics[norm]
                bucket["name"] = name
                if ss_id and not bucket["ss_id"]:
                    bucket["ss_id"] = ss_id
                bucket["papers"].append((paper.id, pos))
                bucket["citations"] += paper.citation_count or 0
                for cat in (paper.categories or [])[:3]:
                    bucket["topics"][cat] += 1
                if isinstance(aff, list):
                    for a in aff:
                        if a:
                            bucket["affiliations"].add(str(a)[:255])

        upserted = 0
        for norm, bucket in author_metrics.items():
            # Upsert author
            top_topics = [t for t, _ in bucket["topics"].most_common(5)]
            stmt = insert(Author).values(
                id=uuid.uuid4(),
                name=bucket["name"],
                normalized_name=norm,
                semantic_scholar_id=bucket["ss_id"],
                affiliations=list(bucket["affiliations"])[:5] or None,
                topics=top_topics or None,
                citation_count=bucket["citations"],
                paper_count=len(bucket["papers"]),
            )
            stmt = stmt.on_conflict_do_update(
                index_elements=["normalized_name"],
                set_={
                    "name": stmt.excluded.name,
                    "topics": stmt.excluded.topics,
                    "affiliations": stmt.excluded.affiliations,
                    "citation_count": stmt.excluded.citation_count,
                    "paper_count": stmt.excluded.paper_count,
                    "updated_at": datetime.utcnow(),
                },
            )
            try:
                await session.execute(stmt)
            except Exception as e:
                logger.warning("Author upsert failed", name=bucket["name"], error=str(e))
                continue

            # Lookup author id
            row = (
                await session.execute(
                    select(Author.id).where(Author.normalized_name == norm)
                )
            ).first()
            if not row:
                continue
            author_id = row[0]

            # Link AuthorPaper (idempotent)
            for paper_id, pos in bucket["papers"]:
                ap_stmt = insert(AuthorPaper).values(
                    author_id=author_id,
                    paper_id=paper_id,
                    position=pos,
                )
                ap_stmt = ap_stmt.on_conflict_do_nothing(
                    index_elements=["author_id", "paper_id"]
                )
                try:
                    await session.execute(ap_stmt)
                except Exception:
                    pass

            upserted += 1

        await session.commit()
        logger.info("Authors built", count=upserted)


# ════════════════════════════════════════════════
# 3. Concept trends (keyword frequency time series)
# ════════════════════════════════════════════════

@celery_app.task(name="src.workers.tasks.intelligence.update_concept_trends")
def update_concept_trends():
    return _run_async(_compute_trends())


# Stop-words cho extraction
_STOPWORDS = {
    "the", "a", "an", "and", "or", "but", "of", "to", "in", "on", "for", "with",
    "as", "by", "is", "are", "was", "were", "be", "been", "being", "from",
    "this", "that", "these", "those", "we", "our", "their", "they", "it",
    "based", "using", "novel", "new", "model", "models", "method", "methods",
    "approach", "approaches", "paper", "study", "show", "results", "result",
    "task", "tasks", "data", "datasets", "dataset", "use", "used", "uses",
}


def _extract_terms(text: str, n: int = 2) -> list[str]:
    """Extract bi-gram terms từ title/abstract — đơn giản hoá BERTopic."""
    if not text:
        return []
    text = text.lower()
    text = re.sub(r"[^a-z\s\-]", " ", text)
    words = [w for w in text.split() if len(w) > 2 and w not in _STOPWORDS]
    if not words:
        return []
    bigrams = [f"{words[i]} {words[i+1]}" for i in range(len(words) - 1)]
    return words + bigrams


async def _compute_trends():
    from sqlalchemy import select
    from src.storage.database import create_async_session_factory
    from src.storage.models.paper import Paper
    from src.storage.models.concept_trend import ConceptTrend

    factory = create_async_session_factory()
    today = date.today()
    weeks_back = 8

    async with factory() as session:
        # Build time-series: với mỗi tuần trong 8 tuần, count terms
        weekly_counts: dict[str, dict[date, int]] = defaultdict(dict)

        for w in range(weeks_back):
            period_end_w = today - timedelta(weeks=w)
            period_start_w = period_end_w - timedelta(days=7)

            papers = (
                await session.execute(
                    select(Paper.title, Paper.abstract).where(
                        Paper.published_date >= period_start_w,
                        Paper.published_date < period_end_w,
                    )
                    .limit(3000)
                )
            ).all()

            term_counts: Counter = Counter()
            for title, abstract in papers:
                terms = _extract_terms((title or "") + " " + (abstract or "")[:500])
                # Chỉ count distinct terms per paper
                for t in set(terms):
                    term_counts[t] += 1

            # Chỉ giữ top 500 terms để giới hạn DB write
            for term, c in term_counts.most_common(500):
                weekly_counts[term][period_end_w] = c

        # Compute growth rate cho mỗi term
        period_end = today
        period_start = today - timedelta(days=7)
        last_week = today
        prev_week = today - timedelta(weeks=1)

        upserted = 0
        for term, weekly_data in weekly_counts.items():
            current_count = weekly_data.get(last_week, 0)
            previous_count = weekly_data.get(prev_week, 0)

            if current_count < 3:
                continue  # Bỏ qua noise

            if previous_count == 0:
                growth_rate = 1.0 if current_count >= 5 else 0.5
            else:
                growth_rate = (current_count - previous_count) / previous_count

            # Phân loại status
            if current_count >= 20 and growth_rate > 0.5:
                status = "hot"
            elif growth_rate > 0.3:
                status = "rising"
            elif growth_rate < -0.3:
                status = "declining"
            elif current_count < 5:
                status = "stale"
            else:
                status = "stable"

            data_points = [
                {"week": str(d), "count": c}
                for d, c in sorted(weekly_data.items())
            ]

            normalized = term.lower().strip()

            # Upsert (idempotent on concept+period_end)
            from sqlalchemy.dialects.postgresql import insert
            stmt = insert(ConceptTrend).values(
                id=uuid.uuid4(),
                concept=term,
                normalized_concept=normalized,
                period_start=period_start,
                period_end=period_end,
                paper_count=current_count,
                growth_rate=growth_rate,
                status=status,
                data_points=data_points,
                computed_at=datetime.utcnow(),
            )
            await session.execute(stmt)
            upserted += 1

        await session.commit()
        logger.info("Concept trends computed", count=upserted)
