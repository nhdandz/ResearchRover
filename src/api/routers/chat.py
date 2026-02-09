import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from src.api.deps import get_current_user, get_db
from src.api.schemas.chat import (
    ChatMessageResponse,
    ContextModeUpdate,
    ConversationCreate,
    ConversationDetail,
    ConversationMessageRequest,
    ConversationResponse,
)
from src.api.schemas.document_chat import ConversationDocumentsUpdate
from src.api.schemas.search import ChatRequest, ChatResponse
from src.core.config import get_settings
from src.llm.router import LLMRouter
from src.processors.embedding import EmbeddingGenerator
from src.rag.generator import AnswerGenerator
from src.rag.pipeline import RAGPipeline
from src.rag.reranker import CrossEncoderReranker
from src.rag.retriever import HybridRetriever
from src.storage.models.conversation import ChatMessage, Conversation
from src.storage.models.conversation_document import ConversationDocument
from src.storage.models.document import Document
from src.storage.models.document_embedding import DocumentEmbedding
from src.storage.models.user import User
from src.storage.vector.qdrant_client import VectorStore

router = APIRouter(prefix="/chat", tags=["RAG Chat"])


def _get_rag_pipeline() -> RAGPipeline:
    vector_store = VectorStore()
    embedding_gen = EmbeddingGenerator()
    retriever = HybridRetriever(vector_store, embedding_gen)
    reranker = CrossEncoderReranker()
    llm = LLMRouter()
    generator = AnswerGenerator(llm)
    return RAGPipeline(retriever, reranker, generator, llm_client=llm)


@router.post("/", response_model=ChatResponse)
async def chat(request: ChatRequest):
    rag = _get_rag_pipeline()

    response = await rag.query(
        question=request.question,
        filters=request.filters,
    )

    return ChatResponse(
        answer=response.answer,
        sources=response.sources,
        confidence=response.confidence,
    )


# ── Conversation CRUD (requires auth) ──


@router.get("/conversations", response_model=list[ConversationResponse])
async def list_conversations(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Conversation)
        .where(Conversation.user_id == user.id)
        .order_by(Conversation.updated_at.desc())
    )
    conversations = result.scalars().all()

    items = []
    for conv in conversations:
        # Get last message preview
        msg_result = await db.execute(
            select(ChatMessage)
            .where(ChatMessage.conversation_id == conv.id)
            .order_by(ChatMessage.created_at.desc())
            .limit(1)
        )
        last_msg = msg_result.scalar_one_or_none()
        preview = last_msg.content[:100] if last_msg else None

        items.append(
            ConversationResponse(
                id=str(conv.id),
                title=conv.title,
                mode=conv.chat_mode,
                context_mode=conv.context_mode,
                created_at=conv.created_at,
                updated_at=conv.updated_at,
                last_message_preview=preview,
            )
        )
    return items


@router.post("/conversations", response_model=ConversationResponse, status_code=201)
async def create_conversation(
    body: ConversationCreate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    conv = Conversation(user_id=user.id, title=body.title, chat_mode=body.mode, context_mode=body.context_mode)
    db.add(conv)
    await db.flush()
    await db.refresh(conv)

    return ConversationResponse(
        id=str(conv.id),
        title=conv.title,
        mode=conv.chat_mode,
        context_mode=conv.context_mode,
        created_at=conv.created_at,
        updated_at=conv.updated_at,
        last_message_preview=None,
    )


@router.get("/conversations/{conversation_id}", response_model=ConversationDetail)
async def get_conversation(
    conversation_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Conversation)
        .options(selectinload(Conversation.messages))
        .where(Conversation.id == conversation_id, Conversation.user_id == user.id)
    )
    conv = result.scalar_one_or_none()
    if not conv:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Conversation not found")

    # Get document IDs if document mode
    document_ids = []
    if conv.chat_mode == "documents":
        doc_result = await db.execute(
            select(ConversationDocument.document_id).where(
                ConversationDocument.conversation_id == conversation_id
            )
        )
        document_ids = [str(d) for d in doc_result.scalars().all()]

    return ConversationDetail(
        id=str(conv.id),
        title=conv.title,
        mode=conv.chat_mode,
        context_mode=conv.context_mode,
        created_at=conv.created_at,
        updated_at=conv.updated_at,
        document_ids=document_ids,
        messages=[
            ChatMessageResponse(
                id=str(m.id),
                role=m.role,
                content=m.content,
                citations=m.citations,
                confidence=m.confidence,
                created_at=m.created_at,
            )
            for m in conv.messages
        ],
    )


