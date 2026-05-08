"""
bioRxiv / medRxiv / ChemRxiv collector — preprint trong bio/medical/chemistry.

API: https://api.biorxiv.org/details/{server}/{interval}/{cursor}
Server values: biorxiv | medrxiv | chemrxiv (chemrxiv qua DataCite, ưu tiên bio/medrxiv)
"""
from collections.abc import AsyncIterator
from dataclasses import dataclass, field
from datetime import date, datetime, timedelta

from src.collectors.base import BaseCollector, CollectorConfig, CollectorResult
from src.core.logging import get_logger

logger = get_logger(__name__)


@dataclass
class BiorxivPaper:
    doi: str
    title: str
    abstract: str
    authors: list[dict]
    categories: list[str]
    published_date: date | None
    pdf_url: str | None
    server: str  # biorxiv | medrxiv
    version: int = 1
    license: str | None = None


class BiorxivCollector(BaseCollector):
    BASE_URL = "https://api.biorxiv.org/details"

    def __init__(self, server: str = "biorxiv"):
        if server not in ("biorxiv", "medrxiv"):
            raise ValueError(f"Unsupported server: {server}")
        self.server = server
        super().__init__(
            CollectorConfig(
                name=server,
                base_url=f"{self.BASE_URL}/{server}",
                rate_limit_per_minute=30,
            )
        )

    def _get_headers(self) -> dict:
        return {"User-Agent": "RRI-OSINT-Bot/1.0", "Accept": "application/json"}

    async def collect(
        self,
        date_from: date | None = None,
        date_to: date | None = None,
        max_results: int = 200,
    ) -> AsyncIterator[CollectorResult[BiorxivPaper]]:
        date_to = date_to or date.today()
        date_from = date_from or (date_to - timedelta(days=7))
        interval = f"{date_from.isoformat()}/{date_to.isoformat()}"

        cursor = 0
        fetched = 0
        while fetched < max_results:
            url = f"{self.BASE_URL}/{self.server}/{interval}/{cursor}"
            try:
                response = await self._request("GET", url)
            except Exception as e:
                logger.warning("biorxiv request failed", error=str(e))
                return

            data = response.json()
            messages = data.get("messages", [])
            if messages and messages[0].get("status") != "ok":
                logger.info("biorxiv done", status=messages[0].get("status"))
                return

            collection = data.get("collection", [])
            if not collection:
                return

            for item in collection:
                doi = item.get("doi")
                title = (item.get("title") or "").strip()
                if not doi or not title:
                    continue

                authors_raw = item.get("authors", "")
                # bioRxiv format: "Lastname, Firstname; Lastname, Firstname; ..."
                authors = []
                if isinstance(authors_raw, str):
                    for a in authors_raw.split(";"):
                        a = a.strip()
                        if not a:
                            continue
                        if "," in a:
                            parts = a.split(",", 1)
                            name = f"{parts[1].strip()} {parts[0].strip()}"
                        else:
                            name = a
                        authors.append({"name": name})

                pub_date = item.get("date")
                try:
                    pub_date_obj = date.fromisoformat(pub_date) if pub_date else None
                except Exception:
                    pub_date_obj = None

                category = item.get("category") or ""

                yield CollectorResult(
                    data=BiorxivPaper(
                        doi=doi,
                        title=title,
                        abstract=(item.get("abstract") or "").strip(),
                        authors=authors,
                        categories=[category] if category else [],
                        published_date=pub_date_obj,
                        pdf_url=f"https://www.{self.server}.org/content/{doi}.full.pdf",
                        server=self.server,
                        version=int(item.get("version") or 1),
                        license=item.get("license"),
                    ),
                    source=self.server,
                    collected_at=datetime.utcnow(),
                )
                fetched += 1
                if fetched >= max_results:
                    return

            # Cursor advances by 100 per page
            cursor += len(collection)
            if len(collection) < 100:
                return

    async def health_check(self) -> bool:
        try:
            today = date.today()
            url = f"{self.BASE_URL}/{self.server}/{(today - timedelta(days=2)).isoformat()}/{today.isoformat()}/0"
            response = await self._request("GET", url)
            return response.status_code == 200
        except Exception:
            return False
