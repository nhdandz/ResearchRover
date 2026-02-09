"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import Link from "next/link";
import {
  TrendingUp, Star, GitFork, ArrowUpRight, ChevronLeft, ChevronRight,
  RefreshCw, Search, X, Check,
} from "lucide-react";
import {
  fetchTrendingPapers, fetchTrendingRepos, fetchTechRadar,
  fetchTrendingFilters, triggerTechRadarGenerate,
} from "@/lib/api";
import { formatNumber } from "@/lib/utils";

const PAGE_SIZE = 20;

/* ── Pill button ── */
function Pill({
  active,
  onClick,
  children,
  variant = "blue",
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  variant?: "blue" | "purple";
}) {
  const colors = {
    blue: active
      ? "bg-primary/12 text-primary ring-1 ring-primary/20"
      : "bg-muted text-muted-foreground hover:bg-muted/80 hover:text-foreground",
    purple: active
      ? "bg-[hsl(262_83%_58%/0.12)] text-[hsl(var(--accent))] ring-1 ring-[hsl(var(--accent)/0.2)]"
      : "bg-muted text-muted-foreground hover:bg-muted/80 hover:text-foreground",
  };
  return (
    <button
      onClick={onClick}
      className={`rounded-xl px-3 py-1.5 text-[12px] font-medium transition-all duration-150 ${colors[variant]}`}
    >
      {children}
    </button>
  );
}

