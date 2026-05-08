#!/usr/bin/env bash
# test_osint_features.sh — smoke-test toàn bộ chức năng OSINT mới
# Usage:  bash scripts/test_osint_features.sh
set -e

API="http://localhost:8000"
EMAIL="osint_demo_$(date +%s)@example.com"
PASS="testpass123"
USERNAME="${EMAIL%%@*}"

echo "════════════════════════════════════════════════"
echo "  RRI OSINT Features — Smoke Test"
echo "════════════════════════════════════════════════"

# ── 1. Health ──
echo
echo "[1] Backend health"
curl -s "$API/health"
echo

# ── 2. Register + login ──
echo
echo "[2] Register & login as $EMAIL"
curl -s -X POST "$API/auth/register" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$EMAIL\",\"username\":\"$USERNAME\",\"password\":\"$PASS\"}" > /dev/null

TOKEN=$(curl -s -X POST "$API/auth/login" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PASS\"}" | python3 -c "import sys,json; print(json.load(sys.stdin)['access_token'])")

if [ -z "$TOKEN" ]; then
  echo "  ✗ Login failed"; exit 1
fi
echo "  ✓ Token acquired"
H="Authorization: Bearer $TOKEN"

# ── 3. Set research interests + onboarding ──
echo
echo "[3] Set research profile (NLP + ML)"
curl -s -X PATCH "$API/auth/me/profile" -H "$H" -H "Content-Type: application/json" -d '{
  "research_interests": ["Natural Language Processing", "Machine Learning", "Deep Learning"],
  "expertise_level": "phd",
  "affiliation": "Test University",
  "position": "PhD Student",
  "bio": "Researching RAG and LLMs",
  "onboarding_completed": true
}' | python3 -c "import sys,json; d=json.load(sys.stdin); print('  ✓ interests=', d.get('research_interests'))"

# ── 4. Notification preferences ──
echo
echo "[4] Notification preferences"
curl -s "$API/me/notifications/preferences" -H "$H" | python3 -m json.tool

# ── 5. Test notification ──
echo
echo "[5] Send test notification"
curl -s -X POST "$API/me/notifications/test" -H "$H" | python3 -m json.tool

echo
echo "[5b] Check unread count"
curl -s "$API/me/notifications/unread-count" -H "$H" | python3 -m json.tool

# ── 6. Create alerts ──
echo
echo "[6] Create 2 user_alerts"
curl -s -X POST "$API/me/alerts" -H "$H" -H "Content-Type: application/json" -d '{
  "alert_type": "keyword",
  "label": "RAG papers",
  "config": {"query": "retrieval augmented generation", "min_relevance": 0.5},
  "channel": "in_app",
  "frequency": "instant"
}' > /dev/null && echo "  ✓ keyword alert: RAG"

curl -s -X POST "$API/me/alerts" -H "$H" -H "Content-Type: application/json" -d '{
  "alert_type": "keyword",
  "label": "LLM agents",
  "config": {"query": "LLM agents tool use", "min_relevance": 0.5},
  "channel": "in_app",
  "frequency": "instant"
}' > /dev/null && echo "  ✓ keyword alert: LLM agents"

ALERT_COUNT=$(curl -s "$API/me/alerts" -H "$H" | python3 -c "import sys,json; print(len(json.load(sys.stdin)))")
echo "  Total alerts: $ALERT_COUNT"

# ── 7. Trigger evaluate alerts task ──
echo
echo "[7] Trigger evaluate_user_alerts"
docker exec rri-worker-1 python -c "
from src.workers.tasks.notifications import evaluate_all_user_alerts
result = evaluate_all_user_alerts.apply_async(queue='reporting')
print(f'  Task ID: {result.id}')
"

# ── 8. Wait + check notifications ──
echo
echo "[8] Đợi 20s rồi check notifications…"
sleep 20
curl -s "$API/me/notifications?limit=5" -H "$H" | python3 -c "
import sys, json
d = json.load(sys.stdin)
print(f'  unread={d[\"unread_count\"]}, total={d[\"total_count\"]}')
for n in d['items'][:3]:
    print(f'  • [{n[\"notification_type\"]}] {n[\"title\"][:80]}')"

# ── 9. Trigger intelligence tasks ──
echo
echo "[9] Trigger 3 intelligence tasks"
docker exec rri-worker-1 python -c "
from src.workers.tasks.intelligence import (
    build_author_profiles, compute_paper_signals, update_concept_trends,
)
for t in [build_author_profiles, compute_paper_signals, update_concept_trends]:
    r = t.apply_async(queue='processing')
    print(f'  ✓ {t.name}: {r.id}')
"

# ── 10. Test data endpoints (current state) ──
echo
echo "[10] Current intelligence data:"
curl -s "$API/intelligence/buzz?period=week&limit=3" | python3 -c "
import sys, json
d = json.load(sys.stdin)
print(f'  buzz papers: {len(d[\"items\"])}')"

curl -s "$API/intelligence/concepts/trending?limit=3" | python3 -c "
import sys, json
d = json.load(sys.stdin)
print(f'  trending concepts: {len(d[\"items\"])}')"

curl -s "$API/authors?limit=3" | python3 -c "
import sys, json
d = json.load(sys.stdin)
print(f'  authors: {d[\"total\"]} total')"

# ── 11. KG ──
echo
echo "[11] Knowledge Graph (top cited papers seed)"
curl -s "$API/intelligence/knowledge-graph?max_nodes=20" | python3 -c "
import sys, json
d = json.load(sys.stdin)
print(f'  nodes: {len(d[\"nodes\"])}, links: {len(d[\"links\"])}')
for n in d['nodes'][:5]:
    print(f'  • {n[\"type\"]}: {n[\"label\"][:60]}')"

# ── 12. Reading queue + lit gaps ──
echo
echo "[12] Reading queue (empty trừ khi user có bookmark 'saved')"
curl -s "$API/me/assistant/reading-queue" -H "$H" | python3 -m json.tool

echo
echo "[13] Literature gaps cho NLP/ML/DL"
curl -s "$API/me/assistant/literature-gaps" -H "$H" | python3 -c "
import sys, json
d = json.load(sys.stdin)
print(f'  gaps found: {len(d[\"items\"])}')
for g in d['items'][:5]:
    print(f'  • {g[\"category\"]}: {g[\"recent_papers_count\"]} papers, gap_score={g[\"gap_score\"]:.2f}')
    print(f'    → {g[\"rationale\"]}')"

echo
echo "════════════════════════════════════════════════"
echo "  Test user: $EMAIL"
echo "  Token: ${TOKEN:0:40}..."
echo "════════════════════════════════════════════════"
echo
echo "→ Mở browser: http://localhost:3000"
echo "→ Login với $EMAIL / $PASS"
echo "→ Click bell icon ở TopNav để xem notifications"
echo "→ Vào /intelligence/buzz, /intelligence/concepts, /authors, /me/reading-queue"
echo
echo "Note: Intelligence data (buzz/authors/concepts) cần worker chạy xong."
echo "Tasks đã queue. Check lại sau 5-10 phút (hoặc khi worker rảnh tay)."
