"""
Personalization tasks — Phase 2.

3 tasks chính:
  1. generate_user_feeds        — chạy hàng ngày, tạo feed items cho tất cả users
  2. generate_user_digest_for   — chạy mỗi Chủ nhật, tạo digest cá nhân per-user
  3. run_saved_searches         — chạy hàng ngày, check saved searches có kết quả mới
"""
import asyncio
import json
from datetime import datetime, timedelta, date

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
# 1. GENERATE USER FEEDS (daily)
# ════════════════════════════════════════════════

@celery_app.task(name="src.workers.tasks.personalization.generate_all_user_feeds")
def generate_all_user_feeds():
    """
    Entry point: lấy tất cả users đã onboard, spawn sub-task cho từng user.
    Chạy hàng ngày lúc 7:00 SA.
    """
    _run_async(_dispatch_feed_tasks())


async def _dispatch_feed_tasks():
    from sqlalchemy import select
    from src.storage.database import create_async_session_factory
    from src.storage.models.user import User

    factory = create_async_session_factory()
    async with factory() as session:
        result = await session.execute(
            select(User.id).where(
                User.is_active == True,  # noqa: E712
                User.onboarding_completed == True,  # noqa: E712
                User.research_interests.isnot(None),
            )
        )
        user_ids = [str(row[0]) for row in result.all()]

    logger.info("Dispatching feed generation tasks", user_count=len(user_ids))
    for uid in user_ids:
        generate_feed_for_user.delay(uid)


@celery_app.task(name="src.workers.tasks.personalization.generate_feed_for_user")
def generate_feed_for_user(user_id: str):
    """Tạo feed items cho một user cụ thể."""
    _run_async(_generate_feed(user_id))


