"""OpenReview API client with full pagination support."""

import asyncio
from datetime import datetime

import httpx

OPENREVIEW_API_BASE = "https://api2.openreview.net"

DEFAULT_VENUES = [
    # Top-tier ML conferences
    "ICLR.cc/2026/Conference",
    "NeurIPS.cc/2025/Conference",
    "ICML.cc/2025/Conference",
    "ICLR.cc/2025/Conference",
    "NeurIPS.cc/2024/Conference",
    "ICML.cc/2024/Conference",
    "ICLR.cc/2024/Conference",
    # AI/NLP/CV conferences
    "AAAI.org/2025/Conference",
    "AAAI.org/2026/Conference",
    "aclweb.org/ACL/2025/Conference",
    "EMNLP/2024/Conference",
    "cvpr/2025/Conference",
    "eccv/2024/Conference",
    # Workshops (smaller but interesting)
    "NeurIPS.cc/2024/Workshop",
    "ICML.cc/2025/Workshop",
]

BATCH_SIZE = 200  # Max per API call
REVIEW_CONCURRENCY = 1  # Sequential review fetches to avoid 429
REQUEST_DELAY = 2.0  # Seconds between API calls
REVIEW_DELAY = 3.0  # Seconds between review fetches
MAX_RETRIES = 5  # Max retries on 429


def _get_value(field):
    """Extract value from OpenReview v2 content field (may be dict with 'value' key)."""
    if isinstance(field, dict):
        return field.get("value")
    return field


def _parse_note(note: dict, venue_id: str) -> dict | None:
    """Parse a single OpenReview note into our format."""
    note_id = note.get("id", "")
    if not note_id:
        return None

    content = note.get("content") or {}

    title = _get_value(content.get("title"))
    abstract = _get_value(content.get("abstract"))
    tldr = _get_value(content.get("TLDR"))
    authors = _get_value(content.get("authors"))
    keywords = _get_value(content.get("keywords"))
    venue = _get_value(content.get("venue"))
    venueid_val = _get_value(content.get("venueid"))
    primary_area = _get_value(content.get("primary_area"))
    pdf = _get_value(content.get("pdf"))

    pdf_url = None
    if pdf:
        if pdf.startswith("http"):
            pdf_url = pdf
        else:
            pdf_url = f"https://openreview.net{pdf}"

    cdate = note.get("cdate") or note.get("tcdate")
    published_at = None
    if cdate:
        try:
            published_at = datetime.fromtimestamp(cdate / 1000)
        except (ValueError, TypeError, OSError):
            pass

    return {
        "note_id": note_id,
        "forum_id": note.get("forum", note_id),
        "title": title or "",
        "abstract": abstract,
        "tldr": tldr,
        "authors": authors if isinstance(authors, list) else [],
        "venue": venue or venue_id.replace("/Conference", "").replace(".cc", ""),
        "venueid": venueid_val or venue_id,
        "primary_area": primary_area,
        "keywords": keywords if isinstance(keywords, list) else [],
        "pdf_url": pdf_url,
        "published_at": published_at,
    }


async def fetch_openreview_notes_paginated(
    venue_id: str,
    max_papers: int = 10000,
) -> list[dict]:
    """Fetch ALL notes from a venue with pagination (batch 200)."""
    all_notes = []
    offset = 0

    async with httpx.AsyncClient(timeout=30) as client:
        while offset < max_papers:
            params = {
                "content.venueid": venue_id,
                "limit": BATCH_SIZE,
                "offset": offset,
            }

            try:
                resp = await client.get(f"{OPENREVIEW_API_BASE}/notes", params=params)
                resp.raise_for_status()
                raw = resp.json()
            except Exception:
                break

            notes_batch = raw.get("notes", [])
            if not notes_batch:
                break

            for note in notes_batch:
                parsed = _parse_note(note, venue_id)
                if parsed:
                    all_notes.append(parsed)

            if len(notes_batch) < BATCH_SIZE:
                break

            offset += BATCH_SIZE
            await asyncio.sleep(0.3)

    return all_notes


async def fetch_reviews_for_note(forum_id: str, max_retries: int = 3) -> list[dict]:
    """Fetch reviews for a specific paper (forum) with retry on 429."""
    params = {
        "forum": forum_id,
        "select": "id,content,signatures",
    }

    async with httpx.AsyncClient(timeout=15) as client:
        for attempt in range(max_retries):
            resp = await client.get(f"{OPENREVIEW_API_BASE}/notes", params=params)
            if resp.status_code == 429:
                wait = 2 ** (attempt + 1)
                await asyncio.sleep(wait)
                continue
            resp.raise_for_status()
            break
        else:
            return []
        raw = resp.json()

    reviews = []
    for note in raw.get("notes", []):
        content = note.get("content") or {}
        rating = _get_value(content.get("rating")) or _get_value(content.get("recommendation"))
        confidence = _get_value(content.get("confidence"))

        if rating is None:
            continue

        rating_num = None
        if isinstance(rating, (int, float)):
            rating_num = float(rating)
        elif isinstance(rating, str):
            try:
                rating_num = float(rating.split(":")[0].strip())
            except (ValueError, IndexError):
                pass

        confidence_num = None
        if isinstance(confidence, (int, float)):
            confidence_num = float(confidence)
        elif isinstance(confidence, str):
            try:
                confidence_num = float(confidence.split(":")[0].strip())
            except (ValueError, IndexError):
                pass

        signatures = note.get("signatures") or []
        reviewer = signatures[0] if signatures else "anonymous"

        reviews.append({
            "reviewer": reviewer,
            "rating": rating_num,
            "confidence": confidence_num,
        })

    return reviews


async def fetch_reviews_batch(forum_ids: list[str]) -> dict[str, list[dict]]:
    """Fetch reviews for multiple papers concurrently."""
    sem = asyncio.Semaphore(REVIEW_CONCURRENCY)
    results: dict[str, list[dict]] = {}

    async def _fetch_one(fid: str):
        async with sem:
            try:
                reviews = await fetch_reviews_for_note(fid)
                results[fid] = reviews
            except Exception:
                results[fid] = []
            await asyncio.sleep(1.0)

    tasks = [_fetch_one(fid) for fid in forum_ids]
    await asyncio.gather(*tasks)
    return results
