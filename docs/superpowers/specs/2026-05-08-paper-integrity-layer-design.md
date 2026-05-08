# Paper Integrity Layer — Design Spec

**Date:** 2026-05-08
**Status:** Approved (user gave preemptive sign-off; no per-section edits requested)
**Scope:** Retraction signals + Peer-review status as first-class fields on Paper, with consistent surfacing in API, RAG, UI, and notifications.
**Out of scope:** Venue normalization, predatory journal detection, citation-of-retracted-paper detection, errata / expression-of-concern auto-detection. Each is a future spec.

---

## 1. Motivation

Current state — verified during audit on 2026-05-08:

- `RetractionWatchCollector` exists and runs on schedule, but `_collect_retractions` (in `src/workers/tasks/collection.py:1684-1697`) **shoehorns retraction data into `paper.vietnam_entities` JSONB** under a `"retraction"` key. `vietnam_entities` is the field for Vietnamese NER results — wrong semantic field.
- `Paper` model has **no** `is_retracted`, `retracted_at`, `peer_review_status`, `venue`, `journal`, or `peer_reviewed` columns.
- Frontend never reads `vietnam_entities.retraction` → users see retracted papers as if normal.
- RAG retriever has no retraction filter → answers can cite retracted work.
- Bookmark holders are not notified when a paper they saved gets retracted.
- A researcher cannot tell preprint vs peer-reviewed vs published from any UI surface.

For the primary persona — **academic researcher (PhD/postdoc)** — these two signals (retracted? peer-reviewed?) are the most-asked questions about any paper. Without them, the platform is not "academic OSINT standard."

This spec adds both signals as proper, surfaced, queryable fields and removes the JSONB shoehorn.

---

## 2. Goals & non-goals

**Goals:**

1. Replace the `vietnam_entities.retraction` shoehorn with proper columns on `papers`.
2. Add a `peer_review_status` enum derived from data already collected (OpenReview, DOI prefixes, source).
3. Make both signals visible everywhere a paper appears (list, detail, search, RAG sources, bookmarks, digest).
4. Filter retracted papers out of RAG retrieval by default.
5. Notify bookmark holders when a saved paper is retracted.
6. Establish the project's first real test suite around this feature (project currently has 0 tests).

**Non-goals:**

- Building a Venue table or normalizing venue strings (planned: separate spec).
- Detecting predatory journals (planned: separate spec, depends on Venue).
- Detecting that a non-retracted paper *cites* a retracted paper (planned: separate spec, depends on real citation graph).
- Auto-classifying errata and expression-of-concern (treated as `unknown` for now).
- Translating retraction data from non-English sources.

---

## 3. Data model

Additions to `papers` table (new Alembic migration):

```python
# Retraction (replaces vietnam_entities.retraction shoehorn)
is_retracted: bool = False                                   # NOT NULL, default false
retracted_at: datetime | None                                # nullable
retraction_reason: str | None                                # text
retraction_source_url: str | None                            # text

# Peer-review signal
peer_review_status: PeerReviewStatus = "unknown"             # Postgres ENUM, NOT NULL, default 'unknown'
peer_review_inferred_from: str | None                        # e.g. "openreview:ICLR2024", "doi:10.1109/...", "arxiv-only"
peer_review_updated_at: datetime | None
```

`PeerReviewStatus` enum values (Postgres native enum):

| Value | Meaning |
|-------|---------|
| `unknown` | Default — inference has not run yet |
| `preprint` | Has arxiv/biorxiv id only; no peer-review evidence |
| `under_review` | Has an open OpenReview note (no decision yet) |
| `peer_reviewed` | OpenReview decision = accept, OR has venue + decision |
| `published` | Has a DOI from a non-preprint publisher |
| `withdrawn` | Author-initiated removal (distinct from forced retraction) |
| `retracted` | Mirrors `is_retracted=True` for query convenience |

**Design decisions:**

