"use client";

import {
  FileText, GitBranch, TrendingUp, Zap, ArrowUpRight,
  Sparkles, RefreshCw, ChevronRight, Eye, EyeOff,
  Loader2, BookMarked, Search,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { fetchPapers, fetchRepos, fetchMyFeed, markFeedItems, markAllFeedRead } from "@/lib/api";
import { formatDate, formatNumber } from "@/lib/utils";
import { useAuth } from "@/components/AuthProvider";
import { cn } from "@/lib/utils";

function StatCard({ icon: Icon, label, value, href }: any) {
  return (
    <Link
      href={href}
      className="group relative rounded-2xl border border-border bg-card p-6 shadow-soft transition-all duration-200 hover:shadow-soft-lg hover:border-primary/20 dark:shadow-soft-dark dark:hover:shadow-soft-dark-lg"
    >
      <div className="flex items-center justify-between">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
          <Icon size={18} className="text-primary" />
        </div>
        <ArrowUpRight
          size={16}
          className="text-muted-foreground/40 transition-all duration-200 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-primary"
        />
      </div>
      <div className="mt-5">
        <p className="text-3xl font-semibold tracking-tighter text-foreground">{value}</p>
        <p className="mt-1 text-[13px] text-muted-foreground">{label}</p>
      </div>
    </Link>
  );
}

// ── Feed item card ──
function FeedItemCard({
  item,
  onMarkRead,
  onDismiss,
}: {
  item: any;
  onMarkRead: () => void;
  onDismiss: () => void;
}) {
  const relevancePct = Math.round((item.relevance_score ?? 0) * 100);
  const dotColor =
    relevancePct >= 70
      ? "bg-emerald-500"
      : relevancePct >= 40
      ? "bg-amber-500"
      : "bg-muted-foreground";

  const interests: string[] = (() => {
    try {
      if (!item.matched_interests) return [];
      if (Array.isArray(item.matched_interests)) return item.matched_interests;
      return JSON.parse(item.matched_interests);
    } catch {
      return [];
    }
  })();

  const href =
    item.item_type === "paper"
      ? `/papers/${item.item_id}`
      : `/repos/${item.item_id}`;

  return (
    <div
      className={cn(
        "group flex items-start gap-3 rounded-xl border p-4 transition-all duration-150 hover:bg-muted/30",
        item.is_read ? "border-border/50 opacity-60" : "border-border"
      )}
    >
      {/* Type icon */}
      <div
        className={cn(
          "mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg",
          item.item_type === "paper" ? "bg-blue-500/10" : "bg-violet-500/10"
        )}
      >
        {item.item_type === "paper" ? (
          <FileText size={13} className="text-blue-500" />
        ) : (
          <GitBranch size={13} className="text-violet-500" />
        )}
      </div>

      <div className="min-w-0 flex-1">
        <Link href={href} className="block">
          <p className="text-[13px] font-medium leading-snug text-foreground hover:text-primary transition-colors line-clamp-2">
            {item.title ?? item.full_name ?? item.item_id}
          </p>
        </Link>

        {item.reason && (
          <p className="mt-1 text-[11px] text-muted-foreground line-clamp-1 italic">
            {item.reason}
          </p>
        )}

        <div className="mt-2 flex flex-wrap items-center gap-2">
          {/* Relevance dot */}
          <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
            <span className={cn("h-1.5 w-1.5 rounded-full", dotColor)} />
            {relevancePct}% match
          </span>
          {interests.slice(0, 2).map((interest) => (
            <span
              key={interest}
              className="rounded-md bg-primary/8 px-1.5 py-0.5 text-[10px] font-medium text-primary"
            >
              {interest}
            </span>
          ))}
        </div>
      </div>

      {/* Actions */}
      <div className="flex shrink-0 items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
        <button
          onClick={onMarkRead}
          title={item.is_read ? "Mark unread" : "Mark read"}
          className="flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
        >
          {item.is_read ? <EyeOff size={12} /> : <Eye size={12} />}
        </button>
        <button
          onClick={onDismiss}
          title="Dismiss"
          className="flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors"
        >
          <EyeOff size={12} />
        </button>
      </div>
    </div>
  );
}

// ── My Feed Widget ──
function MyFeedWidget() {
  const { user } = useAuth();
  const [feedItems, setFeedItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [markingAll, setMarkingAll] = useState(false);

  useEffect(() => {
    if (!user?.onboarding_completed) { setLoading(false); return; }
    loadFeed();
  }, [user]);

  const loadFeed = async () => {
    setLoading(true);
    try {
      const data = await fetchMyFeed({ limit: 8, unread_only: true });
      setFeedItems(data.items ?? data ?? []);
    } catch {
      setFeedItems([]);
    } finally {
      setLoading(false);
    }
  };

  const handleMarkRead = async (id: string, isRead: boolean) => {
    await markFeedItems([id], isRead ? "unread" : "read");
    setFeedItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, is_read: !isRead } : item))
    );
  };

  const handleDismiss = async (id: string) => {
    await markFeedItems([id], "dismiss");
    setFeedItems((prev) => prev.filter((item) => item.id !== id));
  };

  const handleMarkAllRead = async () => {
    setMarkingAll(true);
    try {
      await markAllFeedRead();
      setFeedItems((prev) => prev.map((item) => ({ ...item, is_read: true })));
    } finally {
      setMarkingAll(false);
    }
  };

  const unreadCount = feedItems.filter((i) => !i.is_read).length;

  // No feed yet — prompt to complete onboarding or explain
  if (!user?.onboarding_completed) {
    return (
      <div className="rounded-2xl border border-border bg-card p-6 shadow-soft dark:shadow-soft-dark">
        <div className="flex items-center gap-2 mb-4">
          <Sparkles size={16} className="text-primary" />
          <h2 className="text-lg font-semibold tracking-tighter text-foreground">My Feed</h2>
        </div>
        <div className="py-6 text-center">
          <Sparkles size={32} className="mx-auto text-muted-foreground/20 mb-3" />
          <p className="text-[13px] font-medium text-foreground">Set up your research profile</p>
          <p className="mt-1 text-[12px] text-muted-foreground">
            Complete onboarding to get a personalised feed
          </p>
          <Link
            href="/onboarding"
            className="mt-4 inline-flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-[12px] font-medium text-primary-foreground hover:opacity-90 transition-opacity"
          >
            <Sparkles size={12} /> Complete Setup
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-border bg-card p-6 shadow-soft dark:shadow-soft-dark">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Sparkles size={16} className="text-primary" />
          <h2 className="text-lg font-semibold tracking-tighter text-foreground">My Feed</h2>
          {unreadCount > 0 && (
            <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[11px] font-semibold text-primary">
              {unreadCount} new
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          {unreadCount > 0 && (
            <button
              onClick={handleMarkAllRead}
              disabled={markingAll}
              className="flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[11px] font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
            >
              {markingAll ? <Loader2 size={11} className="animate-spin" /> : <Eye size={11} />}
              Mark all read
            </button>
          )}
          <button
            onClick={loadFeed}
            className="flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
            title="Refresh feed"
          >
            <RefreshCw size={13} />
          </button>
        </div>
      </div>

      {loading && (
        <div className="flex items-center justify-center py-10">
          <Loader2 size={20} className="animate-spin text-muted-foreground" />
        </div>
      )}

      {!loading && feedItems.length === 0 && (
        <div className="py-8 text-center">
          <Sparkles size={28} className="mx-auto text-muted-foreground/20 mb-3" />
          <p className="text-[13px] font-medium text-foreground">Your feed is empty</p>
          <p className="mt-1 text-[12px] text-muted-foreground">
            New papers and repos matching your interests will appear here
          </p>
        </div>
      )}

      {!loading && feedItems.length > 0 && (
        <div className="space-y-2">
          {feedItems.map((item) => (
            <FeedItemCard
              key={item.id}
              item={item}
              onMarkRead={() => handleMarkRead(item.id, item.is_read)}
              onDismiss={() => handleDismiss(item.id)}
            />
          ))}
        </div>
      )}

      {!loading && feedItems.length > 0 && (
        <Link
          href="/me/feed"
          className="mt-4 flex items-center justify-center gap-1.5 rounded-xl border border-border py-2.5 text-[12px] font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
        >
          View full feed <ChevronRight size={13} />
        </Link>
      )}
    </div>
  );
}

export default function Dashboard() {
  const { user } = useAuth();
  const [stats, setStats] = useState({ papers: 0, repos: 0, trending: 0 });
  const [recentPapers, setRecentPapers] = useState<any[]>([]);

  useEffect(() => {
    fetchPapers({ limit: 5 })
      .then((d) => {
        setStats((s) => ({ ...s, papers: d.total || 0 }));
        setRecentPapers(d.items || []);
      })
      .catch(() => {});

    fetchRepos({ limit: 1 })
      .then((d) => {
        setStats((s) => ({ ...s, repos: d.total || 0 }));
      })
      .catch(() => {});
  }, []);

  return (
    <div className="space-y-10">
      <div>
        <h1 className="text-3xl font-semibold tracking-tighter text-foreground">
          {user?.onboarding_completed
            ? `Welcome back${user?.email ? `, ${user.email.split("@")[0]}` : ""}` 
            : "Dashboard"}
        </h1>
        <p className="mt-2 text-[15px] text-muted-foreground">
          Overview of your research intelligence
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard icon={FileText} label="Total Papers" value={formatNumber(stats.papers)} href="/papers" />
        <StatCard icon={GitBranch} label="Repositories" value={formatNumber(stats.repos)} href="/repos" />
        <StatCard icon={TrendingUp} label="Trending" value={formatNumber(stats.trending)} href="/trending" />
        <StatCard icon={Zap} label="Alerts" value="0" href="/reports" />
      </div>

      {/* Main content: feed + recent + quick actions */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* My Feed — takes 2/3 on large screens */}
        <div className="lg:col-span-2">
          <MyFeedWidget />
        </div>

        {/* Right column */}
        <div className="space-y-6">
          {/* Recent Papers */}
          <div className="rounded-2xl border border-border bg-card p-6 shadow-soft dark:shadow-soft-dark">
            <h2 className="text-lg font-semibold tracking-tighter text-foreground">
              Recent Papers
            </h2>
            <div className="mt-5 space-y-2">
              {recentPapers.length === 0 && (
                <p className="py-8 text-center text-[13px] text-muted-foreground">
                  No papers collected yet. Start the collection jobs.
                </p>
              )}
              {recentPapers.map((paper: any) => (
                <Link
                  key={paper.id}
                  href={`/papers/${paper.id}`}
                  className="block rounded-xl border border-border p-4 transition-all duration-150 hover:bg-muted/50 hover:border-primary/20"
                >
                  <p className="text-[13px] font-medium leading-snug text-foreground line-clamp-1">
                    {paper.title}
                  </p>
                  <div className="mt-2 flex items-center gap-3 text-[11px] text-muted-foreground">
                    <span>{formatDate(paper.published_date)}</span>
                    {paper.categories?.length > 0 && (
                      <span className="rounded-lg bg-muted px-2 py-0.5 font-medium">
                        {paper.categories[0]}
                      </span>
                    )}
                    <span>{paper.citation_count} citations</span>
                  </div>
                </Link>
              ))}
            </div>
          </div>

          {/* Quick Actions */}
          <div className="rounded-2xl border border-border bg-card p-6 shadow-soft dark:shadow-soft-dark">
            <h2 className="text-lg font-semibold tracking-tighter text-foreground">
              Quick Actions
            </h2>
            <div className="mt-5 grid grid-cols-2 gap-3">
              {[
                { href: "/chat", title: "Ask AI", desc: "Query research knowledge" },
                { href: "/trending", title: "View Trending", desc: "Papers & repos" },
                { href: "/me/digest", title: "My Digest", desc: "Weekly highlights" },
                { href: "/settings/searches", title: "Saved Searches", desc: "Track topics" },
                { href: "/my-library", title: "My Library", desc: "Bookmarked items" },
                { href: "/settings/alerts", title: "My Alerts", desc: "Manage alerts" },
              ].map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="group rounded-xl border border-border p-4 text-center transition-all duration-150 hover:border-primary/30 hover:bg-primary/5 hover:shadow-glow"
                >
                  <p className="text-[12px] font-semibold text-foreground">{item.title}</p>
                  <p className="mt-0.5 text-[10px] text-muted-foreground">{item.desc}</p>
                </Link>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
