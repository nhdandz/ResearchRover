"""Document Chat API — embed user documents, manage conversation sources."""

import uuid

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.api.deps import get_current_user, get_db
from src.api.schemas.document_chat import (
    DocumentEmbedRequest,
    DocumentEmbedResponse,
    DocumentEmbedStatus,
    LibraryDocument,
    LibraryFolder,
    LibraryPaper,
    LibraryRepo,
    LibraryResponse,
    RepoEmbedRequest,
)
from src.core.logging import get_logger
from src.processors.embedding import EmbeddingGenerator
from src.services.file_storage import FileStorageService
from src.services.text_extractor import SUPPORTED_TYPES, TextExtractor
from src.storage.models.bookmark import Bookmark
from src.storage.models.document import Document
from src.storage.models.document_embedding import DocumentEmbedding
from src.storage.models.folder import Folder
from src.storage.models.paper import Paper
from src.storage.models.repository import Repository
from src.storage.models.user import User
from src.storage.vector.qdrant_client import VectorStore

logger = get_logger(__name__)

router = APIRouter(prefix="/chat/documents", tags=["Document Chat"])

file_storage = FileStorageService()
text_extractor = TextExtractor()


async def _download_paper_pdf(
    paper: Paper,
    user: User,
    folder_id: uuid.UUID,
    db: AsyncSession,
) -> Document | None:
    """Download a paper's PDF from pdf_url and save as a Document."""
    import httpx

    if not paper.pdf_url:
        return None

    try:
        async with httpx.AsyncClient(follow_redirects=True, timeout=60.0) as client:
            response = await client.get(paper.pdf_url)
            response.raise_for_status()
            content = response.content

        if len(content) < 100:  # too small to be a real PDF
            logger.warning("Downloaded PDF too small", paper_id=str(paper.id), size=len(content))
            return None

        doc_id = uuid.uuid4()
        # Sanitize filename from paper title
        safe_title = "".join(c if c.isalnum() or c in " -_" else "_" for c in paper.title[:80])
        filename = f"{safe_title}.pdf"

        storage_path = file_storage.save_file(
            user_id=user.id,
            document_id=doc_id,
            filename=filename,
            content=content,
        )

        document = Document(
            id=doc_id,
            user_id=user.id,
            folder_id=folder_id,
            filename=filename,
            original_filename=filename,
            content_type="application/pdf",
            file_size=len(content),
            storage_path=storage_path,
            note=f"paper:{paper.id}",  # link back to paper
        )
        db.add(document)
        await db.flush()
        await db.refresh(document)

        logger.info(
            "Downloaded paper PDF",
            paper_id=str(paper.id),
            document_id=str(doc_id),
            size=len(content),
        )
        return document

    except Exception as e:
        logger.error("Failed to download paper PDF", paper_id=str(paper.id), error=str(e))
        return None