- `peer_review_status='retracted'` is kept in **app-level sync** with `is_retracted=True` (no Postgres trigger). Simpler to test, easier to debug. The sync is enforced in exactly **two** code paths: (a) `_collect_retractions` in `workers/tasks/collection.py` and (b) `integrity_backfill_once` in `workers/tasks/integrity_backfill.py`. Any future code that toggles `is_retracted` must do both writes; an integration test in `tests/integrity/test_retraction_match.py` asserts the invariant.
- `withdrawn` ≠ `retracted` (intentional). Withdrawn = author choice. Retracted = forced by integrity issue. Different semantics for the researcher.
- `unknown` is the explicit default. Migration does **not** write `'preprint'` blindly — only the inference job sets a non-`unknown` value, with provenance in `peer_review_inferred_from`.
- Index: `(is_retracted, peer_review_status)` btree, used by list/filter and RAG query.

---

## 4. Components

### Backend

1. **Alembic migration** `add_paper_integrity_fields`
   - Path: `migrations/versions/versions/k5l6m7n8o9p0_add_paper_integrity_fields.py`
   - Creates Postgres ENUM `peer_review_status_enum`
   - Adds 7 columns with safe defaults
   - Adds index on `(is_retracted, peer_review_status)`
   - Reversible: `downgrade()` drops columns + enum

2. **Backfill task** `src/workers/tasks/integrity_backfill.py` (new)
   - Celery task `integrity_backfill_once`, idempotent, runnable on demand
   - Phase A: read each paper's `vietnam_entities`, if it contains `"retraction"`, copy fields to new columns and set `peer_review_status='retracted'`. Leave the JSONB key in place for one release (rollback safety).
   - Phase B: run `infer_peer_review_status` rules over all rows where `peer_review_status='unknown'`.

3. **Retraction collector update** `src/workers/tasks/collection.py`
   - `_collect_retractions` writes to new columns (not `vietnam_entities`)
   - Sets `peer_review_status='retracted'`
   - Queries `bookmarks` joined to user, dispatches one `paper_retracted` notification per affected user (de-duped per user per paper)
   - Keeps `is_relevant=False` for backward feed-hide behavior

4. **Peer-review inference task** `src/workers/tasks/intelligence.py`
   - New Celery task `infer_peer_review_status`
   - Schedule: daily at 03:00 UTC (Beat schedule entry in `celery_app.py`)
   - Targets rows where `peer_review_status='unknown'` OR `peer_review_updated_at < now() - 30d`
   - Inference rules, evaluated in order (first match wins):
     1. `OpenReviewNote` exists with `decision='accept'` → `peer_reviewed`, `inferred_from="openreview:{venue}"`
     2. `OpenReviewNote` exists with no decision yet → `under_review`, `inferred_from="openreview:{venue}"`
     3. `OpenReviewNote` exists with `decision='reject'` → `preprint`, `inferred_from="openreview:{venue}:rejected"`
     4. `paper.doi` is set AND DOI prefix is **not** `10.48550` (arxiv) or `10.1101` (biorxiv) → `published`, `inferred_from="doi:{prefix}"`
     5. `paper.arxiv_id` is set → `preprint`, `inferred_from="arxiv-only"`
     6. else → leave `unknown`
   - On conflict (e.g. DOI says published but OpenReview says reject) → prefer `published`, log warning with both signals

5. **Schema update** `src/api/schemas/paper.py`
   - New `PaperIntegrity` sub-schema with `is_retracted`, `retracted_at`, `retraction_reason`, `retraction_source_url`, `peer_review_status`, `peer_review_inferred_from`
   - `PaperResponse` and `PaperDetailResponse` embed `integrity: PaperIntegrity`

6. **Router update** `src/api/routers/papers.py`
   - `GET /papers`: new query params `exclude_retracted: bool = True` (default), `peer_review_status: str | None = None`
   - `GET /papers/{id}` returns `integrity` block
   - `POST /papers/{id}/integrity/refresh` (admin-only) — re-run inference for one paper, used by frontend "Re-check status" button