/* ── Modal for viewing all items ── */
function FilterModal({
  open,
  onClose,
  title,
  items,
  selected,
  onToggle,
  onClear,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  items: string[];
  selected: string[];
  onToggle: (item: string) => void;
  onClear: () => void;
}) {
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (!open) setSearch("");
  }, [open]);

  if (!open) return null;

  const filtered = search
    ? items.filter((item) => item.toLowerCase().includes(search.toLowerCase()))
    : items;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 flex max-h-[80vh] w-full max-w-lg flex-col rounded-2xl border border-border bg-card shadow-soft-lg dark:shadow-soft-dark-lg">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <div>
            <h3 className="text-[15px] font-semibold text-foreground">{title}</h3>
            <p className="mt-0.5 text-[12px] text-muted-foreground">
              {selected.length > 0 ? `${selected.length} selected` : `${items.length} available`}
            </p>
          </div>
          <button onClick={onClose} className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
            <X size={16} />
          </button>
        </div>
        <div className="border-b border-border px-5 py-3">
          <div className="flex items-center gap-2 rounded-xl border border-border bg-background px-3 py-2 transition-all focus-within:border-[hsl(var(--accent)/0.4)] focus-within:ring-2 focus-within:ring-[hsl(var(--accent)/0.1)]">
            <Search size={14} className="shrink-0 text-muted-foreground/60" />
            <input type="text" placeholder="Search..." value={search} onChange={(e) => setSearch(e.target.value)}
              className="flex-1 bg-transparent text-[13px] text-foreground placeholder:text-muted-foreground/40 outline-none" autoFocus />
            {search && <button onClick={() => setSearch("")} className="text-[10px] text-muted-foreground transition-colors hover:text-foreground"><X size={12} /></button>}
          </div>
        </div>
        {selected.length > 0 && (
          <div className="flex flex-wrap gap-1.5 border-b border-border px-5 py-3">
            {selected.map((item) => (
              <span key={item} className="inline-flex items-center gap-1 rounded-lg bg-[hsl(262_83%_58%/0.12)] px-2 py-1 text-[11px] font-medium text-[hsl(var(--accent))] ring-1 ring-[hsl(var(--accent)/0.2)]">
                {item}
                <button onClick={() => onToggle(item)} className="ml-0.5 rounded-full p-0.5 transition-colors hover:bg-[hsl(var(--accent)/0.15)]"><X size={10} /></button>
              </span>
            ))}
            <button onClick={onClear} className="rounded-lg px-2 py-1 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">Clear all</button>
          </div>
        )}
        <div className="flex-1 overflow-y-auto px-2 py-2">
          {filtered.length === 0 && <p className="px-3 py-6 text-center text-[13px] text-muted-foreground/60">No matching items</p>}
          {filtered.map((item) => {
            const isSelected = selected.includes(item);
            return (
              <button key={item} onClick={() => onToggle(item)}
                className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-[13px] transition-all duration-100 ${isSelected ? "bg-[hsl(262_83%_58%/0.08)] text-[hsl(var(--accent))]" : "text-foreground hover:bg-muted"}`}>
                <span className={`flex h-4.5 w-4.5 shrink-0 items-center justify-center rounded-md border transition-all ${isSelected ? "border-[hsl(var(--accent))] bg-[hsl(var(--accent))] text-white" : "border-border"}`}>
                  {isSelected && <Check size={10} />}
                </span>
                <span className="flex-1 truncate">{item}</span>
              </button>
            );
          })}
        </div>
        <div className="flex items-center justify-end gap-2 border-t border-border px-5 py-3">
          <button onClick={onClose} className="rounded-xl bg-primary px-4 py-2 text-[13px] font-medium text-primary-foreground transition-all hover:opacity-90">Done</button>
        </div>
      </div>
    </div>
  );
}

/* ── Multi-select filter with search ── */
function MultiFilter({
  items,
  activeItems,
  onToggle,
  onClear,
  label,
  variant = "purple",
}: {
  items: string[];
  activeItems: string[];
  onToggle: (item: string) => void;
  onClear: () => void;
  label: string;
  variant?: "blue" | "purple";
}) {
  const [search, setSearch] = useState("");
  const [showModal, setShowModal] = useState(false);
  const filtered = search
    ? items.filter((t) => t.toLowerCase().includes(search.toLowerCase()))
    : items.slice(0, 20);

  return (
    <div className="space-y-2.5">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">{label}</span>
        {items.length > 20 && (
          <button onClick={() => setShowModal(true)} className="flex items-center gap-1 text-[11px] font-medium text-[hsl(var(--accent))] transition-colors hover:opacity-80">
            View All ({items.length}) <ChevronRight size={12} />
          </button>
        )}
      </div>

      {activeItems.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          {activeItems.map((t) => (
            <span key={t} className="inline-flex items-center gap-1 rounded-lg bg-[hsl(262_83%_58%/0.12)] px-2.5 py-1 text-[12px] font-medium text-[hsl(var(--accent))] ring-1 ring-[hsl(var(--accent)/0.2)]">
              {t}
              <button onClick={() => onToggle(t)} className="ml-0.5 rounded-full p-0.5 transition-colors hover:bg-[hsl(var(--accent)/0.15)]"><X size={10} /></button>
            </span>
          ))}
          <button onClick={onClear} className="rounded-lg px-2 py-1 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">Clear</button>
        </div>
      )}

      <div className="flex items-center gap-2 rounded-xl border border-border bg-background px-3 py-1.5 transition-all focus-within:border-[hsl(var(--accent)/0.4)] focus-within:ring-2 focus-within:ring-[hsl(var(--accent)/0.1)]">
        <Search size={13} className="shrink-0 text-muted-foreground/60" />
        <input type="text" placeholder={`Search ${label.toLowerCase()}...`} value={search} onChange={(e) => setSearch(e.target.value)}
          className="flex-1 bg-transparent text-[12px] text-foreground placeholder:text-muted-foreground/40 outline-none" />
        {search && <button onClick={() => setSearch("")} className="text-[10px] text-muted-foreground transition-colors hover:text-foreground">&times;</button>}
      </div>

      <div className="flex flex-wrap gap-2">
        {!search && <Pill active={activeItems.length === 0} onClick={onClear} variant={variant}>All</Pill>}
        {filtered.map((t) => (
          <Pill key={t} active={activeItems.includes(t)} onClick={() => onToggle(t)} variant={variant}>{t}</Pill>
        ))}
        {search && filtered.length === 0 && <span className="py-1 text-[12px] text-muted-foreground/60">No matches</span>}
        {!search && items.length > 20 && (
          <button onClick={() => setShowModal(true)} className="self-center text-[11px] font-medium text-[hsl(var(--accent))] transition-colors hover:opacity-80">
            +{items.length - 20} more
          </button>
        )}
      </div>

      <FilterModal open={showModal} onClose={() => setShowModal(false)} title={`All ${label}`} items={items}
        selected={activeItems} onToggle={onToggle} onClear={onClear} />
    </div>
  );
}

export default function TrendingPage() {
  const [papers, setPapers] = useState<any[]>([]);
  const [repos, setRepos] = useState<any[]>([]);
  const [radar, setRadar] = useState<any>(null);
  const [tab, setTab] = useState<"papers" | "repos" | "radar">("papers");
  const [loading, setLoading] = useState(true);

  const [papersPage, setPapersPage] = useState(0);
  const [papersTotal, setPapersTotal] = useState(0);
  const [reposPage, setReposPage] = useState(0);
  const [reposTotal, setReposTotal] = useState(0);

  // Filter data from API
  const [allCategories, setAllCategories] = useState<string[]>([]);
  const [allLanguages, setAllLanguages] = useState<string[]>([]);
  const [allTopics, setAllTopics] = useState<string[]>([]);

  // Active filters
  const [activeCategories, setActiveCategories] = useState<string[]>([]);
  const [selectedLanguage, setSelectedLanguage] = useState<string | null>(null);
  const [activeTopics, setActiveTopics] = useState<string[]>([]);
  const [radarGenerating, setRadarGenerating] = useState(false);
  const [repoSearchInput, setRepoSearchInput] = useState("");
  const [repoSearchQuery, setRepoSearchQuery] = useState("");
  const [paperSearchInput, setPaperSearchInput] = useState("");
  const [paperSearchQuery, setPaperSearchQuery] = useState("");
  const repoDebounceRef = useRef<NodeJS.Timeout>();
  const paperDebounceRef = useRef<NodeJS.Timeout>();

  const categoryParam = activeCategories.length === 1 ? activeCategories[0] : undefined;
  const topicParam = activeTopics.length > 0 ? activeTopics.join(",") : undefined;

  const toggleCategory = (c: string) => {
    setActiveCategories((prev) => prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c]);
    setPapersPage(0);
  };
  const clearCategories = () => { setActiveCategories([]); setPapersPage(0); };

  const toggleTopic = (t: string) => {
    setActiveTopics((prev) => prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]);
    setReposPage(0);
  };
  const clearTopics = () => { setActiveTopics([]); setReposPage(0); };

  const loadPapers = useCallback(async (page: number, category?: string, search?: string) => {
    setLoading(true);
    try {
      const params: any = { skip: page * PAGE_SIZE, limit: PAGE_SIZE };
      if (category) params.category = category;
      if (search) params.search = search;
      const data = await fetchTrendingPapers(params);
      setPapers(data.items || []);
      setPapersTotal(data.total || 0);
      setPapersPage(page);
    } catch {
      setPapers([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadRepos = useCallback(async (page: number, language?: string | null, topic?: string, search?: string) => {
    setLoading(true);
    try {
      const params: any = { skip: page * PAGE_SIZE, limit: PAGE_SIZE };
      if (language) params.language = language;
      if (topic) params.topic = topic;
      if (search) params.search = search;
      const data = await fetchTrendingRepos(params);
      setRepos(data.items || []);
      setReposTotal(data.total || 0);
      setReposPage(page);
    } catch {
      setRepos([]);
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial load
  useEffect(() => {
    Promise.all([
      fetchTrendingPapers({ skip: 0, limit: PAGE_SIZE }).catch(() => ({ items: [], total: 0 })),
      fetchTrendingRepos({ skip: 0, limit: PAGE_SIZE }).catch(() => ({ items: [], total: 0 })),
      fetchTechRadar().catch(() => null),
      fetchTrendingFilters().catch(() => ({ categories: [], languages: [], topics: [] })),
    ]).then(([p, r, t, f]) => {
      setPapers(p.items || []);
      setPapersTotal(p.total || 0);
      setRepos(r.items || []);
      setReposTotal(r.total || 0);
      setRadar(t);
      setAllCategories(f.categories || []);
      setAllLanguages(f.languages || []);
      setAllTopics(f.topics || []);
      setLoading(false);
    });
  }, []);

  // Debounce paper search input
  useEffect(() => {
    clearTimeout(paperDebounceRef.current);
    paperDebounceRef.current = setTimeout(() => {
      setPaperSearchQuery(paperSearchInput);
    }, 400);
    return () => clearTimeout(paperDebounceRef.current);
  }, [paperSearchInput]);

  // Reload papers when category/search filter changes
  useEffect(() => {
    loadPapers(0, categoryParam, paperSearchQuery || undefined);
  }, [categoryParam, paperSearchQuery]); // eslint-disable-line react-hooks/exhaustive-deps

  // Debounce repo search input
  useEffect(() => {
    clearTimeout(repoDebounceRef.current);
    repoDebounceRef.current = setTimeout(() => {
      setRepoSearchQuery(repoSearchInput);
    }, 400);
    return () => clearTimeout(repoDebounceRef.current);
  }, [repoSearchInput]);

  // Reload repos when language/topic/search filter changes
  useEffect(() => {
    loadRepos(0, selectedLanguage, topicParam, repoSearchQuery || undefined);
  }, [selectedLanguage, topicParam, repoSearchQuery]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleGenerateRadar = async () => {
    setRadarGenerating(true);
    try {
      await triggerTechRadarGenerate();
      for (let i = 0; i < 24; i++) {
        await new Promise((r) => setTimeout(r, 5000));
        const data = await fetchTechRadar().catch(() => null);
        if (data && (data.adopt?.length || data.trial?.length || data.assess?.length || data.hold?.length)) {
          setRadar(data);
          break;
        }
      }
    } catch {
      // ignore
    } finally {
      setRadarGenerating(false);
    }
  };

  const totalPaperPages = Math.ceil(papersTotal / PAGE_SIZE);
  const totalRepoPages = Math.ceil(reposTotal / PAGE_SIZE);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tighter text-foreground">Trending</h1>
        <p className="mt-2 text-[15px] text-muted-foreground">Hot papers, repositories, and technology radar</p>
      </div>

      <div className="flex items-center gap-1 rounded-xl border border-border bg-muted/50 p-1">
        {(["papers", "repos", "radar"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex items-center gap-2 rounded-lg px-4 py-2 text-[13px] font-medium transition-all duration-150 ${
              tab === t
                ? "bg-card text-foreground shadow-soft dark:shadow-soft-dark"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {t === "papers" ? "Papers" : t === "repos" ? "Repositories" : "Tech Radar"}
          </button>
        ))}
      </div>

      {/* ══ Papers tab ══ */}
      {tab === "papers" && (
        <div className="space-y-4">
          {/* Search */}
          <div className="flex items-center gap-3 rounded-2xl border border-border bg-card p-2 shadow-soft transition-all focus-within:border-primary/40 focus-within:ring-2 focus-within:ring-primary/10 dark:shadow-soft-dark">
            <Search size={16} className="ml-3 shrink-0 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search papers by title, abstract, or arxiv ID..."
              value={paperSearchInput}
              onChange={(e) => {
                setPaperSearchInput(e.target.value);
                setPapersPage(0);
              }}
              className="flex-1 bg-transparent py-2 text-[14px] text-foreground placeholder:text-muted-foreground/50 outline-none"
            />
            {paperSearchInput && (
              <button
                onClick={() => { setPaperSearchInput(""); setPaperSearchQuery(""); setPapersPage(0); }}
                className="rounded-xl px-3 py-1.5 text-[12px] font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                Clear
              </button>
            )}
          </div>

          {allCategories.length > 0 && (
            <div className="rounded-2xl border border-border bg-card p-5">
              <MultiFilter
                items={allCategories}
                activeItems={activeCategories}
                onToggle={toggleCategory}
                onClear={clearCategories}
                label="Category"
                variant="blue"
              />
            </div>
          )}

          {loading && (
            <div className="flex items-center justify-center py-16">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-muted border-t-primary" />
            </div>
          )}

          {!loading && (
            <div className="space-y-3">
              {papers.map((item: any, i: number) => (
                <Link key={item.id} href={`/papers/${item.id}`}
                  className="group flex items-start gap-4 rounded-2xl border border-border bg-card p-4 shadow-soft transition-all duration-200 hover:shadow-soft-lg hover:border-primary/20 dark:shadow-soft-dark dark:hover:shadow-soft-dark-lg">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted text-sm font-bold text-muted-foreground">
                    {papersPage * PAGE_SIZE + i + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <h3 className="text-[14px] font-semibold tracking-tight text-foreground group-hover:text-primary transition-colors duration-150">{item.title}</h3>
                    <div className="mt-1.5 flex items-center gap-3 text-[12px]">
                      <span className="flex items-center gap-1 font-medium text-amber-500 dark:text-amber-400">
                        <TrendingUp size={12} /> {(item.trending_score || 0).toFixed(1)}
                      </span>
                      <span className="text-muted-foreground">Citations: {item.citation_count || 0}</span>
                      {item.primary_category && (
                        <span className="rounded-lg bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">{item.primary_category}</span>
                      )}
                    </div>
                  </div>
                  <ArrowUpRight size={14} className="shrink-0 text-muted-foreground/40 transition-colors group-hover:text-primary" />
                </Link>
              ))}
              {papers.length === 0 && <p className="py-12 text-center text-sm text-muted-foreground">No trending papers yet.</p>}
              {totalPaperPages > 1 && (
                <Pagination currentPage={papersPage} totalPages={totalPaperPages}
                  onPageChange={(p) => loadPapers(p, categoryParam, paperSearchQuery || undefined)} />
              )}
            </div>
          )}
        </div>
      )}

      {/* ══ Repos tab ══ */}
      {tab === "repos" && (
        <div className="space-y-4">
          {/* Search */}
          <div className="flex items-center gap-3 rounded-2xl border border-border bg-card p-2 shadow-soft transition-all focus-within:border-primary/40 focus-within:ring-2 focus-within:ring-primary/10 dark:shadow-soft-dark">
            <Search size={16} className="ml-3 shrink-0 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search repositories by name or description..."
              value={repoSearchInput}
              onChange={(e) => {
                setRepoSearchInput(e.target.value);
                setReposPage(0);
              }}
              className="flex-1 bg-transparent py-2 text-[14px] text-foreground placeholder:text-muted-foreground/50 outline-none"
            />
            {repoSearchInput && (
              <button
                onClick={() => { setRepoSearchInput(""); setRepoSearchQuery(""); setReposPage(0); }}
                className="rounded-xl px-3 py-1.5 text-[12px] font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                Clear
              </button>
            )}
          </div>

          <div className="space-y-5 rounded-2xl border border-border bg-card p-5">
            {/* Language filter */}
            {allLanguages.length > 0 && (
              <div className="space-y-2.5">
                <span className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">Language</span>
                <div className="flex flex-wrap gap-2">
                  <Pill active={!selectedLanguage} onClick={() => { setSelectedLanguage(null); setReposPage(0); }}>All</Pill>
                  {allLanguages.map((lang) => (
                    <Pill key={lang} active={selectedLanguage === lang}
                      onClick={() => { setSelectedLanguage(selectedLanguage === lang ? null : lang); setReposPage(0); }}>
                      {lang}
                    </Pill>
                  ))}
                </div>
              </div>
            )}

            {/* Topic filter */}
            {allTopics.length > 0 && (
              <>
                <div className="border-t border-border" />
                <MultiFilter
                  items={allTopics}
                  activeItems={activeTopics}
                  onToggle={toggleTopic}
                  onClear={clearTopics}
                  label="Topic"
                  variant="purple"
                />
              </>
            )}
          </div>

          {loading && (
            <div className="flex items-center justify-center py-16">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-muted border-t-primary" />
            </div>
          )}

          {!loading && (
            <div className="space-y-3">
              {repos.map((item: any, i: number) => (
                <Link key={item.id} href={`/repos/${item.id}`}
                  className="group flex items-start gap-4 rounded-2xl border border-border bg-card p-4 shadow-soft transition-all duration-200 hover:shadow-soft-lg hover:border-primary/20 dark:shadow-soft-dark dark:hover:shadow-soft-dark-lg">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted text-sm font-bold text-muted-foreground">
                    {reposPage * PAGE_SIZE + i + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <h3 className="text-[14px] font-semibold tracking-tight text-primary group-hover:text-primary transition-colors duration-150">{item.full_name}</h3>
                    {item.description && <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground line-clamp-1">{item.description}</p>}
                    <div className="mt-1.5 flex items-center gap-3 text-[12px]">
                      <span className="flex items-center gap-1 font-medium text-amber-500 dark:text-amber-400">
                        <TrendingUp size={12} /> {(item.trending_score || 0).toFixed(1)}
                      </span>
                      <span className="flex items-center gap-1 font-medium text-amber-500 dark:text-amber-400">
                        <Star size={12} /> {formatNumber(item.stars_count || 0)}
                      </span>
                      <span className="flex items-center gap-1 text-muted-foreground">
                        <GitFork size={12} /> {formatNumber(item.forks_count || 0)}
                      </span>
                      {item.primary_language && (
                        <span className="rounded-lg bg-muted px-1.5 py-0.5 text-[10px] font-medium text-foreground">{item.primary_language}</span>
                      )}
                    </div>
                  </div>
                  <ArrowUpRight size={14} className="shrink-0 text-muted-foreground/40 transition-colors group-hover:text-primary" />
                </Link>
              ))}
              {repos.length === 0 && <p className="py-12 text-center text-sm text-muted-foreground">No trending repos yet.</p>}
              {totalRepoPages > 1 && (
                <Pagination currentPage={reposPage} totalPages={totalRepoPages}
                  onPageChange={(p) => loadRepos(p, selectedLanguage, topicParam, repoSearchQuery || undefined)} />
              )}
            </div>
          )}
        </div>
      )}

      {/* ══ Tech Radar tab ══ */}
      {tab === "radar" && (
        <div>
          {radar && (radar.adopt?.length || radar.trial?.length || radar.assess?.length || radar.hold?.length) ? (
            <>
              <div className="mb-5 flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-semibold text-foreground">Technology Radar</h2>
                  <p className="mt-0.5 text-[13px] text-muted-foreground">AI-generated overview of current technology trends and recommendations</p>
                </div>
                <button onClick={handleGenerateRadar} disabled={radarGenerating}
                  className="flex items-center gap-2 rounded-xl border border-border bg-card px-3 py-1.5 text-[12px] font-medium text-muted-foreground shadow-soft transition-all hover:bg-muted hover:text-foreground disabled:opacity-50 dark:shadow-soft-dark">
                  <RefreshCw size={12} className={radarGenerating ? "animate-spin" : ""} />
                  {radarGenerating ? "Generating..." : "Regenerate"}
                </button>
              </div>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                {([
                  { key: "adopt", label: "Adopt", color: "border-l-emerald-500", dotColor: "bg-emerald-500", badgeBg: "bg-emerald-500/10", badgeText: "text-emerald-600 dark:text-emerald-400" },
                  { key: "trial", label: "Trial", color: "border-l-blue-500", dotColor: "bg-blue-500", badgeBg: "bg-blue-500/10", badgeText: "text-blue-600 dark:text-blue-400" },
                  { key: "assess", label: "Assess", color: "border-l-amber-500", dotColor: "bg-amber-500", badgeBg: "bg-amber-500/10", badgeText: "text-amber-600 dark:text-amber-400" },
                  { key: "hold", label: "Hold", color: "border-l-red-500", dotColor: "bg-red-500", badgeBg: "bg-red-500/10", badgeText: "text-red-600 dark:text-red-400" },
                ] as const).map(({ key, label, color, dotColor, badgeBg, badgeText }) => {
                  const items = radar[key] || [];
                  return (
                    <div key={key} className={`rounded-2xl border border-border border-l-[3px] ${color} bg-card p-4 shadow-soft dark:shadow-soft-dark`}>
                      <div className="mb-3 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className={`h-2.5 w-2.5 rounded-full ${dotColor}`} />
                          <h3 className="text-sm font-semibold text-foreground">{label}</h3>
                        </div>
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${badgeBg} ${badgeText}`}>
                          {items.length} {items.length === 1 ? "item" : "items"}
                        </span>
                      </div>
                      <div className="space-y-2">
                        {items.length === 0 && <p className="py-3 text-center text-[12px] text-muted-foreground/60">No technologies in this ring</p>}
                        {items.map((tech: any, i: number) => (
                          <div key={i} className="rounded-xl border border-border bg-muted/30 px-3 py-2.5 transition-colors hover:bg-muted/60">
                            <p className="text-[13px] font-medium text-foreground">{tech.name || tech}</p>
                            {tech.reason && <p className="mt-1 text-[12px] leading-relaxed text-muted-foreground">{tech.reason}</p>}
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          ) : (
            <div className="flex flex-col items-center justify-center rounded-2xl border border-border bg-card py-16 shadow-soft dark:shadow-soft-dark">
              {radarGenerating ? (
                <>
                  <div className="relative mb-6 flex h-20 w-20 items-center justify-center">
                    <span className="absolute h-20 w-20 animate-ping rounded-full bg-primary/10" />
                    <span className="absolute h-14 w-14 animate-pulse rounded-full bg-primary/5" />
                    <div className="relative flex h-12 w-12 items-center justify-center rounded-full border border-border bg-card">
                      <RefreshCw size={20} className="animate-spin text-primary" />
                    </div>
                  </div>
                  <p className="text-sm font-medium text-foreground">Generating Tech Radar</p>
                  <p className="mt-1.5 max-w-xs text-center text-[12px] text-muted-foreground">Analyzing trending papers and repositories. This may take a minute or two.</p>
                  <div className="mt-4 flex items-center gap-1.5">
                    <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-primary" style={{ animationDelay: "0ms" }} />
                    <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-primary" style={{ animationDelay: "150ms" }} />
                    <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-primary" style={{ animationDelay: "300ms" }} />
                  </div>
                </>
              ) : (
                <>
                  <div className="relative mb-6 flex h-20 w-20 items-center justify-center">
                    <span className="absolute h-20 w-20 rounded-full border border-border" />
                    <span className="absolute h-14 w-14 rounded-full border border-border" />
                    <span className="absolute h-8 w-8 rounded-full border border-border" />
                    <span className="absolute h-2.5 w-2.5 rounded-full bg-primary" />
                    <span className="absolute h-full w-px bg-border" />
                    <span className="absolute h-px w-full bg-border" />
                  </div>
                  <h3 className="text-sm font-semibold text-foreground">No Tech Radar Yet</h3>
                  <p className="mt-1.5 mb-5 max-w-sm text-center text-[13px] leading-relaxed text-muted-foreground">
                    Generate an AI-powered technology radar based on current trending papers and repositories.
                  </p>
                  <button onClick={handleGenerateRadar}
                    className="group flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground shadow-lg shadow-primary/20 transition-all hover:opacity-90 hover:shadow-primary/30">
                    <RefreshCw size={14} className="transition-transform group-hover:rotate-90" />
                    Generate Tech Radar
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Pagination({
  currentPage,
  totalPages,
  onPageChange,
}: {
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}) {
  const getPageNumbers = () => {
    const pages: (number | "...")[] = [];
    if (totalPages <= 7) {
      for (let i = 0; i < totalPages; i++) pages.push(i);
      return pages;
    }
    pages.push(0);
    if (currentPage > 2) pages.push("...");
    for (let i = Math.max(1, currentPage - 1); i <= Math.min(totalPages - 2, currentPage + 1); i++) {
      pages.push(i);
    }
    if (currentPage < totalPages - 3) pages.push("...");
    pages.push(totalPages - 1);
    return pages;
  };

  return (
    <div className="flex items-center justify-between border-t border-border pt-4">
      <span className="text-[13px] text-muted-foreground">Page {currentPage + 1} of {totalPages}</span>
      <div className="flex items-center gap-1">
        <button onClick={() => onPageChange(currentPage - 1)} disabled={currentPage === 0}
          className="rounded-xl border border-border px-3 py-2 text-foreground transition-all duration-150 hover:bg-muted disabled:opacity-40 disabled:hover:bg-transparent">
          <ChevronLeft size={14} />
        </button>
        {getPageNumbers().map((p, i) =>
          p === "..." ? (
            <span key={`ellipsis-${i}`} className="px-2 text-[12px] text-muted-foreground/60">...</span>
          ) : (
            <button key={p} onClick={() => onPageChange(p)}
              className={`flex h-8 w-8 items-center justify-center rounded-xl text-[13px] font-medium transition-all duration-150 ${
                currentPage === p
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              }`}>
              {p + 1}
            </button>
          )
        )}
        <button onClick={() => onPageChange(currentPage + 1)} disabled={currentPage >= totalPages - 1}
          className="rounded-xl border border-border px-3 py-2 text-foreground transition-all duration-150 hover:bg-muted disabled:opacity-40 disabled:hover:bg-transparent">
          <ChevronRight size={14} />
        </button>
      </div>
    </div>
  );
}
