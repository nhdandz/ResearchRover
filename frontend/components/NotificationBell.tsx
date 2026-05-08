"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  Bell,
  Check,
  CheckCheck,
  Trash2,
  X,
  AlertTriangle,
  TrendingUp,
  BookOpen,
  Star,
  UserPlus,
  Sparkles,
} from "lucide-react";
import {
  fetchNotifications,
  fetchUnreadCount,
  markAllNotificationsRead,
  markNotifications,
  type Notification,
} from "@/lib/api";
import { useAuth } from "@/components/AuthProvider";
import { cn } from "@/lib/utils";

const TYPE_ICONS: Record<string, any> = {
  alert_keyword: Sparkles,
  alert_author: UserPlus,
  alert_citation: TrendingUp,
  alert_venue: BookOpen,
  alert_repo_milestone: Star,
  digest_ready: BookOpen,
  feed_summary: Sparkles,
  system: AlertTriangle,
};

function timeAgo(iso: string): string {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return "";
  const diff = (Date.now() - t) / 1000;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
  return new Date(t).toLocaleDateString();
}

export function NotificationBell() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState(0);
  const [items, setItems] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Poll unread count every 60s
  useEffect(() => {
    if (!user) return;

    let cancelled = false;
    const tick = async () => {
      try {
        const data = await fetchUnreadCount();
        if (!cancelled) setUnread(data.unread_count);
      } catch {
        /* ignore */
      }
    };
    tick();
    const id = window.setInterval(tick, 60000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [user]);

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const loadItems = async () => {
    setLoading(true);
    try {
      const data = await fetchNotifications({ limit: 15 });
      setItems(data.items);
      setUnread(data.unread_count);
    } finally {
      setLoading(false);
    }
  };

  const handleOpen = () => {
    setOpen((prev) => {
      const next = !prev;
      if (next && items.length === 0) loadItems();
      return next;
    });
  };

  const handleMarkRead = async (id: string) => {
    await markNotifications([id], "read");
    setItems((prev) =>
      prev.map((n) => (n.id === id ? { ...n, is_read: true } : n)),
    );
    setUnread((c) => Math.max(0, c - 1));
  };

  const handleMarkAll = async () => {
    await markAllNotificationsRead();
    setItems((prev) => prev.map((n) => ({ ...n, is_read: true })));
    setUnread(0);
  };

  const handleDelete = async (id: string) => {
    await markNotifications([id], "delete");
    setItems((prev) => prev.filter((n) => n.id !== id));
  };

  if (!user) return null;

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={handleOpen}
        className="relative rounded-md p-2 hover:bg-muted/50 transition-colors"
        aria-label="Notifications"
      >
        <Bell className="h-5 w-5" />
        {unread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 inline-flex items-center justify-center rounded-full bg-red-500 px-1.5 py-0.5 text-[10px] font-bold text-white min-w-[18px] h-[18px]">
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-[420px] max-h-[80vh] overflow-hidden rounded-lg border border-border bg-background shadow-2xl z-50 flex flex-col">
          <div className="flex items-center justify-between px-4 py-3 border-b border-border">
            <div className="flex items-center gap-2">
              <Bell className="h-4 w-4" />
              <h3 className="font-semibold text-sm">Notifications</h3>
              {unread > 0 && (
                <span className="rounded-full bg-blue-500/15 px-2 py-0.5 text-[10px] font-medium text-blue-600 dark:text-blue-400">
                  {unread} unread
                </span>
              )}
            </div>
            <div className="flex items-center gap-1">
              {unread > 0 && (
                <button
                  onClick={handleMarkAll}
                  className="rounded p-1.5 hover:bg-muted text-xs flex items-center gap-1"
                  title="Mark all as read"
                >
                  <CheckCheck className="h-3.5 w-3.5" />
                  Mark all read
                </button>
              )}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto">
            {loading ? (
              <div className="flex items-center justify-center py-8 text-sm text-muted-foreground">
                Loading...
              </div>
            ) : items.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-sm text-muted-foreground">
                <Bell className="h-8 w-8 mb-2 opacity-30" />
                <p>No notifications yet</p>
                <p className="text-xs mt-1 opacity-70">
                  Create alerts in /me/alerts to get started
                </p>
              </div>
            ) : (
              <ul className="divide-y divide-border">
                {items.map((n) => {
                  const Icon = TYPE_ICONS[n.notification_type] || Bell;
                  const severityColor = {
                    info: "text-blue-500",
                    success: "text-green-500",
                    warning: "text-amber-500",
                    critical: "text-red-500",
                  }[n.severity] || "text-blue-500";

                  return (
                    <li
                      key={n.id}
                      className={cn(
                        "px-4 py-3 hover:bg-muted/30 transition-colors group relative",
                        !n.is_read && "bg-blue-500/5",
                      )}
                    >
                      <div className="flex gap-3">
                        <div className={cn("mt-0.5 shrink-0", severityColor)}>
                          <Icon className="h-4 w-4" />
                        </div>
                        <div className="flex-1 min-w-0">
                          {n.link ? (
                            <Link
                              href={n.link}
                              onClick={() => {
                                setOpen(false);
                                if (!n.is_read) handleMarkRead(n.id);
                              }}
                              className="block"
                            >
                              <p className={cn(
                                "text-sm leading-tight",
                                !n.is_read && "font-medium"
                              )}>
                                {n.title}
                              </p>
                              {n.body && (
                                <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                                  {n.body}
                                </p>
                              )}
                            </Link>
                          ) : (
                            <>
                              <p className={cn(
                                "text-sm leading-tight",
                                !n.is_read && "font-medium"
                              )}>
                                {n.title}
                              </p>
                              {n.body && (
                                <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                                  {n.body}
                                </p>
                              )}
                            </>
                          )}
                          <p className="text-[10px] text-muted-foreground mt-1.5 uppercase tracking-wide">
                            {timeAgo(n.created_at)}
                          </p>
                        </div>
                        <div className="opacity-0 group-hover:opacity-100 transition flex flex-col gap-1">
                          {!n.is_read && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleMarkRead(n.id);
                              }}
                              className="rounded p-1 hover:bg-muted"
                              title="Mark as read"
                            >
                              <Check className="h-3 w-3" />
                            </button>
                          )}
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDelete(n.id);
                            }}
                            className="rounded p-1 hover:bg-muted text-muted-foreground hover:text-red-500"
                            title="Delete"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <div className="border-t border-border px-4 py-2 flex justify-between items-center">
            <Link
              href="/me/notifications"
              onClick={() => setOpen(false)}
              className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
            >
              View all
            </Link>
            <Link
              href="/me/alerts"
              onClick={() => setOpen(false)}
              className="text-xs text-muted-foreground hover:underline"
            >
              Manage alerts
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