7. **RAG retriever update** `src/rag/retriever.py`
   - `HybridRetriever.retrieve(filters: dict)`: if `filters` does not contain key `'is_retracted'`, the retriever **injects** `{'is_retracted': False}`. Caller opts in by explicitly passing `{'is_retracted': None}` (i.e. "do not filter on this field").
   - The chat router exposes this via optional body field `include_retracted: bool = false`. When `true`, router passes `filters={'is_retracted': None}` to the pipeline.
   - Vector search filter passes `must_not is_retracted` to Qdrant payload filter when filtering is active.
   - BM25 path filters in SQL when filtering is active.

8. **RAG reranker update** `src/rag/reranker.py`
   - Score boost: `+0.1 * RERANK_PEER_REVIEW_WEIGHT` for `peer_reviewed`/`published`, `0` for `preprint`/`unknown`/`under_review`/`withdrawn`
   - Retracted: hard-exclude (defense in depth — retriever should already have filtered)
   - Weight is configurable via env var `RERANK_PEER_REVIEW_WEIGHT` (default 1.0; 0.0 disables)

9. **Notification kind** `src/storage/models/notification.py` + delivery
   - Add `paper_retracted` to the type discriminator
   - Payload: `{paper_id, paper_title, retracted_at, reason, source_url}`
   - `NotificationBell.tsx` rendering: red icon, links to paper detail

### Frontend

10. **`components/PaperIntegrityBadge.tsx`** (new, single source of truth)
    - Props: `{status: PeerReviewStatus, isRetracted: boolean, retractionReason?: string, variant: 'badge' | 'banner' | 'inline'}`
    - Variants:
      - `banner` — full-width red banner with reason + source link, used on paper detail
      - `badge` — compact rounded pill, used in lists/cards
      - `inline` — single icon + status text, used in RAG source list
    - Tooltip on hover: explains the status (e.g. "Peer-reviewed via ICLR 2024" / "Preprint — not yet peer-reviewed")
    - Color map: retracted=red, withdrawn=orange, preprint=gray, under_review=yellow, peer_reviewed=green, published=green, unknown=neutral

11. **`papers/[id]/page.tsx` update**
    - At top of hero card: `<PaperIntegrityBadge variant="banner">` if retracted (full-width red, blocking visual)
    - In stats row: `<PaperIntegrityBadge variant="badge">` always
    - Below abstract: small "Integrity" panel with `peer_review_inferred_from` so the researcher sees the provenance ("Peer-reviewed via OpenReview ICLR 2024")

12. **`papers/page.tsx`, `search/page.tsx`, `my-library/page.tsx` updates**
    - Each paper card: `<PaperIntegrityBadge variant="badge">` near title
    - List filter chip "Hide retracted" (default on), one click off

13. **`chat/page.tsx` + RAG source rendering**
    - Each citation card includes `<PaperIntegrityBadge variant="inline">`
    - If a retracted paper somehow appears in sources (e.g. user opted in), card border is red

---

## 5. Data flow

```
[Retraction Watch RSS]
      │
      ▼
collect_retraction_watch (Celery beat, every 6h)
      │
      ├─→ match by paper.doi (case-insensitive, normalized)
      │
      ├─→ UPDATE papers SET is_retracted=true, retracted_at, retraction_reason,
      │                     retraction_source_url, peer_review_status='retracted'
      │
      └─→ for each user in (SELECT DISTINCT user_id FROM bookmarks WHERE item_id = paper.id):
              create Notification(kind='paper_retracted', payload={paper_id, ...})


[Daily 03:00 UTC]
      │
      ▼
infer_peer_review_status
      │
      ├─→ SELECT papers WHERE peer_review_status='unknown'
      │                    OR peer_review_updated_at < now() - 30d
      │
      ├─→ LEFT JOIN openreview_notes ON paper_id
      │
      └─→ apply rule chain → UPDATE peer_review_status,
                                     peer_review_inferred_from,
                                     peer_review_updated_at = now()


[User search / RAG query]
      │
      ▼
HybridRetriever.retrieve(filters={..., 'is_retracted': False})
      │
      ├─→ Qdrant vector search with payload filter (must_not is_retracted)
      ├─→ BM25 SQL with WHERE is_retracted = false
      │
      ▼
CrossEncoderReranker
      │
      └─→ score += RERANK_PEER_REVIEW_WEIGHT * 0.1 if status in (peer_reviewed, published)
      │
      ▼
AnswerGenerator
      │
      └─→ sources[].integrity = {status, is_retracted, ...}
      │
      ▼
ChatSourceCard renders <PaperIntegrityBadge>
```

