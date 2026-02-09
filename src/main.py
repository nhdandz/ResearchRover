from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from uvicorn.middleware.proxy_headers import ProxyHeadersMiddleware

from src.api.routers import alerts, auth, bookmarks, chat, document_chat, documents, folders, health, papers, reports, repositories, search, trending
from src.core.config import get_settings
from src.core.logging import setup_logging


@asynccontextmanager
async def lifespan(app: FastAPI):
    setup_logging()
    # Initialize Qdrant collections if they don't exist
    from src.storage.vector.qdrant_client import VectorStore
    VectorStore().init_collections()
    # Preload embedding model at startup so /search doesn't block later
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
        allow_origins=["*"],  # Allow all origins for tunnel access
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # Trust proxy headers for correct HTTPS redirects through Cloudflare tunnel
    app.add_middleware(ProxyHeadersMiddleware, trusted_hosts=["*"])

    # Register routers
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

    return app


app = create_app()
