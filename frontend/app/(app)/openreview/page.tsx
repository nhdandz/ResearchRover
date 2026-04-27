"use client";

import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import {
  Search, X, ChevronLeft, ChevronRight, ExternalLink, Download,
  Star, FileText, BarChart3, TrendingUp, Tag, Award, BookOpen,
  Link2, CheckCircle, Layers,
} from "lucide-react";
import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
} from "recharts";
import {
  fetchOpenReviewNotes, fetchOpenReviewFilters, fetchOpenReviewStats,
  fetchOpenReviewKeywords, triggerCollectOpenReview,
} from "@/lib/api";
import { formatNumber } from "@/lib/utils";

const PAGE_SIZE = 20;
const CHART_COLORS = [
  "#3b82f6","#f59e0b","#10b981","#ef4444",
  "#8b5cf6","#ec4899","#06b6d4","#f97316","#a855f7","#14b8a6",
];
const tooltipStyle = {
  backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))",
  borderRadius: "12px", fontSize: "12px", color: "hsl(var(--foreground))",
};

type Tab = "overview" | "papers" | "venues" | "areas";

function ratingColor(r: number | null | undefined) {
  if (r == null) return "text-muted-foreground";
  if (r >= 7) return "text-green-500 dark:text-green-400";
  if (r >= 5) return "text-amber-500 dark:text-amber-400";
  return "text-red-500 dark:text-red-400";
}

const LoadingSpinner = () => (
  <div className="flex items-center justify-center py-16">
    <div className="h-6 w-6 animate-spin rounded-full border-2 border-muted border-t-primary" />
  </div>
);

const Card = ({ children, className = "" }: { children: React.ReactNode; className?: string }) => (
  <div className={`rounded-2xl border border-border bg-card p-5 shadow-soft dark:shadow-soft-dark ${className}`}>{children}</div>
);

