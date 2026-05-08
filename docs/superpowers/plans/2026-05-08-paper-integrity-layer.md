# Paper Integrity Layer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the `vietnam_entities.retraction` shoehorn with proper retraction columns + add `peer_review_status` enum, surface both signals across API, RAG, UI, and notifications, and seed the project's first real test suite.

**Architecture:** Postgres ENUM + 7 new columns on `papers` (Alembic migration). Backfill task migrates existing JSONB retraction data and runs the first peer-review inference. Daily Celery beat runs inference on stale rows. RAG retriever filters retracted papers by default. Frontend renders one shared `PaperIntegrityBadge` component everywhere a paper appears. Notifications dispatch when a bookmarked paper gets retracted.

**Tech Stack:** FastAPI + SQLAlchemy 2.0 (async) + Alembic + Postgres + Celery + Pydantic v2 / Next.js 14 + TypeScript + TailwindCSS / pytest + httpx + testcontainers (test DB).

**Spec:** `docs/superpowers/specs/2026-05-08-paper-integrity-layer-design.md`

---

## File Structure (locked-in decomposition)

### Backend — new files
- `migrations/versions/versions/k5l6m7n8o9p0_add_paper_integrity_fields.py` — Alembic migration: ENUM + 7 columns + index
- `src/storage/models/_enums.py` — shared Python enum module (`PeerReviewStatus`)
- `src/services/peer_review_inference.py` — pure inference function (testable without DB)
- `src/workers/tasks/integrity_backfill.py` — one-shot backfill Celery task
- `tests/conftest.py` — replace SQLite fixture with real Postgres test DB (existing fixture is broken — models use JSONB/ARRAY)
- `tests/factories.py` — model factories for User / Paper / Bookmark / OpenReviewNote / Notification
- `tests/integrity/__init__.py` — package marker
- `tests/integrity/test_peer_review_inference.py` — pure logic tests
- `tests/integrity/test_retraction_backfill.py` — backfill + JSONB migration
- `tests/integrity/test_retraction_collector.py` — retraction flagging + notification
- `tests/integrity/test_rag_retraction_filter.py` — RAG filter behavior
- `tests/api/__init__.py` + `tests/api/test_papers_integrity.py` — endpoint integration tests
- `tests/api/test_chat_integrity.py` — chat opt-in behavior
- `frontend/components/PaperIntegrityBadge.tsx` — shared badge component
- `frontend/__tests__/PaperIntegrityBadge.test.tsx` — frontend smoke

### Backend — modified files
- `src/storage/models/paper.py` — add columns matching the migration
- `src/api/schemas/paper.py:1-30` — add `PaperIntegrity` sub-schema; embed in `PaperResponse`
- `src/api/routers/papers.py:37-75` — `exclude_retracted` + `peer_review_status` filter on list
- `src/api/routers/papers.py:414-425` — include integrity in detail
- `src/api/routers/papers.py` — add `POST /papers/{id}/integrity/refresh` endpoint
- `src/api/routers/chat.py` — add `include_retracted: bool = False` to chat request body
- `src/rag/retriever.py:33-66` — inject `is_retracted=False` filter unless caller passes `None`
- `src/rag/reranker.py` — score boost based on `peer_review_status`
- `src/workers/tasks/collection.py:1659-1702` — rewrite `_collect_retractions` to use new columns + dispatch notifications
- `src/workers/tasks/intelligence.py` — add `infer_peer_review_status` Celery task
- `src/workers/celery_app.py:160-170` — add daily beat schedule for inference
- `src/services/notification_delivery.py` — add `paper_retracted` notification kind
- `.env.example` — document new env vars
- `pyproject.toml` — add `testcontainers` and `pytest-postgresql` dev deps

### Frontend — modified files
- `frontend/app/(app)/papers/[id]/page.tsx` — banner + integrity panel
- `frontend/app/(app)/papers/page.tsx` — badge on cards + "Hide retracted" filter chip
- `frontend/app/(app)/search/page.tsx` — badge on result cards
- `frontend/app/(app)/my-library/page.tsx` — badge on bookmark cards
- `frontend/app/(app)/chat/page.tsx` — inline badge per citation source
- `frontend/lib/api.ts` — types for `PaperIntegrity`; `include_retracted` on chat call

---

## Phase A — Foundation & schema (Tasks 1–4)

### Task 1: Replace broken SQLite fixture with real Postgres test DB

**Why:** Existing `tests/conftest.py` uses SQLite in-memory but models depend on `JSONB` and `ARRAY` (Postgres-only). Calling `Base.metadata.create_all` would fail. We need a real Postgres test DB before any other test can run.

**Files:**
- Modify: `tests/conftest.py`
- Create: `tests/factories.py`
- Modify: `pyproject.toml` (add `testcontainers[postgres]` dev dep)

- [ ] **Step 1: Add testcontainers dev dependency**

Edit `pyproject.toml`, add to `[project.optional-dependencies].dev` (or create one):

```toml
[project.optional-dependencies]
dev = [
    "pytest>=8.0.0",
    "pytest-asyncio>=0.23.0",
    "pytest-cov>=4.1.0",
    "httpx",
    "ruff>=0.2.0",
    "testcontainers[postgres]>=4.0",
    "factory-boy>=3.3.0",
]
```

Run: `uv pip install -e ".[dev]"` (or `pip install testcontainers[postgres] factory-boy`)

- [ ] **Step 2: Replace conftest.py**

Replace entire contents of `tests/conftest.py`:

```python
"""Shared pytest fixtures: real Postgres test DB via testcontainers."""
import asyncio

import pytest
import pytest_asyncio
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from testcontainers.postgres import PostgresContainer

from src.storage.database import Base


@pytest.fixture(scope="session")
def event_loop():
    """Session-scoped loop so the postgres container survives across tests."""
    loop = asyncio.new_event_loop()
    yield loop
    loop.close()


@pytest.fixture(scope="session")
def postgres_container():
    """Boot a Postgres container once per test session."""
    with PostgresContainer("postgres:16-alpine") as pg:
        yield pg


@pytest_asyncio.fixture(scope="session")
async def db_engine(postgres_container):
    """Async engine connected to the test container; create schema once."""
    url = postgres_container.get_connection_url().replace(
        "postgresql+psycopg2://", "postgresql+asyncpg://"
    )
    engine = create_async_engine(url, echo=False)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield engine
    await engine.dispose()


@pytest_asyncio.fixture
async def db_session(db_engine):
    """Per-test transactional session; rollback at end so tests are isolated."""
    connection = await db_engine.connect()
    trans = await connection.begin()
    session_factory = async_sessionmaker(
        bind=connection, class_=AsyncSession, expire_on_commit=False
    )
    async with session_factory() as session:
        yield session
    await trans.rollback()
    await connection.close()
```

- [ ] **Step 3: Create model factories**

Create `tests/factories.py`:

```python
"""Async factories for test data. Hand-rolled (no factory-boy async support yet)."""
import uuid
from datetime import date, datetime, timedelta

from sqlalchemy.ext.asyncio import AsyncSession

from src.storage.models.paper import Paper
from src.storage.models.user import User
from src.storage.models.bookmark import Bookmark
from src.storage.models.openreview_note import OpenReviewNote


async def make_user(session: AsyncSession, **overrides) -> User:
    user = User(
        id=uuid.uuid4(),
        email=overrides.pop("email", f"user-{uuid.uuid4().hex[:8]}@test.local"),
        hashed_password="not-a-real-hash",
        is_active=True,
        **overrides,
    )
    session.add(user)
    await session.flush()
    return user


async def make_paper(session: AsyncSession, **overrides) -> Paper:
    paper = Paper(
        id=uuid.uuid4(),
        title=overrides.pop("title", f"Test Paper {uuid.uuid4().hex[:8]}"),
        abstract=overrides.pop("abstract", "Test abstract."),
        source=overrides.pop("source", "arxiv"),
        published_date=overrides.pop("published_date", date.today() - timedelta(days=30)),
        **overrides,
    )
    session.add(paper)
    await session.flush()
    return paper


async def make_bookmark(session: AsyncSession, *, user: User, paper: Paper, **overrides) -> Bookmark:
    bookmark = Bookmark(
        id=uuid.uuid4(),
        user_id=user.id,
        item_type="paper",
        item_id=paper.id,
        reading_status="saved",
        **overrides,
    )
    session.add(bookmark)
    await session.flush()
    return bookmark


async def make_openreview_note(session: AsyncSession, *, paper: Paper, **overrides) -> OpenReviewNote:
    note = OpenReviewNote(
        id=uuid.uuid4(),
        paper_id=paper.id,
        venue=overrides.pop("venue", "ICLR 2024"),
        venueid=overrides.pop("venueid", "ICLR.cc/2024/Conference"),
        decision=overrides.pop("decision", None),
        **overrides,
    )
    session.add(note)
    await session.flush()
    return note
```

- [ ] **Step 4: Smoke test the fixture**

Create `tests/test_smoke.py`:

```python
import pytest
from sqlalchemy import text

pytestmark = pytest.mark.asyncio


async def test_db_session_works(db_session):
    result = await db_session.execute(text("SELECT 1 AS one"))
    assert result.scalar() == 1


async def test_factories_work(db_session):
    from tests.factories import make_user, make_paper, make_bookmark
    user = await make_user(db_session)
    paper = await make_paper(db_session)
    bm = await make_bookmark(db_session, user=user, paper=paper)
    assert bm.user_id == user.id
    assert bm.item_id == paper.id
```

Run: `pytest tests/test_smoke.py -v`
Expected: 2 passing tests. (First run may take 30s+ to pull the postgres image.)

- [ ] **Step 5: Commit**

```bash
git add pyproject.toml tests/conftest.py tests/factories.py tests/test_smoke.py
git commit -m "test: bootstrap real Postgres test fixture + model factories"
```

---

### Task 2: Add `PeerReviewStatus` enum + Paper model columns

**Files:**
- Create: `src/storage/models/_enums.py`
- Modify: `src/storage/models/paper.py:1-72`
- Test: `tests/integrity/test_paper_model.py` (new)

- [ ] **Step 1: Write the failing test**

Create `tests/integrity/__init__.py` (empty) and `tests/integrity/test_paper_model.py`:

```python
"""Test Paper ORM with new integrity fields."""
import pytest
from datetime import datetime

from src.storage.models.paper import Paper
from src.storage.models._enums import PeerReviewStatus
from tests.factories import make_paper

pytestmark = pytest.mark.asyncio


async def test_paper_defaults(db_session):
    paper = await make_paper(db_session)
    assert paper.is_retracted is False
    assert paper.retracted_at is None
    assert paper.peer_review_status == PeerReviewStatus.UNKNOWN.value


async def test_paper_set_retracted(db_session):
    paper = await make_paper(
        db_session,
        is_retracted=True,
        retracted_at=datetime(2025, 6, 1),
        retraction_reason="Image manipulation",
        retraction_source_url="https://retractionwatch.example/foo",
        peer_review_status=PeerReviewStatus.RETRACTED.value,
        peer_review_inferred_from="retraction-watch",
        peer_review_updated_at=datetime(2025, 6, 1),
    )
    await db_session.refresh(paper)
    assert paper.is_retracted is True
    assert paper.peer_review_status == "retracted"
```

