"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  Sparkles, FileText, GitBranch, Eye, EyeOff,
  Loader2, RefreshCw, Filter, ChevronLeft, ChevronRight,
  Inbox, Star, Check,
} from "lucide-react";
import Link from "next/link";
import { fetchMyFeed, markFeedItems, markAllFeedRead } from "@/lib/api";
import { useAuth } from "@/components/AuthProvider";
import { cn } from "@/lib/utils";

type FeedFilter = "all" | "unread" | "paper" | "repo";

interface FeedItem {
  id: string;
  item_type: "paper" | "repo";
  item_id: string;
  relevance_score: number;
  reason: string | null;
  matched_interests: string | string[];
  is_read: boolean;
  is_dismissed: boolean;
  title?: string;
  full_name?: string;
  description?: string;
  categories?: string[];
  stars_count?: number;
  created_at: string;
}

const PAGE_SIZE = 20;

// ── Relevance indicator ──────────────────────────────────────────────────────
function RelevanceBadge({ score }: { score: number }) {
  const pct = Math.round(score * 100);
  const color =
    pct >= 70 ? "text-emerald-600 bg-emerald-500/10 dark:text-emerald-400"
    : pct >= 40 ? "text-amber-600 bg-amber-500/10 dark:text-amber-400"
    : "text-muted-foreground bg-muted";
  return (
    <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-semibold", color)}>
      {pct}% match
    </span>
  );
}

