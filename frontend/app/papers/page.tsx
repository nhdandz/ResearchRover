"use client";

import { useEffect, useState, useRef, useCallback, useMemo } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import {
  Search, ExternalLink, Download, LayoutGrid, List,
  ArrowUp, ArrowDown, BarChart3, FileText, Calendar,
  Quote, TrendingUp, Tag, X, ChevronRight, Check,
  Users, Share2, Activity, Upload, ArrowUpRight,
  Loader2, Building2, Compass, GitCompare,
} from "lucide-react";
import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  LineChart, Line, Legend, ScatterChart, Scatter, ZAxis,
} from "recharts";
import {
  fetchPapers, fetchPaperStats, fetchPaperCategories,
  triggerCollectPapers, triggerEnrichCitations,
  fetchAuthorAnalytics, fetchKeywordAnalytics,
  fetchCoAuthorNetwork, fetchKeywordTrends, importPapers,
  fetchTopicCoOccurrence, fetchCitationTimeline,
  fetchCategoryHeatmap, fetchTopicCorrelation,
  fetchInstitutionRanking, compareAuthors,
  fetchResearchLandscape,
} from "@/lib/api";
import { formatNumber, formatDate } from "@/lib/utils";

const ForceGraph2D = dynamic(() => import("react-force-graph-2d"), { ssr: false });

type SortField = "published_date" | "citation_count" | "created_at";
type ViewMode = "grid" | "table";
type PageTab = "overview" | "papers" | "analytics" | "networks" | "trends";
type NetworkMode = "coauthor" | "topic";

const LINE_COLORS = [
  "#3b82f6","#ef4444","#10b981","#f59e0b","#8b5cf6",
  "#ec4899","#06b6d4","#f97316","#a855f7","#14b8a6",
];
const CAT_COLORS = [
  "#3b82f6","#f59e0b","#10b981","#ef4444",
  "#8b5cf6","#ec4899","#06b6d4","#f97316","#a855f7","#14b8a6",
];
const YEAR_COLORS = [
  "#8b5cf6","#06b6d4","#f59e0b","#ef4444",
  "#10b981","#ec4899","#3b82f6","#f97316","#a855f7","#14b8a6","#eab308","#fb923c",
];
const tooltipStyle = {
  backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))",
  borderRadius: "12px", fontSize: "12px", color: "hsl(var(--foreground))",
};

/* ── Pill ── */
function Pill({ active, onClick, children, variant = "blue" }: {
  active: boolean; onClick: () => void; children: React.ReactNode; variant?: "blue" | "purple";
}) {
  const c = {
    blue: active ? "bg-primary/12 text-primary ring-1 ring-primary/20" : "bg-muted text-muted-foreground hover:bg-muted/80 hover:text-foreground",
    purple: active ? "bg-[hsl(262_83%_58%/0.12)] text-[hsl(var(--accent))] ring-1 ring-[hsl(var(--accent)/0.2)]" : "bg-muted text-muted-foreground hover:bg-muted/80 hover:text-foreground",
  };
  return <button onClick={onClick} className={`rounded-xl px-3 py-1.5 text-[12px] font-medium transition-all duration-150 ${c[variant]}`}>{children}</button>;
}

