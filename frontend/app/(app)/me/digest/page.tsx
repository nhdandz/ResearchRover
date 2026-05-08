"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Sparkles, FileText, GitBranch, BookMarked, Search,
  RefreshCw, Loader2, ChevronRight, Calendar, ExternalLink,
  ArrowRight, AlertCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/components/AuthProvider";
import { fetchLatestDigest, fetchDigestHistory, triggerDigestGeneration } from "@/lib/api";
import Link from "next/link";

interface DigestPaper {
  id: string; title: string; arxiv_id: string | null;
  categories: string[]; relevance_score: number;
  matched_interests: string[]; source_url: string | null;
}
interface DigestRepo {
  id: string; full_name: string; description: string | null;
  stars_count: number; primary_language: string | null;
  relevance_score: number; matched_interests: string[];
}
interface Digest {
  id: string; period_start: string; period_end: string;
  new_papers_count: number; new_repos_count: number;
  unread_bookmarks_count: number;
  new_papers_in_interests: DigestPaper[];
  new_repos_in_interests: DigestRepo[];
  unread_bookmarks: any[];
  saved_search_updates: any[];
  highlights: string[]; content_md: string | null;
  created_at: string;
}

function RelevanceDot({ score }: { score: number }) {
  const pct = Math.round(score * 100);
  const color = pct >= 70 ? "bg-emerald-500" : pct >= 40 ? "bg-amber-500" : "bg-muted-foreground";
  return (
    <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
      <span className={cn("h-1.5 w-1.5 rounded-full", color)} />
      {pct}% match
    </span>
  );
}

