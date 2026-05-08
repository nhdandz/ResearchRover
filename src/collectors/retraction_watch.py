"""
Retraction Watch collector.

Public CSV dump: https://api.labs.crossref.org/data/retractionwatch?{email}
(Crossref hosts mirror; email registration required for production use.)

Đơn giản hoá: scrape RSS feed của blog Retraction Watch để track papers gần đây.
"""
import re
from collections.abc import AsyncIterator
from dataclasses import dataclass
from datetime import datetime

from src.collectors.base import BaseCollector, CollectorConfig, CollectorResult
from src.core.logging import get_logger

logger = get_logger(__name__)


@dataclass
class RetractionItem:
    title: str
    link: str
    description: str
    published_at: datetime
    paper_doi: str | None = None
    journal: str | None = None
    reason: str | None = None


class RetractionWatchCollector(BaseCollector):
    RSS_URL = "https://retractionwatch.com/feed/"

    def __init__(self):
        super().__init__(
            CollectorConfig(
                name="retraction_watch",
                base_url=self.RSS_URL,
                rate_limit_per_minute=10,
            )
        )

    def _get_headers(self) -> dict:
        return {"User-Agent": "RRI-OSINT-Bot/1.0", "Accept": "application/rss+xml"}

    async def collect(
        self, max_results: int = 50
    ) -> AsyncIterator[CollectorResult[RetractionItem]]:
        try:
            response = await self._request("GET", self.RSS_URL)
        except Exception as e:
            logger.warning("retraction watch fetch failed", error=str(e))
            return

        # Parse RSS XML
        try:
            import xml.etree.ElementTree as ET
            root = ET.fromstring(response.text)
        except Exception as e:
            logger.warning("RSS parse failed", error=str(e))
            return

        channel = root.find("channel")
        if channel is None:
            return

        items = channel.findall("item")[:max_results]
        for item in items:
            title_el = item.find("title")
            link_el = item.find("link")
            desc_el = item.find("description")
            pub_el = item.find("pubDate")

            if title_el is None or link_el is None:
                continue

            title = (title_el.text or "").strip()
            link = (link_el.text or "").strip()
            desc = (desc_el.text or "").strip() if desc_el is not None else ""

            try:
                from email.utils import parsedate_to_datetime
                pub_at = parsedate_to_datetime(pub_el.text) if pub_el is not None else datetime.utcnow()
            except Exception:
                pub_at = datetime.utcnow()

            # Try extract DOI
            doi_match = re.search(r"10\.\d{4,9}/[-._;()/:A-Z0-9]+", desc, re.IGNORECASE)
            doi = doi_match.group(0) if doi_match else None

            yield CollectorResult(
                data=RetractionItem(
                    title=title,
                    link=link,
                    description=desc,
                    published_at=pub_at.replace(tzinfo=None) if pub_at.tzinfo else pub_at,
                    paper_doi=doi,
                ),
                source="retraction_watch",
                collected_at=datetime.utcnow(),
            )

    async def health_check(self) -> bool:
        try:
            response = await self._request("GET", self.RSS_URL)
            return response.status_code == 200
        except Exception:
            return False