async def _generate_feed(user_id: str):
    """
    Embedding-based feed: dùng cosine similarity giữa user.research_interests
    (đã encode) và embeddings của papers/repos mới (đã có trong Qdrant).

    Fallback: nếu Qdrant chưa có hoặc embedding fail → category-based scoring.
    """
    import uuid
    from sqlalchemy import select
    from src.storage.database import create_async_session_factory
    from src.storage.models.user import User
    from src.storage.models.paper import Paper
    from src.storage.models.repository import Repository
    from src.storage.models.user_feed_item import UserFeedItem

    factory = create_async_session_factory()
    since = datetime.utcnow() - timedelta(days=2)  # window 48h

    async with factory() as session:
        result = await session.execute(select(User).where(User.id == user_id))
        user = result.scalar_one_or_none()
        if not user or not user.research_interests:
            return

        interests: list[str] = user.research_interests
        interests_text = ". ".join(interests) + ". " + (user.bio or "")

        # ── Bước 1: Encode interests thành 1 vector ──
        interest_vector = None
        try:
            from src.processors.embedding import EmbeddingGenerator
            gen = EmbeddingGenerator()
            running_loop = asyncio.get_running_loop()
            from functools import partial
            interest_vector = await running_loop.run_in_executor(
                None, partial(gen.embed, interests_text)
            )
        except Exception as e:
            logger.warning("Failed to embed user interests", user_id=user_id, error=str(e))

        new_feed_count = 0

        # ── Bước 2: Semantic match từ Qdrant ──
        if interest_vector:
            try:
                from src.storage.vector.qdrant_client import VectorStore
                vs = VectorStore()

                # Papers
                paper_hits = vs.search(
                    collection="papers", query_vector=interest_vector, limit=40
                )
                for hit in paper_hits:
                    score = hit.get("score", 0.0)
                    if score < 0.45:  # ngưỡng tối thiểu
                        continue
                    payload = hit.get("payload", {})

                    try:
                        paper_id = uuid.UUID(str(hit["id"]))
                    except Exception:
                        continue

                    # Verify paper trong window
                    paper = (
                        await session.execute(select(Paper).where(Paper.id == paper_id))
                    ).scalar_one_or_none()
                    if not paper or paper.created_at < since:
                        continue

                    # Dedup
                    existing = await session.execute(
                        select(UserFeedItem).where(
                            UserFeedItem.user_id == uuid.UUID(user_id),
                            UserFeedItem.item_id == paper.id,
                            UserFeedItem.item_type == "paper",
                        )
                    )
                    if existing.scalar_one_or_none():
                        continue

                    matched_interests = _match_interests_to_categories(
                        interests, paper.categories or []
                    )
                    feed_item = UserFeedItem(
                        user_id=uuid.UUID(user_id),
                        item_type="paper",
                        item_id=paper.id,
                        relevance_score=float(score),
                        reason=(
                            f"Semantic match (score {score:.2f}) with your interests: "
                            f"{', '.join(matched_interests[:2] or interests[:2])}"
                        ),
                        matched_interests=json.dumps(matched_interests or interests[:3]),
                    )
                    session.add(feed_item)
                    new_feed_count += 1

                # Repos
                repo_hits = vs.search(
                    collection="repositories", query_vector=interest_vector, limit=30
                )
                for hit in repo_hits:
                    score = hit.get("score", 0.0)
                    if score < 0.40:
                        continue

                    try:
                        repo_id = uuid.UUID(str(hit["id"]))
                    except Exception:
                        continue

                    repo = (
                        await session.execute(
                            select(Repository).where(Repository.id == repo_id)
                        )
                    ).scalar_one_or_none()
                    if not repo or repo.created_at < since:
                        continue

                    existing = await session.execute(
                        select(UserFeedItem).where(
                            UserFeedItem.user_id == uuid.UUID(user_id),
                            UserFeedItem.item_id == repo.id,
                            UserFeedItem.item_type == "repo",
                        )
                    )
                    if existing.scalar_one_or_none():
                        continue

                    feed_item = UserFeedItem(
                        user_id=uuid.UUID(user_id),
                        item_type="repo",
                        item_id=repo.id,
                        relevance_score=float(score),
                        reason=f"Semantic match (score {score:.2f}) with your interests",
                        matched_interests=json.dumps(interests[:3]),
                    )
                    session.add(feed_item)
                    new_feed_count += 1

                await session.commit()
                logger.info(
                    "Feed generated (semantic)",
                    user_id=user_id,
                    new_items=new_feed_count,
                )
                return
            except Exception as e:
                logger.warning("Vector feed failed, falling back to category", error=str(e))

        # ── Bước 3 (fallback): category-based ──
        interest_to_categories = _DEFAULT_INTEREST_CATEGORIES
        relevant_cats: set[str] = set()
        for interest in interests:
            for cat in interest_to_categories.get(interest, []):
                relevant_cats.add(cat)

        if relevant_cats:
            from sqlalchemy import or_
            cat_filters = [Paper.categories.any(c) for c in relevant_cats]
            papers_result = await session.execute(
                select(Paper)
                .where(Paper.created_at >= since, or_(*cat_filters))
                .order_by(Paper.created_at.desc())
                .limit(50)
            )
            for paper in papers_result.scalars().all():
                paper_cats = set(paper.categories or [])
                matched = paper_cats & relevant_cats
                if not matched:
                    continue
                score = min(1.0, len(matched) / max(len(relevant_cats), 1) * 2)
                matched_interests = _match_interests_to_categories(
                    interests, list(paper_cats)
                )

                existing = await session.execute(
                    select(UserFeedItem).where(
                        UserFeedItem.user_id == uuid.UUID(user_id),
                        UserFeedItem.item_id == paper.id,
                        UserFeedItem.item_type == "paper",
                    )
                )
                if existing.scalar_one_or_none():
                    continue

                feed_item = UserFeedItem(
                    user_id=uuid.UUID(user_id),
                    item_type="paper",
                    item_id=paper.id,
                    relevance_score=score,
                    reason=(
                        f"Matches your interest in {', '.join(matched_interests[:2])}"
                    ),
                    matched_interests=json.dumps(matched_interests),
                )
                session.add(feed_item)
                new_feed_count += 1

        await session.commit()
        logger.info("Feed generated (fallback)", user_id=user_id, new_items=new_feed_count)