---

## 6. Error handling

| Failure mode | Behavior |
|--------------|----------|
| Retraction RSS feed unavailable | Log warning, skip cycle. Existing flags untouched. |
| Retraction item has no DOI | Skip (cannot match). Increment counter `retraction_unmatched_no_doi`. |
| Retraction DOI matches no paper in DB | Skip. Increment counter `retraction_unmatched_no_paper`. Acceptable — partial coverage is honest. |
| Backfill task interrupted mid-run | Idempotent: re-run continues from any paper still showing the JSONB key. |
| Inference rule conflict (e.g. DOI=published, OpenReview=reject) | Prefer `published`, log `peer_review_conflict` with both signals to allow human review. |
| RAG filter excludes all retrieved candidates | Generator returns "No relevant non-retracted sources found for your query" instead of switching to fallback general-knowledge mode (avoids hallucinating around retracted work). |
| User has no notification preference enabled | Skip notification silently, don't error. |
| Frontend response missing `integrity` field (old client / cached response) | `PaperIntegrityBadge` renders `null` for unknown payload — page does not break. |
| Migration backfill partially applied | `vietnam_entities.retraction` is **not** removed in this migration; left for one release. Rollback = drop new columns; data still readable from JSONB. |

---

## 7. Migration strategy (4 phases, separate deploys)

**Phase 1A — Schema only**
- Alembic migration adds columns + enum + index with safe defaults
- Deployable independently; old code paths unaffected

**Phase 1B — Backfill**
- Run `integrity_backfill_once` Celery task once
- Migrates existing `vietnam_entities.retraction` data
- Runs initial peer-review inference

**Phase 1C — Code rollout**
- Deploy retraction collector update, RAG filter, schema additions, frontend badge
- Frontend handles missing `integrity` field gracefully so no lockstep deploy needed

**Phase 1D — Cleanup (next release)**
- Separate Alembic migration removes `retraction` key from `vietnam_entities` for all rows
- Only after Phase 1B/C verified

---

## 8. Testing plan (also: project's first real test suite)

Project currently has only `tests/conftest.py` (21 lines), 0 actual tests against 148 API endpoints. This spec doubles as the testing-foundation seed.

### Unit tests (`tests/integrity/`)

- `test_retraction_match.py`
  - DOI matching across case variants, trailing slashes, prefix variants
  - No-DOI item is skipped, not raised
- `test_peer_review_inference.py`
  - Each of the 6 inference rules independently
  - Conflict resolution: DOI=published wins over OpenReview=reject (with warning emitted)
  - Idempotency: running twice produces same output
- `test_rag_retraction_filter.py`
  - Filter excludes retracted papers from Qdrant search
  - Filter excludes retracted from BM25 SQL
  - All-retracted edge case → returns empty + correct fallback message

### Integration tests (`tests/api/integrity/`, httpx + test DB session)

- `GET /papers/{id}` includes `integrity` block with all fields
- `GET /papers?exclude_retracted=true` does not return retracted papers
- `GET /papers?peer_review_status=peer_reviewed` returns only matching
- `POST /chat` with a query that would match a retracted paper → retracted paper does NOT appear in `sources`
- `POST /me/bookmarks` then trigger retraction backfill → `GET /me/notifications` returns one new `paper_retracted`

### Migration test (`tests/migrations/`)

- Fixture: paper with `vietnam_entities={"retraction": {...}}` and no new columns set
- Run `integrity_backfill_once`
- Assert: new columns populated correctly; `peer_review_status='retracted'`; JSONB key still present (Phase 1D not yet run)
- Run again → no changes (idempotent)

