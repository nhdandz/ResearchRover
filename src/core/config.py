from functools import lru_cache

from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""

    # App
    APP_NAME: str = "OSINT Research"
    DEBUG: bool = False
    LOG_LEVEL: str = "INFO"

    # Database
    DATABASE_URL: str = "postgresql+asyncpg://osint:password@localhost:5432/osint"

    # Redis
    REDIS_URL: str = "redis://localhost:6379/0"

    # Vector DB
    QDRANT_URL: str = "http://localhost:6333"
    QDRANT_API_KEY: str | None = None

    # API Keys
    GITHUB_TOKEN: str = ""
    SEMANTIC_SCHOLAR_API_KEY: str | None = None
    HUGGINGFACE_TOKEN: str | None = None
    OPENAI_API_KEY: str | None = None

    # LLM Settings
    LOCAL_LLM_URL: str = "http://localhost:11434"
    LOCAL_LLM_MODEL: str = "llama3:8b-instruct-q4_K_M"
    CLOUD_LLM_MODEL: str = "gpt-4o"

    # Embedding Settings
    EMBEDDING_MODEL: str = "BAAI/bge-base-en-v1.5"
    EMBEDDING_DIMENSION: int = 768

    # Collection Settings
    ARXIV_CATEGORIES: list[str] = ["cs.AI", "cs.CL", "cs.CV", "cs.LG"]
    COLLECTION_INTERVAL_HOURS: int = 6

    # Rate Limits
    GITHUB_REQUESTS_PER_HOUR: int = 5000
    S2_REQUESTS_PER_MINUTE: int = 100

    # File Upload
    UPLOAD_DIR: str = "./uploads"
    MAX_FILE_SIZE_MB: int = 100

    # JWT / Auth
    SECRET_KEY: str = "change-me-in-production-use-a-long-random-string"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7

    model_config = {
        "env_file": ".env",
        "env_file_encoding": "utf-8",
        "extra": "ignore",
    }


@lru_cache
def get_settings() -> Settings:
    return Settings()
