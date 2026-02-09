import uuid
from datetime import date, timedelta

from sqlalchemy import and_, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from src.storage.models.metrics import MetricsHistory, TrendingScore
from src.storage.models.paper import Paper
from src.storage.models.repository import Repository


class MetricsRepository:
    def __init__(self, session: AsyncSession):
        self.session = session

    async def get_history(
        self,
        entity_type: str,
        entity_id: uuid.UUID,
        days: int = 30,
    ) -> list[MetricsHistory]:
        cutoff = date.today() - timedelta(days=days)
        result = await self.session.execute(
            select(MetricsHistory)
            .where(
                and_(
                    MetricsHistory.entity_type == entity_type,
                    MetricsHistory.entity_id == entity_id,
                    MetricsHistory.recorded_at >= cutoff,
                )
            )
            .order_by(MetricsHistory.recorded_at.asc())
        )
        return list(result.scalars().all())

    async def record_metrics(
        self,
        entity_type: str,
        entity_id: uuid.UUID,
        metrics: dict,
        recorded_at: date | None = None,
    ) -> MetricsHistory:
        record = MetricsHistory(
            entity_type=entity_type,
            entity_id=entity_id,
            metrics=metrics,
            recorded_at=recorded_at or date.today(),
        )
        self.session.add(record)
        await self.session.flush()
        return record

    async def upsert_daily_snapshot(
        self,
        entity_type: str,
        entity_id: uuid.UUID,
        metrics: dict,
    ) -> MetricsHistory:
        """Record or update today's snapshot, and compute velocity fields."""
        today = date.today()

        # Check if today's snapshot already exists
        result = await self.session.execute(
            select(MetricsHistory).where(
                and_(
                    MetricsHistory.entity_type == entity_type,
                    MetricsHistory.entity_id == entity_id,
                    MetricsHistory.recorded_at == today,
                )
            )
        )
        existing = result.scalar_one_or_none()

        # Calculate velocities from historical data
        velocity_1d = await self._calc_velocity(entity_type, entity_id, days=1, current_metrics=metrics)
        velocity_7d = await self._calc_velocity(entity_type, entity_id, days=7, current_metrics=metrics)
        velocity_30d = await self._calc_velocity(entity_type, entity_id, days=30, current_metrics=metrics)

        if existing:
            existing.metrics = metrics
            existing.velocity_1d = velocity_1d
            existing.velocity_7d = velocity_7d
            existing.velocity_30d = velocity_30d
            await self.session.flush()
            return existing

        record = MetricsHistory(
            entity_type=entity_type,
            entity_id=entity_id,
            metrics=metrics,
            recorded_at=today,
            velocity_1d=velocity_1d,
            velocity_7d=velocity_7d,
            velocity_30d=velocity_30d,
        )
        self.session.add(record)
        await self.session.flush()
        return record

    async def _calc_velocity(
        self,
        entity_type: str,
        entity_id: uuid.UUID,
        days: int,
        current_metrics: dict,
    ) -> float | None:
        """Calculate star velocity (stars gained per day) over a period."""
        target_date = date.today() - timedelta(days=days)
        result = await self.session.execute(
            select(MetricsHistory)
            .where(
                and_(
                    MetricsHistory.entity_type == entity_type,
                    MetricsHistory.entity_id == entity_id,
                    MetricsHistory.recorded_at <= target_date,
                )
            )
            .order_by(MetricsHistory.recorded_at.desc())
            .limit(1)
        )
        old = result.scalar_one_or_none()
        if not old:
            return None

        old_stars = old.metrics.get("stars_count", 0)
        new_stars = current_metrics.get("stars_count", 0)
        actual_days = (date.today() - old.recorded_at).days
        if actual_days == 0:
            return None
        return (new_stars - old_stars) / actual_days

    async def get_trending(
        self,
        entity_type: str | None = None,
        category: str | None = None,
        skip: int = 0,
        limit: int = 20,
    ) -> tuple[list[TrendingScore], int]:
        base_query = select(TrendingScore)

        filters = []
        if entity_type:
            filters.append(TrendingScore.entity_type == entity_type)
        if category:
            filters.append(TrendingScore.category == category)
        if filters:
            base_query = base_query.where(and_(*filters))

        count_result = await self.session.execute(
            select(func.count()).select_from(base_query.subquery())
        )
        total = count_result.scalar() or 0

        query = base_query.order_by(TrendingScore.total_score.desc()).offset(skip).limit(limit)
        result = await self.session.execute(query)
        return list(result.scalars().all()), total

    async def get_trending_papers_with_search(
        self,
        category: str | None = None,
        search: str | None = None,
        skip: int = 0,
        limit: int = 20,
    ) -> tuple[list[tuple[TrendingScore, Paper]], int]:
        """Get trending papers joined with Paper for search filtering."""
        from sqlalchemy import or_

        base_query = (
            select(TrendingScore, Paper)
            .join(Paper, TrendingScore.entity_id == Paper.id)
            .where(TrendingScore.entity_type == "paper")
        )

        if category:
            base_query = base_query.where(TrendingScore.category == category)
        if search:
            search_filter = f"%{search}%"
            base_query = base_query.where(
                or_(
                    Paper.title.ilike(search_filter),
                    Paper.abstract.ilike(search_filter),
                    Paper.arxiv_id.ilike(search_filter),
                )
            )

        count_result = await self.session.execute(
            select(func.count()).select_from(base_query.subquery())
        )
        total = count_result.scalar() or 0

        query = base_query.order_by(TrendingScore.total_score.desc()).offset(skip).limit(limit)
        result = await self.session.execute(query)
        rows = result.all()
        return rows, total

    async def get_trending_with_language(
        self,
        language: str | None = None,
        topics: list[str] | None = None,
        search: str | None = None,
        skip: int = 0,
        limit: int = 20,
    ) -> tuple[list[tuple[TrendingScore, Repository]], int]:
        """Get trending repos joined with Repository for language/topic/search filtering."""
        base_query = (
            select(TrendingScore, Repository)
            .join(Repository, TrendingScore.entity_id == Repository.id)
            .where(TrendingScore.entity_type == "repository")
        )

        if language:
            base_query = base_query.where(Repository.primary_language == language)
        if topics:
            for t in topics:
                base_query = base_query.where(Repository.topics.any(t))
        if search:
            search_filter = f"%{search}%"
            from sqlalchemy import or_
            base_query = base_query.where(
                or_(
                    Repository.full_name.ilike(search_filter),
                    Repository.description.ilike(search_filter),
                )
            )

        count_result = await self.session.execute(
            select(func.count()).select_from(base_query.subquery())
        )
        total = count_result.scalar() or 0

        query = base_query.order_by(TrendingScore.total_score.desc()).offset(skip).limit(limit)
        result = await self.session.execute(query)
        rows = result.all()
        return rows, total

    async def get_trending_filters(self) -> dict:
        """Get distinct categories and languages available in trending data."""
        # Distinct categories from papers
        cat_result = await self.session.execute(
            select(TrendingScore.category)
            .where(
                and_(
                    TrendingScore.entity_type == "paper",
                    TrendingScore.category.isnot(None),
                )
            )
            .distinct()
        )
        categories = sorted([r[0] for r in cat_result.all()])

        # Distinct languages from repos via join
        lang_result = await self.session.execute(
            select(Repository.primary_language)
            .join(TrendingScore, TrendingScore.entity_id == Repository.id)
            .where(
                and_(
                    TrendingScore.entity_type == "repository",
                    Repository.primary_language.isnot(None),
                )
            )
            .distinct()
        )
        languages = sorted([r[0] for r in lang_result.all()])

        # Distinct topics from repos via join + unnest
        topic_result = await self.session.execute(
            select(func.unnest(Repository.topics).label("topic"))
            .join(TrendingScore, TrendingScore.entity_id == Repository.id)
            .where(
                and_(
                    TrendingScore.entity_type == "repository",
                    Repository.topics.isnot(None),
                )
            )
            .distinct()
        )
        topics = sorted([r[0] for r in topic_result.all()])

        return {"categories": categories, "languages": languages, "topics": topics}

    async def upsert_trending_score(self, score_data: dict) -> TrendingScore:
        existing = await self.session.execute(
            select(TrendingScore).where(
                and_(
                    TrendingScore.entity_type == score_data["entity_type"],
                    TrendingScore.entity_id == score_data["entity_id"],
                    TrendingScore.period_start == score_data["period_start"],
                )
            )
        )
        existing_score = existing.scalar_one_or_none()

        if existing_score:
            for key, value in score_data.items():
                setattr(existing_score, key, value)
            await self.session.flush()
            return existing_score

        score = TrendingScore(**score_data)
        self.session.add(score)
        await self.session.flush()
        return score
