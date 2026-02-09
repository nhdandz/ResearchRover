import uuid
from datetime import datetime

from pydantic import BaseModel


# ── Folder schemas ──

class FolderCreate(BaseModel):
    name: str
    parent_id: uuid.UUID | None = None
    icon: str | None = None
    position: int = 0


class FolderUpdate(BaseModel):
    name: str | None = None
    parent_id: uuid.UUID | None = None
    icon: str | None = None
    position: int | None = None


class FolderResponse(BaseModel):
    id: uuid.UUID
    parent_id: uuid.UUID | None
    name: str
    icon: str | None
    position: int
    created_at: datetime
    updated_at: datetime
    children: list["FolderResponse"] = []
    bookmark_count: int = 0

    model_config = {"from_attributes": True}


# ── Bookmark schemas ──

class BookmarkCreate(BaseModel):
    folder_id: uuid.UUID
    item_type: str  # paper, repo, huggingface, external
    item_id: uuid.UUID | None = None
    external_url: str | None = None
    external_title: str | None = None
    external_metadata: dict | None = None
    note: str | None = None


class BookmarkUpdate(BaseModel):
    folder_id: uuid.UUID | None = None
    note: str | None = None


class BookmarkResponse(BaseModel):
    id: uuid.UUID
    folder_id: uuid.UUID
    item_type: str
    item_id: uuid.UUID | None
    external_url: str | None
    external_title: str | None
    external_metadata: dict | None
    note: str | None
    created_at: datetime

    model_config = {"from_attributes": True}


# ── Document schemas ──

class DocumentResponse(BaseModel):
    id: uuid.UUID
    folder_id: uuid.UUID
    filename: str
    original_filename: str
    content_type: str
    file_size: int
    note: str | None
    created_at: datetime

    model_config = {"from_attributes": True}


class DocumentUpdate(BaseModel):
    folder_id: uuid.UUID | None = None
    note: str | None = None


# ── Folder contents (Drive-like) ──

class BreadcrumbItem(BaseModel):
    id: uuid.UUID
    name: str


class FolderContentsResponse(BaseModel):
    folder: FolderResponse | None
    breadcrumb: list[BreadcrumbItem]
    subfolders: list[FolderResponse]
    bookmarks: list[BookmarkResponse]
    documents: list[DocumentResponse]


class DocumentContentResponse(BaseModel):
    content: str
    content_type: str
    filename: str
