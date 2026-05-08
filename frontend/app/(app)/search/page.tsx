"use client";

import { useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  Search as SearchIcon,
  FileText,
  GitBranch,
  Star,
  GitFork,
  ExternalLink,
  Bookmark,
  Check,
  X,
  Loader2,
} from "lucide-react";
import { search, createSavedSearch } from "@/lib/api";
import { formatNumber } from "@/lib/utils";
import { useAuth } from "@/components/AuthProvider";

type SearchType = "all" | "paper" | "repository";

// ── Save Search Modal ──
function SaveSearchModal({
  query,
  searchType,
  onClose,
}: {
  query: string;
  searchType: SearchType;
  onClose: () => void;
}) {
  const [name, setName] = useState(query.slice(0, 50));
  const [notify, setNotify] = useState(true);
  const [frequency, setFrequency] = useState("daily");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [err, setErr] = useState("");

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) { setErr("Name is required."); return; }
    setSaving(true);
    setErr("");
    try {
      await createSavedSearch({
        name: name.trim(),
        query,
        search_type: searchType === "all" ? "semantic" : searchType === "paper" ? "semantic" : "semantic",
        notify_new_results: notify,
        frequency,
      });
      setSaved(true);
      setTimeout(onClose, 1200);
    } catch {
      setErr("Failed to save. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-6 shadow-xl">
        <div className="flex items-center justify-between">
          <h3 className="text-[15px] font-semibold tracking-tight text-foreground">Save this Search</h3>
          <button onClick={onClose} className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted">
            <X size={15} />
          </button>
        </div>

        {saved ? (
          <div className="mt-6 flex flex-col items-center gap-3 py-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/15">
              <Check size={22} className="text-emerald-500" />
            </div>
            <p className="text-[14px] font-medium text-foreground">Search saved!</p>
            <p className="text-[12px] text-muted-foreground text-center">
              Go to <Link href="/settings/searches" className="text-primary underline">Saved Searches</Link> to manage it.
            </p>
          </div>
        ) : (
          <form onSubmit={handleSave} className="mt-5 space-y-4">
            <div>
              <label className="mb-1.5 block text-[12px] font-medium text-muted-foreground">Label</label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full rounded-xl border border-border bg-background px-3 py-2 text-[13px] text-foreground placeholder:text-muted-foreground/50 outline-none focus:border-primary/40 focus:ring-2 focus:ring-primary/10"
              />
            </div>
            <div className="rounded-xl border border-border bg-muted/30 px-3 py-2.5">
              <p className="text-[11px] text-muted-foreground">Query</p>
              <p className="mt-0.5 text-[13px] font-medium text-foreground truncate">"{query}"</p>
            </div>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[12px] font-medium text-foreground">Notify new results</p>
                <p className="text-[11px] text-muted-foreground">Daily or weekly</p>
              </div>
              <button
                type="button"
                onClick={() => setNotify((v) => !v)}
                className={`text-[13px] font-medium transition-colors ${notify ? "text-primary" : "text-muted-foreground"}`}
              >
                {notify ? "ON" : "OFF"}
              </button>
            </div>
            {notify && (
              <div className="flex gap-2">
                {["daily", "weekly"].map((f) => (
                  <button
                    key={f}
                    type="button"
                    onClick={() => setFrequency(f)}
                    className={`flex-1 rounded-xl py-2 text-[12px] font-medium capitalize transition-all ${
                      frequency === f
                        ? "bg-primary/12 text-primary ring-1 ring-primary/20"
                        : "bg-muted text-muted-foreground hover:bg-muted/80"
                    }`}
                  >
                    {f}
                  </button>
                ))}
              </div>
            )}
            {err && <p className="text-[12px] text-destructive">{err}</p>}
            <div className="flex gap-2 pt-1">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 rounded-xl border border-border py-2.5 text-[12px] font-medium text-muted-foreground hover:bg-muted transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="flex-1 flex items-center justify-center gap-1.5 rounded-xl bg-primary py-2.5 text-[12px] font-medium text-primary-foreground hover:opacity-90 transition-opacity disabled:opacity-60"
              >
                {saving && <Loader2 size={12} className="animate-spin" />}
                Save
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

function SearchContent() {
  const searchParams = useSearchParams();
  const urlQuery = searchParams.get("q") || "";
  const urlType = (searchParams.get("type") as SearchType) || "all";
  const { user } = useAuth();

  const [query, setQuery] = useState(urlQuery);
  const [type, setType] = useState<SearchType>(urlType);
  const [results, setResults] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [showSaveModal, setShowSaveModal] = useState(false);

  const doSearch = (q: string, t: SearchType) => {
    if (!q.trim()) return;
    setLoading(true);
    setSearched(true);
    search(q, t === "all" ? undefined : t)
      .then((data) => {
        setResults(data.results || []);
        setTotal(data.total || 0);
      })
      .catch(() => {
        setResults([]);
        setTotal(0);
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    if (urlQuery) {
      setQuery(urlQuery);
      doSearch(urlQuery, urlType);
    }
  }, [urlQuery, urlType]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    doSearch(query, type);
    window.history.replaceState(
      null,
      "",
      `/search?q=${encodeURIComponent(query)}${type !== "all" ? `&type=${type}` : ""}`
    );
  };

  const paperResults = results.filter((r) => r.type === "paper");
  const repoResults = results.filter((r) => r.type === "repository" || r.type === "repo");

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-semibold tracking-tighter text-foreground">
          Search
        </h1>
        <p className="mt-2 text-[15px] text-muted-foreground">
          Search across papers and repositories
        </p>
      </div>

      {/* Search box */}
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="flex items-center gap-3 rounded-2xl border border-border bg-card p-2 shadow-soft transition-all focus-within:border-primary/40 focus-within:ring-2 focus-within:ring-primary/10 dark:shadow-soft-dark">
          <SearchIcon size={18} className="ml-3 shrink-0 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search papers, repositories, topics..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="flex-1 bg-transparent py-2 text-[15px] text-foreground placeholder:text-muted-foreground/50 outline-none"
            autoFocus
          />
          {/* Save Search button — shown when there's a query and user is logged in */}
          {searched && query.trim() && user && (
            <button
              type="button"
              onClick={() => setShowSaveModal(true)}
              title="Save this search"
              className="flex items-center gap-1.5 rounded-xl border border-border px-3 py-2.5 text-[12px] font-medium text-muted-foreground hover:border-primary/30 hover:bg-primary/5 hover:text-primary transition-all duration-150"
            >
              <Bookmark size={13} />
              Save
            </button>
          )}
          <button
            type="submit"
            className="rounded-xl bg-primary px-5 py-2.5 text-[13px] font-medium text-primary-foreground transition-all duration-150 hover:opacity-90"
          >
            Search
          </button>
        </div>

        {/* Type filter */}
        <div className="flex items-center gap-2">
          {(
            [
              { value: "all", label: "All", icon: SearchIcon },
              { value: "paper", label: "Papers", icon: FileText },
              { value: "repository", label: "Repos", icon: GitBranch },
            ] as const
          ).map(({ value, label, icon: Icon }) => (
            <button
              key={value}
              type="button"
              onClick={() => {
                setType(value);
                if (searched) doSearch(query, value);
              }}
              className={`flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-[12px] font-medium transition-all duration-150 ${
                type === value
                  ? "bg-primary/12 text-primary ring-1 ring-primary/20"
                  : "bg-muted text-muted-foreground hover:bg-muted/80 hover:text-foreground"
              }`}
            >
              <Icon size={13} />
              {label}
            </button>
          ))}
        </div>
      </form>

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-16">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-muted border-t-primary" />
        </div>
      )}

      {/* No results */}
      {searched && !loading && results.length === 0 && (
        <div className="py-16 text-center">
          <SearchIcon size={40} className="mx-auto text-muted-foreground/30" />
          <p className="mt-4 text-[15px] font-medium text-foreground">No results found</p>
          <p className="mt-1 text-[13px] text-muted-foreground">
            Try different keywords or broaden your search
          </p>
        </div>
      )}

      {/* Results */}
      {!loading && results.length > 0 && (
        <div className="space-y-8">
          <p className="text-[13px] text-muted-foreground">
            {formatNumber(total)} results found
          </p>

          {/* Papers */}
          {(type === "all" || type === "paper") && paperResults.length > 0 && (
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <FileText size={16} className="text-primary" />
                <h2 className="text-[15px] font-semibold tracking-tight text-foreground">
                  Papers
                </h2>
                <span className="rounded-xl bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                  {paperResults.length}
                </span>
              </div>
              <div className="space-y-2">
                {paperResults.map((result: any) => (
                  <Link
                    key={result.id}
                    href={`/papers/${result.id}`}
                    className="group block rounded-2xl border border-border bg-card p-5 shadow-soft transition-all duration-200 hover:shadow-soft-lg hover:border-primary/20 dark:shadow-soft-dark"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0 flex-1">
                        <h3 className="text-[14px] font-semibold tracking-tight text-foreground group-hover:text-primary transition-colors duration-150 line-clamp-2">
                          {result.title}
                        </h3>
                        {result.description && (
                          <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground line-clamp-2">
                            {result.description}
                          </p>
                        )}
                        <div className="mt-3 flex items-center gap-3 text-[11px] text-muted-foreground">
                          {result.metadata?.categories?.length > 0 && (
                            <span className="rounded-lg bg-muted px-2 py-0.5 font-medium">
                              {result.metadata.categories[0]}
                            </span>
                          )}
                          {result.metadata?.citation_count > 0 && (
                            <span className="font-medium text-amber-500 dark:text-amber-400">
                              {result.metadata.citation_count} citations
                            </span>
                          )}
                          <span className="text-muted-foreground/60">
                            Score: {(result.score * 100).toFixed(0)}%
                          </span>
                        </div>
                      </div>
                      <ExternalLink
                        size={13}
                        className="mt-1 shrink-0 text-muted-foreground/40 group-hover:text-primary transition-colors"
                      />
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          )}

          {/* Repos */}
          {(type === "all" || type === "repository") && repoResults.length > 0 && (
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <GitBranch size={16} className="text-[hsl(var(--accent))]" />
                <h2 className="text-[15px] font-semibold tracking-tight text-foreground">
                  Repositories
                </h2>
                <span className="rounded-xl bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                  {repoResults.length}
                </span>
              </div>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                {repoResults.map((result: any) => (
                  <Link
                    key={result.id}
                    href={`/repos/${result.id}`}
                    className="group rounded-2xl border border-border bg-card p-5 shadow-soft transition-all duration-200 hover:shadow-soft-lg hover:border-primary/20 dark:shadow-soft-dark"
                  >
                    <h3 className="text-[14px] font-semibold tracking-tight text-foreground group-hover:text-primary transition-colors duration-150">
                      {result.title || result.metadata?.full_name}
                    </h3>
                    {result.description && (
                      <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground line-clamp-2">
                        {result.description}
                      </p>
                    )}
                    <div className="mt-3 flex items-center gap-4 text-[12px]">
                      {result.metadata?.stars_count != null && (
                        <span className="flex items-center gap-1 font-medium text-amber-500 dark:text-amber-400">
                          <Star size={12} /> {formatNumber(result.metadata.stars_count)}
                        </span>
                      )}
                      {result.metadata?.forks_count != null && (
                        <span className="flex items-center gap-1 text-muted-foreground">
                          <GitFork size={12} /> {formatNumber(result.metadata.forks_count)}
                        </span>
                      )}
                      {result.metadata?.primary_language && (
                        <span className="rounded-lg bg-muted px-2 py-0.5 font-medium text-foreground">
                          {result.metadata.primary_language}
                        </span>
                      )}
                      <span className="text-muted-foreground/60">
                        Score: {(result.score * 100).toFixed(0)}%
                      </span>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Initial state */}
      {!searched && !loading && (
        <div className="py-16 text-center">
          <SearchIcon size={40} className="mx-auto text-muted-foreground/20" />
          <p className="mt-4 text-[15px] text-muted-foreground">
            Enter a query to search across papers and repositories
          </p>
        </div>
      )}

      {/* Save Search Modal */}
      {showSaveModal && (
        <SaveSearchModal
          query={query}
          searchType={type}
          onClose={() => setShowSaveModal(false)}
        />
      )}
    </div>
  );
}

export default function SearchPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center py-32">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-muted border-t-primary" />
        </div>
      }
    >
      <SearchContent />
    </Suspense>
  );
}
