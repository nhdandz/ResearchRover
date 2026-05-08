"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Flame, TrendingUp, Github, MessageSquare, BookOpen, Activity } from "lucide-react";
import { fetchBuzzPapers } from "@/lib/api";

interface BuzzPaper {
  paper_id: string;
  title: string;
  arxiv_id: string | null;
  categories: string[];
  published_date: string | null;
  buzz_score: number;
  buzz_velocity: number;
  source_breakdown: Record<string, any>;
}

export default function BuzzPapersPage() {
  const [period, setPeriod] = useState<"day" | "week" | "month">("week");
  const [sort, setSort] = useState<"buzz_score" | "buzz_velocity">("buzz_score");
  const [items, setItems] = useState<BuzzPaper[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetchBuzzPapers({ period, sort, limit: 30 })
      .then((d) => setItems(d.items))
      .finally(() => setLoading(false));
  }, [period, sort]);

  return (
    <div className="container max-w-6xl py-8">
      <div className="mb-6">
        <h1 className="text-3xl font-bold flex items-center gap-2">
          <Flame className="h-7 w-7 text-orange-500" />
          Buzz Papers
        </h1>
        <p className="text-muted-foreground mt-1">
          Cross-source ranking: ArXiv + HuggingFace + Hacker News + GitHub repos + OpenReview + citations.
        </p>
      </div>

      <div className="flex gap-3 mb-6">
        <div className="flex rounded-lg bg-muted p-1">
          {(["day", "week", "month"] as const).map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={
                "rounded-md px-4 py-1.5 text-sm font-medium transition-colors " +
                (period === p ? "bg-background shadow" : "text-muted-foreground")
              }
            >
              {p.charAt(0).toUpperCase() + p.slice(1)}
            </button>
          ))}
        </div>
        <div className="flex rounded-lg bg-muted p-1">
          <button
            onClick={() => setSort("buzz_score")}
            className={
              "rounded-md px-4 py-1.5 text-sm font-medium transition-colors " +
              (sort === "buzz_score" ? "bg-background shadow" : "text-muted-foreground")
            }
          >
            Top Buzz
          </button>
          <button
            onClick={() => setSort("buzz_velocity")}
            className={
              "rounded-md px-4 py-1.5 text-sm font-medium transition-colors " +
              (sort === "buzz_velocity" ? "bg-background shadow" : "text-muted-foreground")
            }
          >
            Rising Fastest
          </button>
        </div>
      </div>

      {loading ? (
        <div className="py-12 text-center text-muted-foreground">Loading...</div>
      ) : items.length === 0 ? (
        <div className="py-12 text-center text-muted-foreground">
          <p>No signals computed yet.</p>
          <p className="text-xs mt-2">
            Worker schedule: <code>compute_paper_signals</code> runs daily at 3:30 AM UTC.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((p, idx) => (
            <Link
              key={p.paper_id}
              href={`/papers/${p.paper_id}`}
              className="block rounded-lg border border-border bg-card p-4 hover:border-primary/40 transition"
            >
              <div className="flex items-start gap-4">
                <div className="text-2xl font-bold text-orange-500/70 w-8 text-center">
                  {idx + 1}
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold mb-1">{p.title}</h3>
                  <div className="flex flex-wrap gap-1 mb-2">
                    {p.categories.slice(0, 3).map((c) => (
                      <span
                        key={c}
                        className="rounded bg-blue-500/10 px-1.5 py-0.5 text-[10px] font-medium text-blue-600 dark:text-blue-400"
                      >
                        {c}
                      </span>
                    ))}
                  </div>
                  <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                    {p.source_breakdown.citations > 0 && (
                      <span className="flex items-center gap-1">
                        <BookOpen className="h-3 w-3" />
                        {p.source_breakdown.citations} citations
                      </span>
                    )}
                    {p.source_breakdown.hf_upvotes > 0 && (
                      <span className="flex items-center gap-1">
                        🤗 {p.source_breakdown.hf_upvotes}
                      </span>
                    )}
                    {p.source_breakdown.hn_score > 0 && (
                      <span className="flex items-center gap-1">
                        <MessageSquare className="h-3 w-3" />
                        HN {p.source_breakdown.hn_score} ({p.source_breakdown.hn_comments} comments)
                      </span>
                    )}
                    {p.source_breakdown.repo_count > 0 && (
                      <span className="flex items-center gap-1">
                        <Github className="h-3 w-3" />
                        {p.source_breakdown.repo_count} repos · {p.source_breakdown.repo_stars} stars
                      </span>
                    )}
                    {p.source_breakdown.openreview_rating && (
                      <span>📝 OpenReview {p.source_breakdown.openreview_rating.toFixed(1)}</span>
                    )}
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <div className="text-3xl font-bold text-orange-500">
                    {p.buzz_score.toFixed(1)}
                  </div>
                  <div className="text-xs text-muted-foreground">buzz</div>
                  {p.buzz_velocity > 0 && (
                    <div className="flex items-center gap-1 text-green-500 text-xs mt-1 justify-end">
                      <TrendingUp className="h-3 w-3" />+{p.buzz_velocity.toFixed(1)}
                    </div>
                  )}
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
