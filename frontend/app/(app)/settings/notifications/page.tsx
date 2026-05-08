"use client";

import { useEffect, useState } from "react";
import { Bell, Mail, Send, MessageSquare, Save, Check } from "lucide-react";
import {
  getNotificationPreferences,
  updateNotificationPreferences,
  sendTestNotification,
} from "@/lib/api";
import { useAuth } from "@/components/AuthProvider";

interface Prefs {
  in_app: boolean;
  email: boolean;
  weekly_digest: boolean;
  daily_summary: boolean;
  instant_alerts: boolean;
  slack_webhook: string | null;
  discord_webhook: string | null;
  telegram_bot_token: string | null;
  telegram_chat_id: string | null;
}

export default function NotificationSettingsPage() {
  const { user, loading } = useAuth();
  const [prefs, setPrefs] = useState<Prefs | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    getNotificationPreferences().then(setPrefs);
  }, [user]);

  const update = (k: keyof Prefs, v: any) =>
    setPrefs((p) => (p ? { ...p, [k]: v } : p));

  const handleSave = async () => {
    if (!prefs) return;
    setSaving(true);
    try {
      await updateNotificationPreferences(prefs);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const r = await sendTestNotification();
      setTestResult(`✓ Sent (id: ${r.id?.slice(0, 8)}…). Kiểm tra bell icon + email/webhook.`);
    } catch (e: any) {
      setTestResult(`✗ ${e?.message || "Failed"}`);
    } finally {
      setTesting(false);
    }
  };

  if (loading || !prefs) return <div className="p-8">Loading...</div>;
  if (!user) return <div className="p-8">Login required.</div>;

  return (
    <div className="container max-w-3xl py-8 space-y-6">
      <div>
        <h1 className="text-3xl font-bold flex items-center gap-2">
          <Bell className="h-7 w-7" />
          Notification Settings
        </h1>
        <p className="text-muted-foreground mt-1">
          Cấu hình kênh nhận thông báo cho user_alerts.
        </p>
      </div>

      <section className="rounded-lg border border-border bg-card p-6 space-y-4">
        <h2 className="text-lg font-semibold">Channels</h2>
        <Toggle
          label="In-app (bell icon)"
          desc="Hiển thị notification trong dropdown của TopNav"
          checked={prefs.in_app}
          onChange={(v) => update("in_app", v)}
        />
        <Toggle
          label="Email"
          desc="Cần backend cấu hình SMTP_HOST trong .env"
          checked={prefs.email}
          onChange={(v) => update("email", v)}
        />
        <Toggle
          label="Instant alerts"
          desc="Push ngay khi keyword/author/citation/venue/repo match"
          checked={prefs.instant_alerts}
          onChange={(v) => update("instant_alerts", v)}
        />
        <Toggle
          label="Daily summary"
          desc="Gộp các alert thành 1 email/notification mỗi ngày"
          checked={prefs.daily_summary}
          onChange={(v) => update("daily_summary", v)}
        />
        <Toggle
          label="Weekly digest"
          desc="Personal digest gửi sáng Chủ Nhật"
          checked={prefs.weekly_digest}
          onChange={(v) => update("weekly_digest", v)}
        />
      </section>

      <section className="rounded-lg border border-border bg-card p-6 space-y-4">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <Send className="h-5 w-5" />
          Webhooks
        </h2>

        <Field
          label="Slack Incoming Webhook URL"
          placeholder="https://hooks.slack.com/services/..."
          value={prefs.slack_webhook || ""}
          onChange={(v) => update("slack_webhook", v || null)}
        />
        <Field
          label="Discord Webhook URL"
          placeholder="https://discord.com/api/webhooks/..."
          value={prefs.discord_webhook || ""}
          onChange={(v) => update("discord_webhook", v || null)}
        />
        <div className="grid grid-cols-2 gap-3">
          <Field
            label="Telegram Bot Token"
            placeholder="123456789:ABC..."
            value={prefs.telegram_bot_token || ""}
            onChange={(v) => update("telegram_bot_token", v || null)}
          />
          <Field
            label="Telegram Chat ID"
            placeholder="123456789"
            value={prefs.telegram_chat_id || ""}
            onChange={(v) => update("telegram_chat_id", v || null)}
          />
        </div>
      </section>

      <div className="flex gap-3 items-center">
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
        >
          {saved ? <Check className="h-4 w-4" /> : <Save className="h-4 w-4" />}
          {saved ? "Saved" : saving ? "Saving..." : "Save preferences"}
        </button>

        <button
          onClick={handleTest}
          disabled={testing}
          className="flex items-center gap-2 rounded-md border border-border px-4 py-2 text-sm font-medium hover:bg-muted disabled:opacity-50"
        >
          <Send className="h-4 w-4" />
          {testing ? "Sending..." : "Send test notification"}
        </button>

        {testResult && <span className="text-sm text-muted-foreground">{testResult}</span>}
      </div>
    </div>
  );
}

function Toggle({
  label,
  desc,
  checked,
  onChange,
}: {
  label: string;
  desc: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex items-start justify-between gap-4 cursor-pointer hover:bg-muted/30 rounded-md p-2 -m-2 transition">
      <div className="flex-1">
        <div className="text-sm font-medium">{label}</div>
        <div className="text-xs text-muted-foreground mt-0.5">{desc}</div>
      </div>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-1 h-4 w-4 rounded"
      />
    </label>
  );
}

function Field({
  label,
  placeholder,
  value,
  onChange,
}: {
  label: string;
  placeholder?: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-muted-foreground mb-1">
        {label}
      </label>
      <input
        type="text"
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
      />
    </div>
  );
}
