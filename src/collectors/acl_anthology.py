"""
ACL Anthology collector — NLP gold standard.

Source: https://aclanthology.org/anthology+abstracts.bib.gz (toàn bộ)
Hoặc dùng JSON dump: https://aclanthology.org/anthology.json (>50MB)

Để khả thi với rate limit + bandwidth, ta dùng RSS feed của venues mới:
  https://aclanthology.org/events/{venue}-{year}/

Hoặc volume listing per year:
  https://aclanthology.org/volumes/{year}.{venue}.{type}/
"""
from collections.abc import AsyncIterator
from dataclasses import dataclass
from datetime import date, datetime

import httpx

from src.collectors.base import BaseCollector, CollectorConfig, CollectorResult
from src.core.logging import get_logger

logger = get_logger(__name__)


@dataclass
class ACLPaper:
    anthology_id: str  # e.g. "2024.acl-long.42"
    title: str
    abstract: str
    authors: list[dict]
    venue: str
    year: int
    pdf_url: str
    bib_url: str
    doi: str | None = None


class ACLAnthologyCollector(BaseCollector):
    BASE_URL = "https://aclanthology.org"

    def __init__(self):
        super().__init__(
            CollectorConfig(
                name="acl_anthology",
                base_url=self.BASE_URL,
                rate_limit_per_minute=20,
            )
        )

    def _get_headers(self) -> dict:
        return {"User-Agent": "RRI-OSINT-Bot/1.0"}

    async def collect(
        self,
        venues: list[str] | None = None,
        year: int | None = None,
        max_results: int = 100,
    ) -> AsyncIterator[CollectorResult[ACLPaper]]:
        """
        venues: ["acl", "emnlp", "naacl", "eacl", "coling"]
        year:   e.g. 2025
        """
        venues = venues or ["acl", "emnlp", "naacl", "findings"]
        year = year or datetime.utcnow().year

        fetched = 0
        for venue in venues:
            if fetched >= max_results:
                break

            # Try multiple volume types
            for vol_type in ["long", "short", "main"]:
                volume = f"{year}.{venue}-{vol_type}"
                url = f"{self.BASE_URL}/volumes/{volume}/"
                try:
                    response = await self._request("GET", url)
                except httpx.HTTPStatusError:
                    continue
                except Exception as e:
                    logger.warning("ACL fetch failed", venue=venue, error=str(e))
                    continue

                # Parse HTML — quick and dirty (BeautifulSoup chưa import)
                # ACL trang volume có pattern: <a href="/2024.acl-long.42/">Title</a>
                import re
                html = response.text

                # Pattern: <strong><a href="/2024.acl-long.42/">Title</a></strong>
                paper_pattern = re.compile(
                    r'<strong>\s*<a[^>]*href="/(' + re.escape(volume) + r'\.\d+)/?"[^>]*>([^<]+)</a>',
                    re.IGNORECASE,
                )

                for match in paper_pattern.finditer(html):
                    if fetched >= max_results:
                        break
                    anthology_id = match.group(1)
                    title = match.group(2).strip()

                    yield CollectorResult(
                        data=ACLPaper(
                            anthology_id=anthology_id,
                            title=title,
                            abstract="",  # Cần fetch detail page riêng — skip để tiết kiệm
                            authors=[],
                            venue=venue.upper(),
                            year=year,
                            pdf_url=f"{self.BASE_URL}/{anthology_id}.pdf",
                            bib_url=f"{self.BASE_URL}/{anthology_id}.bib",
                        ),
                        source="acl_anthology",
                        collected_at=datetime.utcnow(),
                    )
                    fetched += 1

    async def health_check(self) -> bool:
        try:
            response = await self._request("GET", f"{self.BASE_URL}/")
            return response.status_code == 200
        except Exception:
            return False
