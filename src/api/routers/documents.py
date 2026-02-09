import os
import uuid

import re

import httpx
from fastapi import APIRouter, HTTPException, UploadFile, status
from fastapi.responses import FileResponse
from pydantic import BaseModel
from sqlalchemy import delete, select, update

from src.api.deps import DbSession, SettingsDep, get_current_user_dep
from src.api.schemas.folder import DocumentContentResponse, DocumentResponse, DocumentUpdate
from src.core.logging import get_logger
from src.services.file_storage import FileStorageService
from src.storage.models.document import Document
from src.storage.models.document_embedding import DocumentEmbedding
from src.storage.models.folder import Folder
from src.storage.models.paper import Paper
from src.storage.vector.qdrant_client import VectorStore

logger = get_logger(__name__)

router = APIRouter(prefix="/documents", tags=["documents"])

file_storage = FileStorageService()


@router.post("/upload/{folder_id}", response_model=DocumentResponse, status_code=status.HTTP_201_CREATED)
async def upload_document(
    folder_id: uuid.UUID,
    file: UploadFile,
    current_user: get_current_user_dep,
    db: DbSession,
    settings: SettingsDep,
):
    """Upload a file to a folder."""
    # Verify folder belongs to user
    result = await db.execute(
        select(Folder).where(Folder.id == folder_id, Folder.user_id == current_user.id)
    )
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Folder not found")

    # Read file content
    content = await file.read()
    max_bytes = settings.MAX_FILE_SIZE_MB * 1024 * 1024
    if len(content) > max_bytes:
        raise HTTPException(
            status_code=413,
            detail=f"File too large. Maximum size is {settings.MAX_FILE_SIZE_MB}MB",
        )

    doc_id = uuid.uuid4()
    original_filename = file.filename or "unnamed"
    content_type = file.content_type or "application/octet-stream"

    storage_path = file_storage.save_file(
        user_id=current_user.id,
        document_id=doc_id,
        filename=original_filename,
        content=content,
    )

    document = Document(
        id=doc_id,
        user_id=current_user.id,
        folder_id=folder_id,
        filename=original_filename,
        original_filename=original_filename,
        content_type=content_type,
        file_size=len(content),
        storage_path=storage_path,
    )
    db.add(document)
    await db.flush()
    await db.refresh(document)
    return document


class SavePaperRequest(BaseModel):
    paper_id: uuid.UUID
    folder_id: uuid.UUID


def _sanitize_filename(name: str) -> str:
    name = re.sub(r'[<>:"/\\|?*]', '_', name)
    return name[:200].strip() if name else "paper"


@router.post("/save-paper", response_model=DocumentResponse, status_code=status.HTTP_201_CREATED)
async def save_paper_to_folder(
    body: SavePaperRequest,
    current_user: get_current_user_dep,
    db: DbSession,
    settings: SettingsDep,
):
    """Download a paper's PDF and save it as a document in the given folder."""
    # Verify folder belongs to user
    result = await db.execute(
        select(Folder).where(Folder.id == body.folder_id, Folder.user_id == current_user.id)
    )
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Folder not found")

    # Get paper
    result = await db.execute(select(Paper).where(Paper.id == body.paper_id))
    paper = result.scalar_one_or_none()
    if not paper:
        raise HTTPException(status_code=404, detail="Paper not found")

    if not paper.pdf_url:
        raise HTTPException(status_code=400, detail="Paper does not have a PDF URL")

    # Download PDF from external URL
    try:
        async with httpx.AsyncClient(follow_redirects=True, timeout=60.0) as client:
            resp = await client.get(paper.pdf_url)
            resp.raise_for_status()
            content = resp.content
    except httpx.HTTPError as e:
        logger.warning("Failed to download paper PDF", paper_id=str(body.paper_id), error=str(e))
        raise HTTPException(status_code=502, detail="Failed to download PDF from source")

    max_bytes = settings.MAX_FILE_SIZE_MB * 1024 * 1024
    if len(content) > max_bytes:
        raise HTTPException(
            status_code=413,
            detail=f"PDF too large. Maximum size is {settings.MAX_FILE_SIZE_MB}MB",
        )

    filename = _sanitize_filename(paper.title) + ".pdf"
    doc_id = uuid.uuid4()

    storage_path = file_storage.save_file(
        user_id=current_user.id,
        document_id=doc_id,
        filename=filename,
        content=content,
    )

    document = Document(
        id=doc_id,
        user_id=current_user.id,
        folder_id=body.folder_id,
        filename=filename,
        original_filename=filename,
        content_type="application/pdf",
        file_size=len(content),
        storage_path=storage_path,
    )
    db.add(document)
    await db.flush()
    await db.refresh(document)
    return document


