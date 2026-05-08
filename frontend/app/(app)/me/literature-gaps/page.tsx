"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Search, AlertCircle, TrendingDown, Compass } from "lucide-react";
import { fetchLiteratureGaps } from "@/lib/api";
import { useAuth } from "@/components/AuthProvider";

interface Gap {
  category: string;
  matched_interests: string[];
  recent_papers_count: number;
  prev_papers_count: number;
  gap_score: number;
  rationale: string;
}

export default function LiteratureGapsPage() {
  const { user, loading } = useAuth();
  const [items, setItems] = useState<Gap[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(true);

  useEffect(() => {
    if (!user) return;
    setBusy(true);
    fetchLiteratureGaps()
      .then((d) => {
        setItems(d.items || []);
        setMessage(d.message || null);
      })
      .finally(() => setBusy(false));
  }, [user]);

  if (loading) return null;
  if (!user) return <div className="p-8">Login required.</div>;

  return (
    <div className="container max-w-4xl py-8">
      <div className="mb-6">
        <h1 className="text-3xl font-bold flex items-center gap-2">
          <Compass className="h-7 w-7 text-blue-500" />
          Literature Gap Finder
        </h1>
        <p className="text-muted-foreground mt-1">
          Phát hiện các category trong research_interests có ít publication —
          cơ hội nghiên cứu.
        </p>
      </div>

      {message && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-4 mb-6 flex gap-3 items-start">
          <AlertCircle className="h-5 w-5 text-amber-500 shrink-0 mt-0.5" />
          <div className="text-sm">
            <p className="font-medium text-amber-700 dark:text-amber-400">{message}</p>
            <Link
              href="/onboarding"
              className="text-xs text-amber-600 hover:underline mt-1 inline-block"
            >
              → Set research interests
            </Link>
          </div>
        </div>
      )}

      {busy ? (
        <p className="text-muted-foreground">Đang phân tích...</p>
      ) : items.length === 0 && !message ? (
        <p className="text-muted-foreground">No gaps found. Worker chưa chạy hoặc data không đủ.</p>
      ) : (
        <ul className="space-y-3">
          {items.map((g) => (
            <li
              key={g.category}
              className="rounded-lg border border-border bg-card p-5"
            >
              <div className="flex items-start justify-between gap-4 mb-2">
                <div>
                  <h3 className="text-lg font-semibold flex items-center gap-2">
                    <span className="rounded bg-blue-500/10 px-2 py-0.5 text-sm text-blue-600 dark:text-blue-400 font-mono">
                      {g.category}
                    </span>
                  </h3>
                  <div className="flex gap-2 flex-wrap mt-2">
                    {g.matched_interests.map((i) => (
                      <span
                        key={i}
                        className="rounded-full bg-purple-500/10 px-2 py-0.5 text-xs text-purple-600 dark:text-purple-400"
                      >
                        {i}
                      </span>
                    ))}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-3xl font-bold text-blue-500">
                    {(g.gap_score * 100).toFixed(0)}
                  </div>
                  <div className="text-[10px] text-muted-foreground uppercase tracking-wide">
                    gap score
                  </div>
                </div>
              </div>

              <p className="text-sm text-muted-foreground italic">{g.rationale}</p>

              <div className="mt-3 flex gap-4 text-xs">
                <span>Recent (30d): <strong>{g.recent_papers_count}</strong> papers</span>
                <span className="text-muted-foreground">
                  Previous: {g.prev_papers_count} papers
                </span>
                {g.recent_papers_count < g.prev_papers_count && (
                  <span className="text-orange-500 flex items-center gap-1">
                    <TrendingDown className="h-3 w-3" />
                    Declining
                  </span>
                )}
              </div>

              <Link
                href={`/papers?category=${encodeURIComponent(g.category)}`}
                className="inline-flex items-center gap-1 mt-3 text-xs text-blue-500 hover:underline"
              >
                <Search className="h-3 w-3" />
                Browse papers in {g.category}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
