"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Users, Search } from "lucide-react";
import { fetchAuthorsList } from "@/lib/api";

interface AuthorItem {
  id: string;
  name: string;
  affiliations: string[];
  h_index: number | null;
  citation_count: number;
  paper_count: number;
  topics: string[];
}

export default function AuthorsPage() {
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<"paper_count" | "citation_count" | "h_index">(
    "paper_count",
  );
  const [items, setItems] = useState<AuthorItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    const handler = setTimeout(() => {
      fetchAuthorsList({ search: search || undefined, sort, limit: 50 })
        .then((d) => {
          setItems(d.items);
          setTotal(d.total);
        })
        .finally(() => setLoading(false));
    }, 300);
    return () => clearTimeout(handler);
  }, [search, sort]);

  return (
    <div className="container max-w-6xl py-8">
      <div className="mb-6">
        <h1 className="text-3xl font-bold flex items-center gap-2">
          <Users className="h-7 w-7" />
          Authors
        </h1>
        <p className="text-muted-foreground mt-1">{total} authors indexed</p>
      </div>

      <div className="flex gap-3 mb-6">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search by name..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-lg border border-border bg-background pl-10 pr-4 py-2"
          />
        </div>
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value as any)}
          className="rounded-lg border border-border bg-background px-3 py-2 text-sm"
        >
          <option value="paper_count">Paper Count</option>
          <option value="citation_count">Citations</option>
          <option value="h_index">H-Index</option>
        </select>
      </div>

      {loading ? (
        <p>Loading...</p>
      ) : items.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <p>No authors found.</p>
          <p className="text-xs mt-2">
            Worker schedule: <code>build_author_profiles</code> runs daily at 5 AM UTC.
          </p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((a) => (
            <Link
              key={a.id}
              href={`/authors/${a.id}`}
              className="rounded-lg border border-border p-4 hover:border-primary/50 transition"
            >
              <h3 className="font-semibold mb-1 truncate">{a.name}</h3>
              {a.affiliations[0] && (
                <p className="text-xs text-muted-foreground truncate mb-2">
                  {a.affiliations[0]}
                </p>
              )}
              <div className="flex gap-3 text-xs">
                <span>📄 {a.paper_count}</span>
                <span>📈 {a.citation_count}</span>
                {a.h_index != null && <span>h={a.h_index}</span>}
              </div>
              <div className="flex flex-wrap gap-1 mt-2">
                {a.topics.slice(0, 4).map((t) => (
                  <span
                    key={t}
                    className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium"
                  >
                    {t}
                  </span>
                ))}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