function Pagination({ currentPage, totalPages, onPageChange }: {
  currentPage: number; totalPages: number; onPageChange: (page: number) => void;
}) {
  const getPageNumbers = () => {
    const pages: (number | "...")[] = [];
    if (totalPages <= 7) { for (let i = 0; i < totalPages; i++) pages.push(i); return pages; }
    pages.push(0);
    if (currentPage > 2) pages.push("...");
    for (let i = Math.max(1, currentPage - 1); i <= Math.min(totalPages - 2, currentPage + 1); i++) pages.push(i);
    if (currentPage < totalPages - 3) pages.push("...");
    pages.push(totalPages - 1);
    return pages;
  };
  return (
    <div className="flex items-center justify-between border-t border-border pt-4">
      <span className="text-[13px] text-muted-foreground">Page {currentPage + 1} of {totalPages}</span>
      <div className="flex items-center gap-1">
        <button onClick={() => onPageChange(currentPage - 1)} disabled={currentPage === 0}
          className="rounded-xl border border-border px-3 py-2 text-foreground hover:bg-muted disabled:opacity-40"><ChevronLeft size={14} /></button>
        {getPageNumbers().map((p, i) =>
          p === "..." ? (
            <span key={`e-${i}`} className="px-2 text-[12px] text-muted-foreground/60">...</span>
          ) : (
            <button key={p} onClick={() => onPageChange(p as number)}
              className={`flex h-8 w-8 items-center justify-center rounded-xl text-[13px] font-medium ${currentPage === p ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}>{(p as number) + 1}</button>
          )
        )}
        <button onClick={() => onPageChange(currentPage + 1)} disabled={currentPage >= totalPages - 1}
          className="rounded-xl border border-border px-3 py-2 text-foreground hover:bg-muted disabled:opacity-40"><ChevronRight size={14} /></button>
      </div>
    </div>
  );
}

function Pill({ active, onClick, children }: {
  active: boolean; onClick: () => void; children: React.ReactNode;
}) {
  return (
    <button onClick={onClick}
      className={`rounded-xl px-3 py-1.5 text-[12px] font-medium transition-all duration-150 ${
        active
          ? "bg-primary/12 text-primary ring-1 ring-primary/20"
          : "bg-muted text-muted-foreground hover:bg-muted/80 hover:text-foreground"
      }`}>
      {children}
    </button>
  );
}

export default function OpenReviewPage() {
  const [activeTab, setActiveTab] = useState<Tab>("overview");

  // Overview data
  const [stats, setStats] = useState<any>(null);
  const [keywords, setKeywords] = useState<any[]>([]);
  const [venues, setVenues] = useState<string[]>([]);
  const [primaryAreas, setPrimaryAreas] = useState<string[]>([]);
  const [topPapers, setTopPapers] = useState<any[]>([]);
  const [overviewLoading, setOverviewLoading] = useState(true);
  const [collecting, setCollecting] = useState(false);

  // Papers tab
  const [papers, setPapers] = useState<any[]>([]);
  const [papersTotal, setPapersTotal] = useState(0);
  const [papersPage, setPapersPage] = useState(0);
  const [papersLoading, setPapersLoading] = useState(false);
  const [selectedVenue, setSelectedVenue] = useState<string | null>(null);
  const [selectedArea, setSelectedArea] = useState<string | null>(null);
  const [searchInput, setSearchInput] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState("published_at");
  const [minRating, setMinRating] = useState<string>("");
  const debounceRef = useRef<NodeJS.Timeout>();

  // Search debounce
  useEffect(() => {
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setSearchQuery(searchInput), 400);
    return () => clearTimeout(debounceRef.current);
  }, [searchInput]);

  // Initial load
  useEffect(() => {
    setOverviewLoading(true);
    Promise.all([
      fetchOpenReviewStats().catch(() => null),
      fetchOpenReviewKeywords({ limit: 20 }).catch(() => []),
      fetchOpenReviewFilters().catch(() => ({ venues: [], primary_areas: [] })),
      fetchOpenReviewNotes({ limit: 10, sort: "average_rating", sort_order: "desc" }).catch(() => ({ items: [] })),
    ]).then(([s, k, f, top]) => {
      setStats(s);
      setKeywords(k);
      setVenues(f.venues || []);
      setPrimaryAreas(f.primary_areas || []);
      setTopPapers(top.items || []);
      setOverviewLoading(false);
    });
  }, []);

  // Load papers
  const loadPapers = useCallback(async () => {
    setPapersLoading(true);
    try {
      const params: any = {
        skip: papersPage * PAGE_SIZE, limit: PAGE_SIZE,
        sort: sortBy, sort_order: "desc",
      };
      if (selectedVenue) params.venue = selectedVenue;
      if (selectedArea) params.primary_area = selectedArea;
      if (searchQuery) params.search = searchQuery;
      if (minRating) params.min_rating = parseFloat(minRating);
      const data = await fetchOpenReviewNotes(params);
      setPapers(data.items || []);
      setPapersTotal(data.total || 0);
    } catch {
      setPapers([]);
    } finally {
      setPapersLoading(false);
    }
  }, [papersPage, selectedVenue, selectedArea, searchQuery, sortBy, minRating]);

  useEffect(() => {
    if (activeTab === "papers") loadPapers();
  }, [loadPapers, activeTab]);

  useEffect(() => { setPapersPage(0); }, [selectedVenue, selectedArea, searchQuery, sortBy, minRating]);

  const totalPaperPages = Math.ceil(papersTotal / PAGE_SIZE);

  const venueChartData = useMemo(() => {
    if (!stats?.venue_distribution) return [];
    return Object.entries(stats.venue_distribution as Record<string, number>)
      .sort((a, b) => (b[1] as number) - (a[1] as number))
      .map(([name, value]) => ({
        name: name.length > 30 ? name.slice(0, 30) + "..." : name,
        fullName: name,
        value: value as number,
      }));
  }, [stats]);

  const areaChartData = useMemo(() => {
    if (!stats?.area_distribution) return [];
    return Object.entries(stats.area_distribution as Record<string, number>)
      .sort((a, b) => (b[1] as number) - (a[1] as number))
      .map(([name, value]) => ({
        name: name.length > 35 ? name.slice(0, 35) + "..." : name,
        fullName: name,
        value: value as number,
      }));
  }, [stats]);

  const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: "overview", label: "Overview", icon: <BarChart3 size={14} /> },
    { id: "papers", label: "Papers", icon: <FileText size={14} /> },
    { id: "venues", label: "Venues", icon: <BookOpen size={14} /> },
    { id: "areas", label: "Research Areas", icon: <Layers size={14} /> },
  ];

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-tighter text-foreground">OpenReview</h1>
          <p className="mt-2 text-[15px] text-muted-foreground">
            Academic paper reviews and ratings from top AI/ML conferences
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={async () => {
              setCollecting(true);
              try { await triggerCollectOpenReview(); } finally { setCollecting(false); }
            }}
            disabled={collecting}
            className="flex items-center gap-2 rounded-xl border border-border px-4 py-2.5 text-[13px] font-medium text-foreground shadow-soft hover:bg-muted disabled:opacity-50 dark:shadow-soft-dark"
          >
            {collecting ? (
              <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-muted border-t-primary" />
            ) : (
              <Download size={14} />
            )}
            Collect Data
          </button>
          <a href="https://openreview.net" target="_blank" rel="noopener noreferrer"
            className="flex items-center gap-2 rounded-xl border border-border px-4 py-2.5 text-[13px] font-medium text-foreground shadow-soft hover:bg-muted dark:shadow-soft-dark">
            <ExternalLink size={14} /> openreview.net
          </a>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 rounded-xl border border-border bg-muted/50 p-1">
        {tabs.map((tab) => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 rounded-lg px-4 py-2 text-[13px] font-medium transition-all ${
              activeTab === tab.id
                ? "bg-card text-foreground shadow-soft dark:shadow-soft-dark"
                : "text-muted-foreground hover:text-foreground"
            }`}>
            {tab.icon}{tab.label}
          </button>
        ))}
      </div>

      {/* Overview Tab */}
      {activeTab === "overview" && (
        <div className="space-y-6">
          {overviewLoading && <LoadingSpinner />}
          {!overviewLoading && (
            <>
              {/* Stat cards */}
              <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-6">
                <Card>
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <FileText size={14} />
                    <span className="text-[11px] font-semibold uppercase tracking-widest">Total Papers</span>
                  </div>
                  <p className="mt-2 text-2xl font-semibold tracking-tight text-foreground">{formatNumber(stats?.total || 0)}</p>
                </Card>
                <Card>
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Star size={14} />
                    <span className="text-[11px] font-semibold uppercase tracking-widest">Avg Rating</span>
                  </div>
                  <p className="mt-2 text-2xl font-semibold tracking-tight text-foreground">
                    {stats?.avg_rating || 0}<span className="text-sm text-muted-foreground">/10</span>
                  </p>
                </Card>
                <Card>
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <CheckCircle size={14} />
                    <span className="text-[11px] font-semibold uppercase tracking-widest">Reviewed</span>
                  </div>
                  <p className="mt-2 text-2xl font-semibold tracking-tight text-foreground">{formatNumber(stats?.reviewed_count || 0)}</p>
                  <p className="text-[11px] text-muted-foreground">
                    {stats?.total > 0 ? Math.round(((stats?.reviewed_count || 0) / stats.total) * 100) : 0}% of total
                  </p>
                </Card>
                <Card>
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Link2 size={14} />
                    <span className="text-[11px] font-semibold uppercase tracking-widest">Linked</span>
                  </div>
                  <p className="mt-2 text-2xl font-semibold tracking-tight text-foreground">{formatNumber(stats?.linked_count || 0)}</p>
                  <p className="text-[11px] text-muted-foreground">matched with DB papers</p>
                </Card>
                <Card>
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <BookOpen size={14} />
                    <span className="text-[11px] font-semibold uppercase tracking-widest">Venues</span>
                  </div>
                  <p className="mt-2 text-2xl font-semibold tracking-tight text-foreground">{venues.length}</p>
                </Card>
                <Card>
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Layers size={14} />
                    <span className="text-[11px] font-semibold uppercase tracking-widest">Areas</span>
                  </div>
                  <p className="mt-2 text-2xl font-semibold tracking-tight text-foreground">{primaryAreas.length}</p>
                </Card>
              </div>

              {/* Charts */}
              <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
                {/* Venue distribution */}
                <Card>
                  <div className="flex items-center gap-2 mb-4">
                    <BookOpen size={14} className="text-muted-foreground" />
                    <h3 className="text-[13px] font-semibold text-foreground">Venue Distribution</h3>
                  </div>
                  {venueChartData.length > 0 ? (
                    <div className="flex items-center gap-4">
                      <div className="h-[220px] w-[220px] shrink-0">
                        <ResponsiveContainer width="100%" height="100%">
                          <PieChart>
                            <Pie data={venueChartData} cx="50%" cy="50%" innerRadius={55} outerRadius={85} paddingAngle={2} dataKey="value">
                              {venueChartData.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                            </Pie>
                            <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => [v, "Papers"]} />
                          </PieChart>
                        </ResponsiveContainer>
                      </div>
                      <div className="flex flex-col gap-1.5 overflow-hidden">
                        {venueChartData.slice(0, 10).map((item, i) => {
                          const t = venueChartData.reduce((s, d) => s + d.value, 0);
                          return (
                            <div key={item.name} className="flex items-center gap-2 text-[12px]">
                              <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: CHART_COLORS[i % CHART_COLORS.length] }} />
                              <span className="truncate text-foreground">{item.name}</span>
                              <span className="ml-auto tabular-nums text-muted-foreground">{t > 0 ? Math.round((item.value / t) * 100) : 0}%</span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ) : <p className="text-[12px] text-muted-foreground">No data available</p>}
                </Card>

                {/* Area distribution */}
                <Card>
                  <div className="flex items-center gap-2 mb-4">
                    <Layers size={14} className="text-muted-foreground" />
                    <h3 className="text-[13px] font-semibold text-foreground">Research Areas</h3>
                  </div>
                  {areaChartData.length > 0 ? (
                    <div className="space-y-1.5 max-h-[240px] overflow-y-auto">
                      {areaChartData.map((item, i) => {
                        const maxVal = areaChartData[0]?.value || 1;
                        return (
                          <button key={item.fullName} onClick={() => { setSelectedArea(item.fullName); setActiveTab("papers"); }}
                            className="flex w-full items-center gap-3 rounded-lg px-2 py-1.5 text-left hover:bg-muted/50 transition-colors">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center justify-between text-[12px]">
                                <span className="truncate text-foreground">{item.fullName}</span>
                                <span className="ml-2 tabular-nums text-muted-foreground shrink-0">{item.value}</span>
                              </div>
                              <div className="mt-1 h-1.5 w-full rounded-full bg-muted overflow-hidden">
                                <div className="h-full rounded-full transition-all"
                                  style={{ width: `${(item.value / maxVal) * 100}%`, backgroundColor: CHART_COLORS[i % CHART_COLORS.length] }} />
                              </div>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  ) : <p className="text-[12px] text-muted-foreground">No data available</p>}
                </Card>
              </div>

              {/* Keywords */}
              {keywords.length > 0 && (
                <Card>
                  <div className="flex items-center gap-2 mb-4">
                    <TrendingUp size={14} className="text-muted-foreground" />
                    <h3 className="text-[13px] font-semibold text-foreground">Keyword Trends</h3>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {keywords.map((kw: any, i: number) => {
                      const mx = keywords[0]?.count || 1;
                      const r = kw.count / mx;
                      return (
                        <span key={kw.keyword} className="rounded-lg px-2.5 py-1 font-medium hover:opacity-80"
                          style={{ fontSize: `${11 + Math.round(r * 10)}px`, backgroundColor: `${CHART_COLORS[i % CHART_COLORS.length]}18`, color: CHART_COLORS[i % CHART_COLORS.length], opacity: 0.5 + r * 0.5 }}>
                          {kw.keyword}<span className="ml-1 text-[10px] opacity-60">{kw.count}</span>
                        </span>
                      );
                    })}
                  </div>
                </Card>
              )}

              {/* Top rated papers */}
              {topPapers.length > 0 && (
                <Card>
                  <div className="flex items-center gap-2 mb-4">
                    <Award size={14} className="text-amber-500" />
                    <h3 className="text-[13px] font-semibold text-foreground">Top Rated Papers</h3>
                  </div>
                  <div className="space-y-2">
                    {topPapers.map((p: any, i: number) => (
                      <a key={p.note_id || i}
                        href={p.pdf_url || `https://openreview.net/forum?id=${p.forum_id || p.note_id}`}
                        target="_blank" rel="noopener noreferrer"
                        className="group flex items-start gap-3 rounded-xl px-3 py-2.5 transition-colors hover:bg-muted/50">
                        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted text-[11px] font-bold text-muted-foreground">{i + 1}</span>
                        <div className="min-w-0 flex-1">
                          <h4 className="text-[13px] font-medium text-foreground group-hover:text-primary line-clamp-2">{p.title}</h4>
                          {p.tldr && (
                            <p className="mt-0.5 text-[11px] text-muted-foreground line-clamp-1 italic">{p.tldr}</p>
                          )}
                          <div className="mt-1 flex items-center gap-3 text-[11px]">
                            {p.average_rating != null && (
                              <span className={`flex items-center gap-1 font-medium ${ratingColor(p.average_rating)}`}>
                                <Star size={11} /> {p.average_rating.toFixed(1)}
                              </span>
                            )}
                            {p.venue && (
                              <span className="rounded-md bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">{p.venue}</span>
                            )}
                            {p.primary_area && (
                              <span className="rounded-md bg-violet-500/10 px-1.5 py-0.5 text-[10px] font-medium text-violet-600 dark:text-violet-400">{p.primary_area}</span>
                            )}
                            {p.review_count > 0 && (
                              <span className="text-muted-foreground">{p.review_count} reviews</span>
                            )}
                            {p.paper_id && (
                              <span className="flex items-center gap-0.5 text-green-600 dark:text-green-400">
                                <Link2 size={10} /> linked
                              </span>
                            )}
                          </div>
                        </div>
                        <ExternalLink size={13} className="mt-0.5 shrink-0 text-muted-foreground/40 group-hover:text-primary" />
                      </a>
                    ))}
                  </div>
                </Card>
              )}
            </>
          )}
        </div>
      )}

      {/* Papers Tab */}
      {activeTab === "papers" && (
        <div className="space-y-6">
          {/* Search + filters */}
          <div className="flex items-center gap-3">
            <div className="flex flex-1 items-center gap-2 rounded-2xl border border-border bg-card px-4 py-2 shadow-soft focus-within:border-primary/40 focus-within:ring-2 focus-within:ring-primary/10 dark:shadow-soft-dark">
              <Search size={14} className="shrink-0 text-muted-foreground" />
              <input type="text" placeholder="Search papers..." value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                className="flex-1 bg-transparent text-[13px] text-foreground placeholder:text-muted-foreground/50 outline-none" />
              {searchInput && (
                <button onClick={() => { setSearchInput(""); setSearchQuery(""); }}
                  className="text-muted-foreground hover:text-foreground"><X size={14} /></button>
              )}
            </div>
            <div className="flex items-center gap-1.5">
              <label className="text-[11px] text-muted-foreground">Min rating:</label>
              <input type="number" min="0" max="10" step="0.5" value={minRating}
                onChange={(e) => setMinRating(e.target.value)}
                className="w-16 rounded-lg border border-border bg-card px-2 py-1.5 text-[12px] text-foreground outline-none focus:border-primary/40" />
            </div>
          </div>

          {/* Venue filter */}
          {venues.length > 0 && (
            <div className="space-y-2">
              <div className="flex flex-wrap gap-2">
                <Pill active={!selectedVenue} onClick={() => setSelectedVenue(null)}>All Venues</Pill>
                {venues.map((v) => (
                  <Pill key={v} active={selectedVenue === v}
                    onClick={() => setSelectedVenue(selectedVenue === v ? null : v)}>
                    {v.length > 25 ? v.slice(0, 25) + "..." : v}
                  </Pill>
                ))}
              </div>
            </div>
          )}

          {/* Area filter + sort */}
          <div className="flex items-center justify-between">
            {selectedArea ? (
              <div className="flex items-center gap-2">
                <span className="text-[12px] text-muted-foreground">Area:</span>
                <span className="flex items-center gap-1.5 rounded-xl bg-violet-500/10 px-3 py-1.5 text-[12px] font-medium text-violet-600 dark:text-violet-400">
                  <Layers size={12} />{selectedArea}
                  <button onClick={() => setSelectedArea(null)} className="ml-1 hover:text-foreground"><X size={12} /></button>
                </span>
              </div>
            ) : <div />}
            <div className="flex items-center gap-1 rounded-xl border border-border p-1 shrink-0 ml-3">
              <button onClick={() => setSortBy("average_rating")}
                className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12px] font-medium ${sortBy === "average_rating" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}>
                <Star size={12} /> Rating
              </button>
              <button onClick={() => setSortBy("review_count")}
                className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12px] font-medium ${sortBy === "review_count" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}>
                <FileText size={12} /> Reviews
              </button>
              <button onClick={() => setSortBy("published_at")}
                className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12px] font-medium ${sortBy === "published_at" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}>
                <TrendingUp size={12} /> Recent
              </button>
            </div>
          </div>

          <div className="text-right text-[12px] text-muted-foreground">{formatNumber(papersTotal)} papers found</div>

          {papersLoading && <LoadingSpinner />}

          {!papersLoading && papers.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
              <FileText size={32} className="mb-3 opacity-40" />
              <p className="text-[13px]">No papers found.</p>
            </div>
          )}

          {!papersLoading && papers.length > 0 && (
            <div className="space-y-3">
              {papers.map((p: any) => (
                <a key={p.id}
                  href={p.pdf_url || `https://openreview.net/forum?id=${p.forum_id || p.note_id}`}
                  target="_blank" rel="noopener noreferrer"
                  className="group flex items-start gap-4 rounded-2xl border border-border bg-card p-4 shadow-soft transition-all duration-200 hover:shadow-soft-lg hover:border-primary/20 dark:shadow-soft-dark dark:hover:shadow-soft-dark-lg">
                  <div className="min-w-0 flex-1">
                    <h3 className="text-[14px] font-semibold tracking-tight text-foreground group-hover:text-primary transition-colors line-clamp-2">
                      {p.title}
                    </h3>
                    {p.tldr && (
                      <p className="mt-1 text-[12px] text-muted-foreground line-clamp-2 italic">{p.tldr}</p>
                    )}
                    {p.authors && p.authors.length > 0 && (
                      <p className="mt-1 text-[12px] text-muted-foreground line-clamp-1">
                        {p.authors.slice(0, 4).join(", ")}{p.authors.length > 4 ? ` +${p.authors.length - 4}` : ""}
                      </p>
                    )}
                    <div className="mt-2 flex flex-wrap items-center gap-3 text-[12px]">
                      {p.average_rating != null && (
                        <span className={`flex items-center gap-1 font-medium ${ratingColor(p.average_rating)}`}>
                          <Star size={12} /> {p.average_rating.toFixed(1)}
                        </span>
                      )}
                      {!p.reviews_fetched && (
                        <span className="text-[10px] text-muted-foreground/60 italic">reviews pending</span>
                      )}
                      {p.review_count > 0 && (
                        <span className="text-muted-foreground">{p.review_count} reviews</span>
                      )}
                      {p.venue && (
                        <span className="rounded-md bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">{p.venue}</span>
                      )}
                      {p.primary_area && (
                        <button onClick={(e) => { e.preventDefault(); setSelectedArea(p.primary_area); }}
                          className="rounded-md bg-violet-500/10 px-1.5 py-0.5 text-[10px] font-medium text-violet-600 dark:text-violet-400 hover:bg-violet-500/20">
                          {p.primary_area}
                        </button>
                      )}
                      {p.pdf_url && (
                        <span className="rounded-md bg-red-500/10 px-1.5 py-0.5 text-[10px] font-medium text-red-600 dark:text-red-400">PDF</span>
                      )}
                      {p.paper_id && (
                        <span className="flex items-center gap-0.5 rounded-md bg-green-500/10 px-1.5 py-0.5 text-[10px] font-medium text-green-600 dark:text-green-400">
                          <Link2 size={10} /> DB linked
                        </span>
                      )}
                    </div>
                    {p.keywords && p.keywords.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1">
                        {p.keywords.slice(0, 5).map((kw: string) => (
                          <span key={kw} className="rounded-md bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">{kw}</span>
                        ))}
                        {p.keywords.length > 5 && (
                          <span className="text-[10px] text-muted-foreground">+{p.keywords.length - 5}</span>
                        )}
                      </div>
                    )}
                  </div>
                  <ExternalLink size={14} className="mt-1 shrink-0 text-muted-foreground/40 group-hover:text-primary" />
                </a>
              ))}
            </div>
          )}

          {!papersLoading && totalPaperPages > 1 && (
            <Pagination currentPage={papersPage} totalPages={totalPaperPages} onPageChange={setPapersPage} />
          )}
        </div>
      )}

      {/* Venues Tab */}
      {activeTab === "venues" && (
        <div className="space-y-6">
          {overviewLoading && <LoadingSpinner />}
          {!overviewLoading && (
            <>
              {venueChartData.length > 0 ? (
                <Card>
                  <div className="flex items-center gap-2 mb-4">
                    <BarChart3 size={14} className="text-muted-foreground" />
                    <h3 className="text-[13px] font-semibold text-foreground">Papers per Venue</h3>
                  </div>
                  <div className="h-[400px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={venueChartData} layout="vertical" margin={{ top: 0, right: 20, bottom: 0, left: 180 }}>
                        <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                        <XAxis type="number" tick={{ fontSize: 11 }} />
                        <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={175} />
                        <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => [v, "Papers"]} />
                        <Bar dataKey="value" fill="#3b82f6" radius={[0, 6, 6, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </Card>
              ) : (
                <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
                  <BookOpen size={32} className="mb-3 opacity-40" />
                  <p className="text-[13px]">No venue data available.</p>
                </div>
              )}

              {/* Venue cards */}
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                {venueChartData.map((v, i) => (
                  <button key={v.name} onClick={() => { setSelectedVenue(v.fullName); setActiveTab("papers"); }}
                    className="flex items-center gap-4 rounded-2xl border border-border bg-card p-4 text-left shadow-soft transition-all hover:shadow-soft-lg hover:border-primary/20 dark:shadow-soft-dark">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl" style={{ backgroundColor: `${CHART_COLORS[i % CHART_COLORS.length]}18` }}>
                      <BookOpen size={16} style={{ color: CHART_COLORS[i % CHART_COLORS.length] }} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-[13px] font-medium text-foreground truncate">{v.fullName}</p>
                      <p className="text-[11px] text-muted-foreground">{formatNumber(v.value)} papers</p>
                    </div>
                    <ChevronRight size={14} className="shrink-0 text-muted-foreground" />
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {/* Areas Tab */}
      {activeTab === "areas" && (
        <div className="space-y-6">
          {overviewLoading && <LoadingSpinner />}
          {!overviewLoading && (
            <>
              {areaChartData.length > 0 ? (
                <>
                  <Card>
                    <div className="flex items-center gap-2 mb-4">
                      <BarChart3 size={14} className="text-muted-foreground" />
                      <h3 className="text-[13px] font-semibold text-foreground">Papers per Research Area</h3>
                    </div>
                    <div className="h-[500px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={areaChartData} layout="vertical" margin={{ top: 0, right: 20, bottom: 0, left: 220 }}>
                          <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                          <XAxis type="number" tick={{ fontSize: 11 }} />
                          <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={215} />
                          <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => [v, "Papers"]} />
                          <Bar dataKey="value" fill="#8b5cf6" radius={[0, 6, 6, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </Card>

                  <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
                    {areaChartData.map((a, i) => (
                      <button key={a.fullName} onClick={() => { setSelectedArea(a.fullName); setActiveTab("papers"); }}
                        className="flex items-center gap-4 rounded-2xl border border-border bg-card p-4 text-left shadow-soft transition-all hover:shadow-soft-lg hover:border-violet-500/20 dark:shadow-soft-dark">
                        <div className="flex h-10 w-10 items-center justify-center rounded-xl" style={{ backgroundColor: `${CHART_COLORS[i % CHART_COLORS.length]}18` }}>
                          <Layers size={16} style={{ color: CHART_COLORS[i % CHART_COLORS.length] }} />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-[13px] font-medium text-foreground truncate">{a.fullName}</p>
                          <p className="text-[11px] text-muted-foreground">{formatNumber(a.value)} papers</p>
                        </div>
                        <ChevronRight size={14} className="shrink-0 text-muted-foreground" />
                      </button>
                    ))}
                  </div>
                </>
              ) : (
                <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
                  <Layers size={32} className="mb-3 opacity-40" />
                  <p className="text-[13px]">No research area data available.</p>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
