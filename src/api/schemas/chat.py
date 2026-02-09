from datetime import datetime

from pydantic import BaseModel


class ConversationCreate(BaseModel):
    title: str | None = None
    mode: str = "global"  # "global" | "documents"
    context_mode: str = "rag"  # "rag" | "full_context"


class ChatMessageResponse(BaseModel):
    id: str
    role: str
    content: str
    citations: list[dict] | None = None
    confidence: float | None = None
    created_at: datetime

    class Config:
        from_attributes = True


class ConversationResponse(BaseModel):
    id: str
    title: str | None = None
    mode: str = "global"
    context_mode: str = "rag"
    created_at: datetime
    updated_at: datetime
    last_message_preview: str | None = None

    class Config:
        from_attributes = True


class ConversationDetail(BaseModel):
    id: str
    title: str | None = None
    mode: str = "global"
    context_mode: str = "rag"
    created_at: datetime
    updated_at: datetime
    messages: list[ChatMessageResponse] = []
    document_ids: list[str] = []

    class Config:
        from_attributes = True


class ContextModeUpdate(BaseModel):
    context_mode: str  # "rag" | "full_context"


class ConversationMessageRequest(BaseModel):
    question: str
    filters: dict | None = None