@router.post("/embed", response_model=DocumentEmbedResponse)
async def embed_documents(
    body: DocumentEmbedRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Trigger embedding for selected documents and papers. Skips already-completed ones (cache)."""
    embedding_gen = EmbeddingGenerator()
    vector_store = VectorStore()
    results: list[DocumentEmbedStatus] = []

    # ── Handle paper_ids: auto-download PDF and convert to document_ids ──
    resolved_doc_ids: list[str] = list(body.document_ids)

    for paper_id_str in body.paper_ids:
        paper_id = uuid.UUID(paper_id_str)

        # Check if paper exists
        paper_result = await db.execute(select(Paper).where(Paper.id == paper_id))
        paper = paper_result.scalar_one_or_none()
        if not paper:
            results.append(
                DocumentEmbedStatus(
                    document_id=paper_id_str,
                    status="failed",
                    error_message="Paper not found",
                )
            )
            continue

        # Check if already downloaded as Document
        existing_doc_result = await db.execute(
            select(Document).where(
                Document.user_id == user.id,
                Document.note == f"paper:{paper_id}",
            )
        )
        existing_doc = existing_doc_result.scalar_one_or_none()

        if existing_doc:
            # Already have local PDF — just add to document list
            resolved_doc_ids.append(str(existing_doc.id))
            continue

        # Need to download PDF
        if not paper.pdf_url:
            results.append(
                DocumentEmbedStatus(
                    document_id=paper_id_str,
                    status="failed",
                    error_message="Paper has no PDF URL",
                )
            )
            continue

        # Find the folder where this paper is bookmarked
        bm_result = await db.execute(
            select(Bookmark.folder_id).where(
                Bookmark.user_id == user.id,
                Bookmark.item_type == "paper",
                Bookmark.item_id == paper_id,
            ).limit(1)
        )
        folder_id = bm_result.scalar_one_or_none()
        if not folder_id:
            # Fallback: use user's first folder
            first_folder_result = await db.execute(
                select(Folder.id).where(Folder.user_id == user.id).limit(1)
            )
            folder_id = first_folder_result.scalar_one_or_none()
            if not folder_id:
                results.append(
                    DocumentEmbedStatus(
                        document_id=paper_id_str,
                        status="failed",
                        error_message="No folder available to save PDF",
                    )
                )
                continue

        # Download PDF
        downloaded_doc = await _download_paper_pdf(paper, user, folder_id, db)
        if downloaded_doc:
            resolved_doc_ids.append(str(downloaded_doc.id))
        else:
            results.append(
                DocumentEmbedStatus(
                    document_id=paper_id_str,
                    status="failed",
                    error_message="Failed to download PDF",
                )
            )

    # ── Now embed all resolved documents ──
    for doc_id_str in resolved_doc_ids:
        doc_id = uuid.UUID(doc_id_str)

        # Verify document belongs to user
        doc_result = await db.execute(
            select(Document).where(Document.id == doc_id, Document.user_id == user.id)
        )
        doc = doc_result.scalar_one_or_none()
        if not doc:
            results.append(
                DocumentEmbedStatus(
                    document_id=doc_id_str,
                    status="failed",
                    error_message="Document not found",
                )
            )
            continue

        # Check supported type
        if doc.content_type not in SUPPORTED_TYPES:
            results.append(
                DocumentEmbedStatus(
                    document_id=doc_id_str,
                    status="failed",
                    error_message=f"Unsupported file type: {doc.content_type}",
                )
            )
            continue

        # Check cache — if already completed, skip
        emb_result = await db.execute(
            select(DocumentEmbedding).where(DocumentEmbedding.document_id == doc_id)
        )
        existing_emb = emb_result.scalar_one_or_none()

        if existing_emb and existing_emb.status == "completed":
            results.append(
                DocumentEmbedStatus(
                    document_id=doc_id_str,
                    status="completed",
                    chunk_count=existing_emb.chunk_count,
                )
            )
            continue

        # Create or update embedding record
        if not existing_emb:
            existing_emb = DocumentEmbedding(
                document_id=doc_id,
                user_id=user.id,
                status="processing",
            )
            db.add(existing_emb)
            await db.flush()
        else:
            existing_emb.status = "processing"
            existing_emb.error_message = None
            await db.flush()

        try:
            # Extract text
            abs_path = file_storage.get_absolute_path(doc.storage_path)
            text = text_extractor.extract(abs_path, doc.content_type)

            if not text.strip():
                existing_emb.status = "failed"
                existing_emb.error_message = "No text could be extracted"
                results.append(
                    DocumentEmbedStatus(
                        document_id=doc_id_str,
                        status="failed",
                        error_message="No text could be extracted",
                    )
                )
                continue

            # Chunk text
            chunks = text_extractor.chunk_text(text)

            if not chunks:
                existing_emb.status = "failed"
                existing_emb.error_message = "Text chunking produced no chunks"
                results.append(
                    DocumentEmbedStatus(
                        document_id=doc_id_str,
                        status="failed",
                        error_message="Text chunking produced no chunks",
                    )
                )
                continue

            # Embed batch
            embeddings = embedding_gen.embed_batch(chunks)

            # Prepare points for Qdrant
            points = []
            for i, (chunk, embedding) in enumerate(zip(chunks, embeddings)):
                point_id = str(uuid.uuid5(uuid.NAMESPACE_URL, f"{doc_id}:{i}"))
                points.append(
                    {
                        "id": point_id,
                        "vector": embedding,
                        "payload": {
                            "user_id": str(user.id),
                            "document_id": str(doc_id),
                            "chunk_index": i,
                            "title": doc.original_filename,
                            "content": chunk,
                            "source_type": "user_document",
                        },
                    }
                )

            # Upsert to Qdrant
            vector_store.upsert_batch(collection="user_docs", points=points)

            # Update embedding record
            existing_emb.status = "completed"
            existing_emb.chunk_count = len(chunks)

            results.append(
                DocumentEmbedStatus(
                    document_id=doc_id_str,
                    status="completed",
                    chunk_count=len(chunks),
                )
            )

        except Exception as e:
            logger.error("Failed to embed document", document_id=doc_id_str, error=str(e))
            existing_emb.status = "failed"
            existing_emb.error_message = str(e)[:500]
            results.append(
                DocumentEmbedStatus(
                    document_id=doc_id_str,
                    status="failed",
                    error_message=str(e)[:200],
                )
            )

    return DocumentEmbedResponse(results=results)


@router.get("/embed-status", response_model=DocumentEmbedResponse)
async def get_embed_status(
    document_ids: str = Query(..., description="Comma-separated document IDs"),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get embedding status for given document IDs."""
    ids = [s.strip() for s in document_ids.split(",") if s.strip()]
    results: list[DocumentEmbedStatus] = []

    for doc_id_str in ids:
        doc_id = uuid.UUID(doc_id_str)
        emb_result = await db.execute(
            select(DocumentEmbedding).where(
                DocumentEmbedding.document_id == doc_id,
                DocumentEmbedding.user_id == user.id,
            )
        )
        emb = emb_result.scalar_one_or_none()
        if emb:
            results.append(
                DocumentEmbedStatus(
                    document_id=doc_id_str,
                    status=emb.status,
                    chunk_count=emb.chunk_count,
                    error_message=emb.error_message,
                )
            )
        else:
            results.append(
                DocumentEmbedStatus(
                    document_id=doc_id_str,
                    status="pending",
                )
            )

    return DocumentEmbedResponse(results=results)


@router.post("/embed-repo", response_model=DocumentEmbedResponse)
async def embed_repos(
    body: RepoEmbedRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Ingest GitHub repos via gitingest, chunk, and embed into Qdrant."""
    from src.services.repo_ingestion import chunk_repo_content, ingest_repo

    embedding_gen = EmbeddingGenerator()
    vector_store = VectorStore()
    results: list[DocumentEmbedStatus] = []

    for repo_id_str in body.repo_ids:
        repo_id = uuid.UUID(repo_id_str)

        # Look up Repository in DB
        repo_result = await db.execute(select(Repository).where(Repository.id == repo_id))
        repo = repo_result.scalar_one_or_none()
        if not repo:
            results.append(
                DocumentEmbedStatus(
                    document_id=repo_id_str,
                    status="failed",
                    error_message="Repository not found",
                )
            )
            continue

        # Check if already ingested — look for Document with note="repo:{repo_id}"
        existing_doc_result = await db.execute(
            select(Document).where(
                Document.user_id == user.id,
                Document.note == f"repo:{repo_id}",
            )
        )
        existing_doc = existing_doc_result.scalar_one_or_none()

        if existing_doc:
            # Check embedding cache
            emb_result = await db.execute(
                select(DocumentEmbedding).where(DocumentEmbedding.document_id == existing_doc.id)
            )
            existing_emb = emb_result.scalar_one_or_none()
            if existing_emb and existing_emb.status == "completed":
                results.append(
                    DocumentEmbedStatus(
                        document_id=str(existing_doc.id),
                        status="completed",
                        chunk_count=existing_emb.chunk_count,
                    )
                )
                continue

        # Find folder from bookmark
        bm_result = await db.execute(
            select(Bookmark.folder_id).where(
                Bookmark.user_id == user.id,
                Bookmark.item_type == "repo",
                Bookmark.item_id == repo_id,
            ).limit(1)
        )
        folder_id = bm_result.scalar_one_or_none()
        if not folder_id:
            first_folder_result = await db.execute(
                select(Folder.id).where(Folder.user_id == user.id).limit(1)
            )
            folder_id = first_folder_result.scalar_one_or_none()
            if not folder_id:
                results.append(
                    DocumentEmbedStatus(
                        document_id=repo_id_str,
                        status="failed",
                        error_message="No folder available",
                    )
                )
                continue

        try:
            # Ingest repo via gitingest
            repo_content = await ingest_repo(repo.html_url)

            # Create or reuse Document record
            if not existing_doc:
                doc_id = uuid.uuid4()
                safe_name = "".join(
                    c if c.isalnum() or c in " -_" else "_" for c in repo.full_name
                )
                filename = f"{safe_name}.txt"

                # Save raw content to file storage
                raw_text = (
                    f"# {repo.full_name}\n\n"
                    f"{repo_content.summary}\n\n"
                    f"## File Structure\n{repo_content.tree}\n\n"
                    f"## Content\n{repo_content.content}"
                )
                storage_path = file_storage.save_file(
                    user_id=user.id,
                    document_id=doc_id,
                    filename=filename,
                    content=raw_text.encode("utf-8"),
                )

                existing_doc = Document(
                    id=doc_id,
                    user_id=user.id,
                    folder_id=folder_id,
                    filename=filename,
                    original_filename=repo.full_name,
                    content_type="text/x-github-repo",
                    file_size=len(raw_text.encode("utf-8")),
                    storage_path=storage_path,
                    note=f"repo:{repo_id}",
                )
                db.add(existing_doc)
                await db.flush()
                await db.refresh(existing_doc)

            # Create or update embedding record
            emb_result = await db.execute(
                select(DocumentEmbedding).where(
                    DocumentEmbedding.document_id == existing_doc.id
                )
            )
            emb_record = emb_result.scalar_one_or_none()
            if not emb_record:
                emb_record = DocumentEmbedding(
                    document_id=existing_doc.id,
                    user_id=user.id,
                    status="processing",
                )
                db.add(emb_record)
                await db.flush()
            else:
                emb_record.status = "processing"
                emb_record.error_message = None
                await db.flush()

            # Chunk repo content
            chunks_data = chunk_repo_content(repo_content)
            if not chunks_data:
                emb_record.status = "failed"
                emb_record.error_message = "No content chunks produced"
                results.append(
                    DocumentEmbedStatus(
                        document_id=str(existing_doc.id),
                        status="failed",
                        error_message="No content chunks produced",
                    )
                )
                continue

            # Embed batch
            chunk_texts = [c["content"] for c in chunks_data]
            embeddings = embedding_gen.embed_batch(chunk_texts)

            # Prepare Qdrant points
            points = []
            for i, (chunk_data, embedding) in enumerate(zip(chunks_data, embeddings)):
                point_id = str(uuid.uuid5(uuid.NAMESPACE_URL, f"{existing_doc.id}:{i}"))
                points.append({
                    "id": point_id,
                    "vector": embedding,
                    "payload": {
                        "user_id": str(user.id),
                        "document_id": str(existing_doc.id),
                        "chunk_index": i,
                        "title": repo.full_name,
                        "content": chunk_data["content"],
                        "file_path": chunk_data["file_path"],
                        "source_type": "github_repo",
                        "url": repo.html_url,
                    },
                })

            # Upsert to Qdrant
            vector_store.upsert_batch(collection="user_docs", points=points)

            emb_record.status = "completed"
            emb_record.chunk_count = len(chunks_data)

            results.append(
                DocumentEmbedStatus(
                    document_id=str(existing_doc.id),
                    status="completed",
                    chunk_count=len(chunks_data),
                )
            )

            logger.info(
                "Repo ingested successfully",
                repo=repo.full_name,
                chunks=len(chunks_data),
            )

        except Exception as e:
            logger.error("Failed to ingest repo", repo_id=repo_id_str, error=str(e))
            if existing_doc:
                emb_result = await db.execute(
                    select(DocumentEmbedding).where(
                        DocumentEmbedding.document_id == existing_doc.id
                    )
                )
                emb_record = emb_result.scalar_one_or_none()
                if emb_record:
                    emb_record.status = "failed"
                    emb_record.error_message = str(e)[:500]

            results.append(
                DocumentEmbedStatus(
                    document_id=repo_id_str,
                    status="failed",
                    error_message=str(e)[:200],
                )
            )

    await db.commit()
    return DocumentEmbedResponse(results=results)


@router.get("/library", response_model=LibraryResponse)
async def get_document_library(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get user's folder tree with documents and bookmarked papers."""
    # Fetch all user folders
    folder_result = await db.execute(
        select(Folder)
        .where(Folder.user_id == user.id)
        .order_by(Folder.position)
    )
    folders = folder_result.scalars().all()

    # Fetch all user documents with supported types
    doc_result = await db.execute(
        select(Document)
        .where(
            Document.user_id == user.id,
            Document.content_type.in_(SUPPORTED_TYPES),
        )
        .order_by(Document.created_at.desc())
    )
    documents = doc_result.scalars().all()

    # Fetch bookmarked papers (item_type="paper") with their Paper data
    bookmark_result = await db.execute(
        select(Bookmark, Paper)
        .join(Paper, Bookmark.item_id == Paper.id)
        .where(
            Bookmark.user_id == user.id,
            Bookmark.item_type == "paper",
            Bookmark.item_id.isnot(None),
        )
    )
    bookmark_paper_rows = bookmark_result.all()

    # Fetch bookmarked repos (item_type="repo") with their Repository data
    repo_bookmark_result = await db.execute(
        select(Bookmark, Repository)
        .join(Repository, Bookmark.item_id == Repository.id)
        .where(
            Bookmark.user_id == user.id,
            Bookmark.item_type == "repo",
            Bookmark.item_id.isnot(None),
        )
    )
    bookmark_repo_rows = repo_bookmark_result.all()

    # Check which papers already have a local Document (downloaded PDF)
    # We look for documents whose note starts with "paper:" to link them
    paper_ids = [str(row.Paper.id) for row in bookmark_paper_rows]
    local_paper_docs: dict[str, str] = {}  # paper_id -> document_id

    # Check which repos already have a local Document (ingested)
    repo_ids = [str(row.Repository.id) for row in bookmark_repo_rows]
    local_repo_docs: dict[str, str] = {}  # repo_id -> document_id

    # Fetch all linked documents (papers + repos) in one query
    note_filters = [f"paper:{pid}" for pid in paper_ids] + [f"repo:{rid}" for rid in repo_ids]
    if note_filters:
        local_doc_result = await db.execute(
            select(Document)
            .where(
                Document.user_id == user.id,
                Document.note.in_(note_filters),
            )
        )
        for doc in local_doc_result.scalars().all():
            if doc.note and doc.note.startswith("paper:"):
                p_id = doc.note[6:]  # strip "paper:" prefix
                local_paper_docs[p_id] = str(doc.id)
            elif doc.note and doc.note.startswith("repo:"):
                r_id = doc.note[5:]  # strip "repo:" prefix
                local_repo_docs[r_id] = str(doc.id)

    # Group documents by folder_id
    docs_by_folder: dict[str, list] = {}
    for doc in documents:
        folder_key = str(doc.folder_id)
        if folder_key not in docs_by_folder:
            docs_by_folder[folder_key] = []
        docs_by_folder[folder_key].append(
            LibraryDocument(
                id=str(doc.id),
                filename=doc.filename,
                original_filename=doc.original_filename,
                content_type=doc.content_type,
                file_size=doc.file_size,
                created_at=doc.created_at,
            )
        )

    # Group papers by folder_id (from bookmark)
    papers_by_folder: dict[str, list] = {}
    for row in bookmark_paper_rows:
        bookmark = row.Bookmark
        paper = row.Paper
        folder_key = str(bookmark.folder_id)
        paper_id_str = str(paper.id)
        if folder_key not in papers_by_folder:
            papers_by_folder[folder_key] = []
        papers_by_folder[folder_key].append(
            LibraryPaper(
                paper_id=paper_id_str,
                title=paper.title,
                pdf_url=paper.pdf_url,
                arxiv_id=paper.arxiv_id,
                source=paper.source,
                has_local_pdf=paper_id_str in local_paper_docs,
                document_id=local_paper_docs.get(paper_id_str),
                folder_id=folder_key,
            )
        )

    # Group repos by folder_id (from bookmark)
    repos_by_folder: dict[str, list] = {}
    for row in bookmark_repo_rows:
        bookmark = row.Bookmark
        repository = row.Repository
        folder_key = str(bookmark.folder_id)
        repo_id_str = str(repository.id)
        if folder_key not in repos_by_folder:
            repos_by_folder[folder_key] = []
        repos_by_folder[folder_key].append(
            LibraryRepo(
                repo_id=repo_id_str,
                full_name=repository.full_name,
                description=repository.description,
                html_url=repository.html_url,
                stars_count=repository.stars_count,
                primary_language=repository.primary_language,
                has_local_doc=repo_id_str in local_repo_docs,
                document_id=local_repo_docs.get(repo_id_str),
                folder_id=folder_key,
            )
        )

    # Build folder tree
    folder_map: dict[str, LibraryFolder] = {}
    for f in folders:
        folder_map[str(f.id)] = LibraryFolder(
            id=str(f.id),
            name=f.name,
            parent_id=str(f.parent_id) if f.parent_id else None,
            documents=docs_by_folder.get(str(f.id), []),
            papers=papers_by_folder.get(str(f.id), []),
            repos=repos_by_folder.get(str(f.id), []),
            children=[],
        )

    # Nest children
    root_folders = []
    for fid, folder in folder_map.items():
        if folder.parent_id and folder.parent_id in folder_map:
            folder_map[folder.parent_id].children.append(folder)
        else:
            root_folders.append(folder)

    return LibraryResponse(folders=root_folders)


