# 📡 API Reference

RRI exposes a comprehensive REST API built with [FastAPI](https://fastapi.tiangolo.com/). Full interactive documentation is available via Swagger UI at [http://localhost:8000/docs](http://localhost:8000/docs).

<!-- ![Swagger API](screenshots/swagger.png) -->
<!-- 📸 Chụp ảnh trang http://localhost:8000/docs và lưu vào docs/screenshots/swagger.png -->

---

## Core Endpoints

### Authentication

| Method | Endpoint | Description |
|:-------|:---------|:------------|
| `POST` | `/auth/register` | User registration |
| `POST` | `/auth/login` | JWT login, returns access token |

### Papers

| Method | Endpoint | Description |
|:-------|:---------|:------------|
| `GET` | `/papers/` | List, filter, and sort papers |
| `GET` | `/papers/{id}` | Paper detail with full metadata |
| `GET` | `/papers/stats` | Analytics (category distribution, year trends) |
| `POST` | `/papers/collect` | Trigger paper collection job |
| `POST` | `/papers/enrich-citations` | Bulk enrich citation counts |

### Repositories

| Method | Endpoint | Description |
|:-------|:---------|:------------|
| `GET` | `/repos/` | List and filter repositories |
| `GET` | `/repos/{id}` | Repository detail |

### Search

| Method | Endpoint | Description |
|:-------|:---------|:------------|
| `GET` | `/search/?q=...` | Semantic vector search across papers & repos |

### Trending

| Method | Endpoint | Description |
|:-------|:---------|:------------|
| `GET` | `/trending/papers` | Trending papers by period (day/week/month) |
| `GET` | `/trending/repos` | Trending repos by period |
| `GET` | `/trending/tech-radar` | Technology trend analysis |

### HuggingFace

| Method | Endpoint | Description |
|:-------|:---------|:------------|
| `GET` | `/trending/hf/models` | HuggingFace model rankings |
| `GET` | `/trending/hf/papers` | Daily HuggingFace papers |

### Community

| Method | Endpoint | Description |
|:-------|:---------|:------------|
| `GET` | `/community/posts` | Multi-platform posts (HN, Dev.to, Mastodon, Lemmy) |
| `GET` | `/community/discussions` | GitHub discussions |
| `GET` | `/community/openreview` | OpenReview papers + peer reviews |

### AI Chat

| Method | Endpoint | Description |
|:-------|:---------|:------------|
| `POST` | `/chat/` | RAG-powered Q&A |
| `POST` | `/chat/documents/embed` | Embed uploaded documents |
| `POST` | `/chat/documents/embed-repos` | Ingest GitHub repos for chat |

### Documents

| Method | Endpoint | Description |
|:-------|:---------|:------------|
| `GET` | `/documents/` | User document library |
| `POST` | `/documents/upload` | Upload PDF/DOCX/PPTX |

### Bookmarks

| Method | Endpoint | Description |
|:-------|:---------|:------------|
| `POST` | `/bookmarks/` | Bookmark papers/repos |
| `GET` | `/bookmarks/folders` | Folder management |

### Reports

| Method | Endpoint | Description |
|:-------|:---------|:------------|
| `GET` | `/reports/weekly` | Weekly research digest |

---

## Authentication

All protected endpoints require a JWT token in the `Authorization` header:

```
Authorization: Bearer <your-jwt-token>
```

Obtain a token via `POST /auth/login`:

```bash
curl -X POST http://localhost:8000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username": "your_user", "password": "your_pass"}'
```

---

## Example Requests

### Search Papers

```bash
curl "http://localhost:8000/search/?q=retrieval%20augmented%20generation&type=paper&limit=10" \
  -H "Authorization: Bearer <token>"
```

### Collect Papers from ArXiv

```bash
curl -X POST "http://localhost:8000/papers/collect" \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"source": "arxiv", "query": "LLM", "max_results": 50}'
```

### Send a Chat Message

```bash
curl -X POST "http://localhost:8000/chat/" \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"message": "What are the latest advances in RAG?"}'
```
