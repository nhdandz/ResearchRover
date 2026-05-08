"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  User,
  BookOpen,
  Bell,
  Bot,
  Save,
  Loader2,
  CheckCircle2,
  AlertCircle,
  ChevronDown,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/components/AuthProvider";
import { updateUserProfile, getOnboardingMeta } from "@/lib/api";

const TABS = [
  { id: "research", label: "Research Profile", icon: BookOpen },
  { id: "preferences", label: "Preferences", icon: Bot },
  { id: "notifications", label: "Notifications", icon: Bell },
];

export default function ProfileSettingsPage() {
  const router = useRouter();
  const { user, refreshProfile } = useAuth();
  const [activeTab, setActiveTab] = useState("research");
  const [meta, setMeta] = useState<any>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  // Form state — initialised from user profile
  const [interests, setInterests] = useState<string[]>([]);
  const [expertiseLevel, setExpertiseLevel] = useState("");
  const [affiliation, setAffiliation] = useState("");
  const [position, setPosition] = useState("");
  const [bio, setBio] = useState("");
  const [language, setLanguage] = useState("en");
  const [sources, setSources] = useState<string[]>([]);
  const [llm, setLlm] = useState("ollama");
  const [notifyInApp, setNotifyInApp] = useState(true);
  const [notifyEmail, setNotifyEmail] = useState(false);
  const [notifyWeekly, setNotifyWeekly] = useState(true);

  useEffect(() => {
    if (!user) return;
    setInterests(user.research_interests ?? []);
    setExpertiseLevel(user.expertise_level ?? "");
    setAffiliation(user.affiliation ?? "");
    setPosition(user.position ?? "");
    setBio(user.bio ?? "");
    setLanguage(user.preferred_language ?? "en");
    setSources(user.preferred_sources ?? ["arxiv", "semantic_scholar", "github"]);
    setLlm(user.preferred_llm ?? "ollama");
    const prefs = user.notification_preferences ?? {};
    setNotifyInApp(prefs.in_app !== false);
    setNotifyEmail(prefs.email === true);
    setNotifyWeekly(prefs.weekly_digest !== false);
  }, [user]);

  useEffect(() => {
    getOnboardingMeta().then(setMeta).catch(() => {});
  }, []);

  if (!user) {
    router.replace("/login");
    return null;
  }

  const handleSave = async () => {
    setSaving(true);
    setError("");
    setSaved(false);
    try {
      await updateUserProfile({
        research_interests: interests,
        expertise_level: expertiseLevel || null,
        affiliation: affiliation || null,
        position: position || null,
        bio: bio || null,
        preferred_language: language,
        preferred_sources: sources,
        preferred_llm: llm,
        notification_preferences: {
          in_app: notifyInApp,
          email: notifyEmail,
          weekly_digest: notifyWeekly,
        },
      });
      await refreshProfile();
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err: any) {
      setError(err.response?.data?.detail || "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const toggleInterest = (area: string) => {
    setInterests((prev) =>
      prev.includes(area) ? prev.filter((x) => x !== area) : [...prev, area]
    );
  };

  const toggleSource = (src: string) => {
    setSources((prev) =>
      prev.includes(src) ? prev.filter((x) => x !== src) : [...prev, src]
    );
  };

  return (
    <div className="space-y-8 max-w-2xl">
      {/* Save button */}
      <div className="flex justify-end">
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-[13px] font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
        >
          {saving ? (
            <Loader2 size={14} className="animate-spin" />
          ) : saved ? (
            <CheckCircle2 size={14} />
          ) : (
            <Save size={14} />
          )}
          {saving ? "Saving..." : saved ? "Saved!" : "Save changes"}
        </button>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-xl border border-red-500/20 bg-red-500/5 px-4 py-3 text-[13px] text-red-500">
          <AlertCircle size={14} />
          {error}
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 rounded-xl border border-border bg-surface p-1">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setActiveTab(id)}
            className={cn(
              "flex flex-1 items-center justify-center gap-2 rounded-lg px-3 py-2 text-[12px] font-medium transition-all",
              activeTab === id
                ? "bg-card text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <Icon size={13} />
            {label}
          </button>
        ))}
      </div>

      {/* Research Profile tab */}
      {activeTab === "research" && (
        <div className="space-y-6 rounded-2xl border border-border bg-card p-6">
          {/* Basic info */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-[13px] font-medium text-foreground">
                Institution
              </label>
              <input
                type="text"
                value={affiliation}
                onChange={(e) => setAffiliation(e.target.value)}
                placeholder="e.g. Hanoi University of Science"
                className="w-full rounded-xl border border-border bg-surface px-3 py-2.5 text-[13px] text-foreground placeholder:text-muted-foreground/60 outline-none transition-colors focus:border-primary/40 focus:ring-2 focus:ring-primary/10"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-[13px] font-medium text-foreground">
                Position
              </label>
              <input
                type="text"
                value={position}
                onChange={(e) => setPosition(e.target.value)}
                placeholder="e.g. PhD Student"
                className="w-full rounded-xl border border-border bg-surface px-3 py-2.5 text-[13px] text-foreground placeholder:text-muted-foreground/60 outline-none transition-colors focus:border-primary/40 focus:ring-2 focus:ring-primary/10"
              />
            </div>
          </div>

          <div>
            <label className="mb-1.5 block text-[13px] font-medium text-foreground">
              Bio / Research focus
            </label>
            <textarea
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              rows={3}
              placeholder="Mô tả ngắn về hướng nghiên cứu của bạn..."
              className="w-full rounded-xl border border-border bg-surface px-3 py-2.5 text-[13px] text-foreground placeholder:text-muted-foreground/60 outline-none resize-none transition-colors focus:border-primary/40 focus:ring-2 focus:ring-primary/10"
            />
          </div>

          {/* Expertise level */}
          {meta && (
            <div>
              <label className="mb-2 block text-[13px] font-medium text-foreground">
                Role
              </label>
              <div className="relative">
                <select
                  value={expertiseLevel}
                  onChange={(e) => setExpertiseLevel(e.target.value)}
                  className="w-full appearance-none rounded-xl border border-border bg-surface px-3 py-2.5 pr-8 text-[13px] text-foreground outline-none transition-colors focus:border-primary/40 focus:ring-2 focus:ring-primary/10"
                >
                  <option value="">Select your role</option>
                  {meta.expertise_levels.map((l: any) => (
                    <option key={l.value} value={l.value}>{l.label}</option>
                  ))}
                </select>
                <ChevronDown size={14} className="pointer-events-none absolute right-3 top-3 text-muted-foreground" />
              </div>
            </div>
          )}

          {/* Research interests */}
          {meta && (
            <div>
              <label className="mb-2 block text-[13px] font-medium text-foreground">
                Research interests
              </label>
              <div className="flex flex-wrap gap-2">
                {meta.research_areas.map((area: string) => {
                  const active = interests.includes(area);
                  return (
                    <button
                      key={area}
                      onClick={() => toggleInterest(area)}
                      className={cn(
                        "rounded-full border px-3 py-1.5 text-[12px] font-medium transition-all duration-150",
                        active
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-border bg-surface text-muted-foreground hover:border-primary/40 hover:text-foreground"
                      )}
                    >
                      {active && <CheckCircle2 size={11} className="mr-1.5 inline" />}
                      {area}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Preferences tab */}
      {activeTab === "preferences" && (
        <div className="space-y-6 rounded-2xl border border-border bg-card p-6">
          {/* Language */}
          <div>
            <label className="mb-2 block text-[13px] font-medium text-foreground">
              Preferred language
            </label>
            <div className="flex gap-2">
              {[
                { value: "en", label: "English" },
                { value: "vi", label: "Tiếng Việt" },
                { value: "both", label: "Both" },
              ].map(({ value, label }) => (
                <button
                  key={value}
                  onClick={() => setLanguage(value)}
                  className={cn(
                    "rounded-lg border px-4 py-2 text-[13px] font-medium transition-all duration-150",
                    language === value
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border bg-surface text-muted-foreground hover:border-primary/40 hover:text-foreground"
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* LLM */}
          <div>
            <label className="mb-2 block text-[13px] font-medium text-foreground">
              Default AI model
            </label>
            <div className="grid grid-cols-2 gap-3">
              {[
                { value: "ollama", label: "Ollama (Local)", desc: "Offline, bảo mật" },
                { value: "openai", label: "OpenAI GPT-4o", desc: "Cần API key" },
              ].map(({ value, label, desc }) => (
                <button
                  key={value}
                  onClick={() => setLlm(value)}
                  className={cn(
                    "rounded-xl border p-3 text-left transition-all duration-150",
                    llm === value
                      ? "border-primary bg-primary/10"
                      : "border-border bg-surface hover:border-primary/40"
                  )}
                >
                  <p className={cn("text-[13px] font-medium", llm === value ? "text-primary" : "text-foreground")}>
                    {label}
                  </p>
                  <p className="text-[11px] text-muted-foreground">{desc}</p>
                </button>
              ))}
            </div>
          </div>

          {/* Sources */}
          {meta && (
            <div>
              <label className="mb-2 block text-[13px] font-medium text-foreground">
                Data sources
              </label>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {meta.data_sources.map(({ value, label }: any) => {
                  const active = sources.includes(value);
                  return (
                    <button
                      key={value}
                      onClick={() => toggleSource(value)}
                      className={cn(
                        "flex items-center gap-2 rounded-xl border p-3 text-[12px] font-medium transition-all duration-150",
                        active
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-border bg-surface text-muted-foreground hover:border-primary/40 hover:text-foreground"
                      )}
                    >
                      {active && <CheckCircle2 size={12} className="shrink-0" />}
                      {label}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Notifications tab */}
      {activeTab === "notifications" && (
        <div className="space-y-3 rounded-2xl border border-border bg-card p-6">
          {[
            {
              key: "in_app",
              label: "In-app notifications",
              desc: "Hiển thị thông báo ngay trong giao diện RRI",
              value: notifyInApp,
              onChange: setNotifyInApp,
            },
            {
              key: "weekly_digest",
              label: "Weekly research digest",
              desc: "Tóm tắt papers & repos mới mỗi tuần theo interests của bạn",
              value: notifyWeekly,
              onChange: setNotifyWeekly,
            },
            {
              key: "email",
              label: "Email alerts",
              desc: "Nhận email khi alerts cá nhân của bạn được triggered",
              value: notifyEmail,
              onChange: setNotifyEmail,
            },
          ].map(({ key, label, desc, value, onChange }) => (
            <div key={key} className="flex items-center justify-between rounded-xl border border-border p-4">
              <div>
                <p className="text-[13px] font-medium text-foreground">{label}</p>
                <p className="mt-0.5 text-[11px] text-muted-foreground">{desc}</p>
              </div>
              <button
                onClick={() => onChange(!value)}
                className={cn(
                  "relative h-5 w-9 rounded-full transition-colors duration-200",
                  value ? "bg-primary" : "bg-muted"
                )}
              >
                <span
                  className={cn(
                    "absolute top-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition-transform duration-200",
                    value ? "translate-x-4" : "translate-x-0.5"
                  )}
                />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
