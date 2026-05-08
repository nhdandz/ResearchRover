"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Search, Plus, Trash2, Play, BellRing, BellOff,
  Loader2, RefreshCw, ToggleLeft, ToggleRight,
  CheckCircle2, AlertCircle, Calendar, ArrowRight,
  ChevronDown, Pencil, X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/components/AuthProvider";
import {
  fetchSavedSearches,
  createSavedSearch,
  updateSavedSearch,
  deleteSavedSearch,
  runSavedSearch,
  markSavedSearchViewed,
} from "@/lib/api";
import Link from "next/link";

interface SavedSearch {
  id: string;
  name: string;
  query: string;
  search_type: string;
  filters: Record<string, any> | null;
  notify_new_results: boolean;
  frequency: string;
  last_run_at: string | null;
  last_result_count: number;
  new_results_since_last_view: number;
  is_active: boolean;
  created_at: string;
}

// ── Create / Edit Modal ──
function SearchModal({
  initial,
  onSave,
  onClose,
}: {
  initial?: SavedSearch | null;
  onSave: (data: any) => Promise<void>;
  onClose: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [query, setQuery] = useState(initial?.query ?? "");
  const [searchType, setSearchType] = useState(initial?.search_type ?? "semantic");
  const [notify, setNotify] = useState(initial?.notify_new_results ?? true);
  const [frequency, setFrequency] = useState(initial?.frequency ?? "daily");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !query.trim()) {
      setErr("Name and query are required.");
      return;
    }
    setSaving(true);
    setErr("");
    try {
      await onSave({ name: name.trim(), query: query.trim(), search_type: searchType, notify_new_results: notify, frequency });
      onClose();
    } catch {
      setErr("Failed to save. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-xl">
        <div className="flex items-center justify-between">
          <h3 className="text-[15px] font-semibold tracking-tight text-foreground">
            {initial ? "Edit Saved Search" : "Save New Search"}
          </h3>
          <button onClick={onClose} className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted">
            <X size={16} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-5 space-y-4">
          {/* Name */}
          <div>
            <label className="mb-1.5 block text-[12px] font-medium text-muted-foreground">
              Label <span className="text-destructive">*</span>
            </label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. RAG Vietnamese NLP"
              className="w-full rounded-xl border border-border bg-background px-3 py-2 text-[13px] text-foreground placeholder:text-muted-foreground/50 outline-none focus:border-primary/40 focus:ring-2 focus:ring-primary/10"
            />
          </div>

          {/* Query */}
          <div>
            <label className="mb-1.5 block text-[12px] font-medium text-muted-foreground">
              Search Query <span className="text-destructive">*</span>
            </label>
            <textarea
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="retrieval augmented generation multilingual"
              rows={2}
              className="w-full rounded-xl border border-border bg-background px-3 py-2 text-[13px] text-foreground placeholder:text-muted-foreground/50 outline-none focus:border-primary/40 focus:ring-2 focus:ring-primary/10 resize-none"
            />
          </div>

          {/* Search type */}
          <div>
            <label className="mb-1.5 block text-[12px] font-medium text-muted-foreground">
              Search Type
            </label>
            <div className="flex gap-2">
              {[
                { value: "semantic", label: "Semantic" },
                { value: "keyword", label: "Keyword" },
              ].map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setSearchType(opt.value)}
                  className={cn(
                    "flex-1 rounded-xl py-2 text-[12px] font-medium transition-all duration-150",
                    searchType === opt.value
                      ? "bg-primary/12 text-primary ring-1 ring-primary/20"
                      : "bg-muted text-muted-foreground hover:bg-muted/80"
                  )}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Notifications */}
          <div className="flex items-center justify-between rounded-xl border border-border bg-muted/30 px-4 py-3">
            <div>
              <p className="text-[13px] font-medium text-foreground">Notify new results</p>
              <p className="text-[11px] text-muted-foreground">Alert when new items match this search</p>
            </div>
            <button
              type="button"
              onClick={() => setNotify((v) => !v)}
              className={cn(
                "transition-colors duration-150",
                notify ? "text-primary" : "text-muted-foreground"
              )}
            >
              {notify ? <ToggleRight size={28} /> : <ToggleLeft size={28} />}
            </button>
          </div>

          {/* Frequency (shown only when notify = true) */}
          {notify && (
            <div>
              <label className="mb-1.5 block text-[12px] font-medium text-muted-foreground">
                Check Frequency
              </label>
              <div className="flex gap-2">
                {[
                  { value: "daily", label: "Daily" },
                  { value: "weekly", label: "Weekly" },
                ].map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setFrequency(opt.value)}
                    className={cn(
                      "flex-1 rounded-xl py-2 text-[12px] font-medium transition-all duration-150",
                      frequency === opt.value
                        ? "bg-primary/12 text-primary ring-1 ring-primary/20"
                        : "bg-muted text-muted-foreground hover:bg-muted/80"
                    )}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {err && (
            <div className="flex items-center gap-2 rounded-xl bg-destructive/10 px-3 py-2 text-[12px] text-destructive">
              <AlertCircle size={13} /> {err}
            </div>
          )}

          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-xl border border-border py-2.5 text-[13px] font-medium text-muted-foreground hover:bg-muted transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex-1 flex items-center justify-center gap-2 rounded-xl bg-primary py-2.5 text-[13px] font-medium text-primary-foreground hover:opacity-90 transition-opacity disabled:opacity-60"
            >
              {saving && <Loader2 size={13} className="animate-spin" />}
              {initial ? "Save Changes" : "Save Search"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Search Card ──
function SearchCard({
  item,
  onEdit,
  onDelete,
  onRun,
  onToggleActive,
  onToggleNotify,
}: {
  item: SavedSearch;
  onEdit: () => void;
  onDelete: () => void;
  onRun: () => Promise<{ results?: any[]; new_results?: number; result_count?: number } | void>;
  onToggleActive: () => void;
  onToggleNotify: () => void;
}) {
  const [running, setRunning] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [results, setResults] = useState<any[] | null>(null);

  const handleRun = async (event?: React.MouseEvent) => {
    event?.stopPropagation();
    setRunning(true);
    try {
      const r: any = await onRun();
      if (r?.results) {
        setResults(r.results);
        setExpanded(true);
      }
    } finally {
      setRunning(false);
    }
  };

  const handleToggleExpand = async () => {
    if (!expanded && !results) {
      // Lazy load on first expand
      await handleRun();
    } else {
      setExpanded(!expanded);
    }
  };

  const handleDelete = async () => {
    if (!confirm(`Delete saved search "${item.name}"?`)) return;
    setDeleting(true);
    await onDelete();
  };

  const formatDate = (iso: string | null) => {
    if (!iso) return "Never";
    return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
  };

  return (
    <div className={cn(
      "group rounded-2xl border bg-card shadow-soft transition-all duration-200 dark:shadow-soft-dark",
      item.is_active ? "border-border hover:border-primary/20 hover:shadow-soft-lg" : "border-border/50 opacity-70"
    )}>
      <div
        className="flex items-start gap-3 p-5 cursor-pointer"
        onClick={handleToggleExpand}
        role="button"
      >
        {/* Icon */}
        <div className={cn(
          "mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl",
          item.search_type === "semantic" ? "bg-violet-500/10" : "bg-blue-500/10"
        )}>
          <Search size={15} className={item.search_type === "semantic" ? "text-violet-500" : "text-blue-500"} />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[14px] font-semibold tracking-tight text-foreground">{item.name}</span>
            {item.new_results_since_last_view > 0 && (
              <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[11px] font-semibold text-primary">
                +{item.new_results_since_last_view} new
              </span>
            )}
            <span className={cn(
              "rounded-full px-2 py-0.5 text-[10px] font-medium",
              item.search_type === "semantic" ? "bg-violet-500/10 text-violet-500" : "bg-blue-500/10 text-blue-500"
            )}>
              {item.search_type}
            </span>
            {!item.is_active && (
              <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                paused
              </span>
            )}
          </div>

          <p className="mt-1 text-[12px] text-muted-foreground line-clamp-1 italic">
            "{item.query}"
          </p>

          <div className="mt-3 flex flex-wrap items-center gap-4 text-[11px] text-muted-foreground">
            <span className="flex items-center gap-1">
              <Calendar size={11} />
              Last run: {formatDate(item.last_run_at)}
            </span>
            {item.last_result_count > 0 && (
              <span>{item.last_result_count} results</span>
            )}
            <span className="flex items-center gap-1">
              {item.notify_new_results ? (
                <><BellRing size={11} className="text-primary" /> {item.frequency}</>
              ) : (
                <><BellOff size={11} /> silent</>
              )}
            </span>
          </div>
        </div>

        {/* Actions */}
        <div className="flex shrink-0 items-center gap-1">
          <button
            onClick={handleRun}
            disabled={running}
            title="Run now"
            className="flex h-8 w-8 items-center justify-center rounded-xl text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          >
            {running ? <Loader2 size={13} className="animate-spin" /> : <Play size={13} />}
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onEdit(); }}
            title="Edit"
            className="flex h-8 w-8 items-center justify-center rounded-xl text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          >
            <Pencil size={13} />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onToggleActive(); }}
            title={item.is_active ? "Pause" : "Resume"}
            className="flex h-8 w-8 items-center justify-center rounded-xl text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          >
            {item.is_active ? <ToggleRight size={15} className="text-primary" /> : <ToggleLeft size={15} />}
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); handleDelete(); }}
            disabled={deleting}
            title="Delete"
            className="flex h-8 w-8 items-center justify-center rounded-xl text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors"
          >
            {deleting ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
          </button>
          <ChevronDown
            size={16}
            className={cn(
              "ml-1 text-muted-foreground transition-transform duration-200",
              expanded && "rotate-180"
            )}
          />
        </div>
      </div>

      {/* New results banner */}
      {item.new_results_since_last_view > 0 && !expanded && (
        <Link
          href={`/search?q=${encodeURIComponent(item.query)}&type=all`}
          onClick={(e) => e.stopPropagation()}
          className="mx-5 mb-5 flex items-center justify-between rounded-xl border border-primary/20 bg-primary/5 px-4 py-2.5 text-[12px] font-medium text-primary hover:bg-primary/10 transition-colors"
        >
          <span>View {item.new_results_since_last_view} new results</span>
          <ArrowRight size={13} />
        </Link>
      )}

      {/* Expanded inline results */}
      {expanded && (
        <div className="border-t border-border bg-muted/20 p-5">
          {running ? (
            <div className="flex items-center justify-center gap-2 py-6 text-[12px] text-muted-foreground">
              <Loader2 size={13} className="animate-spin" />
              Running search…
            </div>
          ) : results && results.length > 0 ? (
            <>
              <div className="mb-3 flex items-center justify-between">
                <p className="text-[12px] font-semibold text-foreground">
                  Top {results.length} results
                </p>
                <Link
                  href={`/search?q=${encodeURIComponent(item.query)}&type=all`}
                  onClick={(e) => e.stopPropagation()}
                  className="flex items-center gap-1 text-[11px] font-medium text-primary hover:underline"
                >
                  View all on Search page
                  <ArrowRight size={11} />
                </Link>
              </div>
              <ul className="space-y-1.5">
                {results.slice(0, 10).map((r: any) => (
                  <li key={r.id}>
                    <Link
                      href={
                        r.type === "paper"
                          ? `/papers/${r.id}`
                          : r.type === "repository" || r.type === "repo"
                          ? `/repos/${r.id}`
                          : r.url || "#"
                      }
                      onClick={(e) => e.stopPropagation()}
                      className="flex items-start justify-between gap-3 rounded-lg border border-border/40 bg-background px-3 py-2 hover:border-primary/40 hover:bg-card transition-colors group/result"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="text-[12.5px] font-medium leading-snug text-foreground line-clamp-2 group-hover/result:text-primary">
                          {r.title || "(untitled)"}
                        </p>
                        <div className="mt-1 flex items-center gap-2 text-[10px] text-muted-foreground">
                          <span className="rounded bg-muted px-1.5 py-0.5 uppercase font-medium tracking-wide">
                            {r.type}
                          </span>
                          {typeof r.score === "number" && (
                            <span>match: {(r.score * 100).toFixed(0)}%</span>
                          )}
                        </div>
                      </div>
                      <ArrowRight size={12} className="mt-1 shrink-0 text-muted-foreground group-hover/result:text-primary" />
                    </Link>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <div className="py-6 text-center text-[12px] text-muted-foreground">
              No results yet — click <Play size={11} className="inline mx-1" /> to run.
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main Page ──
export default function SavedSearchesPage() {
  const { user } = useAuth();
  const router = useRouter();

  const [searches, setSearches] = useState<SavedSearch[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editTarget, setEditTarget] = useState<SavedSearch | null>(null);
  const [filter, setFilter] = useState<"all" | "active" | "paused">("all");
  const [runResult, setRunResult] = useState<{ id: string; count: number } | null>(null);

  useEffect(() => {
    if (user && !user.onboarding_completed) {
      router.push("/onboarding");
      return;
    }
    loadSearches();
  }, [user]);

  const loadSearches = async () => {
    setLoading(true);
    try {
      const data = await fetchSavedSearches();
      setSearches(data.items ?? data ?? []);
    } catch {
      setSearches([]);
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async (body: any) => {
    const created = await createSavedSearch(body);
    setSearches((prev) => [created, ...prev]);
  };

  const handleUpdate = async (id: string, body: any) => {
    const updated = await updateSavedSearch(id, body);
    setSearches((prev) => prev.map((s) => (s.id === id ? updated : s)));
  };

  const handleDelete = async (id: string) => {
    await deleteSavedSearch(id);
    setSearches((prev) => prev.filter((s) => s.id !== id));
  };

  const handleRun = async (id: string) => {
    try {
      const result = await runSavedSearch(id);
      setRunResult({ id, count: result.new_results ?? result.result_count ?? 0 });
      // Mark as viewed (reset new_results counter)
      try { await markSavedSearchViewed(id); } catch {}
      await loadSearches();
      setTimeout(() => setRunResult(null), 4000);
      return result;
    } catch {
      return null;
    }
  };

  const handleToggleActive = async (item: SavedSearch) => {
    await handleUpdate(item.id, { is_active: !item.is_active });
  };

  const handleToggleNotify = async (item: SavedSearch) => {
    await handleUpdate(item.id, { notify_new_results: !item.notify_new_results });
  };

  const filtered = searches.filter((s) => {
    if (filter === "active") return s.is_active;
    if (filter === "paused") return !s.is_active;
    return true;
  });

  const totalNew = searches.reduce((acc, s) => acc + s.new_results_since_last_view, 0);

  return (
    <div className="space-y-8">
      {/* Controls bar */}
      <div className="flex items-center justify-between gap-4">
        <p className="text-[13px] text-muted-foreground">
          Searches that run automatically and notify you of new results
        </p>
        <button
          onClick={() => { setEditTarget(null); setShowModal(true); }}
          className="flex shrink-0 items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-[13px] font-medium text-primary-foreground hover:opacity-90 transition-opacity"
        >
          <Plus size={15} />
          New Search
        </button>
      </div>

      {/* Summary banner */}
      {totalNew > 0 && (
        <div className="flex items-center gap-3 rounded-2xl border border-primary/20 bg-primary/5 px-5 py-4">
          <CheckCircle2 size={18} className="shrink-0 text-primary" />
          <div>
            <p className="text-[13px] font-semibold text-foreground">
              {totalNew} new results across your saved searches
            </p>
            <p className="text-[12px] text-muted-foreground">Click a search to view the latest matches</p>
          </div>
        </div>
      )}

      {/* Run result toast */}
      {runResult && (
        <div className="flex items-center gap-3 rounded-2xl border border-emerald-500/20 bg-emerald-500/10 px-5 py-4">
          <RefreshCw size={15} className="text-emerald-500" />
          <p className="text-[13px] font-medium text-foreground">
            Search completed — {runResult.count} new result{runResult.count !== 1 ? "s" : ""} found
          </p>
        </div>
      )}

      {/* Filter pills */}
      <div className="flex items-center gap-2">
        {(["all", "active", "paused"] as const).map((f) => {
          const count = f === "all" ? searches.length : f === "active" ? searches.filter((s) => s.is_active).length : searches.filter((s) => !s.is_active).length;
          return (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={cn(
                "rounded-xl px-3 py-1.5 text-[12px] font-medium transition-all duration-150 capitalize",
                filter === f
                  ? "bg-primary/12 text-primary ring-1 ring-primary/20"
                  : "bg-muted text-muted-foreground hover:bg-muted/80 hover:text-foreground"
              )}
            >
              {f} ({count})
            </button>
          );
        })}
      </div>

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-16">
          <Loader2 size={24} className="animate-spin text-muted-foreground" />
        </div>
      )}

      {/* Empty state */}
      {!loading && filtered.length === 0 && (
        <div className="py-16 text-center">
          <Search size={40} className="mx-auto text-muted-foreground/20" />
          <p className="mt-4 text-[15px] font-medium text-foreground">
            {filter === "all" ? "No saved searches yet" : `No ${filter} searches`}
          </p>
          <p className="mt-1 text-[13px] text-muted-foreground">
            {filter === "all"
              ? "Save a search to track new papers and repos automatically"
              : "Change the filter to see other searches"}
          </p>
          {filter === "all" && (
            <button
              onClick={() => { setEditTarget(null); setShowModal(true); }}
              className="mt-6 inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-[13px] font-medium text-primary-foreground hover:opacity-90 transition-opacity"
            >
              <Plus size={15} /> Save your first search
            </button>
          )}
        </div>
      )}

      {/* List */}
      {!loading && filtered.length > 0 && (
        <div className="space-y-3">
          {filtered.map((item) => (
            <SearchCard
              key={item.id}
              item={item}
              onEdit={() => { setEditTarget(item); setShowModal(true); }}
              onDelete={() => handleDelete(item.id)}
              onRun={() => handleRun(item.id)}
              onToggleActive={() => handleToggleActive(item)}
              onToggleNotify={() => handleToggleNotify(item)}
            />
          ))}
        </div>
      )}

      {/* Modals */}
      {showModal && !editTarget && (
        <SearchModal
          onSave={handleCreate}
          onClose={() => setShowModal(false)}
        />
      )}
      {showModal && editTarget && (
        <SearchModal
          initial={editTarget}
          onSave={(body) => handleUpdate(editTarget.id, body)}
          onClose={() => { setShowModal(false); setEditTarget(null); }}
        />
      )}
    </div>
  );
}