@router.delete("/conversations/{conversation_id}", status_code=204)
async def delete_conversation(
    conversation_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Conversation).where(
            Conversation.id == conversation_id, Conversation.user_id == user.id
        )
    )
    conv = result.scalar_one_or_none()
    if not conv:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Conversation not found")

    await db.delete(conv)


@router.post(
    "/conversations/{conversation_id}/messages",
    response_model=list[ChatMessageResponse],
)
async def send_conversation_message(
    conversation_id: uuid.UUID,
    body: ConversationMessageRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Conversation).where(
            Conversation.id == conversation_id, Conversation.user_id == user.id
        )
    )
    conv = result.scalar_one_or_none()
    if not conv:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Conversation not found")

    # Set title from first question if not set
    if not conv.title:
        conv.title = body.question[:100]

    # Save user message
    user_msg = ChatMessage(
        conversation_id=conv.id,
        role="user",
        content=body.question,
    )
    db.add(user_msg)

    # Call RAG pipeline — route based on conversation mode
    rag = _get_rag_pipeline()

    try:
        if conv.chat_mode == "documents":
            if conv.context_mode == "full_context":
                rag_response = await _query_full_context_mode(
                    rag, body.question, str(user.id), conv.id, db
                )
            else:
                # Document mode — search only user_docs collection
                rag_response = await _query_document_mode(rag, body.question, str(user.id))
        else:
            # Global mode — default RAG over papers/repos/chunks
            rag_response = await rag.query(question=body.question, filters=body.filters)
    except Exception:
        from src.rag.pipeline import RAGResponse

        rag_response = RAGResponse(
            answer="The language model is currently unavailable. Please try again later.",
            sources=[],
            confidence=0.0,
        )

    # Save assistant message
    assistant_msg = ChatMessage(
        conversation_id=conv.id,
        role="assistant",
        content=rag_response.answer,
        citations=rag_response.sources,
        confidence=rag_response.confidence,
    )
    db.add(assistant_msg)

    await db.flush()
    await db.refresh(user_msg)
    await db.refresh(assistant_msg)

    return [
        ChatMessageResponse(
            id=str(user_msg.id),
            role=user_msg.role,
            content=user_msg.content,
            citations=None,
            confidence=None,
            created_at=user_msg.created_at,
        ),
        ChatMessageResponse(
            id=str(assistant_msg.id),
            role=assistant_msg.role,
            content=assistant_msg.content,
            citations=assistant_msg.citations,
            confidence=assistant_msg.confidence,
            created_at=assistant_msg.created_at,
        ),
    ]


async def _query_document_mode(rag: RAGPipeline, question: str, user_id: str):
    """Query RAG pipeline in document mode — only search user_docs collection."""
    from src.core.logging import get_logger
    from src.rag.pipeline import RAGResponse, _is_english

    logger = get_logger(__name__)

    search_query = question
    if not _is_english(question):
        try:
            search_query = await rag._translate_to_english(question)
        except Exception:
            search_query = question

    # Retrieve only from user_docs with user_id filter
    retrieved = await rag.retriever.retrieve(
        query=search_query,
        top_k=10,
        filters={"user_id": user_id},
        collections=["user_docs"],
    )

    if not retrieved:
        try:
            fallback_answer = await rag.generator.generate_fallback(query=question)
        except Exception as e:
            logger.error("LLM fallback generation failed", error=str(e))
            fallback_answer = (
                "Sorry, I couldn't find relevant information in your documents "
                "and the language model is currently unavailable. Please try again later."
            )
        return RAGResponse(answer=fallback_answer, sources=[], confidence=0.0)

    reranked = await rag.reranker.rerank(
        query=search_query, documents=retrieved, top_k=5
    )

    try:
        answer, citations = await rag.generator.generate(
            query=question, context=reranked
        )
    except Exception as e:
        logger.error("LLM generation failed", error=str(e))
        answer = (
            "I found relevant documents but the language model is currently unavailable. "
            "Please try again later. Found sources are listed below."
        )

    sources = [
        {
            "id": doc.id,
            "type": doc.source_type,
            "title": doc.title,
            "url": doc.url,
            "relevance_score": doc.score,
        }
        for doc in reranked
    ]

    return RAGResponse(
        answer=answer,
        sources=sources,
        confidence=rag._calculate_confidence(reranked),
    )