// ── Feed item card ────────────────────────────────────────────────────────────
function FeedCard({
  item,
  onToggleRead,
  onDismiss,
}: {
  item: FeedItem;
  onToggleRead: () => void;
  onDismiss: () => void;
}) {
  const interests: string[] = (() => {
    try {
      if (!item.matched_interests) return [];
      if (Array.isArray(item.matched_interests)) return item.matched_interests;
      return JSON.parse(item.matched_interests as string);
    } catch {
      return [];
    }
  })();

  const href =
    item.item_type === "paper"
      ? `/papers/${item.item_id}`
      : `/repos/${item.item_id}`;

  const isPaper = item.item_type === "paper";

  return (
    <div
      className={cn(
        "group rounded-2xl border bg-card p-5 shadow-soft transition-all duration-200 dark:shadow-soft-dark",
        item.is_read
          ? "border-border/50 opacity-70 hover:opacity-100"
          : "border-border hover:border-primary/20 hover:shadow-soft-lg"
      )}
    >
      <div className="flex items-start gap-4">
        {/* Type icon */}
        <div
          className={cn(
            "mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl",
            isPaper ? "bg-blue-500/10" : "bg-violet-500/10"
          )}
        >
          {isPaper ? (
            <FileText size={15} className="text-blue-500" />
          ) : (
            <GitBranch size={15} className="text-violet-500" />
          )}
        </div>

        <div className="min-w-0 flex-1">
          <Link href={href} className="block group/link">
            <h3 className="text-[14px] font-semibold leading-snug text-foreground group-hover/link:text-primary transition-colors line-clamp-2">
              {item.title ?? item.full_name ?? item.item_id}
            </h3>
          </Link>

          {item.description && (
            <p className="mt-1.5 text-[12px] leading-relaxed text-muted-foreground line-clamp-2">
              {item.description}
            </p>
          )}

          {item.reason && (
            <p className="mt-1.5 text-[11px] text-muted-foreground italic line-clamp-1">
              {item.reason}
            </p>
          )}

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <RelevanceBadge score={item.relevance_score} />
            {interests.slice(0, 3).map((i) => (
              <span
                key={i}
                className="rounded-md bg-primary/8 px-1.5 py-0.5 text-[10px] font-medium text-primary"
              >
                {i}
              </span>
            ))}
            {item.categories?.[0] && (
              <span className="rounded-md bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                {item.categories[0]}
              </span>
            )}
            {item.stars_count != null && item.stars_count > 0 && (
              <span className="flex items-center gap-0.5 text-[11px] font-medium text-amber-500 dark:text-amber-400">
                <Star size={10} /> {item.stars_count.toLocaleString()}
              </span>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="flex shrink-0 flex-col items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
          <button
            onClick={onToggleRead}
            title={item.is_read ? "Mark unread" : "Mark read"}
            className="flex h-8 w-8 items-center justify-center rounded-xl text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          >
            {item.is_read ? <EyeOff size={13} /> : <Eye size={13} />}
          </button>
          <button
            onClick={onDismiss}
            title="Dismiss"
            className="flex h-8 w-8 items-center justify-center rounded-xl text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors"
          >
            <EyeOff size={13} />
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function MyFeedPage() {
  const { user } = useAuth();
  const router = useRouter();

  const [items, setItems] = useState<FeedItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FeedFilter>("unread");
  const [markingAll, setMarkingAll] = useState(false);

  useEffect(() => {
    if (user && !user.onboarding_completed) {
      router.push("/onboarding");
    }
  }, [user]);

  const loadFeed = useCallback(async (p: number, f: FeedFilter) => {
    setLoading(true);
    try {
      const params: Record<string, any> = { skip: p * PAGE_SIZE, limit: PAGE_SIZE };
      if (f === "unread") params.unread_only = true;
      if (f === "paper") params.item_type = "paper";
      if (f === "repo") params.item_type = "repo";

      const data = await fetchMyFeed(params);
      setItems(data.items ?? data ?? []);
      setTotal(data.total_count ?? data.total ?? (data.items ?? data ?? []).length);
    } catch {
      setItems([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadFeed(page, filter);
  }, [page, filter]);

  const handleFilterChange = (f: FeedFilter) => {
    setFilter(f);
    setPage(0);
  };

  const handleToggleRead = async (id: string, isRead: boolean) => {
    await markFeedItems([id], isRead ? "unread" : "read");
    setItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, is_read: !isRead } : item))
    );
  };

  const handleDismiss = async (id: string) => {
    await markFeedItems([id], "dismiss");
    setItems((prev) => prev.filter((item) => item.id !== id));
    setTotal((t) => Math.max(0, t - 1));
  };

  const handleMarkAllRead = async () => {
    setMarkingAll(true);
    try {
      await markAllFeedRead();
      setItems((prev) => prev.map((item) => ({ ...item, is_read: true })));
    } finally {
      setMarkingAll(false);
    }
  };

  const totalPages = Math.ceil(total / PAGE_SIZE);
  const unreadCount = items.filter((i) => !i.is_read).length;

  const FILTERS: { value: FeedFilter; label: string }[] = [
    { value: "unread", label: "Unread" },
    { value: "all", label: "All" },
    { value: "paper", label: "Papers" },
    { value: "repo", label: "Repos" },
  ];

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-3 text-3xl font-semibold tracking-tighter text-foreground">
            <Sparkles size={26} className="text-primary" />
            My Feed
          </h1>
          <p className="mt-2 text-[15px] text-muted-foreground">
            Papers and repos matched to your research interests
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {unreadCount > 0 && filter !== "repo" && (
            <button
              onClick={handleMarkAllRead}
              disabled={markingAll}
              className="flex items-center gap-2 rounded-xl border border-border px-3 py-2 text-[12px] font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
            >
              {markingAll ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
              Mark all read
            </button>
          )}
          <button
            onClick={() => loadFeed(page, filter)}
            className="flex h-9 w-9 items-center justify-center rounded-xl border border-border text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
            title="Refresh"
          >
            <RefreshCw size={14} />
          </button>
        </div>
      </div>

      {/* Onboarding prompt */}
      {user && !user.onboarding_completed && (
        <div className="rounded-2xl border border-amber-500/20 bg-amber-500/10 p-5">
          <p className="text-[13px] font-medium text-foreground">
            Complete your research profile to get a personalised feed
          </p>
          <Link
            href="/onboarding"
            className="mt-3 inline-flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-[12px] font-medium text-primary-foreground hover:opacity-90 transition-opacity"
          >
            <Sparkles size={12} /> Set up profile
          </Link>
        </div>
      )}

      {/* Filter pills */}
      <div className="flex items-center gap-2">
        <Filter size={14} className="text-muted-foreground" />
        {FILTERS.map((f) => (
          <button
            key={f.value}
            onClick={() => handleFilterChange(f.value)}
            className={cn(
              "rounded-xl px-3 py-1.5 text-[12px] font-medium transition-all duration-150",
              filter === f.value
                ? "bg-primary/12 text-primary ring-1 ring-primary/20"
                : "bg-muted text-muted-foreground hover:bg-muted/80 hover:text-foreground"
            )}
          >
            {f.label}
          </button>
        ))}
        {total > 0 && (
          <span className="ml-1 text-[12px] text-muted-foreground">
            {total.toLocaleString()} item{total !== 1 ? "s" : ""}
          </span>
        )}
      </div>

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-20">
          <Loader2 size={24} className="animate-spin text-muted-foreground" />
        </div>
      )}

      {/* Empty state */}
      {!loading && items.length === 0 && (
        <div className="py-20 text-center">
          <Inbox size={44} className="mx-auto text-muted-foreground/20" />
          <p className="mt-5 text-[15px] font-medium text-foreground">
            {filter === "unread" ? "You're all caught up!" : "No items in your feed yet"}
          </p>
          <p className="mt-2 text-[13px] text-muted-foreground">
            {filter === "unread"
              ? "Switch to 'All' to see previously read items"
              : "New papers and repos matching your interests will appear here daily"}
          </p>
          {filter === "unread" && (
            <button
              onClick={() => handleFilterChange("all")}
              className="mt-5 inline-flex items-center gap-1.5 rounded-xl border border-border px-4 py-2 text-[12px] font-medium text-muted-foreground hover:bg-muted transition-colors"
            >
              View all items
            </button>
          )}
        </div>
      )}

      {/* Feed list */}
      {!loading && items.length > 0 && (
        <div className="space-y-3">
          {items.map((item) => (
            <FeedCard
              key={item.id}
              item={item}
              onToggleRead={() => handleToggleRead(item.id, item.is_read)}
              onDismiss={() => handleDismiss(item.id)}
            />
          ))}
        </div>
      )}

      {/* Pagination */}
      {!loading && totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <button
            disabled={page === 0}
            onClick={() => setPage((p) => p - 1)}
            className="flex h-9 w-9 items-center justify-center rounded-xl border border-border text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            <ChevronLeft size={15} />
          </button>
          <span className="text-[13px] text-muted-foreground">
            Page {page + 1} of {totalPages}
          </span>
          <button
            disabled={page >= totalPages - 1}
            onClick={() => setPage((p) => p + 1)}
            className="flex h-9 w-9 items-center justify-center rounded-xl border border-border text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            <ChevronRight size={15} />
          </button>
        </div>
      )}

      {/* Profile nudge when feed is empty and onboarding complete */}
      {!loading && items.length === 0 && user?.onboarding_completed && (
        <div className="rounded-2xl border border-border bg-card p-6 text-center shadow-soft dark:shadow-soft-dark">
          <p className="text-[13px] text-muted-foreground">
            Feed is generated daily. If it's your first time, come back tomorrow — or add more interests in{" "}
            <Link href="/settings/profile" className="text-primary hover:underline">
              Profile Settings
            </Link>
            .
          </p>
        </div>
      )}
    </div>
  );
}
