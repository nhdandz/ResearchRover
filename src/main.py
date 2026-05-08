from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from uvicorn.middleware.proxy_headers import ProxyHeadersMiddleware

from src.api.routers import (
    alerts,
    auth,
    bookmarks,
    chat,
    community,
    document_chat,
    documents,
    folders,
    health,
    papers,
    reports,
    repositories,
    search,
    trending,
)
from src.api.routers.user_alerts import router as user_alerts_router
from src.api.routers.user_feed import router as user_feed_router
from src.api.routers.saved_searches import router as saved_searches_router
from src.api.routers.user_digest import router as user_digest_router
from src.api.routers.paper_notes import router as paper_notes_router
from src.api.routers.notifications import router as notifications_router
from src.api.routers.authors import router as authors_router
from src.api.routers.intelligence import router as intelligence_router
from src.api.routers.research_assistant import router as research_assistant_router
from src.core.config import get_settings
from src.core.logging import setup_logging


@asynccontextmanager
async def lifespan(app: FastAPI):
    setup_logging()
    from src.storage.vector.qdrant_client import VectorStore
    VectorStore().init_collections()
    import threading
    def _preload():
        from src.processors.embedding import EmbeddingGenerator
        EmbeddingGenerator().model
    threading.Thread(target=_preload, daemon=True).start()
    yield


def create_app() -> FastAPI:
    settings = get_settings()

    app = FastAPI(
        title=settings.APP_NAME,
        version="0.1.0",
        description="OSINT Research Automation System",
        lifespan=lifespan,
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    app.add_middleware(ProxyHeadersMiddleware, trusted_hosts=["*"])

    # ── Core routers ──
    app.include_router(health.router)
    app.include_router(auth.router)
    app.include_router(papers.router)
    app.include_router(repositories.router)
    app.include_router(search.router)
    app.include_router(trending.router)
    app.include_router(chat.router)
    app.include_router(document_chat.router)
    app.include_router(reports.router)
    app.include_router(alerts.router)
    app.include_router(folders.router)
    app.include_router(bookmarks.router)
    app.include_router(documents.router)
    app.include_router(community.router)

    # ── Personalization routers ──
    app.include_router(user_alerts_router)
    app.include_router(user_feed_router)
    app.include_router(saved_searches_router)
    app.include_router(user_digest_router)
    app.include_router(paper_notes_router)
    app.include_router(notifications_router)

    # ── OSINT intelligence routers ──
    app.include_router(authors_router)
    app.include_router(intelligence_router)
    app.include_router(research_assistant_router)

    return app


app = create_app()