FULL_CONTEXT_PROMPT = """You are a knowledgeable assistant. Answer the question based on the provided documents/code.

Rules:
1. Use information from the provided content to answer thoroughly
2. Reference specific files or sections when relevant
3. If the content doesn't contain the answer, say so
4. Be concise but thorough

Content:
{context}

Question: {question}

Answer:"""

FULL_CONTEXT_CHAR_LIMIT = 100_000


async def _query_full_context_mode(
    rag: RAGPipeline,
    question: str,
    user_id: str,
    conversation_id: uuid.UUID,
    db: AsyncSession,
):
    """Query LLM with full document content instead of RAG retrieval."""
    from src.core.logging import get_logger
    from src.rag.pipeline import RAGResponse
    from src.services.file_storage import FileStorageService
    from src.services.text_extractor import TextExtractor

    logger = get_logger(__name__)

    # 1. Get document IDs for this conversation
    doc_result = await db.execute(
        select(ConversationDocument.document_id).where(
            ConversationDocument.conversation_id == conversation_id
        )
    )
    doc_ids = doc_result.scalars().all()

    logger.info(
        "Full context mode: querying documents",
        conversation_id=str(conversation_id),
        doc_ids_count=len(doc_ids),
        doc_ids=[str(d) for d in doc_ids],
    )

    if not doc_ids:
        # Fallback: use all embedded documents for this user
        logger.warning(
            "No ConversationDocument records found, falling back to all user embedded docs",
            conversation_id=str(conversation_id),
            user_id=user_id,
        )
        fallback_result = await db.execute(
            select(DocumentEmbedding.document_id).where(
                DocumentEmbedding.user_id == user_id,
                DocumentEmbedding.status == "completed",
            )
        )
        doc_ids = fallback_result.scalars().all()

        if not doc_ids:
            return RAGResponse(
                answer="No documents are attached to this conversation. Please add documents via 'Manage Sources' first.",
                sources=[],
                confidence=0.0,
            )

    # 2. Load documents and read file content
    file_storage = FileStorageService()
    extractor = TextExtractor()
    context_parts = []
    sources = []

    errors = []
    for doc_id in doc_ids:
        doc_result = await db.execute(
            select(Document).where(Document.id == doc_id)
        )
        doc = doc_result.scalar_one_or_none()
        if not doc:
            errors.append(f"Document {doc_id} not found in database")
            continue

        try:
            abs_path = file_storage.get_absolute_path(doc.storage_path)
            logger.info(
                "Reading document for full context",
                document_id=str(doc_id),
                path=abs_path,
                content_type=doc.content_type,
            )

            import os
            if not os.path.exists(abs_path):
                errors.append(f"{doc.original_filename}: file not found at {abs_path}")
                continue

            content = extractor.extract(abs_path, doc.content_type)
            if not content or not content.strip():
                errors.append(f"{doc.original_filename}: extracted text is empty")
                continue

            context_parts.append(f"## Document: {doc.original_filename}\n{content}")
            sources.append({
                "id": str(doc.id),
                "type": "document",
                "title": doc.original_filename,
                "url": None,
                "relevance_score": 1.0,
            })
        except Exception as e:
            logger.error(
                "Failed to read document for full context",
                document_id=str(doc_id),
                storage_path=doc.storage_path,
                content_type=doc.content_type,
                error=str(e),
            )
            errors.append(f"{doc.original_filename}: {str(e)}")

    if not context_parts:
        error_detail = "\n".join(f"- {e}" for e in errors) if errors else "Unknown error"
        return RAGResponse(
            answer=f"Could not read any of the attached documents.\n\nErrors:\n{error_detail}",
            sources=[],
            confidence=0.0,
        )

    # 3. Join and truncate
    full_context = "\n---\n".join(context_parts)
    truncated = False
    if len(full_context) > FULL_CONTEXT_CHAR_LIMIT:
        full_context = full_context[:FULL_CONTEXT_CHAR_LIMIT]
        truncated = True

    # 4. Build prompt and call LLM
    prompt = FULL_CONTEXT_PROMPT.format(context=full_context, question=question)

    try:
        answer = await rag.generator.llm.generate(prompt, max_tokens=2000, temperature=0.3)
    except Exception as e:
        logger.error("LLM generation failed in full context mode", error=str(e))
        answer = "The language model is currently unavailable. Please try again later."

    if truncated:
        answer += "\n\n*Note: Document content was truncated due to size limits. Consider using RAG mode for large documents.*"

    return RAGResponse(answer=answer, sources=sources, confidence=1.0)