_DEFAULT_INTEREST_CATEGORIES = {
    "Natural Language Processing": ["cs.CL", "cs.AI"],
    "Computer Vision": ["cs.CV", "cs.AI"],
    "Machine Learning": ["cs.LG", "stat.ML"],
    "Deep Learning": ["cs.LG", "cs.NE"],
    "Reinforcement Learning": ["cs.LG", "cs.AI"],
    "Robotics": ["cs.RO"],
    "Information Retrieval": ["cs.IR"],
    "Bioinformatics": ["cs.CE", "q-bio"],
    "Human-Computer Interaction": ["cs.HC"],
    "Computer Networks": ["cs.NI"],
    "Cybersecurity": ["cs.CR"],
    "Distributed Systems": ["cs.DC"],
    "Software Engineering": ["cs.SE"],
    "Data Science": ["cs.DB", "stat.ML"],
    "Computer Graphics": ["cs.GR"],
}


def _match_interests_to_categories(
    interests: list[str], paper_categories: list[str]
) -> list[str]:
    """Trả về interest labels match với categories của paper."""
    paper_cats_set = set(paper_categories)
    matched = []
    for interest in interests:
        interest_cats = set(_DEFAULT_INTEREST_CATEGORIES.get(interest, []))
        if interest_cats & paper_cats_set:
            matched.append(interest)
    return matched


# ════════════════════════════════════════════════
# 2. GENERATE USER WEEKLY DIGEST (Sunday)
# ════════════════════════════════════════════════

@celery_app.task(name="src.workers.tasks.personalization.generate_all_user_digests")
def generate_all_user_digests():
    """Entry point: dispatch digest tasks cho tất cả users đã onboard."""
    _run_async(_dispatch_digest_tasks())


async def _dispatch_digest_tasks():
    from sqlalchemy import select
    from src.storage.database import create_async_session_factory
    from src.storage.models.user import User

    factory = create_async_session_factory()
    async with factory() as session:
        result = await session.execute(
            select(User.id).where(
                User.is_active == True,  # noqa: E712
                User.onboarding_completed == True,  # noqa: E712
            )
        )
        user_ids = [str(row[0]) for row in result.all()]

    logger.info("Dispatching digest generation tasks", user_count=len(user_ids))
    for uid in user_ids:
        generate_user_digest_for.delay(uid)


@celery_app.task(name="src.workers.tasks.personalization.generate_user_digest_for")
def generate_user_digest_for(user_id: str):
    """Tạo weekly digest cá nhân cho một user."""
    _run_async(_generate_digest(user_id))