/* ── Filter Modal ── */
function FilterModal({ open, onClose, title, items, selected, onToggle, onClear }: {
  open: boolean; onClose: () => void; title: string; items: string[];
  selected: string[]; onToggle: (i: string) => void; onClear: () => void;
}) {
  const [search, setSearch] = useState("");
  useEffect(() => { if (!open) setSearch(""); }, [open]);
  if (!open) return null;
  const filtered = search ? items.filter((i) => i.toLowerCase().includes(search.toLowerCase())) : items;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 flex max-h-[80vh] w-full max-w-lg flex-col rounded-2xl border border-border bg-card shadow-soft-lg dark:shadow-soft-dark-lg">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <div><h3 className="text-[15px] font-semibold text-foreground">{title}</h3><p className="mt-0.5 text-[12px] text-muted-foreground">{selected.length > 0 ? `${selected.length} selected` : `${items.length} available`}</p></div>
          <button onClick={onClose} className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground"><X size={16} /></button>
        </div>
        <div className="border-b border-border px-5 py-3">
          <div className="flex items-center gap-2 rounded-xl border border-border bg-background px-3 py-2 focus-within:border-[hsl(var(--accent)/0.4)] focus-within:ring-2 focus-within:ring-[hsl(var(--accent)/0.1)]">
            <Search size={14} className="shrink-0 text-muted-foreground/60" />
            <input type="text" placeholder="Search..." value={search} onChange={(e) => setSearch(e.target.value)} className="flex-1 bg-transparent text-[13px] text-foreground placeholder:text-muted-foreground/40 outline-none" autoFocus />
            {search && <button onClick={() => setSearch("")} className="text-muted-foreground hover:text-foreground"><X size={12} /></button>}
          </div>
        </div>
        {selected.length > 0 && (
          <div className="flex flex-wrap gap-1.5 border-b border-border px-5 py-3">
            {selected.map((i) => (<span key={i} className="inline-flex items-center gap-1 rounded-lg bg-[hsl(262_83%_58%/0.12)] px-2 py-1 text-[11px] font-medium text-[hsl(var(--accent))] ring-1 ring-[hsl(var(--accent)/0.2)]">{i}<button onClick={() => onToggle(i)} className="ml-0.5 rounded-full p-0.5 hover:bg-[hsl(var(--accent)/0.15)]"><X size={10} /></button></span>))}
            <button onClick={onClear} className="rounded-lg px-2 py-1 text-[11px] font-medium text-muted-foreground hover:bg-muted hover:text-foreground">Clear all</button>
          </div>
        )}
        <div className="flex-1 overflow-y-auto px-2 py-2">
          {filtered.length === 0 && <p className="px-3 py-6 text-center text-[13px] text-muted-foreground/60">No matching items</p>}
          {filtered.map((item) => {
            const sel = selected.includes(item);
            return (<button key={item} onClick={() => onToggle(item)} className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-[13px] transition-all ${sel ? "bg-[hsl(262_83%_58%/0.08)] text-[hsl(var(--accent))]" : "text-foreground hover:bg-muted"}`}>
              <span className={`flex h-4.5 w-4.5 shrink-0 items-center justify-center rounded-md border ${sel ? "border-[hsl(var(--accent))] bg-[hsl(var(--accent))] text-white" : "border-border"}`}>{sel && <Check size={10} />}</span>
              <span className="flex-1 truncate">{item}</span>
            </button>);
          })}
        </div>
        <div className="flex items-center justify-end gap-2 border-t border-border px-5 py-3"><button onClick={onClose} className="rounded-xl bg-primary px-4 py-2 text-[13px] font-medium text-primary-foreground hover:opacity-90">Done</button></div>
      </div>
    </div>
  );
}

/* ── Category Filter ── */
function CategoryFilter({ categories, activeCategories, onToggle, onClear }: {
  categories: string[]; activeCategories: string[]; onToggle: (c: string) => void; onClear: () => void;
}) {
  const [catSearch, setCatSearch] = useState("");
  const [showModal, setShowModal] = useState(false);
  const filtered = catSearch ? categories.filter((c) => c.toLowerCase().includes(catSearch.toLowerCase())) : categories.slice(0, 20);
  return (
    <div className="space-y-2.5">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">Category</span>
        {categories.length > 20 && <button onClick={() => setShowModal(true)} className="flex items-center gap-1 text-[11px] font-medium text-[hsl(var(--accent))] hover:opacity-80">View All ({categories.length}) <ChevronRight size={12} /></button>}
      </div>
      {activeCategories.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          {activeCategories.map((c) => (<span key={c} className="inline-flex items-center gap-1 rounded-lg bg-[hsl(262_83%_58%/0.12)] px-2.5 py-1 text-[12px] font-medium text-[hsl(var(--accent))] ring-1 ring-[hsl(var(--accent)/0.2)]">{c}<button onClick={() => onToggle(c)} className="ml-0.5 rounded-full p-0.5 hover:bg-[hsl(var(--accent)/0.15)]"><X size={10} /></button></span>))}
          <button onClick={onClear} className="rounded-lg px-2 py-1 text-[11px] font-medium text-muted-foreground hover:bg-muted hover:text-foreground">Clear</button>
        </div>
      )}
      <div className="flex items-center gap-2 rounded-xl border border-border bg-background px-3 py-1.5 focus-within:border-[hsl(var(--accent)/0.4)] focus-within:ring-2 focus-within:ring-[hsl(var(--accent)/0.1)]">
        <Search size={13} className="shrink-0 text-muted-foreground/60" />
        <input type="text" placeholder="Search categories..." value={catSearch} onChange={(e) => setCatSearch(e.target.value)} className="flex-1 bg-transparent text-[12px] text-foreground placeholder:text-muted-foreground/40 outline-none" />
        {catSearch && <button onClick={() => setCatSearch("")} className="text-[10px] text-muted-foreground hover:text-foreground">&times;</button>}
      </div>
      <div className="flex flex-wrap gap-2">
        {!catSearch && <Pill active={activeCategories.length === 0} onClick={onClear} variant="purple">All</Pill>}
        {filtered.map((c) => <Pill key={c} active={activeCategories.includes(c)} onClick={() => onToggle(c)} variant="purple">{c}</Pill>)}
        {catSearch && filtered.length === 0 && <span className="text-[12px] text-muted-foreground/60 py-1">No matching categories</span>}
        {!catSearch && categories.length > 20 && <button onClick={() => setShowModal(true)} className="self-center text-[11px] font-medium text-[hsl(var(--accent))] hover:opacity-80">+{categories.length - 20} more</button>}
      </div>
      <FilterModal open={showModal} onClose={() => setShowModal(false)} title="All Categories" items={categories} selected={activeCategories} onToggle={onToggle} onClear={onClear} />
    </div>
  );
}

/* ── Import Modal ── */
function ImportModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => { if (!open) { setFile(null); setResult(null); setImporting(false); } }, [open]);
  if (!open) return null;
  const handleDrop = (e: React.DragEvent) => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files[0]; if (f && (f.name.endsWith(".csv") || f.name.endsWith(".bib"))) setFile(f); };
  const handleImport = async () => {
    if (!file) return; setImporting(true);
    try { setResult(await importPapers(file)); } catch (e: any) { setResult({ imported: 0, skipped: 0, errors: [e?.response?.data?.detail || "Import failed"] }); }
    finally { setImporting(false); }
  };
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-soft-lg dark:shadow-soft-dark-lg">
        <div className="flex items-center justify-between mb-4"><h3 className="text-[15px] font-semibold text-foreground">Import Papers</h3><button onClick={onClose} className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground"><X size={16} /></button></div>
        {!result ? (<>
          <div onDragOver={(e) => { e.preventDefault(); setDragOver(true); }} onDragLeave={() => setDragOver(false)} onDrop={handleDrop} onClick={() => inputRef.current?.click()}
            className={`flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed p-8 transition-all ${dragOver ? "border-primary bg-primary/5" : file ? "border-green-500/50 bg-green-500/5" : "border-border hover:border-muted-foreground/40"}`}>
            <Upload size={24} className={file ? "text-green-500" : "text-muted-foreground"} />
            {file ? <p className="mt-2 text-[13px] font-medium text-foreground">{file.name}</p> : <><p className="mt-2 text-[13px] font-medium text-foreground">Drop file here or click to browse</p><p className="mt-1 text-[12px] text-muted-foreground">Supports .csv and .bib files</p></>}
            <input ref={inputRef} type="file" accept=".csv,.bib" className="hidden" onChange={(e) => { if (e.target.files?.[0]) setFile(e.target.files[0]); }} />
          </div>
          <div className="mt-4 flex justify-end gap-2">
            <button onClick={onClose} className="rounded-xl border border-border px-4 py-2 text-[13px] font-medium text-foreground hover:bg-muted">Cancel</button>
            <button onClick={handleImport} disabled={!file || importing} className="flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-[13px] font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50">{importing && <Loader2 size={14} className="animate-spin" />}{importing ? "Importing..." : "Import"}</button>
          </div>
        </>) : (<>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-xl bg-green-500/10 p-3 text-center"><p className="text-xl font-semibold text-green-600 dark:text-green-400">{result.imported}</p><p className="text-[11px] text-muted-foreground">Imported</p></div>
              <div className="rounded-xl bg-amber-500/10 p-3 text-center"><p className="text-xl font-semibold text-amber-600 dark:text-amber-400">{result.skipped}</p><p className="text-[11px] text-muted-foreground">Skipped</p></div>
            </div>
            {result.errors?.length > 0 && <div className="max-h-32 overflow-y-auto rounded-xl bg-red-500/5 p-3"><p className="text-[11px] font-semibold text-red-500 mb-1">Errors ({result.errors.length})</p>{result.errors.slice(0, 10).map((e: string, i: number) => <p key={i} className="text-[11px] text-red-400 truncate">{e}</p>)}</div>}
          </div>
          <div className="mt-4 flex justify-end"><button onClick={onClose} className="rounded-xl bg-primary px-4 py-2 text-[13px] font-medium text-primary-foreground hover:opacity-90">Done</button></div>
        </>)}
      </div>
    </div>
  );
}

/* ── Author Compare Modal ── */
function AuthorCompareModal({ open, onClose, authorList }: { open: boolean; onClose: () => void; authorList: string[] }) {
  const [selected, setSelected] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<any>(null);
  useEffect(() => { if (!open) { setSelected([]); setSearch(""); setData(null); } }, [open]);
  if (!open) return null;
  const filtered = search ? authorList.filter((a) => a.toLowerCase().includes(search.toLowerCase())).slice(0, 20) : authorList.slice(0, 20);
  const toggle = (a: string) => setSelected((p) => p.includes(a) ? p.filter((x) => x !== a) : p.length < 5 ? [...p, a] : p);
  const handleCompare = async () => {
    if (selected.length < 2) return; setLoading(true);
    try { setData(await compareAuthors(selected)); } catch {} finally { setLoading(false); }
  };
  const maxPapers = data ? Math.max(...data.authors.map((a: any) => a.paper_count), 1) : 1;
  const maxCit = data ? Math.max(...data.authors.map((a: any) => a.total_citations), 1) : 1;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 w-full max-w-2xl max-h-[85vh] overflow-y-auto rounded-2xl border border-border bg-card p-6 shadow-soft-lg dark:shadow-soft-dark-lg">
        <div className="flex items-center justify-between mb-4"><h3 className="text-[15px] font-semibold text-foreground">Compare Authors</h3><button onClick={onClose} className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground"><X size={16} /></button></div>
        {!data ? (<>
          <div className="flex items-center gap-2 rounded-xl border border-border bg-background px-3 py-2 mb-3">
            <Search size={14} className="text-muted-foreground/60" />
            <input type="text" placeholder="Search authors..." value={search} onChange={(e) => setSearch(e.target.value)} className="flex-1 bg-transparent text-[13px] text-foreground placeholder:text-muted-foreground/40 outline-none" />
          </div>
          {selected.length > 0 && <div className="flex flex-wrap gap-1.5 mb-3">{selected.map((a) => (<span key={a} className="inline-flex items-center gap-1 rounded-lg bg-primary/10 px-2 py-1 text-[11px] font-medium text-primary">{a}<button onClick={() => toggle(a)}><X size={10} /></button></span>))}</div>}
          <div className="max-h-48 overflow-y-auto space-y-1 mb-4">{filtered.map((a) => (<button key={a} onClick={() => toggle(a)} className={`w-full text-left rounded-lg px-3 py-2 text-[13px] transition-colors ${selected.includes(a) ? "bg-primary/10 text-primary" : "hover:bg-muted text-foreground"}`}>{a}</button>))}</div>
          <div className="flex justify-end gap-2">
            <button onClick={onClose} className="rounded-xl border border-border px-4 py-2 text-[13px] font-medium text-foreground hover:bg-muted">Cancel</button>
            <button onClick={handleCompare} disabled={selected.length < 2 || loading} className="flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-[13px] font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50">{loading && <Loader2 size={14} className="animate-spin" />}Compare ({selected.length})</button>
          </div>
        </>) : (
          <div className="space-y-4">
            {/* Bar comparison */}
            <div className="space-y-3">
              {data.authors.map((a: any, i: number) => (
                <div key={a.name} className="rounded-xl border border-border p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="h-3 w-3 rounded-full" style={{ backgroundColor: LINE_COLORS[i % LINE_COLORS.length] }} />
                    <span className="text-[13px] font-semibold text-foreground">{a.name}</span>
                    {a.affiliation && <span className="text-[11px] text-muted-foreground">({a.affiliation})</span>}
                  </div>
                  <div className="grid grid-cols-4 gap-3 text-center text-[11px]">
                    <div><p className="font-semibold text-foreground text-lg">{a.paper_count}</p><p className="text-muted-foreground">Papers</p></div>
                    <div><p className="font-semibold text-foreground text-lg">{formatNumber(a.total_citations)}</p><p className="text-muted-foreground">Citations</p></div>
                    <div><p className="font-semibold text-foreground text-lg">{a.avg_citations}</p><p className="text-muted-foreground">Avg Cit.</p></div>
                    <div><p className="font-semibold text-foreground text-lg">{a.first_year || "?"}-{a.last_year || "?"}</p><p className="text-muted-foreground">Active</p></div>
                  </div>
                  {/* Papers bar */}
                  <div className="mt-2"><div className="h-1.5 rounded-full bg-muted overflow-hidden"><div className="h-full rounded-full transition-all" style={{ width: `${(a.paper_count / maxPapers) * 100}%`, backgroundColor: LINE_COLORS[i % LINE_COLORS.length] }} /></div></div>
                  {a.topics?.length > 0 && <div className="mt-2 flex flex-wrap gap-1">{a.topics.map((t: string) => <span key={t} className="rounded-md bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">{t}</span>)}</div>}
                </div>
              ))}
            </div>
            <div className="flex justify-end"><button onClick={() => setData(null)} className="rounded-xl border border-border px-4 py-2 text-[13px] font-medium text-foreground hover:bg-muted mr-2">Back</button><button onClick={onClose} className="rounded-xl bg-primary px-4 py-2 text-[13px] font-medium text-primary-foreground hover:opacity-90">Done</button></div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Helpers ── */
const LoadingSpinner = () => <div className="flex items-center justify-center py-16"><div className="h-6 w-6 animate-spin rounded-full border-2 border-muted border-t-primary" /></div>;
const EmptyState = ({ message }: { message: string }) => <div className="flex flex-col items-center justify-center py-16 text-muted-foreground"><FileText size={32} className="mb-3 opacity-40" /><p className="text-[13px]">{message}</p></div>;
const Card = ({ children, className = "" }: { children: React.ReactNode; className?: string }) => <div className={`rounded-2xl border border-border bg-card p-5 shadow-soft dark:shadow-soft-dark ${className}`}>{children}</div>;

/* ── Export helper ── */
function exportPapersCSV(papers: any[]) {
  const headers = ["title", "authors", "abstract", "published_date", "citation_count", "categories", "source", "doi", "arxiv_id"];
  const rows = papers.map((p) => [
    `"${(p.title || "").replace(/"/g, '""')}"`,
    `"${(p.authors || []).map((a: any) => a.name || a).join("; ")}"`,
    `"${(p.abstract || "").replace(/"/g, '""')}"`,
    p.published_date || "", p.citation_count || 0,
    `"${(p.categories || []).join("; ")}"`,
    p.source || "", p.doi || "", p.arxiv_id || "",
  ]);
  const csv = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a"); a.href = url; a.download = "papers.csv"; a.click();
  URL.revokeObjectURL(url);
}

