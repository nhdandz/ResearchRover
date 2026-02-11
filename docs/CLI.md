# 💻 CLI Tool

RRI includes a built-in CLI (`rri`) for running OSINT tasks directly from the terminal — no browser needed.

## Usage

### Docker (Recommended)

Since the project runs via Docker, use `docker exec` to run CLI commands:

```bash
# Show help
docker exec rri-app-1 rri --help

# Shorthand: create an alias (add to your ~/.zshrc or ~/.bashrc)
alias rri='docker exec rri-app-1 rri'

# Then use directly
rri collect arxiv --query "LLM" --max-results 10
```

> **Note:** For interactive commands like `rri chat`, you **must** use the `-it` flag:
> ```bash
> docker exec -it rri-app-1 rri chat
> ```

### Local (without Docker)

If you have the project installed locally with a virtual environment:

```bash
source .venv/bin/activate
pip install -e .
rri --help
```

> When running locally, RRI automatically detects it's outside Docker and converts internal hostnames (ollama, postgres, qdrant, redis) to `localhost`, so it connects to Docker services via exposed ports.

---

## Available Commands

```
rri collect   Collect papers, models, and repos from various sources
rri search    Search papers, vectors, and repos
rri analyze   Analyze papers with LLM
rri export    Export reports and data
rri chat      Interactive RAG-powered chat (REPL)
```

---

## `rri collect` — Data Collection

```bash
# Collect papers from ArXiv
rri collect arxiv --query "LLM" --category cs.AI --days 7 --max-results 100

# Collect papers from OpenAlex
rri collect openalex --query "transformer" --from-year 2024 --max-results 50

# Collect models from HuggingFace
rri collect huggingface --query "llm" --type models --max-results 20

# Collect datasets from HuggingFace
rri collect huggingface --query "instruction" --type datasets --max-results 20

# Ingest a GitHub repository
rri collect repo https://github.com/user/repo
```

<details>
<summary>Docker equivalent</summary>

```bash
docker exec rri-app-1 rri collect arxiv --query "LLM" --category cs.AI --days 7 --max-results 100
docker exec rri-app-1 rri collect openalex --query "transformer" --from-year 2024 --max-results 50
docker exec rri-app-1 rri collect huggingface --query "llm" --type models --max-results 20
docker exec rri-app-1 rri collect repo https://github.com/user/repo
```
</details>

**Options:**
- `--save-db` — Save collected data to database (default: off for ArXiv)
- `--output PATH` — Custom output directory (default: `./reports/`)

---

## `rri search` — Search

```bash
# Search papers in database (full-text)
rri search papers "attention mechanism" --limit 20 --sort-by citations

# Semantic vector search across papers
rri search vector "multi-modal RAG pipeline" --limit 10 --collection papers

# Search repositories
rri search repos "llm inference" --limit 10
```

<details>
<summary>Docker equivalent</summary>

```bash
docker exec rri-app-1 rri search papers "attention mechanism" --limit 20 --sort-by citations
docker exec rri-app-1 rri search vector "multi-modal RAG pipeline" --limit 10 --collection papers
docker exec rri-app-1 rri search repos "llm inference" --limit 10
```
</details>

---

## `rri analyze` — LLM-Powered Analysis

```bash
# Analyze a single paper by ArXiv ID (uses local Ollama by default)
rri analyze paper 2401.12345

# Analyze with cloud LLM (OpenAI) and save to database
rri analyze paper 2401.12345 --cloud --save-db

# Batch analyze papers matching a query
rri analyze batch "LLM reasoning" --max-results 10 --category cs.AI
```

<details>
<summary>Docker equivalent</summary>

```bash
docker exec rri-app-1 rri analyze paper 2401.12345
docker exec rri-app-1 rri analyze paper 2401.12345 --cloud --save-db
docker exec rri-app-1 rri analyze batch "LLM reasoning" --max-results 10 --category cs.AI
```
</details>

Each analysis produces: summary, topic classification, keyword extraction, and entity extraction (methods, datasets, metrics, tools). Results are saved as Markdown + JSON in `./reports/`.

---

## `rri export` — Export Data

```bash
# Generate a weekly research report
rri export report --period weekly --format md

# Export papers as CSV
rri export papers --query "LLM" --limit 50 --format csv

# Export papers as JSON or Markdown
rri export papers --query "transformer" --format json
rri export papers --format md --output ./my-export/papers.md
```

<details>
<summary>Docker equivalent</summary>

```bash
docker exec rri-app-1 rri export report --period weekly --format md
docker exec rri-app-1 rri export papers --query "LLM" --limit 50 --format csv
docker exec rri-app-1 rri export papers --query "transformer" --format json
```
</details>

---

## `rri chat` — Interactive RAG Chat

```bash
# Start chat with local LLM (Ollama)
rri chat

# Start chat with cloud LLM (OpenAI)
rri chat --cloud

# Disable reranking for faster responses
rri chat --no-rerank

# Search only specific collections
rri chat --collection papers                          # Papers only
rri chat --collection repositories                    # Repos only
rri chat --collection papers --collection repositories # Papers + Repos
```

<details>
<summary>Docker equivalent (requires -it flag)</summary>

```bash
docker exec -it rri-app-1 rri chat
docker exec -it rri-app-1 rri chat --cloud
docker exec -it rri-app-1 rri chat --no-rerank
docker exec -it rri-app-1 rri chat --collection papers
```
</details>

Type your question and press Enter. The system retrieves relevant papers/repos from the vector database and generates answers with citations. Sources are displayed with type icons:

- `[Paper]` — Academic papers (ArXiv, OpenAlex, etc.)
- `[Repo]` — GitHub repositories
- `[Chunk]` — Document chunks from ingested files

Type `quit` to exit.

> **Note:** All output files (JSON, Markdown, CSV) are saved to `./reports/` by default. Use `--output` to specify a custom path.

---

## Quick Reference

```bash
# Make commands
make up              # Start all services
make down            # Stop all services
make logs            # Stream logs

# CLI via Docker
docker exec rri-app-1 rri --help
docker exec rri-app-1 rri collect --help
docker exec rri-app-1 rri collect arxiv --query "LLM" --max-results 10
docker exec rri-app-1 rri search vector "RAG pipeline" --limit 5
docker exec rri-app-1 rri analyze paper 2401.12345
docker exec rri-app-1 rri export report --period weekly --format md
docker exec -it rri-app-1 rri chat
docker exec -it rri-app-1 rri chat --collection papers
```
