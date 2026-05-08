"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  BellRing, Plus, Trash2, ToggleLeft, ToggleRight,
  Loader2, AlertCircle, Tag, User, Quote, Building2,
  GitBranch, ChevronDown, ChevronUp, Pencil, CheckCircle2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/components/AuthProvider";
import {
  fetchUserAlerts,
  createUserAlert,
  updateUserAlert,
  deleteUserAlert,
  toggleAllUserAlerts,
} from "@/lib/api";

// ── Types ──
interface UserAlert {
  id: string;
  alert_type: string;
  label: string;
  config: Record<string, any>;
  channel: string;
  frequency: string;
  is_active: boolean;
  last_triggered: string | null;
  trigger_count: number;
  created_at: string;
}

// ── Alert type metadata ──
const ALERT_TYPES = [
  {
    value: "keyword",
    label: "Keyword",
    icon: Tag,
    desc: "Paper/repo mới chứa từ khoá",
    color: "text-blue-500",
    bg: "bg-blue-500/10",
    fields: [
      { key: "query", label: "Search query", placeholder: "e.g. RAG Vietnamese NLP", required: true },
      { key: "min_relevance", label: "Min relevance (0-1)", placeholder: "0.6", required: false },
    ],
  },
  {
    value: "author",
    label: "Author",
    icon: User,
    desc: "Tác giả publish paper mới",
    color: "text-violet-500",
    bg: "bg-violet-500/10",
    fields: [
      { key: "author_name", label: "Author name", placeholder: "e.g. Yann LeCun", required: true },
      { key: "semantic_scholar_id", label: "Semantic Scholar ID (optional)", placeholder: "1234567", required: false },
    ],
  },
  {
    value: "citation",
    label: "Citation",
    icon: Quote,
    desc: "Paper bookmark nhận citation mới",
    color: "text-emerald-500",
    bg: "bg-emerald-500/10",
    fields: [
      { key: "paper_id", label: "Paper ID (UUID)", placeholder: "Paste paper UUID", required: true },
    ],
  },
  {
    value: "venue",
    label: "Venue",
    icon: Building2,
    desc: "Conference/journal có paper mới",
    color: "text-amber-500",
    bg: "bg-amber-500/10",
    fields: [
      { key: "venue_name", label: "Venue name", placeholder: "e.g. ICLR, NeurIPS, ACL", required: true },
      { key: "year", label: "Year (optional)", placeholder: "2025", required: false },
    ],
  },
  {
    value: "repo_milestone",
    label: "Repo Milestone",
    icon: GitBranch,
    desc: "Repo đạt mốc stars hoặc có release",
    color: "text-rose-500",
    bg: "bg-rose-500/10",
    fields: [
      { key: "repo_id", label: "Repo ID (UUID)", placeholder: "Paste repo UUID", required: true },
      { key: "milestone_type", label: "Milestone type", placeholder: "stars or release", required: true },
      { key: "threshold", label: "Threshold (for stars)", placeholder: "1000", required: false },
    ],
  },
];

const FREQUENCIES = [
  { value: "instant", label: "Instant" },
  { value: "daily_digest", label: "Daily digest" },
  { value: "weekly_digest", label: "Weekly digest" },
];

const CHANNELS = [
  { value: "in_app", label: "In-app" },
  { value: "email", label: "Email" },
];

function alertTypeInfo(type: string) {
  return ALERT_TYPES.find((t) => t.value === type) ?? ALERT_TYPES[0];
}

