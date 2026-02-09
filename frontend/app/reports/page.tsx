"use client";

import { useEffect, useState } from "react";
import {
  FileText, RefreshCw, TrendingUp, BookOpen, GitFork, Star,
  Calendar, BarChart3, ArrowUpRight, Clock, ChevronRight,
  AlertTriangle, AlertCircle, Info,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  fetchWeeklyReport, fetchAlerts, fetchReportHistory, triggerReportGenerate,
} from "@/lib/api";
import { formatDate, formatNumber } from "@/lib/utils";

export default function ReportsPage() {
  const [report, setReport] = useState<any>(null);
  const [alerts, setAlerts] = useState<any[]>([]);
  const [history, setHistory] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [tab, setTab] = useState<"report" | "alerts" | "history">("report");

  useEffect(() => {
    Promise.all([
      fetchWeeklyReport().catch(() => null),
      fetchAlerts({ limit: 20 }).catch(() => []),
      fetchReportHistory(10).catch(() => []),
    ]).then(([r, a, h]) => {
      setReport(r);
      setAlerts(Array.isArray(a) ? a : a?.items || a || []);
      setHistory(Array.isArray(h) ? h : []);
      setLoading(false);
    });
  }, []);

  const handleGenerate = async () => {
    setGenerating(true);
    try {
      await triggerReportGenerate();
      // Poll for the new report
      for (let i = 0; i < 30; i++) {
        await new Promise((r) => setTimeout(r, 5000));
        const data = await fetchWeeklyReport().catch(() => null);
        if (data && data.id && data.id !== report?.id) {
          setReport(data);
          const h = await fetchReportHistory(10).catch(() => []);
          setHistory(Array.isArray(h) ? h : []);
          break;
        }
      }
    } catch {
      // ignore
    } finally {
      setGenerating(false);
    }
  };

  const hasReport = report && report.id;

  const severityConfig: Record<string, { icon: any; border: string; bg: string; badge: string; badgeText: string }> = {
    high: {
      icon: AlertTriangle,
      border: "border-red-500/20",
      bg: "bg-red-500/5",
      badge: "bg-red-500/10",
      badgeText: "text-red-600 dark:text-red-400",
    },
    medium: {
      icon: AlertCircle,
      border: "border-amber-500/20",
      bg: "bg-amber-500/5",
      badge: "bg-amber-500/10",
      badgeText: "text-amber-600 dark:text-amber-400",
    },
    info: {
      icon: Info,
      border: "border-blue-500/20",
      bg: "bg-blue-500/5",
      badge: "bg-blue-500/10",
      badgeText: "text-blue-600 dark:text-blue-400",
    },
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-semibold tracking-tighter text-foreground">
          Reports & Alerts
        </h1>
        <p className="mt-2 text-[15px] text-muted-foreground">
          Weekly research digests, insights, and alerts
        </p>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 rounded-xl border border-border bg-muted/50 p-1">
        {([
          { key: "report" as const, label: "Weekly Report" },
          { key: "alerts" as const, label: "Alerts" },
          { key: "history" as const, label: "History" },
        ]).map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex items-center gap-2 rounded-lg px-4 py-2 text-[13px] font-medium transition-all duration-150 ${
              tab === t.key
                ? "bg-card text-foreground shadow-soft dark:shadow-soft-dark"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {t.label}
            {t.key === "alerts" && alerts.length > 0 && (
              <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-primary/10 px-1.5 text-[10px] font-bold text-primary">
                {alerts.length}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-16">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-muted border-t-primary" />
        </div>
      )}

      {/* ══ Weekly Report tab ══ */}
      {!loading && tab === "report" && (
        <div className="space-y-5">
          {hasReport ? (
            <>
              {/* Report header card */}
              <div className="rounded-2xl border border-border bg-card p-6 shadow-soft dark:shadow-soft-dark">
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-4">
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary/10">
                      <FileText size={22} className="text-primary" />
                    </div>
                    <div>
                      <h2 className="text-lg font-semibold tracking-tight text-foreground">
                        {report.title || "Weekly Research Digest"}
                      </h2>
                      <div className="mt-1.5 flex items-center gap-3 text-[12px] text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Calendar size={12} />
                          {formatDate(report.generated_at || report.created_at)}
                        </span>
                        <span className="flex items-center gap-1">
                          <Clock size={12} />
                          {report.period_start} — {report.period_end}
                        </span>
                      </div>
                    </div>
                  </div>
                  <button
                    onClick={handleGenerate}
                    disabled={generating}
                    className="flex items-center gap-2 rounded-xl border border-border bg-card px-3 py-1.5 text-[12px] font-medium text-muted-foreground shadow-soft transition-all hover:bg-muted hover:text-foreground disabled:opacity-50 dark:shadow-soft-dark"
                  >
                    <RefreshCw size={12} className={generating ? "animate-spin" : ""} />
                    {generating ? "Generating..." : "Regenerate"}
                  </button>
                </div>

                {/* Stats pills */}
                <div className="mt-5 flex gap-3">
                  <div className="flex items-center gap-2 rounded-xl bg-blue-500/10 px-3.5 py-2">
                    <BookOpen size={14} className="text-blue-600 dark:text-blue-400" />
                    <div>
                      <p className="text-[18px] font-bold text-blue-600 dark:text-blue-400">{report.new_papers_count || 0}</p>
                      <p className="text-[10px] font-medium text-blue-600/70 dark:text-blue-400/70">New Papers</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 rounded-xl bg-emerald-500/10 px-3.5 py-2">
                    <GitFork size={14} className="text-emerald-600 dark:text-emerald-400" />
                    <div>
                      <p className="text-[18px] font-bold text-emerald-600 dark:text-emerald-400">{report.new_repos_count || 0}</p>
                      <p className="text-[10px] font-medium text-emerald-600/70 dark:text-emerald-400/70">New Repos</p>
                    </div>
                  </div>
                  {report.trending_topics && report.trending_topics.length > 0 && (
                    <div className="flex items-center gap-2 rounded-xl bg-purple-500/10 px-3.5 py-2">
                      <TrendingUp size={14} className="text-purple-600 dark:text-purple-400" />
                      <div>
                        <p className="text-[18px] font-bold text-purple-600 dark:text-purple-400">{report.trending_topics.length}</p>
                        <p className="text-[10px] font-medium text-purple-600/70 dark:text-purple-400/70">Topics</p>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Summary */}
              {report.summary && (
                <div className="rounded-2xl border border-border bg-card p-5 shadow-soft dark:shadow-soft-dark">
                  <h3 className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
                    Summary
                  </h3>
                  <p className="mt-3 text-[14px] leading-relaxed text-foreground">
                    {report.summary}
                  </p>
                </div>
              )}

              {/* Highlights */}
              {report.highlights && report.highlights.length > 0 && (
                <div className="rounded-2xl border border-border bg-card p-5 shadow-soft dark:shadow-soft-dark">
                  <h3 className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
                    Key Highlights
                  </h3>
                  <div className="mt-3 space-y-2.5">
                    {report.highlights.map((h: any, i: number) => (
                      <div
                        key={i}
                        className="flex items-start gap-3 rounded-xl border border-border bg-muted/30 px-4 py-3 transition-colors hover:bg-muted/60"
                      >
                        <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-500/10 text-[10px] font-bold text-emerald-600 dark:text-emerald-400">
                          {i + 1}
                        </span>
                        <span className="text-[13px] leading-relaxed text-foreground">
                          {typeof h === "string" ? h : h.text || h.title}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Two-column: Top Papers & Top Repos */}
              <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
                {/* Top Papers */}
                {report.top_papers && report.top_papers.length > 0 && (
                  <div className="rounded-2xl border border-border bg-card p-5 shadow-soft dark:shadow-soft-dark">
                    <div className="mb-3 flex items-center justify-between">
                      <h3 className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
                        <BookOpen size={12} className="text-blue-500" />
                        Top Papers
                      </h3>
                      <span className="rounded-full bg-blue-500/10 px-2 py-0.5 text-[10px] font-medium text-blue-600 dark:text-blue-400">
                        {report.top_papers.length} papers
                      </span>
                    </div>
                    <div className="space-y-2">
                      {report.top_papers.slice(0, 8).map((p: any, i: number) => (
                        <div
                          key={i}
                          className="group flex items-start gap-3 rounded-xl border border-border bg-muted/30 px-3 py-2.5 transition-colors hover:bg-muted/60"
                        >
                          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted text-[10px] font-bold text-muted-foreground">
                            {i + 1}
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="text-[13px] font-medium leading-tight text-foreground line-clamp-2">
                              {p.title || p}
                            </p>
                            <div className="mt-1 flex items-center gap-2 text-[11px] text-muted-foreground">
                              {p.citation_count > 0 && (
                                <span className="flex items-center gap-0.5">
                                  <BarChart3 size={10} /> {p.citation_count} citations
                                </span>
                              )}
                              {p.categories && p.categories[0] && (
                                <span className="rounded-md bg-primary/10 px-1.5 py-0.5 text-[9px] font-medium text-primary">
                                  {p.categories[0]}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Top Repos */}
                {report.top_repos && report.top_repos.length > 0 && (
                  <div className="rounded-2xl border border-border bg-card p-5 shadow-soft dark:shadow-soft-dark">
                    <div className="mb-3 flex items-center justify-between">
                      <h3 className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
                        <GitFork size={12} className="text-emerald-500" />
                        Top Repositories
                      </h3>
                      <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-600 dark:text-emerald-400">
                        {report.top_repos.length} repos
                      </span>
                    </div>
                    <div className="space-y-2">
                      {report.top_repos.slice(0, 8).map((r: any, i: number) => (
                        <div
                          key={i}
                          className="group flex items-start gap-3 rounded-xl border border-border bg-muted/30 px-3 py-2.5 transition-colors hover:bg-muted/60"
                        >
                          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted text-[10px] font-bold text-muted-foreground">
                            {i + 1}
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="text-[13px] font-semibold text-primary">
                              {r.full_name || r}
                            </p>
                            {r.description && (
                              <p className="mt-0.5 text-[12px] text-muted-foreground line-clamp-1">
                                {r.description}
                              </p>
                            )}
                            <div className="mt-1 flex items-center gap-2 text-[11px] text-muted-foreground">
                              {r.stars_count > 0 && (
                                <span className="flex items-center gap-0.5 font-medium text-amber-500 dark:text-amber-400">
                                  <Star size={10} /> {formatNumber(r.stars_count)}
                                </span>
                              )}
                              {r.primary_language && (
                                <span className="rounded-md bg-muted px-1.5 py-0.5 text-[9px] font-medium text-foreground">
                                  {r.primary_language}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Trending Topics */}
              {report.trending_topics && report.trending_topics.length > 0 && (
                <div className="rounded-2xl border border-border bg-card p-5 shadow-soft dark:shadow-soft-dark">
                  <h3 className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
                    Trending Topics
                  </h3>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {report.trending_topics.map((t: any, i: number) => (
                      <span
                        key={i}
                        className="inline-flex items-center gap-1.5 rounded-xl bg-[hsl(262_83%_58%/0.08)] px-3 py-1.5 text-[12px] font-medium text-[hsl(var(--accent))] ring-1 ring-[hsl(var(--accent)/0.15)]"
                      >
                        <TrendingUp size={11} />
                        {t.name || t}
                        {t.count > 0 && (
                          <span className="rounded-md bg-[hsl(var(--accent)/0.1)] px-1 py-0.5 text-[9px]">
                            {t.count}
                          </span>
                        )}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Full Report Content */}
              {report.content && (
                <div className="rounded-2xl border border-border bg-card p-5 shadow-soft dark:shadow-soft-dark">
                  <h3 className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
                    Full Report
                  </h3>
                  <div className="prose prose-sm dark:prose-invert mt-4 max-w-none rounded-xl border border-border bg-muted/30 p-5 text-[13px] leading-relaxed text-foreground">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                      {report.content}
                    </ReactMarkdown>
                  </div>
                </div>
              )}
            </>
          ) : (
            /* Empty state - no report */
            <div className="flex flex-col items-center justify-center rounded-2xl border border-border bg-card py-16 shadow-soft dark:shadow-soft-dark">
              {generating ? (
                <>
                  <div className="relative mb-6 flex h-20 w-20 items-center justify-center">
                    <span className="absolute h-20 w-20 animate-ping rounded-full bg-primary/10" />
                    <span className="absolute h-14 w-14 animate-pulse rounded-full bg-primary/5" />
                    <div className="relative flex h-12 w-12 items-center justify-center rounded-full border border-border bg-card">
                      <RefreshCw size={20} className="animate-spin text-primary" />
                    </div>
                  </div>
                  <p className="text-sm font-medium text-foreground">Generating Weekly Report</p>
                  <p className="mt-1.5 max-w-xs text-center text-[12px] text-muted-foreground">
                    Analyzing papers, repositories, and trends. This may take a minute or two.
                  </p>
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
                    <FileText size={20} className="relative text-muted-foreground" />
                  </div>
                  <h3 className="text-sm font-semibold text-foreground">No Weekly Report Yet</h3>
                  <p className="mt-1.5 mb-5 max-w-sm text-center text-[13px] leading-relaxed text-muted-foreground">
                    Generate an AI-powered weekly digest based on current papers and repositories.
                    Reports are also generated automatically every Monday.
                  </p>
                  <button
                    onClick={handleGenerate}
                    className="group flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground shadow-lg shadow-primary/20 transition-all hover:opacity-90 hover:shadow-primary/30"
                  >
                    <RefreshCw size={14} className="transition-transform group-hover:rotate-90" />
                    Generate Weekly Report
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      )}

      {/* ══ Alerts tab ══ */}
      {!loading && tab === "alerts" && (
        <div className="space-y-3">
          {alerts.length > 0 ? (
            alerts.map((alert: any, i: number) => {
              const config = severityConfig[alert.severity] || severityConfig.info;
              const IconComp = config.icon;
              return (
                <div
                  key={alert.id || i}
                  className={`rounded-2xl border ${config.border} ${config.bg} p-4 shadow-soft transition-all duration-200 hover:shadow-soft-lg dark:shadow-soft-dark dark:hover:shadow-soft-dark-lg`}
                >
                  <div className="flex items-start gap-3">
                    <div className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${config.badge}`}>
                      <IconComp size={16} className={config.badgeText} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between">
                        <span className="text-[14px] font-semibold text-foreground">
                          {alert.title || alert.alert_type}
                        </span>
                        <div className="flex items-center gap-2">
                          <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${config.badge} ${config.badgeText}`}>
                            {alert.severity}
                          </span>
                          <span className="text-[11px] text-muted-foreground">
                            {formatDate(alert.created_at)}
                          </span>
                        </div>
                      </div>
                      {(alert.description || alert.message) && (
                        <p className="mt-1.5 text-[13px] leading-relaxed text-muted-foreground">
                          {alert.description || alert.message}
                        </p>
                      )}
                      {alert.alert_type && (
                        <span className="mt-2 inline-block rounded-md bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                          {alert.alert_type}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          ) : (
            <div className="flex flex-col items-center justify-center rounded-2xl border border-border bg-card py-16 shadow-soft dark:shadow-soft-dark">
              <div className="relative mb-6 flex h-20 w-20 items-center justify-center">
                <span className="absolute h-20 w-20 rounded-full border border-border" />
                <span className="absolute h-14 w-14 rounded-full border border-border" />
                <span className="absolute h-8 w-8 rounded-full border border-border" />
                <AlertCircle size={20} className="relative text-muted-foreground" />
              </div>
              <h3 className="text-sm font-semibold text-foreground">No Alerts Yet</h3>
              <p className="mt-1.5 max-w-sm text-center text-[13px] leading-relaxed text-muted-foreground">
                Alerts will appear here when significant changes are detected in tracked papers and repositories.
              </p>
            </div>
          )}
        </div>
      )}

      {/* ══ History tab ══ */}
      {!loading && tab === "history" && (
        <div className="space-y-3">
          {history.length > 0 ? (
            history.map((r: any, i: number) => (
              <button
                key={r.id || i}
                onClick={() => {
                  setReport(r);
                  setTab("report");
                }}
                className="group flex w-full items-center gap-4 rounded-2xl border border-border bg-card p-4 text-left shadow-soft transition-all duration-200 hover:shadow-soft-lg hover:border-primary/20 dark:shadow-soft-dark dark:hover:shadow-soft-dark-lg"
              >
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10">
                  <FileText size={18} className="text-primary" />
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="text-[14px] font-semibold tracking-tight text-foreground group-hover:text-primary transition-colors duration-150">
                    {r.title || "Weekly Report"}
                  </h3>
                  <div className="mt-1 flex items-center gap-3 text-[12px] text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Calendar size={11} /> {r.period_start} — {r.period_end}
                    </span>
                    <span className="flex items-center gap-1">
                      <BookOpen size={11} /> {r.new_papers_count || 0} papers
                    </span>
                    <span className="flex items-center gap-1">
                      <GitFork size={11} /> {r.new_repos_count || 0} repos
                    </span>
                  </div>
                  {r.summary && (
                    <p className="mt-1.5 text-[12px] leading-relaxed text-muted-foreground line-clamp-2">
                      {r.summary}
                    </p>
                  )}
                </div>
                <ChevronRight size={16} className="shrink-0 text-muted-foreground/40 transition-colors group-hover:text-primary" />
              </button>
            ))
          ) : (
            <div className="flex flex-col items-center justify-center rounded-2xl border border-border bg-card py-16 shadow-soft dark:shadow-soft-dark">
              <div className="relative mb-6 flex h-20 w-20 items-center justify-center">
                <span className="absolute h-20 w-20 rounded-full border border-border" />
                <span className="absolute h-14 w-14 rounded-full border border-border" />
                <span className="absolute h-8 w-8 rounded-full border border-border" />
                <Clock size={20} className="relative text-muted-foreground" />
              </div>
              <h3 className="text-sm font-semibold text-foreground">No Report History</h3>
              <p className="mt-1.5 mb-5 max-w-sm text-center text-[13px] leading-relaxed text-muted-foreground">
                Generate your first weekly report to start building history.
              </p>
              <button
                onClick={() => {
                  setTab("report");
                  handleGenerate();
                }}
                className="group flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground shadow-lg shadow-primary/20 transition-all hover:opacity-90 hover:shadow-primary/30"
              >
                <RefreshCw size={14} className="transition-transform group-hover:rotate-90" />
                Generate First Report
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