- [ ] **Step 2: Run test, verify it fails**

Run: `pytest tests/integrity/test_paper_model.py -v`
Expected: FAIL with `ImportError: cannot import name 'PeerReviewStatus'` or `AttributeError: 'Paper' has no attribute 'is_retracted'`

- [ ] **Step 3: Create the enum module**

Create `src/storage/models/_enums.py`:

```python
"""Shared enums for ORM models."""
from enum import Enum


class PeerReviewStatus(str, Enum):
    """Peer-review signal for a Paper.

    See docs/superpowers/specs/2026-05-08-paper-integrity-layer-design.md §3.
    """
    UNKNOWN = "unknown"
    PREPRINT = "preprint"
    UNDER_REVIEW = "under_review"
    PEER_REVIEWED = "peer_reviewed"
    PUBLISHED = "published"
    WITHDRAWN = "withdrawn"
    RETRACTED = "retracted"
```

- [ ] **Step 4: Add columns to Paper model**

Edit `src/storage/models/paper.py`. Add imports near the top:

```python
from sqlalchemy import Enum as SAEnum
from src.storage.models._enums import PeerReviewStatus
```

Inside `class Paper(Base):` block, after the existing `vietnam_entities` field and before timestamps, insert:

```python
    # ── Integrity layer (spec: 2026-05-08-paper-integrity-layer) ──
    is_retracted: Mapped[bool] = mapped_column(
        Boolean, default=False, server_default="false", nullable=False
    )
    retracted_at: Mapped[datetime | None] = mapped_column(nullable=True)
    retraction_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    retraction_source_url: Mapped[str | None] = mapped_column(Text, nullable=True)

    peer_review_status: Mapped[str] = mapped_column(
        SAEnum(PeerReviewStatus, name="peer_review_status_enum", native_enum=True,
               values_callable=lambda e: [m.value for m in e]),
        default=PeerReviewStatus.UNKNOWN.value,
        server_default=PeerReviewStatus.UNKNOWN.value,
        nullable=False,
    )
    peer_review_inferred_from: Mapped[str | None] = mapped_column(Text, nullable=True)
    peer_review_updated_at: Mapped[datetime | None] = mapped_column(nullable=True)
```

Update the `__table_args__` to include the integrity index:

```python
    __table_args__ = (
        Index("idx_papers_published_date", "published_date", postgresql_using="btree"),
        Index("idx_papers_categories", "categories", postgresql_using="gin"),
        Index("idx_papers_topics", "topics", postgresql_using="gin"),
        Index("idx_papers_integrity", "is_retracted", "peer_review_status"),
    )
```

- [ ] **Step 5: Run test, verify it passes**

Run: `pytest tests/integrity/test_paper_model.py -v`
Expected: 2 PASS.

- [ ] **Step 6: Commit**

```bash
git add src/storage/models/_enums.py src/storage/models/paper.py tests/integrity/__init__.py tests/integrity/test_paper_model.py
git commit -m "feat(model): add Paper integrity columns + PeerReviewStatus enum"
```

---

### Task 3: Alembic migration `add_paper_integrity_fields`

**Files:**
- Create: `migrations/versions/versions/k5l6m7n8o9p0_add_paper_integrity_fields.py`

- [ ] **Step 1: Find current head revision**

Run: `cd /Users/nhdandz/Documents/code/RRI && alembic heads`
Expected: prints one revision, e.g. `bd5e3da3b8f2 (head)` or similar. Note this — it's the `down_revision`.

- [ ] **Step 2: Create the migration file**

Create `migrations/versions/versions/k5l6m7n8o9p0_add_paper_integrity_fields.py`. **Replace `<HEAD_REVISION>` below with the value from Step 1.**

```python
"""Add Paper integrity columns and PeerReviewStatus enum.

Revision ID: k5l6m7n8o9p0
Revises: <HEAD_REVISION>
Create Date: 2026-05-08
"""
from alembic import op
import sqlalchemy as sa


revision = "k5l6m7n8o9p0"
down_revision = "<HEAD_REVISION>"
branch_labels = None
depends_on = None


PEER_REVIEW_VALUES = (
    "unknown", "preprint", "under_review", "peer_reviewed",
    "published", "withdrawn", "retracted",
)


def upgrade() -> None:
    peer_review_enum = sa.Enum(
        *PEER_REVIEW_VALUES, name="peer_review_status_enum"
    )
    peer_review_enum.create(op.get_bind(), checkfirst=True)

    op.add_column("papers", sa.Column("is_retracted", sa.Boolean(),
                  nullable=False, server_default=sa.false()))
    op.add_column("papers", sa.Column("retracted_at", sa.DateTime(), nullable=True))
    op.add_column("papers", sa.Column("retraction_reason", sa.Text(), nullable=True))
    op.add_column("papers", sa.Column("retraction_source_url", sa.Text(), nullable=True))
    op.add_column(
        "papers",
        sa.Column("peer_review_status", peer_review_enum,
                  nullable=False, server_default="unknown"),
    )
    op.add_column("papers", sa.Column("peer_review_inferred_from", sa.Text(), nullable=True))
    op.add_column("papers", sa.Column("peer_review_updated_at", sa.DateTime(), nullable=True))

    op.create_index(
        "idx_papers_integrity", "papers",
        ["is_retracted", "peer_review_status"], unique=False,
    )


def downgrade() -> None:
    op.drop_index("idx_papers_integrity", table_name="papers")
    op.drop_column("papers", "peer_review_updated_at")
    op.drop_column("papers", "peer_review_inferred_from")
    op.drop_column("papers", "peer_review_status")
    op.drop_column("papers", "retraction_source_url")
    op.drop_column("papers", "retraction_reason")
    op.drop_column("papers", "retracted_at")
    op.drop_column("papers", "is_retracted")

    sa.Enum(name="peer_review_status_enum").drop(op.get_bind(), checkfirst=True)
```

- [ ] **Step 3: Apply the migration to local dev DB**