/* ══════════════════════════════════════════════ */
/* ── MAIN PAGE ── */
/* ══════════════════════════════════════════════ */
export default function PapersPage() {
  const [papers, setPapers] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [collecting, setCollecting] = useState(false);
  const [enriching, setEnriching] = useState(false);
  const [categories, setCategories] = useState<string[]>([]);
  const [page, setPage] = useState(0);
  const [viewMode, setViewMode] = useState<ViewMode>("grid");
  const [sortBy, setSortBy] = useState<SortField>("published_date");
  const [sortOrder, setSortOrder] = useState<"desc" | "asc">("desc");
  const [searchInput, setSearchInput] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [stats, setStats] = useState<any>(null);
  const [knownCategories, setKnownCategories] = useState<string[]>([]);
  const [activeTab, setActiveTab] = useState<PageTab>("overview");
  const [showImport, setShowImport] = useState(false);
  const debounceRef = useRef<NodeJS.Timeout>();

  // Analytics
  const [authorData, setAuthorData] = useState<any>(null);
  const [keywordData, setKeywordData] = useState<any>(null);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);
  const [citTimeline, setCitTimeline] = useState<any>(null);
  const [catHeatmap, setCatHeatmap] = useState<any>(null);
  const [institutions, setInstitutions] = useState<any>(null);
  const [landscape, setLandscape] = useState<any>(null);
  const [showCompare, setShowCompare] = useState(false);

  // Network
  const [networkData, setNetworkData] = useState<any>(null);
  const [networkLoading, setNetworkLoading] = useState(false);
  const [minCollabs, setMinCollabs] = useState(2);
  const [networkLimit, setNetworkLimit] = useState(100);
  const [networkMode, setNetworkMode] = useState<NetworkMode>("coauthor");
  const [highlightNode, setHighlightNode] = useState<string | null>(null);
  const [networkSearch, setNetworkSearch] = useState("");
  const graphRef = useRef<any>(null);

  // Trends
  const [trendData, setTrendData] = useState<any>(null);
  const [trendsLoading, setTrendsLoading] = useState(false);
  const [topicCorrelation, setTopicCorrelation] = useState<any>(null);

  const pageSize = viewMode === "grid" ? 21 : 20;
  const categoryParam = categories.length > 0 ? categories.join(",") : undefined;
  const toggleCategory = (c: string) => { setPage(0); setCategories((p) => p.includes(c) ? p.filter((x) => x !== c) : [...p, c]); };
  const clearCategories = () => { setPage(0); setCategories([]); };

  useEffect(() => { fetchPaperCategories().then(setKnownCategories).catch(() => {}); }, []);
  useEffect(() => { clearTimeout(debounceRef.current); debounceRef.current = setTimeout(() => setSearchQuery(searchInput), 400); return () => clearTimeout(debounceRef.current); }, [searchInput]);

  useEffect(() => {
    setLoading(true);
    fetchPapers({ skip: page * pageSize, limit: pageSize, category: categoryParam, search: searchQuery || undefined, sort_by: sortBy, sort_order: sortOrder })
      .then((d) => { setPapers(d.items || []); setTotal(d.total || 0); }).catch(() => {}).finally(() => setLoading(false));
  }, [page, categoryParam, sortBy, sortOrder, searchQuery, pageSize]);

  useEffect(() => { fetchPaperStats({ category: categoryParam, search: searchQuery || undefined }).then(setStats).catch(() => {}); }, [categoryParam, searchQuery]);

  // Analytics data
  useEffect(() => {
    if (activeTab !== "analytics") return;
    setAnalyticsLoading(true);
    Promise.all([
      fetchAuthorAnalytics({ category: categoryParam }),
      fetchKeywordAnalytics({ category: categoryParam }),
      fetchCitationTimeline({ category: categoryParam }),
      fetchCategoryHeatmap({ category: categoryParam }),
      fetchInstitutionRanking({ category: categoryParam }),
      fetchResearchLandscape({ category: categoryParam }),
    ]).then(([auth, kw, cit, hm, inst, land]) => {
      setAuthorData(auth); setKeywordData(kw); setCitTimeline(cit);
      setCatHeatmap(hm); setInstitutions(inst); setLandscape(land);
    }).catch(() => {}).finally(() => setAnalyticsLoading(false));
  }, [activeTab, categoryParam]);

  // Network data
  const loadNetwork = useCallback(() => {
    setNetworkLoading(true);
    const fetcher = networkMode === "coauthor"
      ? fetchCoAuthorNetwork({ min_collabs: minCollabs, limit: networkLimit, category: categoryParam })
      : fetchTopicCoOccurrence({ min_cooccurrence: minCollabs, limit: networkLimit, category: categoryParam });
    fetcher.then(setNetworkData).catch(() => {}).finally(() => setNetworkLoading(false));
  }, [minCollabs, networkLimit, categoryParam, networkMode]);

  useEffect(() => { if (activeTab === "networks") loadNetwork(); }, [activeTab, loadNetwork]);

  // Trends data
  useEffect(() => {
    if (activeTab !== "trends") return;
    setTrendsLoading(true);
    Promise.all([
      fetchKeywordTrends({ category: categoryParam }),
      fetchTopicCorrelation({ category: categoryParam }),
    ]).then(([tr, corr]) => { setTrendData(tr); setTopicCorrelation(corr); })
      .catch(() => {}).finally(() => setTrendsLoading(false));
  }, [activeTab, categoryParam]);

  const handleSort = (field: SortField) => { if (sortBy === field) setSortOrder(sortOrder === "desc" ? "asc" : "desc"); else { setSortBy(field); setSortOrder("desc"); } setPage(0); };
  const SortIcon = ({ field }: { field: SortField }) => { if (sortBy !== field) return <span className="w-3" />; return sortOrder === "desc" ? <ArrowDown size={12} /> : <ArrowUp size={12} />; };

  const catData = useMemo(() => {
    if (!stats) return [];
    const entries = Object.entries(stats.category_distribution as Record<string, number>);
    const top8 = entries.slice(0, 8);
    const other = entries.slice(8).reduce((s, [, v]) => s + (v as number), 0);
    const d = top8.map(([name, value]) => ({ name, value }));
    if (other > 0) d.push({ name: "Other", value: other });
    return d;
  }, [stats]);

  const yearData = useMemo(() => {
    if (!stats) return [];
    return Object.entries(stats.year_distribution as Record<string, number>).sort(([a], [b]) => Number(a) - Number(b)).slice(-12).map(([name, value]) => ({ name, value }));
  }, [stats]);

  // Trend chart data
  const trendChartData = useMemo(() => {
    if (!trendData?.trends) return [];
    const grouped: Record<string, Record<string, number>> = {};
    for (const t of trendData.trends) { if (!grouped[t.period]) grouped[t.period] = {}; grouped[t.period][t.keyword] = t.count; }
    return Object.entries(grouped).sort(([a], [b]) => a.localeCompare(b)).map(([period, vals]) => ({ period, ...vals }));
  }, [trendData]);

  // Prediction: simple linear extrapolation for trends
  const predictionData = useMemo(() => {
    if (!trendChartData.length || !trendData?.top_keywords?.length) return [];
    const lastTwo = trendChartData.slice(-2);
    if (lastTwo.length < 2) return [];
    const lastYear = parseInt(lastTwo[1].period);
    const predictions: any[] = [];
    for (let y = 1; y <= 2; y++) {
      const point: any = { period: String(lastYear + y) };
      for (const kw of trendData.top_keywords) {
        const v1 = (lastTwo[0] as any)[kw] || 0;
        const v2 = (lastTwo[1] as any)[kw] || 0;
        const slope = v2 - v1;
        point[kw] = Math.max(0, Math.round(v2 + slope * y));
      }
      predictions.push(point);
    }
    return [...trendChartData, ...predictions];
  }, [trendChartData, trendData]);

  // Heatmap data transform
  const heatmapGrid = useMemo(() => {
    if (!catHeatmap?.cells) return { rows: [], maxVal: 0 };
    const map: Record<string, Record<string, number>> = {};
    let maxVal = 0;
    for (const c of catHeatmap.cells) {
      if (!map[c.category]) map[c.category] = {};
      map[c.category][c.year] = c.count;
      if (c.count > maxVal) maxVal = c.count;
    }
    return { rows: catHeatmap.categories.map((cat: string) => ({ category: cat, values: catHeatmap.years.map((y: string) => map[cat]?.[y] || 0) })), maxVal };
  }, [catHeatmap]);

  // Correlation matrix
  const corrMatrix = useMemo(() => {
    if (!topicCorrelation?.cells) return { topics: [], matrix: [], maxVal: 0 };
    const { topics, cells } = topicCorrelation;
    const map: Record<string, Record<string, number>> = {};
    let maxVal = 0;
    for (const c of cells) {
      if (!map[c.topic_a]) map[c.topic_a] = {};
      if (!map[c.topic_b]) map[c.topic_b] = {};
      map[c.topic_a][c.topic_b] = c.count;
      map[c.topic_b][c.topic_a] = c.count;
      if (c.count > maxVal) maxVal = c.count;
    }
    return { topics, matrix: topics.map((t: string) => topics.map((t2: string) => t === t2 ? -1 : (map[t]?.[t2] || 0))), maxVal };
  }, [topicCorrelation]);

  // Network node neighbors for highlight
  const neighborMap = useMemo(() => {
    if (!networkData?.edges) return new Map<string, Set<string>>();
    const m = new Map<string, Set<string>>();
    for (const e of networkData.edges) {
      if (!m.has(e.source)) m.set(e.source, new Set());
      if (!m.has(e.target)) m.set(e.target, new Set());
      m.get(e.source)!.add(e.target);
      m.get(e.target)!.add(e.source);
    }
    return m;
  }, [networkData]);

  // Author names for comparison
  const authorNames = useMemo(() => authorData?.top_by_papers?.map((a: any) => a.name) || [], [authorData]);

  const totalPages = Math.ceil(total / pageSize);

  const Pagination = () => total > pageSize ? (
    <div className="flex items-center justify-between">
      <p className="text-[13px] text-muted-foreground">Showing {page * pageSize + 1}-{Math.min((page + 1) * pageSize, total)} of {formatNumber(total)}</p>
      <div className="flex items-center gap-2">
        <button onClick={() => setPage(Math.max(0, page - 1))} disabled={page === 0} className="rounded-xl border border-border px-4 py-2 text-[13px] font-medium text-foreground hover:bg-muted disabled:opacity-40">Previous</button>
        <div className="flex items-center gap-1">
          {Array.from({ length: Math.min(5, totalPages) }, (_, i) => { let pn: number; if (totalPages <= 5) pn = i; else if (page < 3) pn = i; else if (page > totalPages - 4) pn = totalPages - 5 + i; else pn = page - 2 + i;
            return <button key={pn} onClick={() => setPage(pn)} className={`flex h-8 w-8 items-center justify-center rounded-xl text-[13px] font-medium ${page === pn ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}>{pn + 1}</button>;
          })}
        </div>
        <button onClick={() => setPage(page + 1)} disabled={(page + 1) * pageSize >= total} className="rounded-xl border border-border px-4 py-2 text-[13px] font-medium text-foreground hover:bg-muted disabled:opacity-40">Next</button>
      </div>
    </div>
  ) : null;

  const tabs: { id: PageTab; label: string; icon: React.ReactNode }[] = [
    { id: "overview", label: "Overview", icon: <BarChart3 size={14} /> },
    { id: "papers", label: "Papers", icon: <FileText size={14} /> },
    { id: "analytics", label: "Analytics", icon: <Users size={14} /> },
    { id: "networks", label: "Networks", icon: <Share2 size={14} /> },
    { id: "trends", label: "Trends", icon: <Activity size={14} /> },
  ];

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-end justify-between">
        <div><h1 className="text-3xl font-semibold tracking-tighter text-foreground">Papers</h1><p className="mt-2 text-[15px] text-muted-foreground">{formatNumber(total)} papers collected</p></div>
        <div className="flex items-center gap-3">
          <button onClick={() => setShowImport(true)} className="flex items-center gap-2 rounded-xl border border-border px-4 py-2.5 text-[13px] font-medium text-foreground shadow-soft hover:bg-muted dark:shadow-soft-dark"><Upload size={14} />Import</button>
          <button onClick={async () => { setEnriching(true); try { await triggerEnrichCitations(); } catch {} finally { setEnriching(false); } }} disabled={enriching} className="flex items-center gap-2 rounded-xl border border-border px-4 py-2.5 text-[13px] font-medium text-foreground shadow-soft hover:bg-muted disabled:opacity-50 dark:shadow-soft-dark"><Quote size={14} />{enriching ? "Enriching..." : "Enrich Citations"}</button>
          <button onClick={async () => { setCollecting(true); try { await triggerCollectPapers(); } catch {} finally { setCollecting(false); } }} disabled={collecting} className="flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-[13px] font-medium text-primary-foreground shadow-soft hover:opacity-90 disabled:opacity-50 dark:shadow-soft-dark"><Download size={14} />{collecting ? "Collecting..." : "Collect Papers"}</button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 rounded-xl border border-border bg-muted/50 p-1">
        {tabs.map((tab) => (<button key={tab.id} onClick={() => setActiveTab(tab.id)} className={`flex items-center gap-2 rounded-lg px-4 py-2 text-[13px] font-medium transition-all ${activeTab === tab.id ? "bg-card text-foreground shadow-soft dark:shadow-soft-dark" : "text-muted-foreground hover:text-foreground"}`}>{tab.icon}{tab.label}</button>))}
      </div>

      {/* ══ OVERVIEW ══ */}
      {activeTab === "overview" && (
        <div className="space-y-6">
          {stats && <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            {[{ icon: <FileText size={14} />, label: "Total Papers", value: formatNumber(stats.total_papers) },
              { icon: <Quote size={14} />, label: "Total Citations", value: formatNumber(stats.total_citations) },
              { icon: <TrendingUp size={14} />, label: "Avg Citations", value: formatNumber(Math.round(stats.avg_citations)) },
              { icon: <Calendar size={14} />, label: "Recent Papers", value: formatNumber(stats.recent_papers), sub: "last 30 days" },
            ].map((c) => (<Card key={c.label}><div className="flex items-center gap-2 text-muted-foreground">{c.icon}<span className="text-[11px] font-semibold uppercase tracking-widest">{c.label}</span></div><p className="mt-2 text-2xl font-semibold tracking-tight text-foreground">{c.value}</p>{c.sub && <p className="mt-0.5 text-[11px] text-muted-foreground">{c.sub}</p>}</Card>))}
          </div>}
          {stats && <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
            <Card>
              <h3 className="text-[13px] font-semibold text-foreground">Category Distribution</h3>
              {catData.length > 0 ? <div className="mt-4 flex items-center gap-4">
                <div className="h-[220px] w-[220px] shrink-0"><ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={catData} cx="50%" cy="50%" innerRadius={55} outerRadius={85} paddingAngle={2} dataKey="value">{catData.map((_, i) => <Cell key={i} fill={CAT_COLORS[i % CAT_COLORS.length]} />)}</Pie><Tooltip contentStyle={tooltipStyle} formatter={(v: number) => [v, "Papers"]} /></PieChart></ResponsiveContainer></div>
                <div className="flex flex-col gap-1.5 overflow-hidden">{catData.map((item, i) => { const t = catData.reduce((s, d) => s + d.value, 0); return (<div key={item.name} className="flex items-center gap-2 text-[12px]"><span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: CAT_COLORS[i % CAT_COLORS.length] }} /><span className="truncate text-foreground">{item.name}</span><span className="ml-auto tabular-nums text-muted-foreground">{t > 0 ? Math.round((item.value / t) * 100) : 0}%</span></div>); })}</div>
              </div> : <p className="mt-4 text-[12px] text-muted-foreground">No category data</p>}
            </Card>
            <Card>
              <div className="flex items-center gap-2"><Calendar size={14} className="text-muted-foreground" /><h3 className="text-[13px] font-semibold text-foreground">Papers by Year</h3></div>
              {yearData.length > 0 ? <div className="mt-4 h-[280px]"><ResponsiveContainer width="100%" height="100%"><BarChart data={yearData} margin={{ top: 0, right: 20, bottom: 0, left: 0 }}><CartesianGrid strokeDasharray="3 3" vertical={false} /><XAxis dataKey="name" tick={{ fontSize: 11 }} /><YAxis tick={{ fontSize: 11 }} /><Tooltip contentStyle={tooltipStyle} formatter={(v: number) => [v, "Papers"]} /><Bar dataKey="value" radius={[6, 6, 0, 0]}>{yearData.map((_, i) => <Cell key={i} fill={YEAR_COLORS[i % YEAR_COLORS.length]} />)}</Bar></BarChart></ResponsiveContainer></div> : <p className="mt-4 text-[12px] text-muted-foreground">No year data</p>}
            </Card>
          </div>}
          <Card><CategoryFilter categories={knownCategories} activeCategories={categories} onToggle={toggleCategory} onClear={clearCategories} /></Card>
        </div>
      )}

      {/* ══ PAPERS ══ */}
      {activeTab === "papers" && (
        <div className="space-y-6">
          <div className="flex items-center gap-3 rounded-2xl border border-border bg-card p-2 shadow-soft focus-within:border-primary/40 focus-within:ring-2 focus-within:ring-primary/10 dark:shadow-soft-dark">
            <Search size={16} className="ml-3 shrink-0 text-muted-foreground" />
            <input type="text" placeholder="Search papers by title, abstract, or arxiv ID..." value={searchInput} onChange={(e) => { setSearchInput(e.target.value); setPage(0); }} className="flex-1 bg-transparent py-2 text-[14px] text-foreground placeholder:text-muted-foreground/50 outline-none" />
            {searchInput && <button onClick={() => { setSearchInput(""); setSearchQuery(""); setPage(0); }} className="rounded-xl px-3 py-1.5 text-[12px] font-medium text-muted-foreground hover:bg-muted hover:text-foreground">Clear</button>}
          </div>
          <Card><CategoryFilter categories={knownCategories} activeCategories={categories} onToggle={toggleCategory} onClear={clearCategories} /></Card>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1 rounded-xl border border-border p-1">
                <button onClick={() => setViewMode("grid")} className={`flex h-8 w-8 items-center justify-center rounded-lg ${viewMode === "grid" ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground"}`}><LayoutGrid size={15} /></button>
                <button onClick={() => setViewMode("table")} className={`flex h-8 w-8 items-center justify-center rounded-lg ${viewMode === "table" ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground"}`}><List size={15} /></button>
              </div>
              {/* Export button (#11) */}
              {papers.length > 0 && <button onClick={() => exportPapersCSV(papers)} className="flex items-center gap-1.5 rounded-xl border border-border px-3 py-2 text-[12px] font-medium text-muted-foreground hover:bg-muted hover:text-foreground"><Download size={13} />Export CSV</button>}
            </div>
            <span className="text-[12px] text-muted-foreground">Sorted by <span className="font-medium text-foreground">{sortBy.replace(/_/g, " ")}</span> ({sortOrder})</span>
          </div>
          <Pagination />
          {loading && <LoadingSpinner />}
          {!loading && viewMode === "grid" && (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
              {papers.length === 0 && <p className="col-span-full text-center text-sm text-muted-foreground py-12">No papers found.</p>}
              {papers.map((p: any) => (
                <Link key={p.id} href={`/papers/${p.id}`} className="group rounded-2xl border border-border bg-card p-5 shadow-soft transition-all duration-200 hover:shadow-soft-lg hover:border-primary/20 dark:shadow-soft-dark dark:hover:shadow-soft-dark-lg">
                  <div className="flex items-start justify-between"><h3 className="text-[14px] font-semibold tracking-tight text-foreground group-hover:text-primary line-clamp-2">{p.title}</h3><ExternalLink size={13} className="mt-0.5 shrink-0 text-muted-foreground/40 group-hover:text-primary" /></div>
                  {p.abstract && <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground line-clamp-2">{p.abstract}</p>}
                  <div className="mt-4 flex items-center gap-3 text-[12px]">{p.published_date && <span className="text-muted-foreground">{formatDate(p.published_date)}</span>}{p.citation_count > 0 && <span className="flex items-center gap-1 font-medium text-amber-500 dark:text-amber-400"><Quote size={11} /> {formatNumber(p.citation_count)}</span>}{p.arxiv_id && <span className="rounded-lg bg-muted px-2 py-0.5 font-medium text-foreground">{p.arxiv_id}</span>}</div>
                  {p.categories?.length > 0 && <div className="mt-3 flex flex-wrap gap-1.5">{p.categories.slice(0, 4).map((c: string) => <span key={c} className="rounded-lg bg-[hsl(var(--accent)/0.08)] px-2 py-0.5 text-[10px] font-medium text-[hsl(var(--accent))]">{c}</span>)}{p.categories.length > 4 && <span className="px-1 text-[10px] text-muted-foreground">+{p.categories.length - 4}</span>}</div>}
                </Link>
              ))}
            </div>
          )}
          {!loading && viewMode === "table" && (
            <div className="overflow-hidden rounded-2xl border border-border shadow-soft dark:shadow-soft-dark">
              <table className="w-full text-[13px]">
                <thead><tr className="border-b border-border bg-muted/50">
                  <th className="px-5 py-3.5 text-left text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">Paper</th>
                  <th className="px-5 py-3.5 text-left text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">Source</th>
                  <th className="cursor-pointer px-5 py-3.5 text-right text-[11px] font-semibold uppercase tracking-widest text-muted-foreground select-none" onClick={() => handleSort("citation_count")}><span className="inline-flex items-center gap-1"><Quote size={11} /> Citations <SortIcon field="citation_count" /></span></th>
                  <th className="cursor-pointer px-5 py-3.5 text-right text-[11px] font-semibold uppercase tracking-widest text-muted-foreground select-none" onClick={() => handleSort("published_date")}><span className="inline-flex items-center gap-1"><Calendar size={11} /> Published <SortIcon field="published_date" /></span></th>
                  <th className="px-5 py-3.5 text-center text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">Categories</th>
                </tr></thead>
                <tbody className="divide-y divide-border">
                  {papers.length === 0 && <tr><td colSpan={5} className="px-5 py-12 text-center text-sm text-muted-foreground">No papers found.</td></tr>}
                  {papers.map((p: any) => (
                    <tr key={p.id} className="hover:bg-muted/30 transition-colors">
                      <td className="px-5 py-4"><Link href={`/papers/${p.id}`} className="block"><span className="font-medium text-foreground hover:text-primary line-clamp-2">{p.title}</span>{p.abstract && <p className="mt-0.5 text-[12px] text-muted-foreground line-clamp-1 max-w-lg">{p.abstract}</p>}</Link></td>
                      <td className="px-5 py-4">{p.arxiv_id ? <span className="rounded-lg bg-blue-500/10 px-2 py-1 text-[11px] font-medium text-blue-600 dark:text-blue-400">arxiv:{p.arxiv_id}</span> : <span className="rounded-lg bg-muted px-2 py-1 text-[11px] font-medium text-foreground">{p.source}</span>}</td>
                      <td className="px-5 py-4 text-right font-medium tabular-nums text-amber-500 dark:text-amber-400">{p.citation_count > 0 ? formatNumber(p.citation_count) : "-"}</td>
                      <td className="px-5 py-4 text-right text-[12px] text-muted-foreground">{p.published_date ? new Date(p.published_date).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" }) : "-"}</td>
                      <td className="px-5 py-4"><div className="flex flex-wrap items-center justify-center gap-1">{p.categories?.slice(0, 3).map((c: string) => <span key={c} className="rounded-lg bg-[hsl(var(--accent)/0.08)] px-1.5 py-0.5 text-[10px] font-medium text-[hsl(var(--accent))]">{c}</span>)}{p.categories?.length > 3 && <span className="text-[10px] text-muted-foreground">+{p.categories.length - 3}</span>}</div></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <Pagination />
        </div>
      )}

      {/* ══ ANALYTICS ══ */}
      {activeTab === "analytics" && (
        <div className="space-y-6">
          {analyticsLoading && <LoadingSpinner />}
          {!analyticsLoading && !authorData && <EmptyState message="No analytics data available." />}
          {!analyticsLoading && authorData && (<>
            {/* Top Authors + Affiliation */}
            <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
              <Card>
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2"><Users size={14} className="text-muted-foreground" /><h3 className="text-[13px] font-semibold text-foreground">Top Authors by Papers</h3></div>
                  <button onClick={() => setShowCompare(true)} className="flex items-center gap-1 text-[11px] font-medium text-primary hover:opacity-80"><GitCompare size={12} />Compare</button>
                </div>
                {authorData.top_by_papers?.length > 0 ? <div className="h-[350px]"><ResponsiveContainer width="100%" height="100%"><BarChart data={authorData.top_by_papers.slice(0, 10).map((a: any) => ({ name: a.name.length > 20 ? a.name.slice(0, 20) + "..." : a.name, papers: a.paper_count }))} layout="vertical" margin={{ top: 0, right: 20, bottom: 0, left: 100 }}><CartesianGrid strokeDasharray="3 3" horizontal={false} /><XAxis type="number" tick={{ fontSize: 11 }} /><YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={95} /><Tooltip contentStyle={tooltipStyle} /><Bar dataKey="papers" fill="#3b82f6" radius={[0, 6, 6, 0]} /></BarChart></ResponsiveContainer></div> : <p className="text-[12px] text-muted-foreground">No data</p>}
              </Card>
              <Card>
                <h3 className="text-[13px] font-semibold text-foreground mb-4">Affiliation Distribution</h3>
                {Object.keys(authorData.affiliation_distribution || {}).length > 0 ? <div className="flex items-center gap-4">
                  <div className="h-[220px] w-[220px] shrink-0"><ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={Object.entries(authorData.affiliation_distribution).slice(0, 8).map(([n, v]) => ({ name: (n as string).length > 25 ? (n as string).slice(0, 25) + "..." : n, value: v }))} cx="50%" cy="50%" innerRadius={55} outerRadius={85} paddingAngle={2} dataKey="value">{Object.entries(authorData.affiliation_distribution).slice(0, 8).map((_, i) => <Cell key={i} fill={CAT_COLORS[i % CAT_COLORS.length]} />)}</Pie><Tooltip contentStyle={tooltipStyle} /></PieChart></ResponsiveContainer></div>
                  <div className="flex flex-col gap-1.5 overflow-hidden">{Object.entries(authorData.affiliation_distribution).slice(0, 8).map(([n, v], i) => <div key={n} className="flex items-center gap-2 text-[12px]"><span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: CAT_COLORS[i % CAT_COLORS.length] }} /><span className="truncate text-foreground">{n}</span><span className="ml-auto tabular-nums text-muted-foreground">{v as number}</span></div>)}</div>
                </div> : <p className="text-[12px] text-muted-foreground">No affiliation data</p>}
              </Card>
            </div>

            {/* Citation Timeline (#5) */}
            {citTimeline && citTimeline.data?.length > 0 && (
              <Card>
                <div className="flex items-center gap-2 mb-4"><TrendingUp size={14} className="text-muted-foreground" /><h3 className="text-[13px] font-semibold text-foreground">Citation Timeline - Top Authors</h3></div>
                <div className="h-[350px]"><ResponsiveContainer width="100%" height="100%"><LineChart data={(() => { const g: Record<string, any> = {}; for (const d of citTimeline.data) { if (!g[d.year]) g[d.year] = { year: d.year }; g[d.year][d.author] = d.citations; } return Object.values(g).sort((a: any, b: any) => a.year.localeCompare(b.year)); })()} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="year" tick={{ fontSize: 11 }} /><YAxis tick={{ fontSize: 11 }} /><Tooltip contentStyle={tooltipStyle} /><Legend wrapperStyle={{ fontSize: "10px" }} />{citTimeline.authors.slice(0, 8).map((a: string, i: number) => <Line key={a} type="monotone" dataKey={a} stroke={LINE_COLORS[i % LINE_COLORS.length]} strokeWidth={2} dot={{ r: 2 }} />)}</LineChart></ResponsiveContainer></div>
              </Card>
            )}

            {/* Category Heatmap (#7) */}
            {catHeatmap && heatmapGrid.rows.length > 0 && (
              <Card>
                <div className="flex items-center gap-2 mb-4"><BarChart3 size={14} className="text-muted-foreground" /><h3 className="text-[13px] font-semibold text-foreground">Category x Year Heatmap</h3></div>
                <div className="overflow-x-auto">
                  <table className="text-[11px]">
                    <thead><tr><th className="px-2 py-1 text-left text-muted-foreground font-medium">Category</th>{catHeatmap.years.map((y: string) => <th key={y} className="px-2 py-1 text-center text-muted-foreground font-medium">{y}</th>)}</tr></thead>
                    <tbody>{heatmapGrid.rows.map((row: any) => (
                      <tr key={row.category}><td className="px-2 py-1 font-medium text-foreground whitespace-nowrap">{row.category.length > 20 ? row.category.slice(0, 20) + "..." : row.category}</td>
                        {row.values.map((v: number, i: number) => { const intensity = heatmapGrid.maxVal > 0 ? v / heatmapGrid.maxVal : 0; return <td key={i} className="px-2 py-1 text-center"><div className="mx-auto flex h-7 w-10 items-center justify-center rounded-md text-[10px] font-medium" style={{ backgroundColor: `rgba(59, 130, 246, ${intensity * 0.8})`, color: intensity > 0.4 ? "white" : "inherit" }}>{v > 0 ? v : ""}</div></td>; })}
                      </tr>
                    ))}</tbody>
                  </table>
                </div>
              </Card>
            )}

            {/* Keyword Cloud */}
            {keywordData?.keywords?.length > 0 && (
              <Card>
                <div className="flex items-center gap-2 mb-4"><Tag size={14} className="text-muted-foreground" /><h3 className="text-[13px] font-semibold text-foreground">Keyword Cloud</h3></div>
                <div className="flex flex-wrap gap-2">{keywordData.keywords.map((kw: any, i: number) => { const mx = keywordData.keywords[0]?.count || 1; const r = kw.count / mx; return <span key={kw.keyword} className="rounded-lg px-2.5 py-1 font-medium hover:opacity-80" style={{ fontSize: `${11 + Math.round(r * 10)}px`, backgroundColor: `${LINE_COLORS[i % LINE_COLORS.length]}18`, color: LINE_COLORS[i % LINE_COLORS.length], opacity: 0.5 + r * 0.5 }}>{kw.keyword}<span className="ml-1 text-[10px] opacity-60">{kw.count}</span></span>; })}</div>
              </Card>
            )}

            {/* Topic Distribution */}
            {keywordData?.topics?.length > 0 && (
              <Card>
                <div className="flex items-center gap-2 mb-4"><BarChart3 size={14} className="text-muted-foreground" /><h3 className="text-[13px] font-semibold text-foreground">Topic Distribution</h3></div>
                <div className="h-[300px]"><ResponsiveContainer width="100%" height="100%"><BarChart data={keywordData.topics.slice(0, 15).map((t: any) => ({ name: t.keyword.length > 20 ? t.keyword.slice(0, 20) + "..." : t.keyword, count: t.count }))} margin={{ top: 0, right: 20, bottom: 0, left: 0 }}><CartesianGrid strokeDasharray="3 3" vertical={false} /><XAxis dataKey="name" tick={{ fontSize: 10 }} angle={-30} textAnchor="end" height={60} /><YAxis tick={{ fontSize: 11 }} /><Tooltip contentStyle={tooltipStyle} /><Bar dataKey="count" radius={[6, 6, 0, 0]}>{keywordData.topics.slice(0, 15).map((_: any, i: number) => <Cell key={i} fill={CAT_COLORS[i % CAT_COLORS.length]} />)}</Bar></BarChart></ResponsiveContainer></div>
              </Card>
            )}

            {/* Institution Ranking (#13) */}
            {institutions?.institutions?.length > 0 && (
              <Card>
                <div className="flex items-center gap-2 mb-4"><Building2 size={14} className="text-muted-foreground" /><h3 className="text-[13px] font-semibold text-foreground">Institution Ranking</h3></div>
                <div className="overflow-hidden rounded-xl border border-border">
                  <table className="w-full text-[13px]">
                    <thead><tr className="border-b border-border bg-muted/50">
                      <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">#</th>
                      <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">Institution</th>
                      <th className="px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">Papers</th>
                      <th className="px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">Citations</th>
                      <th className="px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">Avg Cit.</th>
                      <th className="px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">Authors</th>
                    </tr></thead>
                    <tbody className="divide-y divide-border">{institutions.institutions.slice(0, 20).map((inst: any, i: number) => (
                      <tr key={inst.name} className="hover:bg-muted/30"><td className="px-4 py-2.5 text-muted-foreground">{i + 1}</td><td className="px-4 py-2.5 font-medium text-foreground max-w-xs truncate">{inst.name}</td><td className="px-4 py-2.5 text-right tabular-nums">{formatNumber(inst.paper_count)}</td><td className="px-4 py-2.5 text-right tabular-nums text-amber-500">{formatNumber(inst.total_citations)}</td><td className="px-4 py-2.5 text-right tabular-nums text-muted-foreground">{inst.avg_citations}</td><td className="px-4 py-2.5 text-right tabular-nums text-muted-foreground">{inst.author_count}</td></tr>
                    ))}</tbody>
                  </table>
                </div>
              </Card>
            )}

            {/* Research Landscape (#12) */}
            {landscape?.points?.length > 0 && (
              <Card>
                <div className="flex items-center gap-2 mb-4"><Compass size={14} className="text-muted-foreground" /><h3 className="text-[13px] font-semibold text-foreground">Research Landscape</h3><span className="text-[11px] text-muted-foreground">(X: avg year, Y: avg citations, size: paper count)</span></div>
                <div className="h-[400px]"><ResponsiveContainer width="100%" height="100%">
                  <ScatterChart margin={{ top: 10, right: 20, bottom: 10, left: 10 }}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="avg_year" type="number" domain={["auto", "auto"]} tick={{ fontSize: 11 }} name="Avg Year" />
                    <YAxis dataKey="avg_citations" type="number" tick={{ fontSize: 11 }} name="Avg Citations" />
                    <ZAxis dataKey="paper_count" range={[40, 400]} name="Papers" />
                    <Tooltip contentStyle={tooltipStyle} formatter={(v: any, name: string) => [typeof v === "number" ? v.toFixed(1) : v, name]} labelFormatter={() => ""} content={({ payload }) => { if (!payload?.[0]) return null; const d = payload[0].payload; return <div className="rounded-lg border border-border bg-card p-2 text-[12px] shadow-lg"><p className="font-semibold text-foreground">{d.topic}</p><p className="text-muted-foreground">Papers: {d.paper_count}</p><p className="text-muted-foreground">Avg Citations: {d.avg_citations}</p><p className="text-muted-foreground">Avg Year: {d.avg_year}</p></div>; }} />
                    <Scatter data={landscape.points} fill="#3b82f6" fillOpacity={0.6} />
                  </ScatterChart>
                </ResponsiveContainer></div>
              </Card>
            )}
          </>)}
          <AuthorCompareModal open={showCompare} onClose={() => setShowCompare(false)} authorList={authorNames} />
        </div>
      )}

      {/* ══ NETWORKS ══ */}
      {activeTab === "networks" && (
        <div className="space-y-6">
          <Card className="!p-4">
            <div className="flex flex-wrap items-center gap-4">
              {/* Mode switch (#4) */}
              <div className="flex items-center gap-1 rounded-xl border border-border p-1">
                <button onClick={() => { setNetworkMode("coauthor"); setHighlightNode(null); }} className={`rounded-lg px-3 py-1.5 text-[12px] font-medium ${networkMode === "coauthor" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}>Co-authorship</button>
                <button onClick={() => { setNetworkMode("topic"); setHighlightNode(null); }} className={`rounded-lg px-3 py-1.5 text-[12px] font-medium ${networkMode === "topic" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}>Topic Co-occurrence</button>
              </div>
              <div className="flex items-center gap-2">
                <label className="text-[12px] font-medium text-muted-foreground">{networkMode === "coauthor" ? "Min Collabs:" : "Min Co-occurrence:"}</label>
                <input type="range" min={1} max={10} value={minCollabs} onChange={(e) => setMinCollabs(Number(e.target.value))} className="w-24 accent-primary" />
                <span className="text-[12px] font-semibold text-foreground w-4">{minCollabs}</span>
              </div>
              <div className="flex items-center gap-2"><label className="text-[12px] font-medium text-muted-foreground">Max Edges:</label>
                <select value={networkLimit} onChange={(e) => setNetworkLimit(Number(e.target.value))} className="rounded-lg border border-border bg-background px-2 py-1 text-[12px] text-foreground outline-none"><option value={50}>50</option><option value={100}>100</option><option value={200}>200</option><option value={500}>500</option></select>
              </div>
              {/* Search in graph (#3) */}
              <div className="flex items-center gap-2 rounded-xl border border-border bg-background px-2 py-1">
                <Search size={12} className="text-muted-foreground" />
                <input type="text" placeholder="Search node..." value={networkSearch} onChange={(e) => {
                  setNetworkSearch(e.target.value);
                  if (e.target.value && networkData?.nodes) {
                    const found = networkData.nodes.find((n: any) => n.label.toLowerCase().includes(e.target.value.toLowerCase()));
                    if (found) { setHighlightNode(found.id); graphRef.current?.centerAt?.(0, 0, 500); }
                  } else setHighlightNode(null);
                }} className="w-32 bg-transparent text-[12px] text-foreground placeholder:text-muted-foreground/40 outline-none" />
              </div>
              <button onClick={loadNetwork} disabled={networkLoading} className="flex items-center gap-1 rounded-xl bg-primary px-3 py-1.5 text-[12px] font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50">{networkLoading ? <Loader2 size={12} className="animate-spin" /> : <Share2 size={12} />}Refresh</button>
            </div>
          </Card>
          {networkLoading && <LoadingSpinner />}
          {!networkLoading && (!networkData || networkData.nodes?.length === 0) && <EmptyState message={`No ${networkMode === "coauthor" ? "co-authorship" : "topic co-occurrence"} data found. Try lowering the threshold.`} />}
          {!networkLoading && networkData && networkData.nodes?.length > 0 && (<>
            <div className="rounded-2xl border border-border bg-card shadow-soft dark:shadow-soft-dark overflow-hidden" style={{ height: 500 }}>
              <ForceGraph2D
                ref={graphRef}
                graphData={{
                  nodes: networkData.nodes.map((n: any) => ({ id: n.id, label: n.label, val: n.paper_count, affiliation: n.affiliation })),
                  links: networkData.edges.map((e: any) => ({ source: e.source, target: e.target, value: e.weight })),
                }}
                nodeLabel={(node: any) => `${node.label}${node.affiliation ? ` (${node.affiliation})` : ""} - ${node.val} ${networkMode === "coauthor" ? "collabs" : "co-occurrences"}`}
                nodeRelSize={1}
                linkWidth={(link: any) => Math.min(0.5 + link.value * 0.3, 3)}
                linkColor={(link: any) => {
                  if (!highlightNode) return "rgba(156, 163, 175, 0.15)";
                  const src = typeof link.source === "object" ? link.source.id : link.source;
                  const tgt = typeof link.target === "object" ? link.target.id : link.target;
                  return (src === highlightNode || tgt === highlightNode) ? "rgba(59, 130, 246, 0.5)" : "rgba(156, 163, 175, 0.05)";
                }}
                d3AlphaDecay={0.03} d3VelocityDecay={0.3} cooldownTicks={200}
                onNodeClick={(node: any) => setHighlightNode(highlightNode === node.id ? null : node.id)}
                nodeCanvasObject={(node: any, ctx: CanvasRenderingContext2D, globalScale: number) => {
                  const isHighlighted = highlightNode === node.id;
                  const isNeighbor = highlightNode ? neighborMap.get(highlightNode)?.has(node.id) : false;
                  const isDimmed = highlightNode && !isHighlighted && !isNeighbor;
                  const r = Math.max(1.5, Math.sqrt(node.val || 1) * 1.2);
                  // (#1) Color by affiliation hash
                  let color = "#3b82f6";
                  if (networkMode === "coauthor" && node.affiliation) {
                    let hash = 0; for (let i = 0; i < node.affiliation.length; i++) hash = node.affiliation.charCodeAt(i) + ((hash << 5) - hash);
                    color = CAT_COLORS[Math.abs(hash) % CAT_COLORS.length];
                  }
                  if (networkMode === "topic") { let hash = 0; for (let i = 0; i < node.label.length; i++) hash = node.label.charCodeAt(i) + ((hash << 5) - hash); color = LINE_COLORS[Math.abs(hash) % LINE_COLORS.length]; }
                  ctx.beginPath(); ctx.arc(node.x, node.y, isHighlighted ? r * 1.8 : r, 0, 2 * Math.PI);
                  ctx.fillStyle = isDimmed ? `${color}30` : isHighlighted ? color : `${color}cc`;
                  ctx.fill();
                  if (isHighlighted) { ctx.strokeStyle = color; ctx.lineWidth = 1; ctx.stroke(); }
                  if (globalScale > 1.2 || isHighlighted) {
                    const fontSize = isHighlighted ? Math.max(12 / globalScale, 3) : Math.max(8 / globalScale, 1.5);
                    ctx.font = `${isHighlighted ? "bold " : ""}${fontSize}px -apple-system, sans-serif`;
                    ctx.textAlign = "center"; ctx.textBaseline = "top";
                    ctx.fillStyle = isDimmed ? "rgba(107,114,128,0.2)" : "rgba(107,114,128,0.8)";
                    const lbl = node.label.length > 18 ? node.label.slice(0, 18) + ".." : node.label;
                    ctx.fillText(lbl, node.x, node.y + (isHighlighted ? r * 1.8 : r) + 1);
                  }
                }}
                nodePointerAreaPaint={(node: any, color: string, ctx: CanvasRenderingContext2D) => { const r = Math.max(3, Math.sqrt(node.val || 1) * 1.5); ctx.beginPath(); ctx.arc(node.x, node.y, r, 0, 2 * Math.PI); ctx.fillStyle = color; ctx.fill(); }}
                width={typeof window !== "undefined" ? Math.min(window.innerWidth - 80, 1200) : 800}
                height={500}
              />
            </div>
            {highlightNode && <Card className="!p-3"><p className="text-[12px] text-foreground"><span className="font-semibold">{highlightNode}</span> — {neighborMap.get(highlightNode)?.size || 0} connections. <button onClick={() => setHighlightNode(null)} className="text-primary hover:underline ml-1">Clear</button></p></Card>}
            <div className="overflow-hidden rounded-2xl border border-border shadow-soft dark:shadow-soft-dark">
              <table className="w-full text-[13px]"><thead><tr className="border-b border-border bg-muted/50">
                <th className="px-5 py-3 text-left text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">{networkMode === "coauthor" ? "Author A" : "Topic A"}</th>
                <th className="px-5 py-3 text-left text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">{networkMode === "coauthor" ? "Author B" : "Topic B"}</th>
                <th className="px-5 py-3 text-right text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">{networkMode === "coauthor" ? "Co-authored" : "Co-occurrence"}</th>
              </tr></thead>
              <tbody className="divide-y divide-border">{networkData.edges.slice(0, 20).map((e: any, i: number) => (<tr key={i} className="hover:bg-muted/30"><td className="px-5 py-3 text-foreground">{e.source}</td><td className="px-5 py-3 text-foreground">{e.target}</td><td className="px-5 py-3 text-right font-medium tabular-nums text-primary">{e.weight}</td></tr>))}</tbody></table>
              {networkData.edges.length > 20 && <div className="border-t border-border px-5 py-2 text-center text-[11px] text-muted-foreground">Showing top 20 of {networkData.edges.length} edges</div>}
            </div>
          </>)}
        </div>
      )}

      {/* ══ TRENDS ══ */}
      {activeTab === "trends" && (
        <div className="space-y-6">
          {trendsLoading && <LoadingSpinner />}
          {!trendsLoading && (!trendData || trendData.top_keywords?.length === 0) && <EmptyState message="No trend data available." />}
          {!trendsLoading && trendData && trendData.top_keywords?.length > 0 && (<>
            {/* Keyword Trends with Prediction (#9) */}
            <Card>
              <div className="flex items-center gap-2 mb-4"><Activity size={14} className="text-muted-foreground" /><h3 className="text-[13px] font-semibold text-foreground">Keyword Trends Over Time</h3><span className="text-[11px] text-muted-foreground">(dashed = predicted)</span></div>
              <div className="h-[400px]"><ResponsiveContainer width="100%" height="100%"><LineChart data={predictionData.length > 0 ? predictionData : trendChartData} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="period" tick={{ fontSize: 11 }} /><YAxis tick={{ fontSize: 11 }} /><Tooltip contentStyle={tooltipStyle} /><Legend wrapperStyle={{ fontSize: "11px" }} />
                {trendData.top_keywords.map((kw: string, i: number) => <Line key={kw} type="monotone" dataKey={kw} stroke={LINE_COLORS[i % LINE_COLORS.length]} strokeWidth={2} dot={{ r: 3 }} activeDot={{ r: 5 }} strokeDasharray={predictionData.length > trendChartData.length ? undefined : undefined} />)}
              </LineChart></ResponsiveContainer></div>
            </Card>

            {/* Emerging Keywords */}
            {trendData.emerging?.length > 0 && (
              <Card>
                <div className="flex items-center gap-2 mb-4"><TrendingUp size={14} className="text-muted-foreground" /><h3 className="text-[13px] font-semibold text-foreground">Emerging Keywords</h3><span className="text-[11px] text-muted-foreground ml-1">(recent 2y vs previous 2y)</span></div>
                <div className="overflow-hidden rounded-xl border border-border"><table className="w-full text-[13px]"><thead><tr className="border-b border-border bg-muted/50">
                  <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">Keyword</th>
                  <th className="px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">Recent</th>
                  <th className="px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">Previous</th>
                  <th className="px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">Growth</th>
                </tr></thead><tbody className="divide-y divide-border">{trendData.emerging.slice(0, 20).map((item: any) => (
                  <tr key={item.keyword} className="hover:bg-muted/30"><td className="px-4 py-3 font-medium text-foreground">{item.keyword}</td><td className="px-4 py-3 text-right tabular-nums">{item.recent_count}</td><td className="px-4 py-3 text-right tabular-nums text-muted-foreground">{item.previous_count}</td><td className="px-4 py-3 text-right"><span className="inline-flex items-center gap-1 font-medium tabular-nums text-green-600 dark:text-green-400"><ArrowUpRight size={12} />{item.growth_rate > 999 ? "999+" : item.growth_rate.toFixed(0)}%</span></td></tr>
                ))}</tbody></table></div>
              </Card>
            )}

            {/* Topic Correlation Matrix (#8) */}
            {corrMatrix.topics.length > 0 && (
              <Card>
                <div className="flex items-center gap-2 mb-4"><Share2 size={14} className="text-muted-foreground" /><h3 className="text-[13px] font-semibold text-foreground">Topic Correlation Matrix</h3></div>
                <div className="overflow-x-auto">
                  <table className="text-[10px]">
                    <thead><tr><th className="p-1" /></tr></thead>
                    <tbody>
                      <tr><td />{corrMatrix.topics.map((t: string) => <td key={t} className="p-1 text-center text-muted-foreground font-medium" style={{ writingMode: "vertical-lr", maxHeight: 80 }}>{t.length > 15 ? t.slice(0, 15) + ".." : t}</td>)}</tr>
                      {corrMatrix.topics.map((t: string, ri: number) => (
                        <tr key={t}><td className="p-1 text-right text-muted-foreground font-medium whitespace-nowrap pr-2">{t.length > 15 ? t.slice(0, 15) + ".." : t}</td>
                          {corrMatrix.matrix[ri]?.map((v: number, ci: number) => {
                            if (v === -1) return <td key={ci} className="p-1"><div className="w-6 h-6 mx-auto rounded bg-muted" /></td>;
                            const intensity = corrMatrix.maxVal > 0 ? v / corrMatrix.maxVal : 0;
                            return <td key={ci} className="p-1"><div className="w-6 h-6 mx-auto rounded flex items-center justify-center text-[8px]" style={{ backgroundColor: v > 0 ? `rgba(139, 92, 246, ${intensity * 0.8})` : "transparent", color: intensity > 0.4 ? "white" : "inherit" }}>{v > 0 ? v : ""}</div></td>;
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
            )}
          </>)}
        </div>
      )}

      <ImportModal open={showImport} onClose={() => setShowImport(false)} />
    </div>
  );
}