export default function DigestPage() {
  const router = useRouter();
  const { user } = useAuth();
  const [digest, setDigest] = useState<Digest | null>(null);
  const [history, setHistory] = useState<Digest[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState("");
  const [activeTab, setActiveTab] = useState<"overview" | "papers" | "repos" | "full">("overview");

  useEffect(() => {
    if (!user) { router.replace("/login"); return; }
    loadDigest();
  }, [user]);

  const loadDigest = async () => {
    setLoading(true);
    try {
      const [d, h] = await Promise.all([fetchLatestDigest(), fetchDigestHistory(5)]);
      setDigest(d);
      setHistory(h);
    } catch {
      setError("No digest available yet.");
    } finally {
      setLoading(false);
    }
  };

  const handleGenerate = async () => {
    setGenerating(true);
    try {
      await triggerDigestGeneration();
      setTimeout(() => { loadDigest(); setGenerating(false); }, 3000);
    } catch {
      setGenerating(false);
    }
  };

  if (!user) return null;

  return (
    <div className="space-y-8 max-w-3xl">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tighter text-foreground">
            My Weekly Digest
          </h1>
          <p className="mt-1 text-[13px] text-muted-foreground">
            Tóm tắt cá nhân hoá mỗi tuần theo research interests của bạn
          </p>
        </div>
        <button
          onClick={handleGenerate}
          disabled={generating}
          className="flex items-center gap-2 rounded-xl border border-border px-4 py-2 text-[13px] font-medium text-foreground hover:bg-muted disabled:opacity-50"
        >
          {generating ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
          Generate now
        </button>
      </div>

      {/* Loading */}
      {loading && (
        <div className="flex justify-center py-16">
          <Loader2 size={20} className="animate-spin text-muted-foreground" />
        </div>
      )}

      {/* No digest */}
      {!loading && !digest && (
        <div className="flex flex-col items-center rounded-2xl border border-dashed border-border py-16 text-center">
          <Sparkles size={28} className="mb-3 text-muted-foreground/40" />
          <p className="text-[13px] font-medium text-muted-foreground">No digest yet</p>
          <p className="mt-1 text-[12px] text-muted-foreground/60 max-w-xs">
            {error || 'Digests are generated every Sunday. Click "Generate now" to create one immediately.'}
          </p>
          <button
            onClick={handleGenerate}
            disabled={generating}
            className="mt-4 flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-[13px] font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {generating ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />}
            Generate first digest
          </button>
        </div>
      )}

      {digest && (
        <>
          {/* Period badge + stats */}
          <div className="rounded-2xl border border-border bg-card p-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-[12px] text-muted-foreground">
                <Calendar size={13} />
                {new Date(digest.period_start).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                {" — "}
                {new Date(digest.period_end).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
              </div>
              <span className="text-[11px] text-muted-foreground">
                Generated {new Date(digest.created_at).toLocaleDateString()}
              </span>
            </div>

            <div className="mt-4 grid grid-cols-3 gap-4">
              {[
                { icon: FileText, label: "New papers", value: digest.new_papers_count, color: "text-blue-500", bg: "bg-blue-500/10" },
                { icon: GitBranch, label: "New repos", value: digest.new_repos_count, color: "text-orange-500", bg: "bg-orange-500/10" },
                { icon: BookMarked, label: "Unread bookmarks", value: digest.unread_bookmarks_count, color: "text-amber-500", bg: "bg-amber-500/10" },
              ].map(({ icon: Icon, label, value, color, bg }) => (
                <div key={label} className="rounded-xl border border-border bg-surface p-3 text-center">
                  <div className={cn("mx-auto mb-2 flex h-8 w-8 items-center justify-center rounded-lg", bg)}>
                    <Icon size={14} className={color} />
                  </div>
                  <p className="text-2xl font-semibold tracking-tight text-foreground">{value}</p>
                  <p className="text-[11px] text-muted-foreground">{label}</p>
                </div>
              ))}
            </div>

            {/* Highlights */}
            {digest.highlights?.length > 0 && (
              <div className="mt-4 space-y-1.5">
                {digest.highlights.map((h, i) => (
                  <div key={i} className="flex items-start gap-2 text-[13px] text-foreground">
                    <span className="mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                    {h}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Tabs */}
          <div className="flex gap-1 rounded-xl border border-border bg-surface p-1">
            {[
              { id: "overview", label: "Overview" },
              { id: "papers", label: `Papers (${digest.new_papers_count})` },
              { id: "repos", label: `Repos (${digest.new_repos_count})` },
              { id: "full", label: "Full digest" },
            ].map(({ id, label }) => (
              <button
                key={id}
                onClick={() => setActiveTab(id as any)}
                className={cn(
                  "flex-1 rounded-lg px-3 py-2 text-[12px] font-medium transition-all",
                  activeTab === id ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                )}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Overview tab */}
          {activeTab === "overview" && (
            <div className="space-y-4">
              {/* Top 3 papers */}
              {digest.new_papers_in_interests?.length > 0 && (
                <div className="rounded-2xl border border-border bg-card p-5">
                  <h3 className="mb-3 flex items-center gap-2 text-[13px] font-semibold text-foreground">
                    <FileText size={14} className="text-blue-500" /> Top papers this week
                  </h3>
                  <div className="space-y-3">
                    {digest.new_papers_in_interests.slice(0, 3).map((p) => (
                      <div key={p.id} className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <Link href={`/papers/${p.id}`} className="text-[13px] font-medium text-foreground hover:text-primary line-clamp-1">
                            {p.title}
                          </Link>
                          <div className="mt-1 flex items-center gap-2">
                            <RelevanceDot score={p.relevance_score} />
                            {p.categories.slice(0, 2).map((c) => (
                              <span key={c} className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">{c}</span>
                            ))}
                          </div>
                        </div>
                        {p.arxiv_id && (
                          <a href={`https://arxiv.org/abs/${p.arxiv_id}`} target="_blank" rel="noopener noreferrer"
                            className="shrink-0 text-muted-foreground hover:text-primary">
                            <ExternalLink size={13} />
                          </a>
                        )}
                      </div>
                    ))}
                  </div>
                  {digest.new_papers_count > 3 && (
                    <button onClick={() => setActiveTab("papers")} className="mt-3 flex items-center gap-1 text-[12px] text-primary hover:underline">
                      View all {digest.new_papers_count} papers <ChevronRight size={12} />
                    </button>
                  )}
                </div>
              )}

              {/* Saved search updates */}
              {digest.saved_search_updates?.length > 0 && (
                <div className="rounded-2xl border border-amber-500/20 bg-amber-500/5 p-5">
                  <h3 className="mb-3 flex items-center gap-2 text-[13px] font-semibold text-amber-600">
                    <Search size={14} /> Saved searches have new results
                  </h3>
                  {digest.saved_search_updates.map((s: any) => (
                    <div key={s.id} className="flex items-center justify-between">
                      <p className="text-[13px] text-foreground">{s.name}</p>
                      <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-[11px] font-medium text-amber-600">
                        +{s.new_results} new
                      </span>
                    </div>
                  ))}
                  <Link href="/settings/searches" className="mt-2 flex items-center gap-1 text-[12px] text-amber-600 hover:underline">
                    View saved searches <ArrowRight size={12} />
                  </Link>
                </div>
              )}
            </div>
          )}

          {/* Papers tab */}
          {activeTab === "papers" && (
            <div className="space-y-3">
              {digest.new_papers_in_interests?.length === 0 ? (
                <p className="py-8 text-center text-[13px] text-muted-foreground">No papers matched your interests this week.</p>
              ) : (
                digest.new_papers_in_interests?.map((p) => (
                  <div key={p.id} className="rounded-2xl border border-border bg-card p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1">
                        <Link href={`/papers/${p.id}`} className="text-[13px] font-medium text-foreground hover:text-primary">
                          {p.title}
                        </Link>
                        <div className="mt-2 flex flex-wrap items-center gap-2">
                          <RelevanceDot score={p.relevance_score} />
                          {p.matched_interests.map((i) => (
                            <span key={i} className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">{i}</span>
                          ))}
                          {p.categories.slice(0, 2).map((c) => (
                            <span key={c} className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">{c}</span>
                          ))}
                        </div>
                      </div>
                      {p.arxiv_id && (
                        <a href={`https://arxiv.org/abs/${p.arxiv_id}`} target="_blank" rel="noopener noreferrer"
                          className="shrink-0 rounded-lg border border-border px-2.5 py-1.5 text-[11px] text-muted-foreground hover:bg-muted">
                          arXiv ↗
                        </a>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {/* Repos tab */}
          {activeTab === "repos" && (
            <div className="space-y-3">
              {digest.new_repos_in_interests?.length === 0 ? (
                <p className="py-8 text-center text-[13px] text-muted-foreground">No repos matched your interests this week.</p>
              ) : (
                digest.new_repos_in_interests?.map((r) => (
                  <div key={r.id} className="rounded-2xl border border-border bg-card p-4">
                    <div className="flex items-start justify-between">
                      <div>
                        <Link href={`/repos/${r.id}`} className="text-[13px] font-medium text-foreground hover:text-primary">
                          {r.full_name}
                        </Link>
                        {r.description && <p className="mt-0.5 text-[12px] text-muted-foreground line-clamp-1">{r.description}</p>}
                        <div className="mt-2 flex items-center gap-2">
                          <RelevanceDot score={r.relevance_score} />
                          <span className="text-[11px] text-muted-foreground">⭐ {r.stars_count.toLocaleString()}</span>
                          {r.primary_language && (
                            <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">{r.primary_language}</span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {/* Full digest markdown */}
          {activeTab === "full" && (
            <div className="rounded-2xl border border-border bg-card p-6">
              {digest.content_md ? (
                <div className="prose prose-sm dark:prose-invert max-w-none text-[13px]">
                  <pre className="whitespace-pre-wrap font-sans text-[13px] text-foreground leading-relaxed">
                    {digest.content_md}
                  </pre>
                </div>
              ) : (
                <p className="text-center text-[13px] text-muted-foreground">Full digest content not available.</p>
              )}
            </div>
          )}

          {/* History */}
          {history.length > 1 && (
            <div>
              <h3 className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Previous digests</h3>
              <div className="space-y-2">
                {history.slice(1).map((d) => (
                  <Link key={d.id} href={`/me/digest/${d.id}`}
                    className="flex items-center justify-between rounded-xl border border-border bg-card px-4 py-3 hover:bg-muted">
                    <span className="text-[13px] text-foreground">
                      {new Date(d.period_start).toLocaleDateString("en-US", { month: "short", day: "numeric" })} –{" "}
                      {new Date(d.period_end).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                    </span>
                    <span className="text-[12px] text-muted-foreground">
                      {d.new_papers_count} papers · {d.new_repos_count} repos
                    </span>
                  </Link>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
