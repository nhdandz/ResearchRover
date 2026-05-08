"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Bell, CheckCheck, Trash2, Filter } from "lucide-react";
import {
  fetchNotifications,
  markAllNotificationsRead,
  markNotifications,
  clearReadNotifications,
  type Notification,
} from "@/lib/api";
import { useAuth } from "@/components/AuthProvider";
import { cn } from "@/lib/utils";

export default function NotificationsPage() {
  const { user, loading: authLoading } = useAuth();
  const [items, setItems] = useState<Notification[]>([]);
  const [total, setTotal] = useState(0);
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>("all");
  const [unreadOnly, setUnreadOnly] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const params: any = { limit: 50 };
      if (unreadOnly) params.unread_only = true;
      if (filter !== "all") params.notification_type = filter;
      const data = await fetchNotifications(params);
      setItems(data.items);
      setTotal(data.total_count);
      setUnread(data.unread_count);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user) load();
  }, [user, filter, unreadOnly]);

  const handleMarkAll = async () => {
    await markAllNotificationsRead();
    load();
  };

  const handleClearRead = async () => {
    await clearReadNotifications();
    load();
  };

  const handleAction = async (id: string, action: "read" | "delete") => {
    await markNotifications([id], action);
    load();
  };

  if (authLoading) return null;
  if (!user) {
    return (
      <div className="container max-w-3xl py-12 text-center">
        <p>Please log in to see notifications.</p>
      </div>
    );
  }

  const filterOptions = [
    { value: "all", label: "All" },
    { value: "alert_keyword", label: "Keyword alerts" },
    { value: "alert_author", label: "Author alerts" },
    { value: "alert_citation", label: "Citation updates" },
    { value: "alert_venue", label: "Venue alerts" },
    { value: "alert_repo_milestone", label: "Repo milestones" },
    { value: "system", label: "System" },
  ];

  return (
    <div className="container max-w-4xl py-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Bell className="h-6 w-6" />
            Notifications
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {total} total · {unread} unread
          </p>
        </div>
        <div className="flex gap-2">
          {unread > 0 && (
            <button
              onClick={handleMarkAll}
              className="flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm hover:bg-muted"
            >
              <CheckCheck className="h-4 w-4" />
              Mark all read
            </button>
          )}
          <button
            onClick={handleClearRead}
            className="flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm hover:bg-muted text-red-500"
          >
            <Trash2 className="h-4 w-4" />
            Clear read
          </button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 mb-4 items-center">
        <div className="flex items-center gap-1 text-sm text-muted-foreground">
          <Filter className="h-3.5 w-3.5" />
          Filter:
        </div>
        {filterOptions.map((opt) => (
          <button
            key={opt.value}
            onClick={() => setFilter(opt.value)}
            className={cn(
              "rounded-full px-3 py-1 text-xs font-medium transition-colors",
              filter === opt.value
                ? "bg-primary text-primary-foreground"
                : "bg-muted/50 text-muted-foreground hover:bg-muted",
            )}
          >
            {opt.label}
          </button>
        ))}
        <label className="ml-auto flex items-center gap-2 text-sm cursor-pointer">
          <input
            type="checkbox"
            checked={unreadOnly}
            onChange={(e) => setUnreadOnly(e.target.checked)}
            className="rounded"
          />
          Unread only
        </label>
      </div>

      {loading ? (
        <div className="text-center py-12 text-muted-foreground">Loading...</div>
      ) : items.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <Bell className="h-12 w-12 mx-auto mb-3 opacity-30" />
          <p className="font-medium">No notifications</p>
          <p className="text-xs mt-1">
            <Link href="/me/alerts" className="text-blue-500 hover:underline">
              Configure alerts
            </Link>{" "}
            to receive notifications about new papers, repos, citations, and more.
          </p>
        </div>
      ) : (
        <ul className="space-y-2">
          {items.map((n) => (
            <li
              key={n.id}
              className={cn(
                "rounded-lg border p-4 transition-colors group",
                !n.is_read
                  ? "border-blue-500/30 bg-blue-500/5"
                  : "border-border bg-card",
              )}
            >
              <div className="flex justify-between gap-3">
                <div className="flex-1 min-w-0">
                  {n.link ? (
                    <Link href={n.link} className="block">
                      <p className={cn("text-sm leading-snug", !n.is_read && "font-semibold")}>
                        {n.title}
                      </p>
                      {n.body && (
                        <p className="text-sm text-muted-foreground mt-1.5">
                          {n.body}
                        </p>
                      )}
                    </Link>
                  ) : (
                    <>
                      <p className={cn("text-sm leading-snug", !n.is_read && "font-semibold")}>
                        {n.title}
                      </p>
                      {n.body && (
                        <p className="text-sm text-muted-foreground mt-1.5">
                          {n.body}
                        </p>
                      )}
                    </>
                  )}
                  <div className="flex items-center gap-3 mt-2 text-[11px] text-muted-foreground">
                    <span className="rounded bg-muted px-1.5 py-0.5 font-medium uppercase tracking-wide">
                      {n.notification_type.replace("alert_", "")}
                    </span>
                    <span>{new Date(n.created_at).toLocaleString()}</span>
                    {n.delivered_email && <span>· Email sent</span>}
                    {n.delivered_webhook && <span>· Webhook sent</span>}
                  </div>
                </div>
                <div className="flex flex-col gap-1 opacity-0 group-hover:opacity-100 transition">
                  {!n.is_read && (
                    <button
                      onClick={() => handleAction(n.id, "read")}
                      className="rounded p-1.5 hover:bg-muted text-xs"
                    >
                      Mark read
                    </button>
                  )}
                  <button
                    onClick={() => handleAction(n.id, "delete")}
                    className="rounded p-1.5 hover:bg-muted text-red-500 text-xs"
                  >
                    Delete
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
