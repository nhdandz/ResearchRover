import uuid
from datetime import date, timedelta

from sqlalchemy import and_, case, func, literal_column, or_, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from src.storage.models.paper import Paper


class PaperRepository:
    def __init__(self, session: AsyncSession):
        self.session = session

    async def get_by_id(self, paper_id: uuid.UUID) -> Paper | None:
        result = await self.session.execute(select(Paper).where(Paper.id == paper_id))
        return result.scalar_one_or_none()

    async def get_by_arxiv_id(self, arxiv_id: str) -> Paper | None:
        result = await self.session.execute(
            select(Paper).where(Paper.arxiv_id == arxiv_id)
        )
        return result.scalar_one_or_none()

    def _build_filters(
        self,
        category: str | None = None,
        topic: str | None = None,
        date_from: date | None = None,
        date_to: date | None = None,
        has_code: bool | None = None,
        is_vietnamese: bool | None = None,
        search: str | None = None,
        source: str | None = None,
    ) -> list:
        filters = []
        if category:
            cats = [c.strip() for c in category.split(",") if c.strip()]
            if len(cats) == 1:
                filters.append(Paper.categories.any(cats[0]))
            elif len(cats) > 1:
                filters.append(or_(*(Paper.categories.any(c) for c in cats)))
        if topic:
            topics = [t.strip() for t in topic.split(",") if t.strip()]
            if len(topics) == 1:
                filters.append(Paper.topics.any(topics[0]))
            elif len(topics) > 1:
                filters.append(or_(*(Paper.topics.any(t) for t in topics)))
        if date_from:
            filters.append(Paper.published_date >= date_from)
        if date_to:
            filters.append(Paper.published_date <= date_to)
        if is_vietnamese is not None:
            filters.append(Paper.is_vietnamese == is_vietnamese)
        if has_code is not None:
            filters.append(Paper.is_relevant == has_code)
        if source:
            filters.append(Paper.source == source)
        if search:
            term = f"%{search}%"
            filters.append(
                or_(
                    Paper.title.ilike(term),
                    Paper.abstract.ilike(term),
                    Paper.arxiv_id.ilike(term),
                )
            )
        return filters

    async def list_papers(
        self,
        skip: int = 0,
        limit: int = 20,
        category: str | None = None,
        topic: str | None = None,
        date_from: date | None = None,
        date_to: date | None = None,
        has_code: bool | None = None,
        is_vietnamese: bool | None = None,
        search: str | None = None,
        source: str | None = None,
        sort_by: str = "published_date",
        sort_order: str = "desc",
    ) -> tuple[list[Paper], int]:
        filters = self._build_filters(
            category=category, topic=topic, date_from=date_from,
            date_to=date_to, has_code=has_code, is_vietnamese=is_vietnamese,
            search=search, source=source,
        )

        query = select(Paper)
        count_query = select(func.count()).select_from(Paper)

        if filters:
            where = and_(*filters)
            query = query.where(where)
            count_query = count_query.where(where)

        sort_column = getattr(Paper, sort_by, Paper.published_date)
        if sort_order == "desc":
            query = query.order_by(sort_column.desc())
        else:
            query = query.order_by(sort_column.asc())

        query = query.offset(skip).limit(limit)

        result = await self.session.execute(query)
        papers = list(result.scalars().all())

        count_result = await self.session.execute(count_query)
        total = count_result.scalar() or 0

        return papers, total

    async def get_stats(
        self,
        category: str | None = None,
        topic: str | None = None,
        search: str | None = None,
        source: str | None = None,
    ) -> dict:
        filters = self._build_filters(category=category, topic=topic, search=search, source=source)
        where_clause = and_(*filters) if filters else True

        thirty_days_ago = date.today() - timedelta(days=30)

        # Summary
        summary_q = select(
            func.count().label("total_papers"),
            func.coalesce(func.sum(Paper.citation_count), 0).label("total_citations"),
            func.coalesce(func.avg(Paper.citation_count), 0).label("avg_citations"),
            func.sum(case((Paper.published_date >= thirty_days_ago, 1), else_=0)).label("recent_papers"),
        ).where(where_clause)
        summary = (await self.session.execute(summary_q)).one()

        # Category distribution (unnest ARRAY)
        cat_unnest = func.unnest(Paper.categories).label("category")
        cat_subq = (
            select(Paper.id, cat_unnest)
            .where(where_clause)
            .where(Paper.categories.isnot(None))
            .subquery()
        )
        cat_q = (
            select(cat_subq.c.category, func.count().label("cnt"))
            .group_by(cat_subq.c.category)
            .order_by(func.count().desc())
        )
        cat_result = await self.session.execute(cat_q)
        category_distribution = {row.category: row.cnt for row in cat_result.all()}

        # Source distribution
        source_q = (
            select(Paper.source, func.count().label("cnt"))
            .where(where_clause)
            .group_by(Paper.source)
            .order_by(func.count().desc())
        )
        source_result = await self.session.execute(source_q)
        source_distribution = {row.source: row.cnt for row in source_result.all()}

        # Year distribution
        year_expr = func.extract("year", Paper.published_date).label("year")
        year_q = (
            select(year_expr, func.count().label("cnt"))
            .where(where_clause)
            .where(Paper.published_date.isnot(None))
            .group_by(year_expr)
            .order_by(year_expr.desc())
        )
        year_result = await self.session.execute(year_q)
        year_distribution = {str(int(row.year)): row.cnt for row in year_result.all() if row.year}

        return {
            "total_papers": summary.total_papers or 0,
            "total_citations": int(summary.total_citations or 0),
            "avg_citations": round(float(summary.avg_citations or 0), 1),
            "recent_papers": int(summary.recent_papers or 0),
            "category_distribution": category_distribution,
            "source_distribution": source_distribution,
            "year_distribution": year_distribution,
        }

    async def create(self, paper: Paper) -> Paper:
        self.session.add(paper)
        await self.session.flush()
        return paper

    async def upsert_by_arxiv_id(self, paper_data: dict) -> Paper:
        existing = await self.get_by_arxiv_id(paper_data.get("arxiv_id", ""))
        if existing:
            for key, value in paper_data.items():
                if value is not None:
                    setattr(existing, key, value)
            await self.session.flush()
            return existing

        paper = Paper(**paper_data)
        self.session.add(paper)
        await self.session.flush()
        return paper

    async def get_by_s2_id(self, s2_id: str) -> Paper | None:
        result = await self.session.execute(
            select(Paper).where(Paper.semantic_scholar_id == s2_id)
        )
        return result.scalar_one_or_none()

    async def _get_by_doi(self, doi: str) -> Paper | None:
        result = await self.session.execute(
            select(Paper).where(Paper.doi == doi)
        )
        return result.scalar_one_or_none()

    async def upsert_by_s2_id(self, paper_data: dict) -> Paper | None:
        arxiv_id = paper_data.get("arxiv_id")
        s2_id = paper_data.get("semantic_scholar_id", "")
        doi = paper_data.get("doi")

        existing = None
        if arxiv_id:
            existing = await self.get_by_arxiv_id(arxiv_id)
        if not existing and s2_id:
            existing = await self.get_by_s2_id(s2_id)
        if not existing and doi:
            existing = await self._get_by_doi(doi)

        if existing:
            for key, value in paper_data.items():
                if value is not None:
                    setattr(existing, key, value)
            await self.session.flush()
            return existing

        try:
            paper = Paper(**paper_data)
            self.session.add(paper)
            await self.session.flush()
            return paper
        except Exception:
            await self.session.rollback()
            return None

    async def get_unprocessed(self, limit: int = 100) -> list[Paper]:
        result = await self.session.execute(
            select(Paper)
            .where(Paper.is_processed == False)  # noqa: E712
            .order_by(Paper.created_at.asc())
            .limit(limit)
        )
        return list(result.scalars().all())

    async def mark_processed(self, paper_id: uuid.UUID) -> None:
        paper = await self.get_by_id(paper_id)
        if paper:
            paper.is_processed = True
            await self.session.flush()

    async def get_author_analytics(
        self, limit: int = 20, category: str | None = None
    ) -> dict:
        filters = self._build_filters(category=category)
        where_clause = and_(*filters) if filters else text("TRUE")

        # Use jsonb_array_elements to unnest JSONB authors array
        author_subq = (
            select(
                literal_column("author->>'name'").label("author_name"),
                literal_column("author->>'affiliation'").label("affiliation"),
                Paper.citation_count,
            )
            .select_from(
                Paper.__table__.join(
                    text("jsonb_array_elements(papers.authors) AS author"),
                    text("TRUE"),
                    isouter=True,
                )
            )
            .where(where_clause)
            .where(Paper.authors.isnot(None))
            .subquery()
        )

        # Top by papers
        top_papers_q = (
            select(
                author_subq.c.author_name,
                func.min(author_subq.c.affiliation).label("affiliation"),
                func.count().label("paper_count"),
                func.coalesce(func.sum(author_subq.c.citation_count), 0).label("total_citations"),
            )
            .where(author_subq.c.author_name.isnot(None))
            .group_by(author_subq.c.author_name)
            .order_by(func.count().desc())
            .limit(limit)
        )
        top_papers = (await self.session.execute(top_papers_q)).all()

        # Top by citations
        top_cit_q = (
            select(
                author_subq.c.author_name,
                func.min(author_subq.c.affiliation).label("affiliation"),
                func.count().label("paper_count"),
                func.coalesce(func.sum(author_subq.c.citation_count), 0).label("total_citations"),
            )
            .where(author_subq.c.author_name.isnot(None))
            .group_by(author_subq.c.author_name)
            .order_by(func.coalesce(func.sum(author_subq.c.citation_count), 0).desc())
            .limit(limit)
        )
        top_citations = (await self.session.execute(top_cit_q)).all()

        # Affiliation distribution
        aff_q = (
            select(
                author_subq.c.affiliation,
                func.count().label("cnt"),
            )
            .where(author_subq.c.affiliation.isnot(None))
            .where(author_subq.c.affiliation != "")
            .group_by(author_subq.c.affiliation)
            .order_by(func.count().desc())
            .limit(20)
        )
        aff_result = (await self.session.execute(aff_q)).all()

        return {
            "top_by_papers": [
                {
                    "name": r.author_name,
                    "affiliation": r.affiliation,
                    "paper_count": r.paper_count,
                    "total_citations": int(r.total_citations),
                }
                for r in top_papers
            ],
            "top_by_citations": [
                {
                    "name": r.author_name,
                    "affiliation": r.affiliation,
                    "paper_count": r.paper_count,
                    "total_citations": int(r.total_citations),
                }
                for r in top_citations
            ],
            "affiliation_distribution": {r.affiliation: r.cnt for r in aff_result},
        }

    async def get_keyword_analytics(
        self,
        limit: int = 50,
        category: str | None = None,
        year: int | None = None,
    ) -> dict:
        filters = self._build_filters(category=category)
        if year:
            filters.append(func.extract("year", Paper.published_date) == year)
        where_clause = and_(*filters) if filters else text("TRUE")

        # Keywords (unnest ARRAY)
        kw_unnest = func.unnest(Paper.keywords).label("keyword")
        kw_subq = (
            select(Paper.id, kw_unnest)
            .where(where_clause)
            .where(Paper.keywords.isnot(None))
            .subquery()
        )
        kw_q = (
            select(kw_subq.c.keyword, func.count().label("cnt"))
            .group_by(kw_subq.c.keyword)
            .order_by(func.count().desc())
            .limit(limit)
        )
        kw_result = (await self.session.execute(kw_q)).all()

        # Topics (unnest ARRAY)
        tp_unnest = func.unnest(Paper.topics).label("topic")
        tp_subq = (
            select(Paper.id, tp_unnest)
            .where(where_clause)
            .where(Paper.topics.isnot(None))
            .subquery()
        )
        tp_q = (
            select(tp_subq.c.topic, func.count().label("cnt"))
            .group_by(tp_subq.c.topic)
            .order_by(func.count().desc())
            .limit(limit)
        )
        tp_result = (await self.session.execute(tp_q)).all()

        return {
            "keywords": [{"keyword": r.keyword, "count": r.cnt} for r in kw_result],
            "topics": [{"keyword": r.topic, "count": r.cnt} for r in tp_result],
        }

    async def get_coauthor_network(
        self,
        min_collabs: int = 2,
        limit: int = 100,
        category: str | None = None,
    ) -> dict:
        # Build category filter clause for raw SQL
        if category:
            cat_clause = "AND :category = ANY(p.categories)"
            params = {"min_collabs": min_collabs, "limit": limit, "category": category}
        else:
            cat_clause = ""
            params = {"min_collabs": min_collabs, "limit": limit}

        # Build co-author pairs using raw SQL for JSONB cross join
        query = text(f"""
            WITH paper_authors AS (
                SELECT p.id AS paper_id,
                       a->>'name' AS author_name,
                       a->>'affiliation' AS affiliation
                FROM papers p,
                     jsonb_array_elements(p.authors) AS a
                WHERE p.authors IS NOT NULL
                  AND jsonb_typeof(p.authors) = 'array'
                  AND jsonb_array_length(p.authors) > 1
                  {cat_clause}
            ),
            pairs AS (
                SELECT a1.author_name AS source,
                       a2.author_name AS target,
                       a1.affiliation AS source_aff,
                       a2.affiliation AS target_aff,
                       COUNT(DISTINCT a1.paper_id) AS weight
                FROM paper_authors a1
                JOIN paper_authors a2
                  ON a1.paper_id = a2.paper_id
                 AND a1.author_name < a2.author_name
                WHERE a1.author_name IS NOT NULL
                  AND a2.author_name IS NOT NULL
                GROUP BY a1.author_name, a2.author_name, a1.affiliation, a2.affiliation
                HAVING COUNT(DISTINCT a1.paper_id) >= :min_collabs
                ORDER BY weight DESC
                LIMIT :limit
            )
            SELECT * FROM pairs
        """)
        result = (await self.session.execute(query, params)).all()

        # Collect unique nodes
        node_map: dict[str, dict] = {}
        edges = []
        for row in result:
            src, tgt, src_aff, tgt_aff, w = row
            if src not in node_map:
                node_map[src] = {"id": src, "label": src, "paper_count": 0, "affiliation": src_aff}
            if tgt not in node_map:
                node_map[tgt] = {"id": tgt, "label": tgt, "paper_count": 0, "affiliation": tgt_aff}
            node_map[src]["paper_count"] += w
            node_map[tgt]["paper_count"] += w
            edges.append({"source": src, "target": tgt, "weight": w})

        return {
            "nodes": list(node_map.values()),
            "edges": edges,
        }

    async def get_keyword_trends(
        self, top_n: int = 10, category: str | None = None
    ) -> dict:
        filters = self._build_filters(category=category)
        where_clause = and_(*filters) if filters else text("TRUE")

        # Use keywords if available, fall back to topics
        # Check which field has data
        kw_count = (await self.session.execute(
            select(func.count()).select_from(Paper).where(Paper.keywords.isnot(None))
        )).scalar() or 0

        if kw_count > 0:
            field = Paper.keywords
            field_label = "keyword"
        else:
            field = Paper.topics
            field_label = "keyword"

        kw_unnest = func.unnest(field).label("keyword")
        kw_subq = (
            select(Paper.id, kw_unnest, Paper.published_date)
            .where(where_clause)
            .where(field.isnot(None))
            .where(Paper.published_date.isnot(None))
            .subquery()
        )
        top_kw_q = (
            select(kw_subq.c.keyword, func.count().label("cnt"))
            .group_by(kw_subq.c.keyword)
            .order_by(func.count().desc())
            .limit(top_n)
        )
        top_kw_result = (await self.session.execute(top_kw_q)).all()
        top_keywords = [r.keyword for r in top_kw_result]

        if not top_keywords:
            return {"trends": [], "top_keywords": [], "emerging": []}

        # Get per-year counts for top keywords
        year_expr = func.extract("year", kw_subq.c.published_date).label("year")
        trend_q = (
            select(year_expr, kw_subq.c.keyword, func.count().label("cnt"))
            .where(kw_subq.c.keyword.in_(top_keywords))
            .group_by(year_expr, kw_subq.c.keyword)
            .order_by(year_expr.asc())
        )
        trend_result = (await self.session.execute(trend_q)).all()
        trends = [
            {"period": str(int(r.year)), "keyword": r.keyword, "count": r.cnt}
            for r in trend_result
            if r.year
        ]

        # Emerging keywords: compare last 2 years vs previous 2 years
        current_year = date.today().year
        recent_years = [current_year, current_year - 1]
        previous_years = [current_year - 2, current_year - 3]

        recent_q = (
            select(kw_subq.c.keyword, func.count().label("cnt"))
            .where(func.extract("year", kw_subq.c.published_date).in_(recent_years))
            .group_by(kw_subq.c.keyword)
            .having(func.count() >= 2)
        )
        recent_result = {r.keyword: r.cnt for r in (await self.session.execute(recent_q)).all()}

        prev_q = (
            select(kw_subq.c.keyword, func.count().label("cnt"))
            .where(func.extract("year", kw_subq.c.published_date).in_(previous_years))
            .group_by(kw_subq.c.keyword)
        )
        prev_result = {r.keyword: r.cnt for r in (await self.session.execute(prev_q)).all()}

        emerging = []
        for kw, recent_cnt in recent_result.items():
            prev_cnt = prev_result.get(kw, 0)
            if prev_cnt == 0:
                growth = float(recent_cnt) * 100.0
            else:
                growth = ((recent_cnt - prev_cnt) / prev_cnt) * 100.0
            if growth > 0:
                emerging.append({
                    "keyword": kw,
                    "recent_count": recent_cnt,
                    "previous_count": prev_cnt,
                    "growth_rate": round(growth, 1),
                })
        emerging.sort(key=lambda x: x["growth_rate"], reverse=True)

        return {
            "trends": trends,
            "top_keywords": top_keywords,
            "emerging": emerging[:20],
        }

    async def get_by_title_normalized(self, title_normalized: str) -> Paper | None:
        result = await self.session.execute(
            select(Paper).where(Paper.title_normalized == title_normalized)
        )
        return result.scalar_one_or_none()

    async def get_topic_cooccurrence(
        self, limit: int = 80, min_cooccurrence: int = 5, category: str | None = None
    ) -> dict:
        if category:
            cat_clause = "AND :category = ANY(p.categories)"
            params: dict = {"limit": limit, "min_co": min_cooccurrence, "category": category}
        else:
            cat_clause = ""
            params = {"limit": limit, "min_co": min_cooccurrence}

        query = text(f"""
            WITH topic_pairs AS (
                SELECT t1.topic AS topic_a, t2.topic AS topic_b,
                       COUNT(*) AS weight
                FROM (SELECT p.id, unnest(p.topics) AS topic FROM papers p
                      WHERE p.topics IS NOT NULL {cat_clause}) t1
                JOIN (SELECT p.id, unnest(p.topics) AS topic FROM papers p
                      WHERE p.topics IS NOT NULL {cat_clause}) t2
                  ON t1.id = t2.id AND t1.topic < t2.topic
                GROUP BY t1.topic, t2.topic
                HAVING COUNT(*) >= :min_co
                ORDER BY weight DESC
                LIMIT :limit
            )
            SELECT * FROM topic_pairs
        """)
        result = (await self.session.execute(query, params)).all()

        node_map: dict[str, dict] = {}
        edges = []
        for row in result:
            ta, tb, w = row
            if ta not in node_map:
                node_map[ta] = {"id": ta, "label": ta, "paper_count": 0}
            if tb not in node_map:
                node_map[tb] = {"id": tb, "label": tb, "paper_count": 0}
            node_map[ta]["paper_count"] += w
            node_map[tb]["paper_count"] += w
            edges.append({"source": ta, "target": tb, "weight": w})

        return {"nodes": list(node_map.values()), "edges": edges}

    async def get_citation_timeline(
        self, limit: int = 8, category: str | None = None
    ) -> dict:
        if category:
            cat_clause = "AND :category = ANY(p.categories)"
            params: dict = {"limit": limit, "category": category}
        else:
            cat_clause = ""
            params = {"limit": limit}

        # First get top authors by total citations
        top_q = text(f"""
            SELECT a->>'name' AS author_name,
                   SUM(p.citation_count) AS total_cit
            FROM papers p, jsonb_array_elements(p.authors) AS a
            WHERE p.authors IS NOT NULL
              AND jsonb_typeof(p.authors) = 'array'
              AND p.citation_count > 0
              {cat_clause}
            GROUP BY a->>'name'
            ORDER BY total_cit DESC
            LIMIT :limit
        """)
        top_authors = [r.author_name for r in (await self.session.execute(top_q, params)).all()]

        if not top_authors:
            return {"data": [], "authors": []}

        # Get per-year citation sums for these authors
        placeholders = ", ".join(f":a{i}" for i in range(len(top_authors)))
        author_params = {f"a{i}": name for i, name in enumerate(top_authors)}

        timeline_q = text(f"""
            SELECT EXTRACT(YEAR FROM p.published_date)::int AS year,
                   a->>'name' AS author_name,
                   SUM(p.citation_count) AS citations
            FROM papers p, jsonb_array_elements(p.authors) AS a
            WHERE p.authors IS NOT NULL
              AND jsonb_typeof(p.authors) = 'array'
              AND p.published_date IS NOT NULL
              AND a->>'name' IN ({placeholders})
            GROUP BY year, author_name
            ORDER BY year
        """)
        result = (await self.session.execute(timeline_q, author_params)).all()

        data = [
            {"year": str(r.year), "author": r.author_name, "citations": int(r.citations)}
            for r in result if r.year
        ]
        return {"data": data, "authors": top_authors}

    async def get_category_heatmap(self, category: str | None = None) -> dict:
        filters = self._build_filters(category=category)
        where_clause = and_(*filters) if filters else text("TRUE")

        cat_unnest = func.unnest(Paper.categories).label("category")
        year_expr = func.extract("year", Paper.published_date).label("year")

        subq = (
            select(cat_unnest, year_expr)
            .where(where_clause)
            .where(Paper.categories.isnot(None))
            .where(Paper.published_date.isnot(None))
            .subquery()
        )

        # Get top categories
        top_cat_q = (
            select(subq.c.category, func.count().label("cnt"))
            .group_by(subq.c.category)
            .order_by(func.count().desc())
            .limit(15)
        )
        top_cats = [r.category for r in (await self.session.execute(top_cat_q)).all()]

        if not top_cats:
            return {"cells": [], "categories": [], "years": []}

        heatmap_q = (
            select(subq.c.category, subq.c.year, func.count().label("cnt"))
            .where(subq.c.category.in_(top_cats))
            .group_by(subq.c.category, subq.c.year)
            .order_by(subq.c.year)
        )
        result = (await self.session.execute(heatmap_q)).all()

        cells = [
            {"category": r.category, "year": str(int(r.year)), "count": r.cnt}
            for r in result if r.year
        ]
        years = sorted(set(c["year"] for c in cells))

        return {"cells": cells, "categories": top_cats, "years": years}

    async def get_topic_correlation(
        self, limit: int = 15, min_cooccurrence: int = 10, category: str | None = None
    ) -> dict:
        if category:
            cat_clause = "AND :category = ANY(p.categories)"
            params: dict = {"limit": limit, "min_co": min_cooccurrence, "category": category}
        else:
            cat_clause = ""
            params = {"limit": limit, "min_co": min_cooccurrence}

        # Get top topics first
        top_q = text(f"""
            SELECT topic, COUNT(*) AS cnt
            FROM (SELECT unnest(topics) AS topic FROM papers
                  WHERE topics IS NOT NULL {cat_clause}) sub
            GROUP BY topic ORDER BY cnt DESC LIMIT :limit
        """)
        top_topics = [r.topic for r in (await self.session.execute(top_q, params)).all()]

        if not top_topics:
            return {"cells": [], "topics": []}

        # Get co-occurrence counts for these topics
        placeholders = ", ".join(f":t{i}" for i in range(len(top_topics)))
        topic_params = {f"t{i}": t for i, t in enumerate(top_topics)}
        topic_params["min_co"] = min_cooccurrence

        corr_q = text(f"""
            SELECT t1.topic AS topic_a, t2.topic AS topic_b, COUNT(*) AS cnt
            FROM (SELECT p.id, unnest(p.topics) AS topic FROM papers p WHERE p.topics IS NOT NULL) t1
            JOIN (SELECT p.id, unnest(p.topics) AS topic FROM papers p WHERE p.topics IS NOT NULL) t2
              ON t1.id = t2.id AND t1.topic < t2.topic
            WHERE t1.topic IN ({placeholders}) AND t2.topic IN ({placeholders})
            GROUP BY t1.topic, t2.topic
            HAVING COUNT(*) >= :min_co
        """)
        result = (await self.session.execute(corr_q, topic_params)).all()

        cells = [{"topic_a": r.topic_a, "topic_b": r.topic_b, "count": r.cnt} for r in result]
        return {"cells": cells, "topics": top_topics}

    async def get_institution_ranking(
        self, limit: int = 30, category: str | None = None
    ) -> dict:
        if category:
            cat_clause = "AND :category = ANY(p.categories)"
            params: dict = {"limit": limit, "category": category}
        else:
            cat_clause = ""
            params = {"limit": limit}

        query = text(f"""
            SELECT aff,
                   COUNT(DISTINCT paper_id) AS paper_count,
                   COALESCE(SUM(citation_count), 0) AS total_citations,
                   ROUND(AVG(citation_count)::numeric, 1) AS avg_citations,
                   COUNT(DISTINCT author_name) AS author_count
            FROM (
                SELECT p.id AS paper_id,
                       a->>'name' AS author_name,
                       a->>'affiliation' AS aff,
                       p.citation_count
                FROM papers p, jsonb_array_elements(p.authors) AS a
                WHERE p.authors IS NOT NULL
                  AND jsonb_typeof(p.authors) = 'array'
                  AND a->>'affiliation' IS NOT NULL
                  AND a->>'affiliation' != ''
                  {cat_clause}
            ) sub
            GROUP BY aff
            ORDER BY paper_count DESC
            LIMIT :limit
        """)
        result = (await self.session.execute(query, params)).all()

        return {
            "institutions": [
                {
                    "name": r.aff,
                    "paper_count": r.paper_count,
                    "total_citations": int(r.total_citations),
                    "avg_citations": float(r.avg_citations),
                    "author_count": r.author_count,
                }
                for r in result
            ]
        }

    async def get_author_comparison(self, author_names: list[str]) -> dict:
        if not author_names:
            return {"authors": []}

        placeholders = ", ".join(f":a{i}" for i in range(len(author_names)))
        params = {f"a{i}": name for i, name in enumerate(author_names)}

        query = text(f"""
            SELECT a->>'name' AS author_name,
                   a->>'affiliation' AS affiliation,
                   COUNT(DISTINCT p.id) AS paper_count,
                   COALESCE(SUM(p.citation_count), 0) AS total_citations,
                   ROUND(AVG(p.citation_count)::numeric, 1) AS avg_citations,
                   MIN(EXTRACT(YEAR FROM p.published_date))::int AS first_year,
                   MAX(EXTRACT(YEAR FROM p.published_date))::int AS last_year
            FROM papers p, jsonb_array_elements(p.authors) AS a
            WHERE p.authors IS NOT NULL
              AND jsonb_typeof(p.authors) = 'array'
              AND a->>'name' IN ({placeholders})
            GROUP BY a->>'name', a->>'affiliation'
        """)
        rows = (await self.session.execute(query, params)).all()

        # Also get topics per author
        topics_q = text(f"""
            SELECT a->>'name' AS author_name, t.topic, COUNT(*) AS cnt
            FROM papers p,
                 jsonb_array_elements(p.authors) AS a,
                 unnest(p.topics) AS t(topic)
            WHERE p.authors IS NOT NULL
              AND jsonb_typeof(p.authors) = 'array'
              AND p.topics IS NOT NULL
              AND a->>'name' IN ({placeholders})
            GROUP BY a->>'name', t.topic
            ORDER BY a->>'name', cnt DESC
        """)
        topics_result = (await self.session.execute(topics_q, params)).all()

        # Group topics by author (top 5 each)
        author_topics: dict[str, list[str]] = {}
        for r in topics_result:
            if r.author_name not in author_topics:
                author_topics[r.author_name] = []
            if len(author_topics[r.author_name]) < 5:
                author_topics[r.author_name].append(r.topic)

        # Merge rows (author may have multiple affiliations)
        merged: dict[str, dict] = {}
        for r in rows:
            name = r.author_name
            if name not in merged:
                merged[name] = {
                    "name": name,
                    "affiliation": r.affiliation,
                    "paper_count": r.paper_count,
                    "total_citations": int(r.total_citations),
                    "avg_citations": float(r.avg_citations),
                    "first_year": r.first_year,
                    "last_year": r.last_year,
                    "topics": author_topics.get(name, []),
                }
            else:
                merged[name]["paper_count"] += r.paper_count
                merged[name]["total_citations"] += int(r.total_citations)

        return {"authors": list(merged.values())}

    async def get_research_landscape(
        self, limit: int = 50, category: str | None = None
    ) -> dict:
        filters = self._build_filters(category=category)
        where_clause = and_(*filters) if filters else text("TRUE")

        tp_unnest = func.unnest(Paper.topics).label("topic")
        subq = (
            select(
                tp_unnest,
                func.extract("year", Paper.published_date).label("year"),
                Paper.citation_count,
            )
            .where(where_clause)
            .where(Paper.topics.isnot(None))
            .where(Paper.published_date.isnot(None))
            .subquery()
        )

        landscape_q = (
            select(
                subq.c.topic,
                func.avg(subq.c.year).label("avg_year"),
                func.avg(subq.c.citation_count).label("avg_citations"),
                func.count().label("paper_count"),
            )
            .group_by(subq.c.topic)
            .having(func.count() >= 5)
            .order_by(func.count().desc())
            .limit(limit)
        )
        result = (await self.session.execute(landscape_q)).all()

        return {
            "points": [
                {
                    "topic": r.topic,
                    "avg_year": round(float(r.avg_year), 1),
                    "avg_citations": round(float(r.avg_citations), 1),
                    "paper_count": r.paper_count,
                }
                for r in result
            ]
        }

    async def get_similar_papers(
        self, paper_id: uuid.UUID, limit: int = 10
    ) -> list[Paper]:
        paper = await self.get_by_id(paper_id)
        if not paper:
            return []

        filters = []
        filters.append(Paper.id != paper_id)

        if paper.topics:
            filters.append(Paper.topics.overlap(paper.topics))
        elif paper.categories:
            filters.append(Paper.categories.overlap(paper.categories))
        else:
            return []

        query = (
            select(Paper)
            .where(and_(*filters))
            .order_by(Paper.citation_count.desc())
            .limit(limit)
        )
        result = await self.session.execute(query)
        return list(result.scalars().all())
