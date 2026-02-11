# 🔧 Configuration & Development

## Environment Variables

| Variable | Required | Default | Description |
|:---------|:--------:|:--------|:------------|
| `DATABASE_URL` | ✅ | `postgresql+asyncpg://...` | PostgreSQL connection string |
| `REDIS_URL` | ✅ | `redis://redis:6379/0` | Redis connection string |
| `QDRANT_URL` | ✅ | `http://qdrant:6333` | Qdrant server URL |
| `SECRET_KEY` | ✅ | — | JWT signing key |
| `GITHUB_TOKEN` | ✅ | — | GitHub API personal access token |
| `SEMANTIC_SCHOLAR_API_KEY` | ❌ | — | Improves paper metadata & citations |
| `HUGGINGFACE_TOKEN` | ❌ | — | HuggingFace API access |
| `OPENAI_API_KEY` | ❌ | — | Cloud LLM features (GPT-4o) |
| `LOCAL_LLM_URL` | ❌ | `http://ollama:11434` | Ollama server URL |
| `LOCAL_LLM_MODEL` | ❌ | `llama3:8b-instruct-q4_K_M` | Local LLM model name |
| `CLOUD_LLM_MODEL` | ❌ | `gpt-4o` | Cloud LLM model name |
| `EMBEDDING_MODEL` | ❌ | `BAAI/bge-base-en-v1.5` | Sentence-transformer model |

### Setting Up `.env`

```bash
cp .env.example .env
# Edit .env with your API keys
```

---

## Local Development (without Docker)

### Backend

```bash
# Create virtual environment
python -m venv .venv
source .venv/bin/activate

# Install dependencies
pip install -e ".[dev]"

# Run the API server
uvicorn src.main:app --reload --port 8000
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

> **Note:** When running locally, you still need PostgreSQL, Redis, Qdrant, and Ollama running. You can start only the infrastructure services:
> ```bash
> docker compose up -d postgres redis qdrant ollama
> ```

---

## Running Tests

```bash
# Via Make
make test

# Directly with pytest
pytest tests/ -v --cov=src
```

---

## Code Quality

```bash
# Lint with ruff
make lint

# Auto-format with ruff
make format
```

---

## Database Migrations

```bash
# Run pending migrations
make migrate

# Create a new migration
make migrate-create msg="add new table"
```

Migrations are managed by [Alembic](https://alembic.sqlalchemy.org/) and stored in the `migrations/` directory.

---

## Make Commands Reference

```bash
make up              # Start all services (docker-compose up -d)
make down            # Stop all services
make logs            # Stream logs from all containers
make migrate         # Run Alembic database migrations
make migrate-create  # Create new migration (msg="description")
make seed            # Seed initial demo data
make init-qdrant     # Initialize Qdrant vector collections
make pull-model      # Download Ollama LLM model
make test            # Run tests with coverage
make lint            # Run ruff linter
make format          # Auto-format code with ruff
```
