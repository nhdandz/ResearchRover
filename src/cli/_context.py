"""Factory functions for CLI dependencies."""

from urllib.parse import urlparse, urlunparse

from rich.console import Console

from src.core.config import Settings, get_settings

console = Console(stderr=True)

# Docker-internal hostnames → localhost for local CLI usage
_DOCKER_HOSTS = {"postgres", "redis", "qdrant", "ollama", "app"}


def _localize_url(url: str) -> str:
    """Replace Docker-internal hostnames with localhost."""
    parsed = urlparse(url)
    if parsed.hostname in _DOCKER_HOSTS:
        # Preserve userinfo (user:pass@)
        userinfo = ""
        if parsed.username:
            userinfo = parsed.username
            if parsed.password:
                userinfo += f":{parsed.password}"
            userinfo += "@"
        host = f"localhost:{parsed.port}" if parsed.port else "localhost"
        replaced = parsed._replace(netloc=f"{userinfo}{host}")
        return urlunparse(replaced)
    return url


def get_cli_settings() -> Settings:
    return get_settings()


def get_session_factory():
    """Create async session factory. Returns None if DB is unavailable."""
    try:
        from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

        settings = get_cli_settings()
        db_url = _localize_url(settings.DATABASE_URL)
        _engine = create_async_engine(
            db_url,
            echo=settings.DEBUG,
            pool_size=5,
            max_overflow=5,
            pool_pre_ping=True,
        )
        return async_sessionmaker(
            _engine,
            class_=AsyncSession,
            expire_on_commit=False,
        )
    except Exception as e:
        console.print(f"[yellow]Warning: Database unavailable ({e})[/yellow]")
        return None


def get_llm_client(cloud: bool = False):
    """Get LLM client. Returns None if unavailable."""
    settings = get_cli_settings()
    try:
        if cloud:
            if not settings.OPENAI_API_KEY:
                console.print("[yellow]Warning: OPENAI_API_KEY not set[/yellow]")
                return None
            from src.llm.openai_client import OpenAIClient

            return OpenAIClient(
                api_key=settings.OPENAI_API_KEY,
                model=settings.CLOUD_LLM_MODEL,
            )
        else:
            from src.llm.ollama_client import OllamaClient

            base_url = _localize_url(settings.LOCAL_LLM_URL)
            return OllamaClient(
                base_url=base_url,
                model=settings.LOCAL_LLM_MODEL,
            )
    except Exception as e:
        console.print(f"[yellow]Warning: LLM client unavailable ({e})[/yellow]")
        return None


def get_vector_store():
    """Get vector store. Returns None if unavailable."""
    try:
        from qdrant_client import QdrantClient as _QdrantClient

        from src.core.config import get_settings as _gs

        settings = _gs()
        qdrant_url = _localize_url(settings.QDRANT_URL)

        from src.storage.vector.qdrant_client import VectorStore

        store = VectorStore.__new__(VectorStore)
        store.client = _QdrantClient(url=qdrant_url, api_key=settings.QDRANT_API_KEY)
        return store
    except Exception as e:
        console.print(f"[yellow]Warning: Vector store unavailable ({e})[/yellow]")
        return None


def get_embedding_generator():
    """Get embedding generator. Returns None if unavailable."""
    try:
        from src.processors.embedding import EmbeddingGenerator

        return EmbeddingGenerator()
    except Exception as e:
        console.print(f"[yellow]Warning: Embedding model unavailable ({e})[/yellow]")
        return None