@router.patch(
    "/conversations/{conversation_id}/context-mode",
    response_model=ConversationResponse,
)
async def update_context_mode(
    conversation_id: uuid.UUID,
    body: ContextModeUpdate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Update the context mode (rag / full_context) of a conversation."""
    if body.context_mode not in ("rag", "full_context"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="context_mode must be 'rag' or 'full_context'",
        )

    result = await db.execute(
        select(Conversation).where(
            Conversation.id == conversation_id, Conversation.user_id == user.id
        )
    )
    conv = result.scalar_one_or_none()
    if not conv:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Conversation not found")

    conv.context_mode = body.context_mode
    await db.flush()
    await db.refresh(conv)

    return ConversationResponse(
        id=str(conv.id),
        title=conv.title,
        mode=conv.chat_mode,
        context_mode=conv.context_mode,
        created_at=conv.created_at,
        updated_at=conv.updated_at,
        last_message_preview=None,
    )


# ── Conversation ↔ Documents endpoints ──


@router.put(
    "/conversations/{conversation_id}/documents",
    response_model=list[str],
)
async def set_conversation_documents(
    conversation_id: uuid.UUID,
    body: ConversationDocumentsUpdate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Set the document list for a conversation (replaces existing)."""
    conv_result = await db.execute(
        select(Conversation).where(
            Conversation.id == conversation_id, Conversation.user_id == user.id
        )
    )
    conv = conv_result.scalar_one_or_none()
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found")

    # Delete existing links
    await db.execute(
        delete(ConversationDocument).where(
            ConversationDocument.conversation_id == conversation_id
        )
    )

    # Insert new links
    for doc_id_str in body.document_ids:
        doc_id = uuid.UUID(doc_id_str)
        doc_result = await db.execute(
            select(Document).where(Document.id == doc_id, Document.user_id == user.id)
        )
        if doc_result.scalar_one_or_none():
            db.add(
                ConversationDocument(
                    conversation_id=conversation_id,
                    document_id=doc_id,
                )
            )

    await db.flush()
    return body.document_ids


@router.get(
    "/conversations/{conversation_id}/documents",
    response_model=list[str],
)
async def get_conversation_documents(
    conversation_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get document IDs attached to a conversation."""
    conv_result = await db.execute(
        select(Conversation).where(
            Conversation.id == conversation_id, Conversation.user_id == user.id
        )
    )
    if not conv_result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Conversation not found")

    result = await db.execute(
        select(ConversationDocument.document_id).where(
            ConversationDocument.conversation_id == conversation_id
        )
    )
    doc_ids = result.scalars().all()
    return [str(d) for d in doc_ids]