@router.get("/{document_id}/download")
async def download_document(
    document_id: uuid.UUID,
    current_user: get_current_user_dep,
    db: DbSession,
):
    """Download a document file."""
    result = await db.execute(
        select(Document).where(Document.id == document_id, Document.user_id == current_user.id)
    )
    document = result.scalar_one_or_none()
    if not document:
        raise HTTPException(status_code=404, detail="Document not found")

    abs_path = file_storage.get_absolute_path(document.storage_path)
    if not os.path.exists(abs_path):
        raise HTTPException(status_code=404, detail="File not found on disk")
    return FileResponse(
        path=abs_path,
        filename=document.original_filename,
        media_type=document.content_type,
    )


@router.get("/{document_id}/content", response_model=DocumentContentResponse)
async def get_document_content(
    document_id: uuid.UUID,
    current_user: get_current_user_dep,
    db: DbSession,
):
    """Return text content for text-based files (TXT, MD, CSV)."""
    result = await db.execute(
        select(Document).where(Document.id == document_id, Document.user_id == current_user.id)
    )
    document = result.scalar_one_or_none()
    if not document:
        raise HTTPException(status_code=404, detail="Document not found")

    TEXT_TYPES = {
        "text/plain", "text/markdown", "text/csv",
        "text/html", "application/json", "text/xml",
    }
    TEXT_EXTS = {
        "txt", "md", "csv", "json", "xml", "html", "log", "yml", "yaml",
        "py", "js", "ts", "jsx", "tsx", "rs", "go", "java", "c", "cpp",
        "h", "hpp", "cs", "rb", "php", "sh", "bash", "zsh", "bat",
        "sql", "r", "m", "swift", "kt", "scala", "lua", "pl",
        "toml", "ini", "cfg", "conf", "env", "gitignore", "dockerfile",
        "makefile", "cmake", "gradle", "properties",
    }
    ext = document.original_filename.rsplit(".", 1)[-1].lower() if "." in document.original_filename else ""

    is_text = (
        document.content_type in TEXT_TYPES
        or document.content_type.startswith("text/")
        or ext in TEXT_EXTS
    )
    if not is_text:
        raise HTTPException(status_code=400, detail="File type does not support text preview")

    content_type = document.content_type if document.content_type in TEXT_TYPES else "text/plain"

    abs_path = file_storage.get_absolute_path(document.storage_path)
    if not os.path.exists(abs_path):
        raise HTTPException(status_code=404, detail="File not found on disk")
    max_size = 1 * 1024 * 1024  # 1MB
    if os.path.getsize(abs_path) > max_size:
        raise HTTPException(status_code=413, detail="File too large for text preview (max 1MB)")

    with open(abs_path, "r", encoding="utf-8", errors="replace") as f:
        text = f.read()

    return DocumentContentResponse(
        content=text,
        content_type=content_type,
        filename=document.original_filename,
    )


@router.patch("/{document_id}", response_model=DocumentResponse)
async def update_document(
    document_id: uuid.UUID,
    body: DocumentUpdate,
    current_user: get_current_user_dep,
    db: DbSession,
):
    """Update a document (move folder or edit note)."""
    result = await db.execute(
        select(Document).where(Document.id == document_id, Document.user_id == current_user.id)
    )
    document = result.scalar_one_or_none()
    if not document:
        raise HTTPException(status_code=404, detail="Document not found")

    update_data = body.model_dump(exclude_unset=True)

    # Verify target folder belongs to user
    if "folder_id" in update_data and update_data["folder_id"]:
        result = await db.execute(
            select(Folder).where(
                Folder.id == update_data["folder_id"], Folder.user_id == current_user.id
            )
        )
        if not result.scalar_one_or_none():
            raise HTTPException(status_code=404, detail="Target folder not found")

    if update_data:
        await db.execute(
            update(Document).where(Document.id == document_id).values(**update_data)
        )
        await db.flush()
        await db.refresh(document)

    return document


@router.delete("/{document_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_document(
    document_id: uuid.UUID,
    current_user: get_current_user_dep,
    db: DbSession,
):
    """Delete a document and its physical file."""
    result = await db.execute(
        select(Document).where(Document.id == document_id, Document.user_id == current_user.id)
    )
    document = result.scalar_one_or_none()
    if not document:
        raise HTTPException(status_code=404, detail="Document not found")

    # Cleanup embeddings from Qdrant if they exist
    emb_result = await db.execute(
        select(DocumentEmbedding).where(DocumentEmbedding.document_id == document_id)
    )
    emb = emb_result.scalar_one_or_none()
    if emb and emb.chunk_count > 0:
        try:
            vector_store = VectorStore()
            point_ids = [
                str(uuid.uuid5(uuid.NAMESPACE_URL, f"{document_id}:{i}"))
                for i in range(emb.chunk_count)
            ]
            vector_store.delete(collection="user_docs", point_ids=point_ids)
        except Exception as e:
            logger.warning("Failed to cleanup vectors", document_id=str(document_id), error=str(e))

    # Delete embedding record
    await db.execute(delete(DocumentEmbedding).where(DocumentEmbedding.document_id == document_id))

    # Delete physical file
    file_storage.delete_file(current_user.id, document_id)

    # Delete DB record
    await db.execute(delete(Document).where(Document.id == document_id))
