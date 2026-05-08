"use client";

import { useEffect, useState } from "react";
import { Sparkles, TrendingUp, TrendingDown, Minus } from "lucide-react";
import { fetchTrendingConcepts } from "@/lib/api";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";

interface ConceptItem {
  concept: string;
  paper_count: number;
  growth_rate: number;
  status: string;
  data_points: { week: string; count: number }[];
}

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  hot: { label: "🔥 Hot", color: "bg-red-500/10 text-red-500" },
  rising: { label: "📈 Rising", color: "bg-green-500/10 text-green-500" },
  stable: { label: "= Stable", color: "bg-blue-500/10 text-blue-500" },
  declining: { label: "📉 Declining", color: "bg-orange-500/10 text-orange-500" },
  stale: { label: "💤 Stale", color: "bg-muted text-muted-foreground" },
};

export default function ConceptsPage() {
  const [filter, setFilter] = useState<string | null>(null);
  const [items, setItems] = useState<ConceptItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<ConceptItem | null>(null);

  useEffect(() => {
    setLoading(true);
    const params: any = { limit: 60 };
    if (filter) params.status = filter;
    fetchTrendingConcepts(params)
      .then((d) => {
        setItems(d.items);
        if (d.items.length > 0 && !selected) setSelected(d.items[0]);
      })
      .finally(() => setLoading(false));
  }, [filter]);

  return (
    <div className="container max-w-7xl py-8">
      <div className="mb-6">
        <h1 className="text-3xl font-bold flex items-center gap-2">
          <Sparkles className="h-7 w-7 text-purple-500" />
          Concept Trends
        </h1>
        <p className="text-muted-foreground mt-1">
          Phát hiện thuật ngữ mới nổi, theo dõi sự dịch chuyển trong nghiên cứu.
        </p>
      </div>

      <div className="flex gap-2 mb-6 flex-wrap">
        {Object.entries(STATUS_LABELS).map(([key, { label, color }]) => (
          <button
            key={key}
            onClick={() => setFilter(filter === key ? null : key)}
            className={
              "rounded-full px-3 py-1.5 text-sm font-medium transition-colors " +
              (filter === key ? color + " ring-2 ring-current" : color)
            }
          >
            {label}
          </button>
        ))}
        {filter && (
          <button
            onClick={() => setFilter(null)}
            className="text-xs text-muted-foreground underline"
          >
            Clear filter
          </button>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-2 max-h-[700px] overflow-y-auto pr-2">
          {loading ? (
            <p className="text-muted-foreground">Loading...</p>
          ) : items.length === 0 ? (
            <p className="text-muted-foreground py-8 text-center">
              No concept trends yet. Worker runs weekly on Monday.
            </p>
          ) : (
            items.map((c) => {
              const status = STATUS_LABELS[c.status] || STATUS_LABELS.stable;
              const isSelected = selected?.concept === c.concept;
              return (
                <button
                  key={c.concept}
                  onClick={() => setSelected(c)}
                  className={
                    "w-full text-left rounded-lg border p-3 transition-colors " +
                    (isSelected
                      ? "border-primary bg-primary/5"
                      : "border-border hover:border-primary/50")
                  }
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-mono text-sm font-semibold">{c.concept}</span>
                    <span className={"text-xs rounded px-2 py-0.5 " + status.color}>
                      {status.label}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground">
                    <span>{c.paper_count} papers/week</span>
                    <span
                      className={
                        c.growth_rate > 0
                          ? "text-green-500"
                          : c.growth_rate < 0
                          ? "text-red-500"
                          : ""
                      }
                    >
                      {c.growth_rate > 0 ? "+" : ""}
                      {(c.growth_rate * 100).toFixed(0)}%
                    </span>
                  </div>
                </button>
              );
            })
          )}
        </div>

        <div className="rounded-lg border border-border bg-card p-6 sticky top-20 self-start">
          {selected ? (
            <>
              <h2 className="text-xl font-bold font-mono mb-2">{selected.concept}</h2>
              <div className="flex gap-4 text-sm mb-4">
                <span>📊 {selected.paper_count} papers</span>
                <span
                  className={
                    selected.growth_rate > 0 ? "text-green-500" : "text-red-500"
                  }
                >
                  {selected.growth_rate > 0 ? (
                    <TrendingUp className="inline h-4 w-4 mr-1" />
                  ) : selected.growth_rate < 0 ? (
                    <TrendingDown className="inline h-4 w-4 mr-1" />
                  ) : (
                    <Minus className="inline h-4 w-4 mr-1" />
                  )}
                  {(selected.growth_rate * 100).toFixed(1)}% growth
                </span>
              </div>

              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={selected.data_points}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgb(var(--border))" />
                    <XAxis
                      dataKey="week"
                      stroke="rgb(var(--muted-foreground))"
                      fontSize={11}
                    />
                    <YAxis stroke="rgb(var(--muted-foreground))" fontSize={11} />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "rgb(var(--card))",
                        border: "1px solid rgb(var(--border))",
                      }}
                    />
                    <Line
                      type="monotone"
                      dataKey="count"
                      stroke="#8b5cf6"
                      strokeWidth={2}
                      dot={{ r: 3 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </>
          ) : (
            <p className="text-muted-foreground text-center py-12">
              Select a concept to see its time-series.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
