"""GitHub repository ingestion service using gitingest."""

import asyncio
import re
from dataclasses import dataclass

from src.core.logging import get_logger

logger = get_logger(__name__)

MAX_CONTENT_SIZE = 2 * 1024 * 1024  # 2MB limit


@dataclass
class RepoContent:
    summary: str
    tree: str
    content: str
    repo_name: str


async def ingest_repo(url: str) -> RepoContent:
    """Ingest a GitHub repository using gitingest.

    Args:
        url: GitHub repository URL (e.g. https://github.com/owner/repo)

    Returns:
        RepoContent with summary, tree structure, and file contents.
    """
    from gitingest import ingest

    logger.info("Ingesting repository", url=url)

    # gitingest.ingest is synchronous — run in thread
    summary, tree, content = await asyncio.to_thread(ingest, url)

    # Extract repo name from URL
    parts = url.rstrip("/").split("/")
    repo_name = f"{parts[-2]}/{parts[-1]}" if len(parts) >= 2 else url

    # Truncate content if too large
    if content and len(content) > MAX_CONTENT_SIZE:
        content = content[:MAX_CONTENT_SIZE]
        logger.warning("Repository content truncated", repo_name=repo_name, max_size=MAX_CONTENT_SIZE)

    return RepoContent(
        summary=summary or "",
        tree=tree or "",
        content=content or "",
        repo_name=repo_name,
    )


# Regex to match gitingest file boundary markers like:
# ================================================
# File: path/to/file.py
# ================================================
_FILE_BOUNDARY_RE = re.compile(
    r"^={4,}\nFile:\s*(.+?)\n={4,}$",
    re.MULTILINE,
)


def chunk_repo_content(
    repo: RepoContent,
    chunk_size: int = 800,
    overlap: int = 100,
) -> list[dict]:
    """Split ingested repo content into chunks for embedding.

    Returns list of dicts with keys: content, file_path, chunk_index.
    """
    chunks: list[dict] = []
    idx = 0

    # First chunk: overview (summary + tree structure)
    overview = f"# Repository Overview: {repo.repo_name}\n\n"
    if repo.summary:
        overview += f"## Summary\n{repo.summary}\n\n"
    if repo.tree:
        overview += f"## File Structure\n{repo.tree}\n"

    if overview.strip():
        chunks.append({
            "content": overview.strip(),
            "file_path": "OVERVIEW",
            "chunk_index": idx,
        })
        idx += 1

    if not repo.content:
        return chunks

    # Split content by file boundary markers
    splits = _FILE_BOUNDARY_RE.split(repo.content)

    # splits alternates between: [pre-text, filepath1, filecontent1, filepath2, filecontent2, ...]
    # First element is text before any file marker (usually empty)
    file_pairs: list[tuple[str, str]] = []
    i = 1  # skip pre-text
    while i < len(splits) - 1:
        file_path = splits[i].strip()
        file_content = splits[i + 1].strip()
        if file_content:
            file_pairs.append((file_path, file_content))
        i += 2

    # If no file boundaries found, treat entire content as one block
    if not file_pairs:
        for sub in _sub_chunk(repo.content, chunk_size, overlap):
            chunks.append({
                "content": sub,
                "file_path": "content",
                "chunk_index": idx,
            })
            idx += 1
        return chunks

    # Process each file
    for file_path, file_content in file_pairs:
        header = f"# File: {file_path}\n\n"
        if len(file_content) <= chunk_size:
            chunks.append({
                "content": header + file_content,
                "file_path": file_path,
                "chunk_index": idx,
            })
            idx += 1
        else:
            for sub in _sub_chunk(file_content, chunk_size, overlap):
                chunks.append({
                    "content": header + sub,
                    "file_path": file_path,
                    "chunk_index": idx,
                })
                idx += 1

    return chunks


def _sub_chunk(text: str, chunk_size: int, overlap: int) -> list[str]:
    """Split text into overlapping sub-chunks."""
    results = []
    start = 0
    text_len = len(text)

    while start < text_len:
        end = start + chunk_size
        if end < text_len:
            # Try to break at newline
            last_nl = text.rfind("\n", start + chunk_size // 2, end)
            if last_nl > start:
                end = last_nl + 1
        chunk = text[start:end].strip()
        if chunk:
            results.append(chunk)
        start = end - overlap
        if start >= text_len:
            break

    return results