async def _generate_digest(user_id: str):
    import uuid
    from sqlalchemy import select, or_, func
    from src.storage.database import create_async_session_factory
    from src.storage.models.user import User
    from src.storage.models.paper import Paper
    from src.storage.models.repository import Repository
    from src.storage.models.bookmark import Bookmark
    from src.storage.models.saved_search import SavedSearch
    from src.storage.models.user_weekly_digest import UserWeeklyDigest

    factory = create_async_session_factory()
    period_end = date.today()
    period_start = period_end - timedelta(days=7)
    since = datetime.combine(period_start, datetime.min.time())

    # Map interests → categories (giống _generate_feed)
    interest_to_categories = {
        "Natural Language Processing": ["cs.CL", "cs.AI"],
        "Computer Vision": ["cs.CV", "cs.AI"],
        "Machine Learning": ["cs.LG", "stat.ML"],
        "Deep Learning": ["cs.LG", "cs.NE"],
        "Reinforcement Learning": ["cs.LG", "cs.AI"],
        "Robotics": ["cs.RO"],
        "Information Retrieval": ["cs.IR"],
        "Bioinformatics": ["cs.CE", "q-bio"],
        "Human-Computer Interaction": ["cs.HC"],
        "Computer Networks": ["cs.NI"],
        "Cybersecurity": ["cs.CR"],
        "Distributed Systems": ["cs.DC"],
        "Software Engineering": ["cs.SE"],
        "Data Science": ["cs.DB", "stat.ML"],
        "Computer Graphics": ["cs.GR"],
    }

    async with factory() as session:
        result = await session.execute(select(User).where(User.id == user_id))
        user = result.scalar_one_or_none()
        if not user:
            return

        interests = user.research_interests or []
        relevant_cats: set[str] = set()
        for interest in interests:
            for cat in interest_to_categories.get(interest, []):
                relevant_cats.add(cat)

        # ── Papers mới trong tuần khớp interests ──
        papers_data = []
        if relevant_cats:
            from sqlalchemy import or_
            cat_filters = [Paper.categories.any(c) for c in relevant_cats]
            pr = await session.execute(
                select(Paper)
                .where(Paper.created_at >= since, or_(*cat_filters))
                .order_by(Paper.citation_count.desc(), Paper.created_at.desc())
                .limit(10)
            )
            for p in pr.scalars().all():
                p_cats = set(p.categories or [])
                matched = [i for i in interests if set(interest_to_categories.get(i, [])) & p_cats]
                score = min(1.0, len(p_cats & relevant_cats) / max(len(relevant_cats), 1) * 2)
                papers_data.append({
                    "id": str(p.id),
                    "title": p.title,
                    "arxiv_id": p.arxiv_id,
                    "categories": p.categories[:3] if p.categories else [],
                    "relevance_score": round(score, 2),
                    "matched_interests": matched,
                    "source_url": p.source_url,
                })

        # ── Repos mới trong tuần ──
        repos_data = []
        interest_keywords = [i.lower().replace(" ", "-") for i in interests]
        rr = await session.execute(
            select(Repository)
            .where(Repository.created_at >= since)
            .order_by(Repository.stars_count.desc())
            .limit(50)
        )
        for repo in rr.scalars().all():
            repo_topics = [t.lower() for t in (repo.topics or [])]
            repo_desc = (repo.description or "").lower()
            matched_kws = [kw for kw in interest_keywords if kw in repo_topics or kw in repo_desc]
            if not matched_kws:
                continue
            matched_interests_repo = [
                i for i in interests
                if i.lower().replace(" ", "-") in matched_kws
            ]
            repos_data.append({
                "id": str(repo.id),
                "full_name": repo.full_name,
                "description": repo.description or "",
                "stars_count": repo.stars_count or 0,
                "primary_language": repo.primary_language,
                "relevance_score": min(1.0, len(matched_kws) / 3),
                "matched_interests": matched_interests_repo or interests[:2],
            })
            if len(repos_data) >= 5:
                break

        # ── Unread bookmarks (reminder) ──
        uid = uuid.UUID(user_id)
        br = await session.execute(
            select(Bookmark)
            .where(
                Bookmark.user_id == uid,
                Bookmark.reading_status == "saved",
            )
            .order_by(Bookmark.created_at.asc())
            .limit(5)
        )
        unread_bmarks = [
            {"id": str(b.id), "item_type": b.item_type, "item_id": str(b.item_id)}
            for b in br.scalars().all()
        ]

        # ── Saved searches với kết quả mới ──
        sr = await session.execute(
            select(SavedSearch).where(
                SavedSearch.user_id == uid,
                SavedSearch.is_active == True,  # noqa: E712
                SavedSearch.new_results_since_last_view > 0,
            )
        )
        ss_updates = [
            {
                "id": str(s.id),
                "name": s.name,
                "query": s.query,
                "new_results": s.new_results_since_last_view,
            }
            for s in sr.scalars().all()
        ]

        # ── LLM: tạo highlights và summary ──
        highlights = []
        content_md = ""
        try:
            from src.core.config import get_settings
            from src.llm.ollama_client import OllamaClient
            settings = get_settings()
            llm = OllamaClient(base_url=settings.LOCAL_LLM_URL, model=settings.LOCAL_LLM_MODEL)

            papers_summary = "\n".join(
                f"- {p['title']} [{', '.join(p['categories'])}]" for p in papers_data[:5]
            ) or "No new papers this week."

            repos_summary = "\n".join(
                f"- {r['full_name']} ({r['primary_language'] or 'N/A'}): {r['stars_count']} stars"
                for r in repos_data[:3]
            ) or "No new repos this week."

            interests_str = ", ".join(interests) if interests else "General AI/ML"
            affiliation = user.affiliation or ""
            position = user.position or ""
            role_ctx = f"{position} at {affiliation}" if affiliation else position or "researcher"

            prompt = f"""Generate a personalized weekly research digest for a {role_ctx} whose research interests are: {interests_str}.

Period: {period_start} to {period_end}

New Papers in your research areas ({len(papers_data)} papers):
{papers_summary}

New Repositories in your areas ({len(repos_data)} repos):
{repos_summary}

You MUST respond with valid JSON only (no markdown, no explanation):
{{
  "highlights": ["key highlight 1", "key highlight 2", "key highlight 3"],
  "content_md": "A personalized markdown digest (200-400 words) addressing this specific researcher's interests"
}}
Rules:
- "highlights" must be 2-4 short strings, each directly relevant to the user's interests
- "content_md" must reference their specific interests ({interests_str}) and be written to them personally
"""
            response = await llm.generate_json(prompt, max_tokens=1500, temperature=0.5)
            highlights = response.get("highlights", [])[:5]
            content_md = response.get("content_md", "")
        except Exception as e:
            logger.warning("LLM digest generation failed", error=str(e))
            highlights = [
                f"{len(papers_data)} new papers in your research areas this week",
                f"{len(repos_data)} new relevant repositories",
                f"{len(unread_bmarks)} unread bookmarks waiting for you",
            ]
            content_md = f"# Weekly Digest: {period_start} to {period_end}\n\n"
            if papers_data:
                content_md += f"## New Papers ({len(papers_data)})\n"
                for p in papers_data[:5]:
                    content_md += f"- **{p['title']}** `[{', '.join(p['categories'][:2])}]`\n"
            if repos_data:
                content_md += f"\n## New Repositories ({len(repos_data)})\n"
                for r in repos_data[:3]:
                    content_md += f"- **{r['full_name']}** ⭐ {r['stars_count']:,}\n"

        # ── Lưu digest ──
        digest = UserWeeklyDigest(
            user_id=uid,
            period_start=period_start,
            period_end=period_end,
            new_papers_in_interests=papers_data,
            new_papers_count=len(papers_data),
            new_repos_in_interests=repos_data,
            new_repos_count=len(repos_data),
            unread_bookmarks=unread_bmarks,
            unread_bookmarks_count=len(unread_bmarks),
            saved_search_updates=ss_updates if ss_updates else None,
            highlights=highlights,
            content_md=content_md,
        )
        session.add(digest)
        await session.commit()
        logger.info("User digest generated", user_id=user_id, papers=len(papers_data), repos=len(repos_data))