### Frontend smoke (`frontend/__tests__/`)

- `PaperIntegrityBadge.test.tsx` — renders correct color + label for each of 7 status values
- `PaperIntegrityBadge.banner.test.tsx` — banner variant shows reason + clickable source URL when retracted

### Test infrastructure to add

- `tests/conftest.py` extended with: async DB session fixture, factory for Paper/Bookmark/User/OpenReviewNote, RAG mock retriever
- `pytest.ini` already wired in `pyproject.toml` (asyncio_mode=auto)
- CI: add `make test` target running `pytest --cov=src --cov-report=term-missing`

---

## 9. Configuration

New environment variables:

| Var | Default | Purpose |
|-----|---------|---------|
| `RERANK_PEER_REVIEW_WEIGHT` | `1.0` | Multiplier on peer-review score boost in reranker; 0.0 disables |
| `INTEGRITY_INFERENCE_STALENESS_DAYS` | `30` | Re-infer status after this many days |
| `RETRACTION_NOTIFICATION_ENABLED` | `true` | Master toggle for paper_retracted notifications |

---

## 10. Open questions / future work

These are deliberately deferred and become future specs:

1. **Venue table & normalization** — needed for predatory journal detection. Many papers have `venue` strings like "ICLR" / "ICLR 2024" / "International Conference on Learning Representations" that need clustering.
2. **Predatory journal detection** — depends on (1) plus a curated list (Beall's list / Cabells signals).
3. **Citation-level integrity** — flag papers that *cite* retracted work. Requires a real `paper_references` table (separate audit finding #1).
4. **Errata / expression-of-concern** — currently lumped into `unknown`. Needs a separate signal channel and probably a separate enum dimension.
5. **Multi-source retraction feeds** — currently only Retraction Watch RSS. Crossref labs CSV mirror would give more coverage.
6. **Self-corrections** — paper version 2 supersedes version 1. ArXiv tracks this in `updated_date` but we don't surface it as an integrity signal.

---

## 11. Decisions & rationale

- **Why a Postgres enum, not a free-form string?** Inference rules write into this column; a typo silently breaks filters. Enum + Pydantic validation catches early.
- **Why `unknown` as default rather than `preprint`?** Migration without inference is honest about not knowing. Setting `preprint` blindly would be a lie for any paper that's actually peer-reviewed but hasn't been inferred yet.
- **Why is `retracted` both a boolean and an enum value?** Two different query needs: `WHERE is_retracted=true` is the hot filter (used by RAG, lists, search) and benefits from a dedicated boolean + index. The enum value lets us write `WHERE peer_review_status IN (...)` for full-status queries.
- **Why hard-exclude retracted from RAG instead of including-with-warning?** A retracted paper is data the research community has formally repudiated. Including it weighted-down still risks the LLM citing it. Researchers can opt in explicitly via `include_retracted=true` on a per-query basis.
- **Why not a Postgres trigger to sync `is_retracted` ↔ `peer_review_status='retracted'`?** Triggers are invisible during testing and debugging. App-level sync in 2-3 specific code paths is easier to reason about for a project that's about to add its first tests.

---

## 12. Acceptance criteria

The spec is delivered when:

- [ ] All 7 columns exist on `papers` with the documented defaults
- [ ] `vietnam_entities.retraction` data is fully migrated (verified by zero JSONB-only retractions in audit query)
- [ ] `_collect_retractions` writes to new columns; no new writes go to `vietnam_entities.retraction`
- [ ] Daily inference job has run at least once and populated `peer_review_status` for all rows
- [ ] `GET /papers/{id}` returns `integrity` block
- [ ] `GET /papers?exclude_retracted=true` is the default behavior
- [ ] RAG `/chat` does not surface retracted papers in `sources`
- [ ] Bookmark holders receive `paper_retracted` notification within 5 minutes of flag
- [ ] Paper detail page shows red banner on retracted papers
- [ ] All paper cards (lists, search, library) show integrity badge
- [ ] All RAG source citations show inline integrity indicator
- [ ] Test suite (per Section 8) is green in CI