// ── Create Alert Modal ──
function CreateAlertModal({ onCreated, onClose }: { onCreated: () => void; onClose: () => void }) {
  const [alertType, setAlertType] = useState("keyword");
  const [label, setLabel] = useState("");
  const [config, setConfig] = useState<Record<string, string>>({});
  const [channel, setChannel] = useState("in_app");
  const [frequency, setFrequency] = useState("daily_digest");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const info = alertTypeInfo(alertType);

  const handleSubmit = async () => {
    if (!label.trim()) { setError("Label is required"); return; }
    setSubmitting(true);
    setError("");
    try {
      await createUserAlert({
        alert_type: alertType,
        label,
        config: Object.fromEntries(
          Object.entries(config).filter(([, v]) => v.trim() !== "")
        ),
        channel,
        frequency,
      });
      onCreated();
      onClose();
    } catch (err: any) {
      setError(err.response?.data?.detail || "Failed to create alert");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-2xl">
        <h2 className="text-[15px] font-semibold text-foreground">New Alert</h2>
        <p className="mt-0.5 text-[12px] text-muted-foreground">
          Bạn sẽ được thông báo khi có nội dung mới phù hợp
        </p>

        <div className="mt-5 space-y-4">
          {/* Alert type */}
          <div>
            <label className="mb-2 block text-[12px] font-medium text-foreground">Alert type</label>
            <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-5">
              {ALERT_TYPES.map((t) => {
                const active = alertType === t.value;
                return (
                  <button
                    key={t.value}
                    onClick={() => { setAlertType(t.value); setConfig({}); }}
                    className={cn(
                      "flex flex-col items-center gap-1 rounded-xl border p-2 text-[11px] font-medium transition-all",
                      active ? `border-primary ${t.bg} ${t.color}` : "border-border bg-surface text-muted-foreground hover:border-primary/30"
                    )}
                  >
                    <t.icon size={14} />
                    {t.label}
                  </button>
                );
              })}
            </div>
            <p className="mt-1.5 text-[11px] text-muted-foreground">{info.desc}</p>
          </div>

          {/* Label */}
          <div>
            <label className="mb-1.5 block text-[12px] font-medium text-foreground">Label</label>
            <input
              type="text"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="e.g. NLP papers in Vietnamese"
              className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-[13px] text-foreground placeholder:text-muted-foreground/60 outline-none focus:border-primary/40 focus:ring-2 focus:ring-primary/10"
            />
          </div>

          {/* Config fields */}
          {info.fields.map((field) => (
            <div key={field.key}>
              <label className="mb-1.5 block text-[12px] font-medium text-foreground">
                {field.label}
                {field.required && <span className="ml-0.5 text-red-400">*</span>}
              </label>
              <input
                type="text"
                value={config[field.key] ?? ""}
                onChange={(e) => setConfig((prev) => ({ ...prev, [field.key]: e.target.value }))}
                placeholder={field.placeholder}
                className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-[13px] text-foreground placeholder:text-muted-foreground/60 outline-none focus:border-primary/40 focus:ring-2 focus:ring-primary/10"
              />
            </div>
          ))}

          {/* Channel + Frequency */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1.5 block text-[12px] font-medium text-foreground">Channel</label>
              <select
                value={channel}
                onChange={(e) => setChannel(e.target.value)}
                className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-[13px] text-foreground outline-none focus:border-primary/40"
              >
                {CHANNELS.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
              </select>
            </div>
            <div>
              <label className="mb-1.5 block text-[12px] font-medium text-foreground">Frequency</label>
              <select
                value={frequency}
                onChange={(e) => setFrequency(e.target.value)}
                className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-[13px] text-foreground outline-none focus:border-primary/40"
              >
                {FREQUENCIES.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
              </select>
            </div>
          </div>

          {error && (
            <div className="flex items-center gap-2 rounded-xl border border-red-500/20 bg-red-500/5 px-3 py-2 text-[12px] text-red-500">
              <AlertCircle size={13} /> {error}
            </div>
          )}
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-xl border border-border px-4 py-2 text-[13px] text-muted-foreground hover:bg-muted">
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={submitting}
            className="flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-[13px] font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {submitting ? <Loader2 size={13} className="animate-spin" /> : <CheckCircle2 size={13} />}
            Create Alert
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Alert Card ──
function AlertCard({ alert, onToggle, onDelete }: {
  alert: UserAlert;
  onToggle: (id: string, active: boolean) => void;
  onDelete: (id: string) => void;
}) {
  const info = alertTypeInfo(alert.alert_type);
  const [expanded, setExpanded] = useState(false);

  return (
    <div className={cn(
      "rounded-2xl border bg-card p-4 transition-all",
      alert.is_active ? "border-border" : "border-border/50 opacity-60"
    )}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-xl", info.bg)}>
            <info.icon size={15} className={info.color} />
          </div>
          <div>
            <p className="text-[13px] font-medium text-foreground">{alert.label}</p>
            <div className="mt-1 flex items-center gap-2">
              <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-medium", info.bg, info.color)}>
                {info.label}
              </span>
              <span className="text-[10px] text-muted-foreground">{alert.frequency.replace("_", " ")}</span>
              <span className="text-[10px] text-muted-foreground">·</span>
              <span className="text-[10px] text-muted-foreground">{alert.channel}</span>
              {alert.trigger_count > 0 && (
                <>
                  <span className="text-[10px] text-muted-foreground">·</span>
                  <span className="text-[10px] text-muted-foreground">
                    triggered {alert.trigger_count}×
                  </span>
                </>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1">
          <button
            onClick={() => setExpanded((v) => !v)}
            className="flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted"
          >
            {expanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
          </button>
          <button
            onClick={() => onToggle(alert.id, !alert.is_active)}
            className="flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted"
            title={alert.is_active ? "Pause alert" : "Resume alert"}
          >
            {alert.is_active
              ? <ToggleRight size={15} className="text-primary" />
              : <ToggleLeft size={15} />
            }
          </button>
          <button
            onClick={() => onDelete(alert.id)}
            className="flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground hover:bg-red-500/10 hover:text-red-500"
          >
            <Trash2 size={13} />
          </button>
        </div>
      </div>

      {/* Expanded config details */}
      {expanded && (
        <div className="mt-3 rounded-xl border border-border/60 bg-surface p-3">
          <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Config</p>
          {Object.entries(alert.config).map(([k, v]) => (
            <div key={k} className="flex gap-2 text-[12px]">
              <span className="text-muted-foreground">{k}:</span>
              <span className="font-medium text-foreground">{String(v)}</span>
            </div>
          ))}
          {alert.last_triggered && (
            <p className="mt-2 text-[11px] text-muted-foreground">
              Last triggered: {new Date(alert.last_triggered).toLocaleDateString()}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main Page ──
export default function AlertsPage() {
  const router = useRouter();
  const { user } = useAuth();
  const [alerts, setAlerts] = useState<UserAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [filterType, setFilterType] = useState<string | null>(null);

  const loadAlerts = async () => {
    try {
      const data = await fetchUserAlerts();
      setAlerts(data);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!user) { router.replace("/login"); return; }
    loadAlerts();
  }, [user, router]);

  const handleToggle = async (id: string, active: boolean) => {
    await updateUserAlert(id, { is_active: active });
    setAlerts((prev) => prev.map((a) => a.id === id ? { ...a, is_active: active } : a));
  };

  const handleDelete = async (id: string) => {
    await deleteUserAlert(id);
    setAlerts((prev) => prev.filter((a) => a.id !== id));
  };

  const handleToggleAll = async (active: boolean) => {
    const updated = await toggleAllUserAlerts(active);
    setAlerts(updated);
  };

  const filtered = filterType ? alerts.filter((a) => a.alert_type === filterType) : alerts;
  const activeCount = alerts.filter((a) => a.is_active).length;

  return (
    <div className="space-y-8 max-w-2xl">
      {/* Controls bar */}
      <div className="flex items-center justify-between">
        <p className="text-[13px] text-muted-foreground">
          {alerts.length > 0
            ? `${activeCount} active · ${alerts.length} total`
            : "Chưa có alert nào. Tạo alert để không bỏ lỡ nội dung quan trọng."}
        </p>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-[13px] font-medium text-primary-foreground hover:bg-primary/90"
        >
          <Plus size={15} /> New Alert
        </button>
      </div>

      {/* Bulk controls + filter */}
      {alerts.length > 0 && (
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5 flex-wrap">
            <button
              onClick={() => setFilterType(null)}
              className={cn(
                "rounded-full border px-3 py-1 text-[12px] font-medium transition-all",
                !filterType ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:border-primary/30"
              )}
            >
              All ({alerts.length})
            </button>
            {ALERT_TYPES.filter((t) => alerts.some((a) => a.alert_type === t.value)).map((t) => (
              <button
                key={t.value}
                onClick={() => setFilterType(t.value)}
                className={cn(
                  "rounded-full border px-3 py-1 text-[12px] font-medium transition-all",
                  filterType === t.value ? `border-primary ${t.bg} ${t.color}` : "border-border text-muted-foreground hover:border-primary/30"
                )}
              >
                {t.label} ({alerts.filter((a) => a.alert_type === t.value).length})
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => handleToggleAll(true)} className="text-[12px] text-primary hover:underline">Enable all</button>
            <span className="text-muted-foreground">·</span>
            <button onClick={() => handleToggleAll(false)} className="text-[12px] text-muted-foreground hover:underline">Pause all</button>
          </div>
        </div>
      )}

      {/* Alert list */}
      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 size={20} className="animate-spin text-muted-foreground" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border py-12 text-center">
          <BellRing size={28} className="mb-3 text-muted-foreground/40" />
          <p className="text-[13px] font-medium text-muted-foreground">No alerts yet</p>
          <p className="mt-1 text-[12px] text-muted-foreground/60">
            Tạo alert để được thông báo khi có paper, tác giả, hoặc repo mới
          </p>
          <button
            onClick={() => setShowCreate(true)}
            className="mt-4 flex items-center gap-1.5 rounded-xl border border-border px-4 py-2 text-[13px] font-medium text-foreground hover:bg-muted"
          >
            <Plus size={14} /> Create first alert
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((alert) => (
            <AlertCard
              key={alert.id}
              alert={alert}
              onToggle={handleToggle}
              onDelete={handleDelete}
            />
          ))}
        </div>
      )}

      {showCreate && (
        <CreateAlertModal onCreated={loadAlerts} onClose={() => setShowCreate(false)} />
      )}
    </div>
  );
}