# ════════════════════════════════════════════════
# 3. RUN SAVED SEARCHES (daily)
# ════════════════════════════════════════════════

@celery_app.task(name="src.workers.tasks.personalization.run_all_saved_searches")
def run_all_saved_searches():
    """Chạy lại tất cả active saved searches, cập nhật new_results_since_last_view."""
    _run_async(_run_saved_searches())


async def _run_saved_searches():
    from functools import partial
    from sqlalchemy import select, update
    from src.storage.database import create_async_session_factory
    from src.storage.models.saved_search import SavedSearch

    factory = create_async_session_factory()
    async with factory() as session:
        result = await session.execute(
            select(SavedSearch).where(SavedSearch.is_active == True)  # noqa: E712
        )
        searches = result.scalars().all()

        updated = 0
        for s in searches:
            try:
                from src.processors.embedding import EmbeddingGenerator
                from src.storage.vector.qdrant_client import VectorStore

                gen = EmbeddingGenerator()
                # Use get_running_loop() — we are already inside an async context
                running_loop = asyncio.get_running_loop()
                embedding = await running_loop.run_in_executor(
                    None, partial(gen.embed, s.query)
                )

                filters = s.filters or {}
                item_type = filters.get("type")
                collections = (
                    ["papers"] if item_type == "paper"
                    else ["repositories"] if item_type in ("repo", "repository")
                    else ["papers", "repositories"]
                )

                total_hits = 0
                vs = VectorStore()
                for col in collections:
                    try:
                        hits = vs.search(collection=col, query_vector=embedding, limit=20)
                        total_hits += len(hits)
                    except Exception:
                        pass  # Collection may not exist yet

                prev_count = s.last_result_count or 0
                # Only increment new_results when the count grew
                new_delta = max(0, total_hits - prev_count)

                await session.execute(
                    update(SavedSearch)
                    .where(SavedSearch.id == s.id)
                    .values(
                        last_run_at=datetime.utcnow(),
                        last_result_count=total_hits,
                        new_results_since_last_view=(
                            (s.new_results_since_last_view or 0) + new_delta
                        ),
                    )
                )
                updated += 1
            except Exception as e:
                logger.warning("Failed to run saved search", search_id=str(s.id), error=str(e))

        await session.commit()
        logger.info("Saved searches updated", count=updated)
