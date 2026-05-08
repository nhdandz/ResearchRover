"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ListOrdered, Clock, TrendingUp } from "lucide-react";
import { fetchReadingQueue } from "@/lib/api";
import { useAuth } from "@/components/AuthProvider";

interface QueueItem {
  bookmark_id: string;
  paper_id: string;
  title: string;
  arxiv_id: string | null;
  abstract_preview: string;
  categories: string[];
  priority_score: number;
  factors: {
    relevance: number;
    buzz: number;
    recency: number;
    reading_time_factor: number;
  };
  estimated_reading_minutes: number;
  saved_at: string | null;
}

export default function ReadingQueuePage() {
  const { user, loading: authLoading } = useAuth();
  const [items, setItems] = useState<QueueItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    fetchReadingQueue(30)
      .then((d) => setItems(d.items))
      .finally(() => setLoading(false));
  }, [user]);

  if (authLoading) return null;
  if (!user) return <div className="p-8 text-center">Login required.</div>;

  return (
    <div className="container max-w-4xl py-8">
      <h1 className="text-3xl font-bold flex items-center gap-2 mb-2">
        <ListOrdered className="h-7 w-7" />
        Reading Priority Queue
      </h1>
      <p className="text-muted-foreground mb-6">
        Bookmarked papers ranked by relevance × buzz × recency × reading time.
      </p>

      {loading ? (
        <p>Loading...</p>
      ) : items.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <p>No saved papers in queue.</p>
          <p className="text-sm mt-2">
            Bookmark papers as "saved" status to populate the queue.
          </p>
        </div>
      ) : (
        <ol className="space-y-3">
          {items.map((item, idx) => (
            <li
              key={item.bookmark_id}
              className="rounded-lg border border-border p-4 hover:border-primary/50 transition"
            >
              <div className="flex gap-4">
                <div className="text-2xl font-bold text-primary/60 w-8 shrink-0 text-center">
                  {idx + 1}
                </div>
                <div className="flex-1 min-w-0">
                  <Link
                    href={`/papers/${item.paper_id}`}
                    className="block hover:underline"
                  >
                    <h3 className="font-semibold leading-tight">{item.title}</h3>
                  </Link>
                  <p className="text-sm text-muted-foreground line-clamp-2 mt-1">
                    {item.abstract_preview}
                  </p>
                  <div className="flex gap-4 mt-3 text-xs">
                    <span className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />~{item.estimated_reading_minutes} min
                    </span>
                    <span className="text-muted-foreground">
                      Relevance{" "}
                      <strong className="text-foreground">
                        {(item.factors.relevance * 100).toFixed(0)}%
                      </strong>
                    </span>
                    <span className="text-muted-foreground">
                      Buzz{" "}
                      <strong className="text-foreground">
                        {(item.factors.buzz * 100).toFixed(0)}%
                      </strong>
                    </span>
                    <span className="text-muted-foreground">
                      Recency{" "}
                      <strong className="text-foreground">
                        {(item.factors.recency * 100).toFixed(0)}%
                      </strong>
                    </span>
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <div className="text-2xl font-bold text-primary">
                    {(item.priority_score * 100).toFixed(0)}
                  </div>
                  <div className="text-[10px] text-muted-foreground uppercase">priority</div>
                </div>
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