Run: `make migrate` (or `alembic upgrade head` if Make target doesn't exist)
Expected: prints `Running upgrade ... -> k5l6m7n8o9p0, Add Paper integrity columns`. No errors.

- [ ] **Step 4: Verify schema in dev DB**

Run: `psql $DATABASE_URL -c "\d papers" | grep -E "is_retracted|peer_review_status"`
Expected: 7 new columns are listed with correct types.

- [ ] **Step 5: Verify rollback works**

Run: `alembic downgrade -1 && alembic upgrade head`
Expected: both succeed.

- [ ] **Step 6: Commit**

```bash
git add migrations/versions/versions/k5l6m7n8o9p0_add_paper_integrity_fields.py
git commit -m "migration: add paper integrity columns + peer_review_status enum"
```

---

### Task 4: Add `PaperIntegrity` schema + embed in `PaperResponse`

**Files:**
- Modify: `src/api/schemas/paper.py:1-30`
- Test: `tests/integrity/test_paper_schema.py`

- [ ] **Step 1: Write the failing test**

Create `tests/integrity/test_paper_schema.py`:

```python
"""PaperResponse with integrity sub-schema."""
import pytest
from datetime import datetime

from src.api.schemas.paper import PaperResponse, PaperIntegrity
from src.storage.models._enums import PeerReviewStatus
from tests.factories import make_paper

pytestmark = pytest.mark.asyncio


async def test_paper_response_includes_integrity(db_session):
    paper = await make_paper(
        db_session,
        is_retracted=True,
        retracted_at=datetime(2025, 6, 1),
        retraction_reason="Image manipulation",
        peer_review_status=PeerReviewStatus.RETRACTED.value,
        peer_review_inferred_from="retraction-watch",
    )
    resp = PaperResponse.model_validate(paper)
    assert isinstance(resp.integrity, PaperIntegrity)
    assert resp.integrity.is_retracted is True
    assert resp.integrity.peer_review_status == "retracted"
    assert resp.integrity.retraction_reason == "Image manipulation"


async def test_paper_response_default_integrity(db_session):
    paper = await make_paper(db_session)
    resp = PaperResponse.model_validate(paper)
    assert resp.integrity.is_retracted is False
    assert resp.integrity.peer_review_status == "unknown"
```

- [ ] **Step 2: Run test, verify it fails**

Run: `pytest tests/integrity/test_paper_schema.py -v`
Expected: FAIL — `PaperIntegrity` does not exist.

- [ ] **Step 3: Add `PaperIntegrity` and embed in `PaperResponse`**

Edit `src/api/schemas/paper.py`. Add after imports, before `class PaperResponse`:

```python
class PaperIntegrity(BaseModel):
    is_retracted: bool = False
    retracted_at: datetime | None = None
    retraction_reason: str | None = None
    retraction_source_url: str | None = None
    peer_review_status: str = "unknown"
    peer_review_inferred_from: str | None = None
    peer_review_updated_at: datetime | None = None

    model_config = {"from_attributes": True}
```

Then modify `PaperResponse` to embed integrity. Use a model_validator so it builds from the flat ORM fields:

```python
from pydantic import BaseModel, model_validator


class PaperResponse(BaseModel):
    # ... existing fields stay the same ...
    integrity: PaperIntegrity = PaperIntegrity()

    model_config = {"from_attributes": True}

    @model_validator(mode="before")
    @classmethod
    def _build_integrity(cls, values):
        # When validating from an ORM object (`from_attributes=True`), values is
        # the ORM instance. When validating from a dict, it's a dict.
        if isinstance(values, dict):
            return values
        # ORM instance: copy integrity fields into a nested dict for the sub-schema.
        as_dict = {k: getattr(values, k) for k in cls.model_fields if k != "integrity"}
        as_dict["integrity"] = {
            "is_retracted": getattr(values, "is_retracted", False),
            "retracted_at": getattr(values, "retracted_at", None),
            "retraction_reason": getattr(values, "retraction_reason", None),
            "retraction_source_url": getattr(values, "retraction_source_url", None),
            "peer_review_status": getattr(values, "peer_review_status", "unknown"),
            "peer_review_inferred_from": getattr(values, "peer_review_inferred_from", None),
            "peer_review_updated_at": getattr(values, "peer_review_updated_at", None),
        }
        return as_dict
```

- [ ] **Step 4: Run test, verify it passes**

Run: `pytest tests/integrity/test_paper_schema.py -v`
Expected: 2 PASS.

- [ ] **Step 5: Commit**

```bash
git add src/api/schemas/paper.py tests/integrity/test_paper_schema.py
git commit -m "feat(schema): add PaperIntegrity sub-schema, embed in PaperResponse"
```

---

## Phase B — Backend logic (Tasks 5–10)

### Task 5: Pure peer-review inference function

**Files:**
- Create: `src/services/peer_review_inference.py`
- Test: `tests/integrity/test_peer_review_inference.py`

- [ ] **Step 1: Write failing tests for each rule**

Create `tests/integrity/test_peer_review_inference.py`:

```python
"""Pure inference rules — no DB."""
import pytest

from src.services.peer_review_inference import infer_status, InferenceInput
from src.storage.models._enums import PeerReviewStatus


def test_openreview_accept_wins():
    out = infer_status(InferenceInput(
        arxiv_id="2401.00001", doi=None,
        openreview_decision="accept", openreview_venue="ICLR 2024",
    ))
    assert out.status == PeerReviewStatus.PEER_REVIEWED.value
    assert out.inferred_from == "openreview:ICLR 2024"


def test_openreview_no_decision_under_review():
    out = infer_status(InferenceInput(
        arxiv_id="2401.00001", doi=None,
        openreview_decision=None, openreview_venue="ICLR 2025",
    ))
    assert out.status == PeerReviewStatus.UNDER_REVIEW.value


def test_openreview_reject_falls_back_to_preprint():
    out = infer_status(InferenceInput(
        arxiv_id="2401.00001", doi=None,
        openreview_decision="reject", openreview_venue="ICLR 2024",
    ))
    assert out.status == PeerReviewStatus.PREPRINT.value
    assert out.inferred_from == "openreview:ICLR 2024:rejected"


def test_doi_non_arxiv_published():
    out = infer_status(InferenceInput(
        arxiv_id=None, doi="10.1109/TPAMI.2024.1234567",
        openreview_decision=None, openreview_venue=None,
    ))
    assert out.status == PeerReviewStatus.PUBLISHED.value
    assert out.inferred_from == "doi:10.1109"


def test_doi_arxiv_prefix_is_preprint():
    out = infer_status(InferenceInput(
        arxiv_id="2401.00001", doi="10.48550/arXiv.2401.00001",
        openreview_decision=None, openreview_venue=None,
    ))
    assert out.status == PeerReviewStatus.PREPRINT.value


def test_doi_biorxiv_prefix_is_preprint():
    out = infer_status(InferenceInput(
        arxiv_id=None, doi="10.1101/2024.01.01.123456",
        openreview_decision=None, openreview_venue=None,
    ))
    assert out.status == PeerReviewStatus.PREPRINT.value


def test_arxiv_only_fallback():
    out = infer_status(InferenceInput(
        arxiv_id="2401.00001", doi=None,
        openreview_decision=None, openreview_venue=None,
    ))
    assert out.status == PeerReviewStatus.PREPRINT.value


def test_no_signals_remains_unknown():
    out = infer_status(InferenceInput(
        arxiv_id=None, doi=None,
        openreview_decision=None, openreview_venue=None,
    ))
    assert out.status == PeerReviewStatus.UNKNOWN.value


def test_doi_published_wins_over_openreview_reject():
    """Spec §4.4 conflict resolution."""
    out = infer_status(InferenceInput(
        arxiv_id="2401.00001", doi="10.1109/TPAMI.2024.1234567",
        openreview_decision="reject", openreview_venue="ICLR 2024",
    ))
    assert out.status == PeerReviewStatus.PUBLISHED.value
    assert "conflict" in (out.warning or "").lower()
```

- [ ] **Step 2: Run tests, verify they fail**

Run: `pytest tests/integrity/test_peer_review_inference.py -v`
Expected: FAIL with `ImportError`.

- [ ] **Step 3: Implement the inference function**

Create `src/services/peer_review_inference.py`:

```python
"""Pure peer-review status inference. No DB, no I/O."""
from dataclasses import dataclass

from src.storage.models._enums import PeerReviewStatus


PREPRINT_DOI_PREFIXES = ("10.48550", "10.1101")  # arxiv, biorxiv


@dataclass(frozen=True)
class InferenceInput:
    arxiv_id: str | None
    doi: str | None
    openreview_decision: str | None  # "accept" | "reject" | None
    openreview_venue: str | None


@dataclass(frozen=True)
class InferenceOutput:
    status: str
    inferred_from: str | None
    warning: str | None = None


def _doi_prefix(doi: str) -> str:
    return doi.split("/")[0] if "/" in doi else doi


def infer_status(inp: InferenceInput) -> InferenceOutput:
    """Apply rule chain from spec §4.4. First match wins, with one conflict check."""
    has_published_doi = (
        inp.doi is not None
        and _doi_prefix(inp.doi) not in PREPRINT_DOI_PREFIXES
    )
    decision = (inp.openreview_decision or "").lower().strip()

    # Conflict guard: spec §4.4 — DOI published wins over OpenReview reject.
    if has_published_doi and decision == "reject":
        return InferenceOutput(
            status=PeerReviewStatus.PUBLISHED.value,
            inferred_from=f"doi:{_doi_prefix(inp.doi)}",
            warning=f"peer_review_conflict: DOI={inp.doi} published vs OpenReview={inp.openreview_venue} rejected",
        )

    # Rule 1: OpenReview accept
    if decision == "accept":
        return InferenceOutput(
            status=PeerReviewStatus.PEER_REVIEWED.value,
            inferred_from=f"openreview:{inp.openreview_venue}" if inp.openreview_venue else "openreview",
        )
    # Rule 2: OpenReview pending
    if inp.openreview_venue and not decision:
        return InferenceOutput(
            status=PeerReviewStatus.UNDER_REVIEW.value,
            inferred_from=f"openreview:{inp.openreview_venue}",
        )
    # Rule 3: OpenReview reject (no published DOI — handled above)
    if decision == "reject":
        return InferenceOutput(
            status=PeerReviewStatus.PREPRINT.value,
            inferred_from=f"openreview:{inp.openreview_venue}:rejected" if inp.openreview_venue else "openreview:rejected",
        )
    # Rule 4: Non-preprint DOI
    if has_published_doi:
        return InferenceOutput(
            status=PeerReviewStatus.PUBLISHED.value,
            inferred_from=f"doi:{_doi_prefix(inp.doi)}",
        )
    # Rule 5: arxiv-only
    if inp.arxiv_id:
        return InferenceOutput(
            status=PeerReviewStatus.PREPRINT.value,
            inferred_from="arxiv-only",
        )
    # Rule 6: no signals
    return InferenceOutput(status=PeerReviewStatus.UNKNOWN.value, inferred_from=None)
```

- [ ] **Step 4: Run tests, verify all pass**

Run: `pytest tests/integrity/test_peer_review_inference.py -v`
Expected: 9 PASS.

- [ ] **Step 5: Commit**

```bash
git add src/services/peer_review_inference.py tests/integrity/test_peer_review_inference.py
git commit -m "feat(integrity): pure peer-review status inference function"
```

---

### Task 6: Backfill task — JSONB retraction migration + initial inference

**Files:**
- Create: `src/workers/tasks/integrity_backfill.py`
- Test: `tests/integrity/test_retraction_backfill.py`

- [ ] **Step 1: Write failing test**

Create `tests/integrity/test_retraction_backfill.py`:

```python
import pytest
from datetime import datetime

from src.storage.models.paper import Paper
from src.storage.models._enums import PeerReviewStatus
from src.workers.tasks.integrity_backfill import (
    backfill_retraction_jsonb,
    backfill_inference,
)
from tests.factories import make_paper, make_openreview_note

pytestmark = pytest.mark.asyncio


async def test_retraction_jsonb_migrated_to_columns(db_session):
    paper = await make_paper(
        db_session,
        doi="10.1234/abcd",
        vietnam_entities={
            "retraction": {
                "retracted_at": "2025-06-01T00:00:00",
                "reason": "Image manipulation",
                "source_url": "https://retractionwatch.example/foo",
                "title": "Retraction notice",
            }
        },
    )
    affected = await backfill_retraction_jsonb(db_session)
    await db_session.refresh(paper)

    assert affected == 1
    assert paper.is_retracted is True
    assert paper.retraction_reason == "Image manipulation"
    assert paper.peer_review_status == PeerReviewStatus.RETRACTED.value
    # JSONB key kept for one release per spec §7
    assert "retraction" in (paper.vietnam_entities or {})


async def test_backfill_idempotent(db_session):
    paper = await make_paper(
        db_session,
        vietnam_entities={"retraction": {"retracted_at": "2025-06-01T00:00:00"}},
    )
    first = await backfill_retraction_jsonb(db_session)
    second = await backfill_retraction_jsonb(db_session)
    assert first == 1
    assert second == 0  # already migrated


async def test_inference_backfill_sets_status(db_session):
    p1 = await make_paper(db_session, arxiv_id="2401.00001", doi=None)
    p2 = await make_paper(db_session, arxiv_id=None, doi="10.1109/TPAMI.2024.1")
    p3 = await make_paper(db_session, arxiv_id="2401.00002")
    await make_openreview_note(db_session, paper=p3, decision="accept")

    affected = await backfill_inference(db_session)
    for p in (p1, p2, p3):
        await db_session.refresh(p)

    assert affected == 3
    assert p1.peer_review_status == PeerReviewStatus.PREPRINT.value
    assert p2.peer_review_status == PeerReviewStatus.PUBLISHED.value
    assert p3.peer_review_status == PeerReviewStatus.PEER_REVIEWED.value


async def test_inference_skips_already_set(db_session):
    p = await make_paper(
        db_session, arxiv_id="2401.00001",
        peer_review_status=PeerReviewStatus.PEER_REVIEWED.value,
    )
    affected = await backfill_inference(db_session)
    assert affected == 0  # not unknown, skip
```

- [ ] **Step 2: Run test, verify it fails**

Run: `pytest tests/integrity/test_retraction_backfill.py -v`
Expected: FAIL with `ImportError`.

- [ ] **Step 3: Implement backfill module**

Create `src/workers/tasks/integrity_backfill.py`:

```python
"""One-shot backfill: migrate JSONB retraction → columns; run initial inference."""
from datetime import datetime
from typing import cast

from sqlalchemy import select, or_
from sqlalchemy.ext.asyncio import AsyncSession

from src.core.logging import get_logger
from src.services.peer_review_inference import InferenceInput, infer_status
from src.storage.models._enums import PeerReviewStatus
from src.storage.models.openreview_note import OpenReviewNote
from src.storage.models.paper import Paper
from src.workers.celery_app import celery_app

logger = get_logger(__name__)


def _parse_dt(s: str | None) -> datetime | None:
    if not s:
        return None
    try:
        return datetime.fromisoformat(s.replace("Z", "+00:00")).replace(tzinfo=None)
    except (ValueError, AttributeError):
        return None


async def backfill_retraction_jsonb(session: AsyncSession) -> int:
    """Migrate `vietnam_entities.retraction` → integrity columns. Idempotent.

    Returns the number of papers updated this run.
    """
    rows = (
        await session.execute(
            select(Paper).where(
                Paper.vietnam_entities.is_not(None),
                Paper.is_retracted.is_(False),  # idempotent guard
            )
        )
    ).scalars().all()

    updated = 0
    for paper in rows:
        ve = paper.vietnam_entities or {}
        rdata = ve.get("retraction")
        if not rdata:
            continue
        paper.is_retracted = True
        paper.retracted_at = _parse_dt(rdata.get("retracted_at"))
        paper.retraction_reason = rdata.get("reason")
        paper.retraction_source_url = rdata.get("source_url")
        paper.peer_review_status = PeerReviewStatus.RETRACTED.value
        paper.peer_review_inferred_from = "retraction-watch:backfill"
        paper.peer_review_updated_at = datetime.utcnow()
        updated += 1

    await session.flush()
    logger.info("retraction backfill complete", papers_updated=updated)
    return updated


async def backfill_inference(session: AsyncSession) -> int:
    """Run peer-review inference for all rows with `peer_review_status='unknown'`.

    Returns the number of papers whose status changed.
    """
    rows = (
        await session.execute(
            select(Paper).where(
                Paper.peer_review_status == PeerReviewStatus.UNKNOWN.value,
                Paper.is_retracted.is_(False),
            )
        )
    ).scalars().all()

    if not rows:
        return 0

    paper_ids = [p.id for p in rows]
    notes = (
        await session.execute(
            select(OpenReviewNote).where(OpenReviewNote.paper_id.in_(paper_ids))
        )
    ).scalars().all()
    note_by_pid = {n.paper_id: n for n in notes}

    updated = 0
    for paper in rows:
        note = note_by_pid.get(paper.id)
        out = infer_status(
            InferenceInput(
                arxiv_id=paper.arxiv_id,
                doi=paper.doi,
                openreview_decision=note.decision if note else None,
                openreview_venue=note.venue if note else None,
            )
        )
        if out.status == PeerReviewStatus.UNKNOWN.value:
            continue
        paper.peer_review_status = out.status
        paper.peer_review_inferred_from = out.inferred_from
        paper.peer_review_updated_at = datetime.utcnow()
        if out.warning:
            logger.warning("inference conflict", paper_id=str(paper.id), warning=out.warning)
        updated += 1

    await session.flush()
    logger.info("inference backfill complete", papers_updated=updated)
    return updated


@celery_app.task(name="src.workers.tasks.integrity_backfill.integrity_backfill_once")
def integrity_backfill_once() -> dict:
    """Celery entrypoint — runs both backfills in one transaction."""
    import asyncio
    from src.storage.database import create_async_session_factory

    async def _run() -> dict:
        factory = create_async_session_factory()
        async with factory() as session:
            r = await backfill_retraction_jsonb(session)
            i = await backfill_inference(session)
            await session.commit()
            return {"retractions_migrated": r, "inferences_set": i}

    loop = asyncio.new_event_loop()
    try:
        return loop.run_until_complete(_run())
    finally:
        loop.close()
```

- [ ] **Step 4: Run test, verify all pass**

Run: `pytest tests/integrity/test_retraction_backfill.py -v`
Expected: 4 PASS.

- [ ] **Step 5: Commit**

```bash
git add src/workers/tasks/integrity_backfill.py tests/integrity/test_retraction_backfill.py
git commit -m "feat(integrity): one-shot backfill for JSONB retraction + initial inference"
```

---

### Task 7: Daily inference Celery task + Beat schedule

**Files:**
- Modify: `src/workers/tasks/intelligence.py`
- Modify: `src/workers/celery_app.py:160-170`
- Test: `tests/integrity/test_inference_task.py`

- [ ] **Step 1: Write failing test**

Create `tests/integrity/test_inference_task.py`:

```python
"""Daily inference task — re-runs on stale rows."""
import pytest
from datetime import datetime, timedelta

from src.storage.models._enums import PeerReviewStatus
from src.workers.tasks.intelligence import _run_peer_review_inference
from tests.factories import make_paper, make_openreview_note

pytestmark = pytest.mark.asyncio


async def test_inference_runs_on_unknown(db_session):
    p = await make_paper(db_session, arxiv_id="2401.00001")
    affected = await _run_peer_review_inference(db_session, staleness_days=30)
    await db_session.refresh(p)
    assert affected >= 1
    assert p.peer_review_status == PeerReviewStatus.PREPRINT.value


async def test_inference_skips_fresh(db_session):
    p = await make_paper(
        db_session, arxiv_id="2401.00001",
        peer_review_status=PeerReviewStatus.PREPRINT.value,
        peer_review_updated_at=datetime.utcnow() - timedelta(days=5),
    )
    affected = await _run_peer_review_inference(db_session, staleness_days=30)
    assert affected == 0


async def test_inference_re_runs_stale(db_session):
    """Stale row (>30d) gets re-inferred and updates timestamp."""
    p = await make_paper(
        db_session, arxiv_id="2401.00001",
        peer_review_status=PeerReviewStatus.PREPRINT.value,
        peer_review_updated_at=datetime.utcnow() - timedelta(days=60),
    )
    # Add an OpenReview accept — should change status to peer_reviewed
    await make_openreview_note(db_session, paper=p, decision="accept")
    affected = await _run_peer_review_inference(db_session, staleness_days=30)
    await db_session.refresh(p)
    assert affected == 1
    assert p.peer_review_status == PeerReviewStatus.PEER_REVIEWED.value
```

- [ ] **Step 2: Run test, verify it fails**

Run: `pytest tests/integrity/test_inference_task.py -v`
Expected: FAIL — function doesn't exist.

- [ ] **Step 3: Add the inference function + Celery task**

Append to `src/workers/tasks/intelligence.py` (read top of file first to confirm imports already exist):

```python
# ════════════════════════════════════════════════
# Peer-review inference (daily) — spec: 2026-05-08-paper-integrity-layer
# ════════════════════════════════════════════════

async def _run_peer_review_inference(session, staleness_days: int = 30) -> int:
    """Re-infer status for unknown rows OR rows whose updated_at is older than staleness_days.

    Returns number of rows whose status actually changed.
    """
    from datetime import datetime, timedelta
    from sqlalchemy import select, or_, and_
    from src.storage.models.paper import Paper
    from src.storage.models._enums import PeerReviewStatus
    from src.storage.models.openreview_note import OpenReviewNote
    from src.services.peer_review_inference import InferenceInput, infer_status

    cutoff = datetime.utcnow() - timedelta(days=staleness_days)
    rows = (
        await session.execute(
            select(Paper).where(
                and_(
                    Paper.is_retracted.is_(False),
                    or_(
                        Paper.peer_review_status == PeerReviewStatus.UNKNOWN.value,
                        Paper.peer_review_updated_at.is_(None),
                        Paper.peer_review_updated_at < cutoff,
                    ),
                )
            )
        )
    ).scalars().all()
    if not rows:
        return 0

    paper_ids = [p.id for p in rows]
    notes = (
        await session.execute(
            select(OpenReviewNote).where(OpenReviewNote.paper_id.in_(paper_ids))
        )
    ).scalars().all()
    note_by_pid = {n.paper_id: n for n in notes}

    changed = 0
    for paper in rows:
        note = note_by_pid.get(paper.id)
        out = infer_status(
            InferenceInput(
                arxiv_id=paper.arxiv_id,
                doi=paper.doi,
                openreview_decision=note.decision if note else None,
                openreview_venue=note.venue if note else None,
            )
        )
        if out.status == paper.peer_review_status:
            # Update timestamp even if status unchanged so we don't re-pick it tomorrow
            paper.peer_review_updated_at = datetime.utcnow()
            continue
        paper.peer_review_status = out.status
        paper.peer_review_inferred_from = out.inferred_from
        paper.peer_review_updated_at = datetime.utcnow()
        if out.warning:
            logger.warning("inference conflict", paper_id=str(paper.id), warning=out.warning)
        changed += 1

    await session.flush()
    return changed


@celery_app.task(name="src.workers.tasks.intelligence.infer_peer_review_status")
def infer_peer_review_status(staleness_days: int = 30) -> dict:
    """Celery entrypoint for the daily inference task."""
    import asyncio
    import os
    from src.storage.database import create_async_session_factory

    async def _do() -> int:
        factory = create_async_session_factory()
        async with factory() as session:
            n = await _run_peer_review_inference(session, staleness_days=staleness_days)
            await session.commit()
            return n

    days = int(os.getenv("INTEGRITY_INFERENCE_STALENESS_DAYS", staleness_days))
    loop = asyncio.new_event_loop()
    try:
        n = loop.run_until_complete(_do())
        return {"changed": n, "staleness_days": days}
    finally:
        loop.close()
```

- [ ] **Step 4: Add the Beat schedule entry**

Edit `src/workers/celery_app.py`. Find the existing beat schedule dict (around line 160) and add an entry:

```python
    "infer-peer-review-status-daily": {
        "task": "src.workers.tasks.intelligence.infer_peer_review_status",
        "schedule": crontab(hour=3, minute=0),
        "options": {"expires": 60 * 60 * 12},
    },
```

(If `crontab` isn't already imported in that file, add `from celery.schedules import crontab` at the top.)

- [ ] **Step 5: Run tests, verify they pass**

Run: `pytest tests/integrity/test_inference_task.py -v`
Expected: 3 PASS.

- [ ] **Step 6: Commit**

```bash
git add src/workers/tasks/intelligence.py src/workers/celery_app.py tests/integrity/test_inference_task.py
git commit -m "feat(integrity): daily peer-review inference task + beat schedule"
```

---

### Task 8: Rewrite retraction collector to use new columns + dispatch notifications

**Files:**
- Modify: `src/workers/tasks/collection.py:1659-1702`
- Test: `tests/integrity/test_retraction_collector.py`

- [ ] **Step 1: Write failing test**

Create `tests/integrity/test_retraction_collector.py`:

```python
"""Retraction collector writes new columns + notifies bookmark holders."""
import pytest
from datetime import datetime
from unittest.mock import patch, AsyncMock

from src.collectors.retraction_watch import RetractionItem
from src.workers.tasks.collection import _apply_retraction
from src.storage.models._enums import PeerReviewStatus
from src.storage.models.notification import Notification
from sqlalchemy import select
from tests.factories import make_paper, make_user, make_bookmark

pytestmark = pytest.mark.asyncio


async def test_retraction_writes_columns(db_session):
    paper = await make_paper(db_session, doi="10.1234/abcd")
    item = RetractionItem(
        title="Retraction: Foo", link="https://retractionwatch.example/x",
        description="image manipulation", paper_doi="10.1234/abcd",
        published_at=datetime(2025, 6, 1), reason="Image manipulation",
    )
    flagged = await _apply_retraction(db_session, item)
    await db_session.refresh(paper)

    assert flagged is True
    assert paper.is_retracted is True
    assert paper.retraction_reason == "Image manipulation"
    assert paper.retraction_source_url == "https://retractionwatch.example/x"
    assert paper.peer_review_status == PeerReviewStatus.RETRACTED.value


async def test_retraction_no_doi_skipped(db_session):
    item = RetractionItem(
        title="x", link="x", description="x", paper_doi=None,
        published_at=datetime(2025, 6, 1),
    )
    flagged = await _apply_retraction(db_session, item)
    assert flagged is False


async def test_retraction_dispatches_notifications(db_session):
    paper = await make_paper(db_session, doi="10.1234/efgh")
    user = await make_user(db_session)
    await make_bookmark(db_session, user=user, paper=paper)

    item = RetractionItem(
        title="Retraction: Bar", link="https://retractionwatch.example/y",
        description="x", paper_doi="10.1234/efgh",
        published_at=datetime(2025, 6, 1), reason="Plagiarism",
    )
    await _apply_retraction(db_session, item)

    notifs = (
        await db_session.execute(
            select(Notification).where(
                Notification.user_id == user.id,
                Notification.notification_type == "paper_retracted",
            )
        )
    ).scalars().all()

    assert len(notifs) == 1
    assert notifs[0].data["paper_id"] == str(paper.id)
    assert notifs[0].severity == "warning"


async def test_retraction_no_bookmarks_no_notifications(db_session):
    paper = await make_paper(db_session, doi="10.1234/ijkl")
    item = RetractionItem(
        title="x", link="x", description="x", paper_doi="10.1234/ijkl",
        published_at=datetime(2025, 6, 1), reason="x",
    )
    await _apply_retraction(db_session, item)

    notifs = (
        await db_session.execute(select(Notification))
    ).scalars().all()
    assert len(notifs) == 0
```

- [ ] **Step 2: Run test, verify it fails**

Run: `pytest tests/integrity/test_retraction_collector.py -v`
Expected: FAIL — `_apply_retraction` doesn't exist.

- [ ] **Step 3: Refactor `_collect_retractions` and extract `_apply_retraction`**

In `src/workers/tasks/collection.py`, replace the existing `_collect_retractions` block (around lines 1659-1702) with this:

```python
async def _apply_retraction(session, item) -> bool:
    """Flag matching paper + dispatch notifications. Pure async — testable.

    Returns True if a paper was flagged, False otherwise.
    """
    from datetime import datetime
    from sqlalchemy import select
    from src.storage.models.paper import Paper
    from src.storage.models._enums import PeerReviewStatus
    from src.storage.models.bookmark import Bookmark
    from src.storage.models.notification import Notification

    if not item.paper_doi:
        return False

    paper = (
        await session.execute(
            select(Paper).where(Paper.doi == item.paper_doi)
        )
    ).scalar_one_or_none()
    if not paper:
        return False

    paper.is_retracted = True
    paper.retracted_at = item.published_at
    paper.retraction_reason = item.reason
    paper.retraction_source_url = item.link
    paper.peer_review_status = PeerReviewStatus.RETRACTED.value
    paper.peer_review_inferred_from = "retraction-watch"
    paper.peer_review_updated_at = datetime.utcnow()
    paper.is_relevant = False  # keep existing feed-hide behavior

    # Find users who bookmarked this paper
    bookmark_rows = (
        await session.execute(
            select(Bookmark.user_id)
            .where(Bookmark.item_id == paper.id, Bookmark.item_type == "paper")
            .distinct()
        )
    ).all()

    for (user_id,) in bookmark_rows:
        notif = Notification(
            user_id=user_id,
            notification_type="paper_retracted",
            severity="warning",
            title=f"A bookmarked paper has been retracted",
            body=item.reason or "Reason unspecified.",
            link=f"/papers/{paper.id}",
            data={
                "paper_id": str(paper.id),
                "paper_title": paper.title,
                "retracted_at": item.published_at.isoformat(),
                "reason": item.reason,
                "source_url": item.link,
            },
            dedup_key=f"paper_retracted:{paper.id}",
        )
        session.add(notif)

    return True


async def _collect_retractions(max_results: int):
    from src.collectors.retraction_watch import RetractionWatchCollector
    from src.storage.database import create_async_session_factory

    factory = create_async_session_factory()
    flagged = 0
    items_seen = 0

    async with RetractionWatchCollector() as collector:
        async with factory() as session:
            async for result in collector.collect(max_results=max_results):
                items_seen += 1
                if await _apply_retraction(session, result.data):
                    flagged += 1
            await session.commit()

    logger.info("Retraction watch done", items_seen=items_seen, papers_flagged=flagged)
```

- [ ] **Step 4: Run test, verify all pass**

Run: `pytest tests/integrity/test_retraction_collector.py -v`
Expected: 4 PASS.

- [ ] **Step 5: Verify the old `vietnam_entities` write path is gone**

Run: `grep -n 'vietnam_entities.*retraction\|retraction.*vietnam_entities' src/workers/tasks/collection.py`
Expected: no matches.

- [ ] **Step 6: Commit**

```bash
git add src/workers/tasks/collection.py tests/integrity/test_retraction_collector.py
git commit -m "feat(integrity): retraction collector writes new columns + notifies bookmark holders"
```

---

### Task 9: RAG retriever — default-exclude retracted

**Files:**
- Modify: `src/rag/retriever.py:33-66`
- Test: `tests/integrity/test_rag_retraction_filter.py`

- [ ] **Step 1: Write failing test**

Create `tests/integrity/test_rag_retraction_filter.py`:

```python
"""HybridRetriever default-excludes is_retracted=True."""
import pytest
from unittest.mock import MagicMock

from src.rag.retriever import HybridRetriever


def _make_retriever(captured_filters: list):
    vs = MagicMock()
    def fake_search(collection, query_vector, limit, filters=None):
        captured_filters.append(filters)
        return []
    vs.search.side_effect = fake_search
    emb = MagicMock()
    emb.embed.return_value = [0.0] * 768
    return HybridRetriever(vs, emb)


@pytest.mark.asyncio
async def test_default_filter_excludes_retracted():
    captured = []
    r = _make_retriever(captured)
    await r.retrieve(query="anything", top_k=5)
    # Each call to vs.search should have is_retracted=False in filters
    for f in captured:
        assert f is not None
        assert f.get("is_retracted") is False


@pytest.mark.asyncio
async def test_explicit_opt_in_passes_none():
    captured = []
    r = _make_retriever(captured)
    await r.retrieve(query="x", top_k=5, filters={"is_retracted": None})
    for f in captured:
        assert "is_retracted" not in f or f["is_retracted"] is None


@pytest.mark.asyncio
async def test_caller_filter_preserved_and_merged():
    captured = []
    r = _make_retriever(captured)
    await r.retrieve(query="x", top_k=5, filters={"source_type": "paper"})
    for f in captured:
        assert f["source_type"] == "paper"
        assert f["is_retracted"] is False  # injected default
```

- [ ] **Step 2: Run test, verify it fails**

Run: `pytest tests/integrity/test_rag_retraction_filter.py -v`
Expected: FAIL — current retriever passes `filters` through unchanged.

- [ ] **Step 3: Update retriever to inject default filter**

Edit `src/rag/retriever.py`. Replace the `retrieve` method body:

```python
    async def retrieve(
        self,
        query: str,
        top_k: int = 10,
        filters: dict | None = None,
        collections: list[str] | None = None,
    ) -> list[RetrievedDocument]:
        # Spec §4.7: default-exclude retracted unless caller explicitly passes
        # `is_retracted: None` (opt-in to retracted in results).
        merged_filters = dict(filters) if filters else {}
        if "is_retracted" not in merged_filters:
            merged_filters["is_retracted"] = False
        # If caller passes None, drop the key so vector store ignores it.
        if merged_filters.get("is_retracted") is None:
            merged_filters.pop("is_retracted", None)

        query_embedding = self.embeddings.embed(query)
        target_collections = collections or ["papers", "repositories", "chunks"]

        all_results = []
        for collection in target_collections:
            results = self.vector_store.search(
                collection=collection,
                query_vector=query_embedding,
                limit=top_k,
                filters=merged_filters,
            )
            for hit in results:
                payload = hit.get("payload", {})
                all_results.append(
                    RetrievedDocument(
                        id=str(hit["id"]),
                        source_type=payload.get("source_type", collection),
                        title=payload.get("title", ""),
                        content=payload.get("content", payload.get("abstract", "")),
                        url=payload.get("url"),
                        score=hit["score"],
                    )
                )

        all_results.sort(key=lambda x: x.score, reverse=True)
        return all_results[:top_k]
```

- [ ] **Step 4: Run test, verify all pass**

Run: `pytest tests/integrity/test_rag_retraction_filter.py -v`
Expected: 3 PASS.

- [ ] **Step 5: Commit**

```bash
git add src/rag/retriever.py tests/integrity/test_rag_retraction_filter.py
git commit -m "feat(rag): retriever defaults to is_retracted=False; opt-in via None"
```

---

### Task 10: RAG reranker — peer-review status score boost

**Files:**
- Modify: `src/rag/reranker.py`
- Test: `tests/integrity/test_rag_reranker_boost.py`

- [ ] **Step 1: Read existing reranker to understand interface**

Run: `cat src/rag/reranker.py`
Note the class name (`CrossEncoderReranker`), the `rerank` method signature, and what fields are available on `RetrievedDocument`. The current `RetrievedDocument` (from `retriever.py`) doesn't carry `peer_review_status` — we'll need to add it.

- [ ] **Step 2: Add `peer_review_status` and `is_retracted` to `RetrievedDocument`**

Edit `src/rag/retriever.py`:

```python
@dataclass
class RetrievedDocument:
    id: str
    source_type: str
    title: str
    content: str
    url: str | None
    score: float
    peer_review_status: str = "unknown"
    is_retracted: bool = False
```

Inside `retrieve`, when building `RetrievedDocument`, populate the new fields:

```python
                all_results.append(
                    RetrievedDocument(
                        id=str(hit["id"]),
                        source_type=payload.get("source_type", collection),
                        title=payload.get("title", ""),
                        content=payload.get("content", payload.get("abstract", "")),
                        url=payload.get("url"),
                        score=hit["score"],
                        peer_review_status=payload.get("peer_review_status", "unknown"),
                        is_retracted=payload.get("is_retracted", False),
                    )
                )
```

- [ ] **Step 3: Write failing reranker test**

Create `tests/integrity/test_rag_reranker_boost.py`:

```python
"""Reranker score boost for peer-reviewed status."""
import pytest
from unittest.mock import MagicMock, patch

from src.rag.retriever import RetrievedDocument


@pytest.mark.asyncio
async def test_peer_reviewed_outranks_preprint_with_equal_base_score():
    """Same base score, peer_reviewed > preprint after boost."""
    from src.rag.reranker import CrossEncoderReranker

    pr = RetrievedDocument(
        id="p1", source_type="paper", title="Peer-reviewed paper",
        content="...", url=None, score=0.5, peer_review_status="peer_reviewed",
    )
    pre = RetrievedDocument(
        id="p2", source_type="paper", title="Preprint paper",
        content="...", url=None, score=0.5, peer_review_status="preprint",
    )

    # Mock the cross-encoder so rerank-base score equals input score.
    with patch.object(CrossEncoderReranker, "_score_pairs",
                      return_value=[0.5, 0.5]):
        rer = CrossEncoderReranker()
        out = await rer.rerank(query="q", documents=[pre, pr], top_k=2)

    assert out[0].id == "p1"   # peer_reviewed wins after boost


@pytest.mark.asyncio
async def test_retracted_excluded_even_if_passed():
    from src.rag.reranker import CrossEncoderReranker
    bad = RetrievedDocument(
        id="bad", source_type="paper", title="Retracted",
        content="...", url=None, score=0.99, is_retracted=True,
    )
    good = RetrievedDocument(
        id="good", source_type="paper", title="OK",
        content="...", url=None, score=0.5,
    )
    with patch.object(CrossEncoderReranker, "_score_pairs",
                      return_value=[0.99, 0.5]):
        rer = CrossEncoderReranker()
        out = await rer.rerank(query="q", documents=[bad, good], top_k=2)
    assert all(d.id != "bad" for d in out)
```

- [ ] **Step 4: Run test, verify it fails**

Run: `pytest tests/integrity/test_rag_reranker_boost.py -v`
Expected: FAIL — boost logic not present.

- [ ] **Step 5: Update reranker**

Edit `src/rag/reranker.py`. Locate the `rerank` method. Add status boost + retracted filter. The exact edit depends on the current shape of the file (check Step 1). The boost logic to add after computing base scores:

```python
import os

_BOOST_WEIGHT = float(os.getenv("RERANK_PEER_REVIEW_WEIGHT", "1.0"))
_BOOST_BY_STATUS = {
    "peer_reviewed": 0.1,
    "published": 0.1,
}


def _status_boost(status: str) -> float:
    return _BOOST_WEIGHT * _BOOST_BY_STATUS.get(status, 0.0)
```

Inside `rerank` (pseudo-shape — adapt to current method):

```python
    async def rerank(self, query, documents, top_k):
        # Defense in depth: drop retracted even if retriever didn't filter.
        documents = [d for d in documents if not getattr(d, "is_retracted", False)]
        if not documents:
            return []

        base_scores = self._score_pairs([(query, d.content) for d in documents])
        for doc, base in zip(documents, base_scores):
            doc.score = base + _status_boost(getattr(doc, "peer_review_status", "unknown"))

        documents.sort(key=lambda d: d.score, reverse=True)
        return documents[:top_k]
```

If the existing `rerank` doesn't have a method called `_score_pairs`, refactor to extract it, since the test mocks it.

- [ ] **Step 6: Run test, verify all pass**

Run: `pytest tests/integrity/test_rag_reranker_boost.py -v`
Expected: 2 PASS.

- [ ] **Step 7: Commit**

```bash
git add src/rag/retriever.py src/rag/reranker.py tests/integrity/test_rag_reranker_boost.py
git commit -m "feat(rag): reranker boosts peer_reviewed/published; hard-excludes retracted"
```

---

## Phase C — API surface (Tasks 11–12)

### Task 11: Papers router — filter params + integrity in detail + admin refresh

**Files:**
- Modify: `src/api/routers/papers.py:37-75` (list_papers)
- Modify: `src/api/routers/papers.py:414-425` (get_paper)
- Modify: `src/storage/repositories/paper_repo.py` (list_papers method — add filter args)
- Test: `tests/api/__init__.py` + `tests/api/test_papers_integrity.py`

- [ ] **Step 1: Write failing tests**

Create `tests/api/__init__.py` (empty) and `tests/api/test_papers_integrity.py`:

```python
"""Integration tests for /papers integrity surface."""
import pytest
from httpx import AsyncClient
from datetime import datetime

from src.main import app
from src.api.deps import get_db
from src.storage.models._enums import PeerReviewStatus
from tests.factories import make_paper

pytestmark = pytest.mark.asyncio


@pytest.fixture
async def client(db_session):
    """Test client with DB session override."""
    async def _override():
        yield db_session
    app.dependency_overrides[get_db] = _override
    async with AsyncClient(app=app, base_url="http://test") as ac:
        yield ac
    app.dependency_overrides.clear()


async def test_get_paper_returns_integrity(client, db_session):
    paper = await make_paper(
        db_session,
        is_retracted=True,
        retraction_reason="Image manipulation",
        peer_review_status=PeerReviewStatus.RETRACTED.value,
    )
    r = await client.get(f"/papers/{paper.id}")
    assert r.status_code == 200
    body = r.json()
    integrity = body["paper"]["integrity"]
    assert integrity["is_retracted"] is True
    assert integrity["peer_review_status"] == "retracted"
    assert integrity["retraction_reason"] == "Image manipulation"


async def test_list_excludes_retracted_by_default(client, db_session):
    await make_paper(db_session, title="Visible", is_retracted=False)
    await make_paper(db_session, title="Retracted",
                     is_retracted=True,
                     peer_review_status=PeerReviewStatus.RETRACTED.value)

    r = await client.get("/papers/")
    assert r.status_code == 200
    titles = [p["title"] for p in r.json()["items"]]
    assert "Visible" in titles
    assert "Retracted" not in titles


async def test_list_include_retracted_via_param(client, db_session):
    await make_paper(db_session, title="Retracted",
                     is_retracted=True,
                     peer_review_status=PeerReviewStatus.RETRACTED.value)
    r = await client.get("/papers/?exclude_retracted=false")
    titles = [p["title"] for p in r.json()["items"]]
    assert "Retracted" in titles


async def test_filter_by_peer_review_status(client, db_session):
    await make_paper(db_session, title="A", peer_review_status=PeerReviewStatus.PEER_REVIEWED.value)
    await make_paper(db_session, title="B", peer_review_status=PeerReviewStatus.PREPRINT.value)
    r = await client.get("/papers/?peer_review_status=peer_reviewed")
    titles = [p["title"] for p in r.json()["items"]]
    assert "A" in titles and "B" not in titles
```

- [ ] **Step 2: Run test, verify they fail**

Run: `pytest tests/api/test_papers_integrity.py -v`
Expected: 4 FAILures — params and integrity field don't exist.

- [ ] **Step 3: Update PaperRepository.list_papers signature**

Read `src/storage/repositories/paper_repo.py`, find `list_papers`. Add two parameters:

```python
    async def list_papers(
        self,
        # ... existing args ...
        exclude_retracted: bool = True,
        peer_review_status: str | None = None,
    ) -> tuple[list[Paper], int]:
        # ... existing query construction ...
        if exclude_retracted:
            query = query.where(Paper.is_retracted.is_(False))
        if peer_review_status:
            query = query.where(Paper.peer_review_status == peer_review_status)
        # ... rest unchanged ...
```

- [ ] **Step 4: Update list_papers router**

Edit `src/api/routers/papers.py:37-75`:

```python
@router.get("/", response_model=PaginatedResponse[PaperResponse])
async def list_papers(
    db: DbSession,
    skip: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=100),
    category: str | None = None,
    topic: str | None = None,
    search: str | None = None,
    source: str | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
    has_code: bool | None = None,
    is_vietnamese: bool | None = None,
    exclude_retracted: bool = Query(True),
    peer_review_status: str | None = Query(None),
    sort_by: str = Query("published_date"),
    sort_order: str = Query("desc"),
):
    repo = PaperRepository(db)
    papers, total = await repo.list_papers(
        skip=skip, limit=limit,
        category=category, topic=topic, search=search, source=source,
        date_from=date_from, date_to=date_to,
        has_code=has_code, is_vietnamese=is_vietnamese,
        exclude_retracted=exclude_retracted,
        peer_review_status=peer_review_status,
        sort_by=sort_by, sort_order=sort_order,
    )
    return PaginatedResponse(
        items=[PaperResponse.model_validate(p) for p in papers],
        total=total, skip=skip, limit=limit,
    )
```

- [ ] **Step 5: Add admin refresh endpoint**

Append to `src/api/routers/papers.py`:

```python
@router.post("/{paper_id}/integrity/refresh")
async def refresh_paper_integrity(paper_id: UUID, db: DbSession):
    """Re-run peer-review inference for one paper. Used by 'Re-check status' button."""
    from src.workers.tasks.intelligence import _run_peer_review_inference
    from sqlalchemy import select, update
    from src.storage.models.paper import Paper

    paper = (await db.execute(
        select(Paper).where(Paper.id == paper_id)
    )).scalar_one_or_none()
    if not paper:
        raise HTTPException(status_code=404, detail="Paper not found")

    # Force re-inference by clearing the timestamp
    paper.peer_review_updated_at = None
    await db.commit()
    await _run_peer_review_inference(db, staleness_days=0)
    await db.commit()
    await db.refresh(paper)
    return {
        "paper_id": str(paper_id),
        "peer_review_status": paper.peer_review_status,
        "peer_review_inferred_from": paper.peer_review_inferred_from,
    }
```

- [ ] **Step 6: Run tests, verify they pass**

Run: `pytest tests/api/test_papers_integrity.py -v`
Expected: 4 PASS.

- [ ] **Step 7: Commit**

```bash
git add src/api/routers/papers.py src/storage/repositories/paper_repo.py tests/api/__init__.py tests/api/test_papers_integrity.py
git commit -m "feat(api): /papers exclude_retracted + peer_review_status filter; refresh endpoint"
```

---

### Task 12: Chat router — `include_retracted` opt-in

**Files:**
- Modify: `src/api/routers/chat.py` (find the chat request schema + handler)
- Modify: `src/api/schemas/chat.py` (add field)
- Test: `tests/api/test_chat_integrity.py`

- [ ] **Step 1: Read chat.py to find the request schema**

Run: `grep -n "class.*Request\|@router" src/api/routers/chat.py | head -30 && cat src/api/schemas/chat.py`

Note the request body class name (likely `ChatMessageRequest` or similar).

- [ ] **Step 2: Write failing test**

Create `tests/api/test_chat_integrity.py`:

```python
"""Chat opt-in surfaces include_retracted to RAG pipeline."""
import pytest
from unittest.mock import patch, AsyncMock
from httpx import AsyncClient

from src.main import app
from src.api.deps import get_db
from src.rag.pipeline import RAGResponse

pytestmark = pytest.mark.asyncio


@pytest.fixture
async def client(db_session):
    async def _override():
        yield db_session
    app.dependency_overrides[get_db] = _override
    async with AsyncClient(app=app, base_url="http://test") as ac:
        yield ac
    app.dependency_overrides.clear()


async def test_chat_default_filters_retracted(client):
    captured = {}
    async def fake_query(self, question, **kwargs):
        captured["filters"] = kwargs.get("filters")
        return RAGResponse(answer="ok", sources=[], confidence=0.0)

    with patch("src.rag.pipeline.RAGPipeline.query", new=fake_query):
        r = await client.post("/chat/messages", json={"content": "hi"})
    # Default: filters should have is_retracted=False (or be absent so retriever injects default)
    assert captured.get("filters") is None or captured["filters"].get("is_retracted") is False


async def test_chat_include_retracted_passes_none(client):
    captured = {}
    async def fake_query(self, question, **kwargs):
        captured["filters"] = kwargs.get("filters")
        return RAGResponse(answer="ok", sources=[], confidence=0.0)

    with patch("src.rag.pipeline.RAGPipeline.query", new=fake_query):
        r = await client.post("/chat/messages",
                              json={"content": "hi", "include_retracted": True})
    assert captured["filters"]["is_retracted"] is None
```

(If your chat endpoint requires authentication and a different request shape, adapt the URL/body — the important assertions are the filter values.)

- [ ] **Step 3: Run test, verify it fails**

Run: `pytest tests/api/test_chat_integrity.py -v`
Expected: FAIL — `include_retracted` field doesn't exist.

- [ ] **Step 4: Add `include_retracted` to chat request schema**

Edit `src/api/schemas/chat.py`. Find the request model and add:

```python
    include_retracted: bool = False
```

- [ ] **Step 5: Pipe through to retriever in chat router**

Edit `src/api/routers/chat.py`. Find where `RAGPipeline.query(...)` is called. Build filters dict:

```python
    filters = {"is_retracted": None} if request.include_retracted else None
    response = await pipeline.query(question=request.content, filters=filters)
```

(Adapt to the actual call site; the key is to pass `filters={"is_retracted": None}` when opting in, else let the retriever's default kick in.)

- [ ] **Step 6: Run test, verify it passes**

Run: `pytest tests/api/test_chat_integrity.py -v`
Expected: 2 PASS.

- [ ] **Step 7: Commit**

```bash
git add src/api/schemas/chat.py src/api/routers/chat.py tests/api/test_chat_integrity.py
git commit -m "feat(chat): include_retracted opt-in flag pipes through to retriever"
```

---

## Phase D — Frontend (Tasks 13–17)

### Task 13: `PaperIntegrityBadge` shared component

**Files:**
- Create: `frontend/components/PaperIntegrityBadge.tsx`
- Modify: `frontend/lib/api.ts` (add types)
- Test: `frontend/__tests__/PaperIntegrityBadge.test.tsx`

- [ ] **Step 1: Add types to `lib/api.ts`**

Edit `frontend/lib/api.ts`. Append to type exports:

```ts
export type PeerReviewStatus =
  | "unknown" | "preprint" | "under_review"
  | "peer_reviewed" | "published" | "withdrawn" | "retracted";

export interface PaperIntegrity {
  is_retracted: boolean;
  retracted_at: string | null;
  retraction_reason: string | null;
  retraction_source_url: string | null;
  peer_review_status: PeerReviewStatus;
  peer_review_inferred_from: string | null;
  peer_review_updated_at: string | null;
}
```

- [ ] **Step 2: Write the component**

Create `frontend/components/PaperIntegrityBadge.tsx`:

```tsx
"use client";

import { AlertTriangle, ShieldCheck, ShieldQuestion, Clock, FileWarning, BookOpen, Ban } from "lucide-react";
import { cn } from "@/lib/utils";
import type { PaperIntegrity, PeerReviewStatus } from "@/lib/api";

type Variant = "badge" | "banner" | "inline";

interface Props {
  integrity?: PaperIntegrity | null;
  variant?: Variant;
  className?: string;
}

const STATUS_META: Record<PeerReviewStatus, { label: string; tone: string; icon: typeof BookOpen; tip: string }> = {
  unknown:        { label: "Unverified",      tone: "neutral", icon: ShieldQuestion, tip: "Status not yet inferred." },
  preprint:       { label: "Preprint",        tone: "gray",    icon: BookOpen,       tip: "Available as preprint; not yet peer-reviewed." },
  under_review:   { label: "Under review",    tone: "amber",   icon: Clock,          tip: "Submitted to a peer-reviewed venue; decision pending." },
  peer_reviewed:  { label: "Peer-reviewed",   tone: "green",   icon: ShieldCheck,    tip: "Accepted by a peer-reviewed venue." },
  published:      { label: "Published",       tone: "green",   icon: ShieldCheck,    tip: "Has a DOI from a non-preprint publisher." },
  withdrawn:      { label: "Withdrawn",       tone: "orange",  icon: Ban,            tip: "Author-initiated removal." },
  retracted:      { label: "RETRACTED",       tone: "red",     icon: AlertTriangle,  tip: "Forced retraction due to integrity issue." },
};

const TONE_CLASSES: Record<string, string> = {
  neutral: "bg-muted text-muted-foreground border-border",
  gray:    "bg-zinc-500/10 text-zinc-600 dark:text-zinc-300 border-zinc-500/20",
  amber:   "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30",
  green:   "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/30",
  orange:  "bg-orange-500/10 text-orange-700 dark:text-orange-400 border-orange-500/30",
  red:     "bg-red-500/10 text-red-700 dark:text-red-400 border-red-500/40",
};

export function PaperIntegrityBadge({ integrity, variant = "badge", className }: Props) {
  if (!integrity) return null;
  const status: PeerReviewStatus = integrity.is_retracted ? "retracted" : integrity.peer_review_status;
  const meta = STATUS_META[status] ?? STATUS_META.unknown;
  const Icon = meta.icon;
  const tone = TONE_CLASSES[meta.tone];

  if (variant === "banner" && integrity.is_retracted) {
    return (
      <div
        role="alert"
        className={cn(
          "flex items-start gap-3 rounded-2xl border-2 border-red-500/40 bg-red-500/10 p-4 text-red-700 dark:text-red-400",
          className,
        )}
      >
        <AlertTriangle size={20} className="mt-0.5 shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="text-[14px] font-semibold">This paper has been retracted.</p>
          {integrity.retraction_reason && (
            <p className="mt-1 text-[13px]">Reason: {integrity.retraction_reason}</p>
          )}
          {integrity.retraction_source_url && (
            <a
              href={integrity.retraction_source_url}
              target="_blank" rel="noopener noreferrer"
              className="mt-1 inline-block text-[12px] underline hover:no-underline"
            >
              Retraction notice ↗
            </a>
          )}
        </div>
      </div>
    );
  }

  if (variant === "inline") {
    return (
      <span
        title={meta.tip}
        className={cn("inline-flex items-center gap-1 text-[11px] font-medium", className)}
      >
        <Icon size={11} />
        {meta.label}
      </span>
    );
  }

  // default: badge
  return (
    <span
      title={meta.tip}
      className={cn(
        "inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[11px] font-medium",
        tone, className,
      )}
    >
      <Icon size={11} />
      {meta.label}
    </span>
  );
}
```

- [ ] **Step 3: Set up frontend test runner (if not already)**

Check: `cat frontend/package.json | grep -E "vitest|jest"`

If neither is installed, add Vitest:

```bash
cd frontend && npm install -D vitest @testing-library/react @testing-library/jest-dom @vitejs/plugin-react jsdom
```

Add to `package.json` scripts:

```json
"test": "vitest run",
"test:watch": "vitest"
```

Create `frontend/vitest.config.ts`:

```ts
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
  },
  resolve: { alias: { "@": path.resolve(__dirname, ".") } },
});
```

- [ ] **Step 4: Write the smoke test**

Create `frontend/__tests__/PaperIntegrityBadge.test.tsx`:

```tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { PaperIntegrityBadge } from "@/components/PaperIntegrityBadge";

const base = {
  is_retracted: false, retracted_at: null,
  retraction_reason: null, retraction_source_url: null,
  peer_review_inferred_from: null, peer_review_updated_at: null,
};

describe("PaperIntegrityBadge", () => {
  it("renders nothing for null integrity", () => {
    const { container } = render(<PaperIntegrityBadge integrity={null} />);
    expect(container.firstChild).toBeNull();
  });

  it("renders peer-reviewed badge", () => {
    render(<PaperIntegrityBadge integrity={{ ...base, peer_review_status: "peer_reviewed" }} />);
    expect(screen.getByText(/peer-reviewed/i)).toBeInTheDocument();
  });

  it("renders retracted as RETRACTED badge", () => {
    render(<PaperIntegrityBadge integrity={{ ...base, is_retracted: true, peer_review_status: "retracted" }} />);
    expect(screen.getByText(/retracted/i)).toBeInTheDocument();
  });

  it("renders banner with reason and source link when retracted", () => {
    render(
      <PaperIntegrityBadge
        variant="banner"
        integrity={{
          ...base, is_retracted: true, peer_review_status: "retracted",
          retraction_reason: "Image manipulation",
          retraction_source_url: "https://example.com/notice",
        }}
      />,
    );
    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.getByText(/image manipulation/i)).toBeInTheDocument();
    expect(screen.getByRole("link")).toHaveAttribute("href", "https://example.com/notice");
  });

  it("banner variant returns null for non-retracted", () => {
    const { container } = render(
      <PaperIntegrityBadge variant="banner" integrity={{ ...base, peer_review_status: "preprint" }} />,
    );
    expect(container.firstChild).toBeNull();
  });
});
```

- [ ] **Step 5: Run test, verify all pass**

Run: `cd frontend && npm test`
Expected: 5 PASS.

- [ ] **Step 6: Commit**

```bash
git add frontend/components/PaperIntegrityBadge.tsx frontend/lib/api.ts frontend/__tests__/PaperIntegrityBadge.test.tsx frontend/vitest.config.ts frontend/package.json frontend/package-lock.json
git commit -m "feat(ui): PaperIntegrityBadge shared component + Vitest setup"
```

---

### Task 14: Wire badge into paper detail page

**Files:**
- Modify: `frontend/app/(app)/papers/[id]/page.tsx`

- [ ] **Step 1: Add banner above hero card**

In `frontend/app/(app)/papers/[id]/page.tsx`, after the imports add:

```tsx
import { PaperIntegrityBadge } from "@/components/PaperIntegrityBadge";
```

Inside the main return, immediately after the back link and before the hero card:

```tsx
{p.integrity?.is_retracted && (
  <PaperIntegrityBadge variant="banner" integrity={p.integrity} />
)}
```

- [ ] **Step 2: Add badge to stats row**

Inside the existing "Stats row" `<div className="mt-6 flex flex-wrap gap-6">`, add at the start:

```tsx
{p.integrity && (
  <PaperIntegrityBadge integrity={p.integrity} />
)}
```

- [ ] **Step 3: Add provenance line below abstract**

After the abstract block closes, add:

```tsx
{p.integrity?.peer_review_inferred_from && (
  <p className="mt-2 text-[11px] text-muted-foreground">
    Status inferred from: <code className="rounded bg-muted px-1">{p.integrity.peer_review_inferred_from}</code>
  </p>
)}
```

- [ ] **Step 4: Verify locally**

Run: `cd frontend && npm run dev`
Open: `http://localhost:3000/papers/<some-paper-id>`
Expected: badge renders in stats row. If you have a retracted test paper, the banner appears at top.

- [ ] **Step 5: Commit**

```bash
git add frontend/app/\(app\)/papers/\[id\]/page.tsx
git commit -m "feat(ui): paper detail shows integrity banner + badge + provenance"
```

---

### Task 15: Wire badge into paper list, search, and library cards

**Files:**
- Modify: `frontend/app/(app)/papers/page.tsx`
- Modify: `frontend/app/(app)/search/page.tsx`
- Modify: `frontend/app/(app)/my-library/page.tsx`

- [ ] **Step 1: Add badge to papers list page**

Find each card render block and add inside the metadata row:

```tsx
import { PaperIntegrityBadge } from "@/components/PaperIntegrityBadge";

// inside card:
{paper.integrity && <PaperIntegrityBadge integrity={paper.integrity} />}
```

Add a "Hide retracted" toggle near the existing filters. Wire it to a state that gets passed as `exclude_retracted` query param:

```tsx
const [hideRetracted, setHideRetracted] = useState(true);
// ... in filter UI ...
<label className="flex items-center gap-1.5 text-[12px]">
  <input type="checkbox" checked={hideRetracted}
         onChange={(e) => setHideRetracted(e.target.checked)} />
  Hide retracted
</label>
// ... in fetch call ...
fetchPapers({ ...filters, exclude_retracted: hideRetracted })
```

(Update the `fetchPapers` helper in `frontend/lib/api.ts` to accept and forward `exclude_retracted`.)

- [ ] **Step 2: Repeat for search page**

Same pattern in `search/page.tsx` — add badge per result card. Search uses semantic similarity, server already filters retracted by default via Task 9.

- [ ] **Step 3: Repeat for my-library**

Same pattern in `my-library/page.tsx`. Bookmark cards show the badge so users see if their saved paper is retracted.

- [ ] **Step 4: Smoke test in browser**

Run: `cd frontend && npm run dev`
Open papers list, search, library — verify badges render on each card.

- [ ] **Step 5: Commit**

```bash
git add frontend/app/\(app\)/papers/page.tsx frontend/app/\(app\)/search/page.tsx frontend/app/\(app\)/my-library/page.tsx frontend/lib/api.ts
git commit -m "feat(ui): integrity badge on paper list, search, library cards + hide-retracted filter"
```

---

### Task 16: Wire badge into chat sources

**Files:**
- Modify: `frontend/app/(app)/chat/page.tsx`

- [ ] **Step 1: Read the chat sources rendering block**

Run: `grep -n "sources\|citation" frontend/app/\(app\)/chat/page.tsx | head -20`

Locate where each source/citation card is rendered.

- [ ] **Step 2: Add inline badge per source**

For each source card, add the inline badge:

```tsx
{src.integrity && (
  <PaperIntegrityBadge variant="inline" integrity={src.integrity} className="ml-2" />
)}
```

If the source returned by RAG doesn't include integrity yet, we need to surface it from the backend. Check the RAG `sources` response — currently in `pipeline.py:120-129` it only includes id/type/title/url/score. Add to that build:

```python
sources = [
    {
        "id": doc.id,
        "type": doc.source_type,
        "title": doc.title,
        "url": doc.url,
        "relevance_score": doc.score,
        "integrity": {
            "is_retracted": doc.is_retracted,
            "peer_review_status": doc.peer_review_status,
            # other PaperIntegrity fields default-null
        },
    }
    for doc in reranked
]
```

- [ ] **Step 3: Add red border around retracted sources**

```tsx
<div className={cn(
  "rounded-lg border p-3",
  src.integrity?.is_retracted ? "border-red-500/40 bg-red-500/5" : "border-border",
)}>
```

- [ ] **Step 4: Smoke test**

Run: `cd frontend && npm run dev`
Have a chat conversation. Verify source cards show the inline badge.

- [ ] **Step 5: Commit**

```bash
git add frontend/app/\(app\)/chat/page.tsx src/rag/pipeline.py
git commit -m "feat(ui): chat sources show integrity badge; retracted have red border"
```

---

## Phase E — Wiring & cleanup (Tasks 17–19)

### Task 17: Document env vars + run backfill in dev

**Files:**
- Modify: `.env.example`
- Modify: `Makefile` (add backfill target)

- [ ] **Step 1: Document new env vars**

Append to `.env.example`:

```
# Integrity layer (spec: 2026-05-08-paper-integrity-layer)
RERANK_PEER_REVIEW_WEIGHT=1.0
INTEGRITY_INFERENCE_STALENESS_DAYS=30
RETRACTION_NOTIFICATION_ENABLED=true
```

- [ ] **Step 2: Add Make target for one-shot backfill**

Append to `Makefile`:

```
backfill-integrity:
	docker compose exec app celery -A src.workers.celery_app call src.workers.tasks.integrity_backfill.integrity_backfill_once
```

- [ ] **Step 3: Run backfill against dev DB**

Run: `make backfill-integrity`
Expected: prints task ID. Check logs (`docker compose logs worker | tail -30`) for "retraction backfill complete" and "inference backfill complete" lines.

- [ ] **Step 4: Verify in dev DB**

Run: `psql $DATABASE_URL -c "SELECT peer_review_status, COUNT(*) FROM papers GROUP BY 1"`
Expected: distribution shows non-zero values for `preprint`, `published`, etc.

- [ ] **Step 5: Commit**

```bash
git add .env.example Makefile
git commit -m "ops: integrity backfill make target + env vars"
```

---

### Task 18: End-to-end integration test

**Files:**
- Create: `tests/integrity/test_e2e.py`

- [ ] **Step 1: Write the test**

Create `tests/integrity/test_e2e.py`:

```python
"""End-to-end: bookmark a paper, retract it, verify all surfaces."""
import pytest
from datetime import datetime
from httpx import AsyncClient
from sqlalchemy import select

from src.main import app
from src.api.deps import get_db
from src.collectors.retraction_watch import RetractionItem
from src.workers.tasks.collection import _apply_retraction
from src.storage.models.notification import Notification
from tests.factories import make_paper, make_user, make_bookmark

pytestmark = pytest.mark.asyncio


@pytest.fixture
async def client(db_session):
    async def _override():
        yield db_session
    app.dependency_overrides[get_db] = _override
    async with AsyncClient(app=app, base_url="http://test") as ac:
        yield ac
    app.dependency_overrides.clear()


async def test_full_retraction_flow(client, db_session):
    # Setup
    user = await make_user(db_session)
    paper = await make_paper(db_session, doi="10.99/zzzz", title="Important Paper")
    await make_bookmark(db_session, user=user, paper=paper)

    # Sanity: paper visible
    r = await client.get("/papers/")
    assert any(p["id"] == str(paper.id) for p in r.json()["items"])

    # Trigger retraction
    item = RetractionItem(
        title="Retraction notice", link="https://retractionwatch.example/zzz",
        description="x", paper_doi="10.99/zzzz",
        published_at=datetime(2025, 7, 1), reason="Fabricated data",
    )
    await _apply_retraction(db_session, item)
    await db_session.commit()

    # 1. Detail endpoint shows retracted
    r = await client.get(f"/papers/{paper.id}")
    integrity = r.json()["paper"]["integrity"]
    assert integrity["is_retracted"] is True
    assert integrity["retraction_reason"] == "Fabricated data"

    # 2. Default list excludes it
    r = await client.get("/papers/")
    assert all(p["id"] != str(paper.id) for p in r.json()["items"])

    # 3. Opt-in includes it
    r = await client.get("/papers/?exclude_retracted=false")
    assert any(p["id"] == str(paper.id) for p in r.json()["items"])

    # 4. Notification was created
    notifs = (
        await db_session.execute(
            select(Notification).where(
                Notification.user_id == user.id,
                Notification.notification_type == "paper_retracted",
            )
        )
    ).scalars().all()
    assert len(notifs) == 1
    assert notifs[0].data["paper_id"] == str(paper.id)
```

- [ ] **Step 2: Run test, verify it passes**

Run: `pytest tests/integrity/test_e2e.py -v`
Expected: 1 PASS.

- [ ] **Step 3: Run the full integrity test suite**

Run: `pytest tests/integrity tests/api -v --cov=src.services.peer_review_inference --cov=src.workers.tasks.integrity_backfill`
Expected: all green. Coverage on new modules ≥ 80%.

- [ ] **Step 4: Commit**

```bash
git add tests/integrity/test_e2e.py
git commit -m "test(integrity): end-to-end retraction flow across API surfaces"
```

---

### Task 19: Phase 1D cleanup migration (deferred — separate PR after verification)

**Note:** Per spec §7, this task is intentionally deferred to a separate release. **Do not run as part of the current implementation.** It removes the `vietnam_entities.retraction` JSONB key after the new columns have been verified in production for one release cycle.

**Files:**
- Create (later): `migrations/versions/versions/l6m7n8o9p0q1_cleanup_vietnam_entities_retraction.py`

```python
"""Drop the now-redundant vietnam_entities.retraction key.

Revision ID: l6m7n8o9p0q1
Revises: k5l6m7n8o9p0
Create Date: TBD (one release after k5l6m7n8o9p0 is in production)
"""
from alembic import op


revision = "l6m7n8o9p0q1"
down_revision = "k5l6m7n8o9p0"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
        UPDATE papers
        SET vietnam_entities = vietnam_entities - 'retraction'
        WHERE vietnam_entities ? 'retraction'
    """)


def downgrade() -> None:
    # Irreversible — data is already in dedicated columns.
    pass
```

- [ ] Marker only — don't execute. Reference this section when planning the next release.

---

## Acceptance verification (run before merge)

- [ ] All 7 columns exist on `papers` (`psql ... \d papers`)
- [ ] `grep -rn "vietnam_entities.*retraction" src/` returns no production code paths (test fixtures excepted)
- [ ] `pytest tests/ -v` is green
- [ ] `cd frontend && npm test` is green
- [ ] `make backfill-integrity` completes without errors
- [ ] Distribution query shows non-`unknown` statuses for >50% of papers
- [ ] `GET /papers/` default excludes retracted; `?exclude_retracted=false` includes them
- [ ] `GET /papers/<id>` returns `integrity` block
- [ ] Paper detail page renders banner for retracted papers (visual check)
- [ ] Chat source cards render integrity badge (visual check)
- [ ] Bookmark a paper, run `_apply_retraction` against it, see `paper_retracted` notification in `/me/notifications`

---

## Self-review notes

**Spec coverage check (run after writing):**

| Spec section | Tasks covering it |
|--------------|-------------------|
| §3 Data model — 7 columns + enum | Task 2 (ORM) + Task 3 (migration) |
| §4.1 Migration | Task 3 |
| §4.2 Backfill task | Task 6 |
| §4.3 Retraction collector update | Task 8 |
| §4.4 Inference task | Tasks 5 (pure logic) + 7 (Celery) |
| §4.5 Schema update | Task 4 |
| §4.6 Router updates | Task 11 |
| §4.7 RAG retriever filter | Task 9 |
| §4.8 RAG reranker boost | Task 10 |
| §4.9 Notification kind | Task 8 (dispatch); reuses existing `notifications.notification_type` String column |
| §4.10 PaperIntegrityBadge | Task 13 |
| §4.11 Paper detail integration | Task 14 |
| §4.12 List/search/library integration | Task 15 |
| §4.13 Chat sources integration | Task 16 |
| §5 Data flow | All tasks combined; verified by Task 18 e2e |
| §6 Error handling | Each task's tests cover the documented modes |
| §7 Migration phases 1A–1C | Tasks 3, 6, 8/13–16 respectively; Phase 1D = Task 19 (deferred) |
| §8 Testing | Tasks 1, 2, 4–13, 18 |
| §9 Configuration | Task 7 (env var read), Task 17 (.env.example), Task 10 (RERANK_PEER_REVIEW_WEIGHT) |
| §12 Acceptance criteria | "Acceptance verification" checklist above |

**Type-consistency spot-check:**

- `PeerReviewStatus` enum imported from `src/storage/models/_enums.py` everywhere ✓
- Frontend type `PeerReviewStatus` mirrors the 7 string values exactly ✓
- `PaperIntegrity` Pydantic schema field names match ORM column names exactly ✓
- `RetrievedDocument` extended with `peer_review_status` + `is_retracted` (Task 10 step 2) — used in Task 16 (chat sources include integrity) ✓
- `_apply_retraction` extracted helper in Task 8 is referenced (not redefined) by Task 18 e2e ✓
