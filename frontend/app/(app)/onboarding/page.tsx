"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, ChevronRight, ChevronLeft, Sparkles, FlaskConical, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/components/AuthProvider";
import { getOnboardingMeta, completeOnboarding } from "@/lib/api";

// ── Types ──
interface OnboardingMeta {
  research_areas: string[];
  expertise_levels: { value: string; label: string }[];
  data_sources: { value: string; label: string }[];
}

// ── Step components ──

function StepIndicator({ current, total }: { current: number; total: number }) {
  return (
    <div className="flex items-center gap-2">
      {Array.from({ length: total }).map((_, i) => (
        <div
          key={i}
          className={cn(
            "h-1.5 rounded-full transition-all duration-300",
            i < current ? "w-6 bg-primary" : i === current ? "w-8 bg-primary" : "w-6 bg-border"
          )}
        />
      ))}
    </div>
  );
}

// Step 1: Research interests + expertise level
function Step1({
  selected,
  onToggle,
  expertiseLevel,
  onExpertise,
  areas,
  levels,
}: {
  selected: string[];
  onToggle: (area: string) => void;
  expertiseLevel: string;
  onExpertise: (v: string) => void;
  areas: string[];
  levels: { value: string; label: string }[];
}) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold tracking-tight text-foreground">
          What do you research?
        </h2>
        <p className="mt-1 text-[13px] text-muted-foreground">
          Chọn ít nhất 1 lĩnh vực. RRI sẽ dùng thông tin này để lọc và gợi ý nội dung phù hợp cho bạn.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {areas.map((area) => {
          const active = selected.includes(area);
          return (
            <button
              key={area}
              onClick={() => onToggle(area)}
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

      <div>
        <label className="mb-2 block text-[13px] font-medium text-foreground">
          Your role
        </label>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {levels.map(({ value, label }) => (
            <button
              key={value}
              onClick={() => onExpertise(value)}
              className={cn(
                "rounded-xl border p-3 text-left text-[12px] transition-all duration-150",
                expertiseLevel === value
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border bg-surface text-muted-foreground hover:border-primary/40 hover:text-foreground"
              )}
            >
              {expertiseLevel === value && (
                <CheckCircle2 size={12} className="mb-1 text-primary" />
              )}
              {label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// Step 2: Affiliation + Language + Sources
function Step2({
  affiliation,
  onAffiliation,
  position,
  onPosition,
  language,
  onLanguage,
  sources,
  onToggleSource,
  availableSources,
}: {
  affiliation: string;
  onAffiliation: (v: string) => void;
  position: string;
  onPosition: (v: string) => void;
  language: string;
  onLanguage: (v: string) => void;
  sources: string[];
  onToggleSource: (v: string) => void;
  availableSources: { value: string; label: string }[];
}) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold tracking-tight text-foreground">
          About you
        </h2>
        <p className="mt-1 text-[13px] text-muted-foreground">
          Thông tin này giúp RRI cá nhân hóa context khi dùng AI chat.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className="mb-1.5 block text-[13px] font-medium text-foreground">
            Institution / Organization
          </label>
          <input
            type="text"
            value={affiliation}
            onChange={(e) => onAffiliation(e.target.value)}
            placeholder="e.g. Hanoi University of Science"
            className="w-full rounded-xl border border-border bg-surface px-3 py-2.5 text-[13px] text-foreground placeholder:text-muted-foreground/60 outline-none transition-colors focus:border-primary/40 focus:ring-2 focus:ring-primary/10"
          />
        </div>
        <div>
          <label className="mb-1.5 block text-[13px] font-medium text-foreground">
            Position / Title
          </label>
          <input
            type="text"
            value={position}
            onChange={(e) => onPosition(e.target.value)}
            placeholder="e.g. PhD Student"
            className="w-full rounded-xl border border-border bg-surface px-3 py-2.5 text-[13px] text-foreground placeholder:text-muted-foreground/60 outline-none transition-colors focus:border-primary/40 focus:ring-2 focus:ring-primary/10"
          />
        </div>
      </div>

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
              onClick={() => onLanguage(value)}
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

      <div>
        <label className="mb-2 block text-[13px] font-medium text-foreground">
          Data sources to follow
        </label>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {availableSources.map(({ value, label }) => {
            const active = sources.includes(value);
            return (
              <button
                key={value}
                onClick={() => onToggleSource(value)}
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
    </div>
  );
}

// Step 3: LLM + Notifications
function Step3({
  llm,
  onLlm,
  notifyEmail,
  onNotifyEmail,
  notifyWeekly,
  onNotifyWeekly,
}: {
  llm: string;
  onLlm: (v: string) => void;
  notifyEmail: boolean;
  onNotifyEmail: (v: boolean) => void;
  notifyWeekly: boolean;
  onNotifyWeekly: (v: boolean) => void;
}) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold tracking-tight text-foreground">
          AI & Notifications
        </h2>
        <p className="mt-1 text-[13px] text-muted-foreground">
          Chọn AI model mặc định và cài đặt thông báo.
        </p>
      </div>

      <div>
        <label className="mb-2 block text-[13px] font-medium text-foreground">
          Default AI model
        </label>
        <div className="grid grid-cols-2 gap-3">
          {[
            {
              value: "ollama",
              label: "Ollama (Local)",
              desc: "Chạy hoàn toàn offline, bảo mật tuyệt đối",
            },
            {
              value: "openai",
              label: "OpenAI GPT-4o",
              desc: "Mạnh hơn, cần API key và kết nối internet",
            },
          ].map(({ value, label, desc }) => (
            <button
              key={value}
              onClick={() => onLlm(value)}
              className={cn(
                "rounded-xl border p-4 text-left transition-all duration-150",
                llm === value
                  ? "border-primary bg-primary/10"
                  : "border-border bg-surface hover:border-primary/40"
              )}
            >
              <div className="flex items-center gap-2">
                {llm === value && <CheckCircle2 size={14} className="text-primary" />}
                <span className={cn("text-[13px] font-medium", llm === value ? "text-primary" : "text-foreground")}>
                  {label}
                </span>
              </div>
              <p className="mt-1.5 text-[11px] text-muted-foreground">{desc}</p>
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className="mb-2 block text-[13px] font-medium text-foreground">
          Notification preferences
        </label>
        <div className="space-y-3 rounded-xl border border-border bg-surface p-4">
          {[
            {
              key: "weekly_digest",
              label: "Weekly research digest",
              desc: "Email tóm tắt papers và repos mới mỗi tuần",
              value: notifyWeekly,
              onChange: onNotifyWeekly,
            },
            {
              key: "email",
              label: "Email notifications",
              desc: "Nhận email khi alerts của bạn được triggered",
              value: notifyEmail,
              onChange: onNotifyEmail,
            },
          ].map(({ key, label, desc, value, onChange }) => (
            <div key={key} className="flex items-center justify-between">
              <div>
                <p className="text-[13px] font-medium text-foreground">{label}</p>
                <p className="text-[11px] text-muted-foreground">{desc}</p>
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
      </div>
    </div>
  );
}

// ── Main Page ──

export default function OnboardingPage() {
  const router = useRouter();
  const { user, refreshProfile } = useAuth();
  const [meta, setMeta] = useState<OnboardingMeta | null>(null);
  const [step, setStep] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  // Step 1 state
  const [interests, setInterests] = useState<string[]>([]);
  const [expertiseLevel, setExpertiseLevel] = useState("phd");

  // Step 2 state
  const [affiliation, setAffiliation] = useState("");
  const [position, setPosition] = useState("");
  const [language, setLanguage] = useState("en");
  const [sources, setSources] = useState(["arxiv", "semantic_scholar", "github"]);

  // Step 3 state
  const [llm, setLlm] = useState("ollama");
  const [notifyEmail, setNotifyEmail] = useState(false);
  const [notifyWeekly, setNotifyWeekly] = useState(true);

  useEffect(() => {
    getOnboardingMeta().then(setMeta).catch(() => {});
  }, []);

  // Redirect nếu đã onboard
  useEffect(() => {
    if (user?.onboarding_completed) {
      router.replace("/");
    }
  }, [user, router]);

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

  const canNext = () => {
    if (step === 0) return interests.length > 0 && expertiseLevel !== "";
    if (step === 1) return sources.length > 0;
    return true;
  };

  const handleFinish = async () => {
    setSubmitting(true);
    setError("");
    try {
      await completeOnboarding({
        research_interests: interests,
        expertise_level: expertiseLevel,
        affiliation: affiliation || null,
        position: position || null,
        preferred_language: language,
        preferred_sources: sources,
        preferred_llm: llm,
        notification_preferences: {
          in_app: true,
          email: notifyEmail,
          weekly_digest: notifyWeekly,
        },
      });
      await refreshProfile();
      router.push("/");
    } catch (err: any) {
      setError(err.response?.data?.detail || "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  };

  if (!meta) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 size={24} className="animate-spin text-muted-foreground" />
      </div>
    );
  }

  const TOTAL_STEPS = 3;

  return (
    <div className="flex min-h-[80vh] items-center justify-center">
      <div className="w-full max-w-lg space-y-8">
        {/* Header */}
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-primary/10">
              <Sparkles size={16} className="text-primary" />
            </div>
            <span className="text-[13px] font-medium text-muted-foreground">
              Personalization setup
            </span>
          </div>
          <StepIndicator current={step} total={TOTAL_STEPS} />
          <p className="text-[11px] text-muted-foreground">
            Step {step + 1} of {TOTAL_STEPS}
          </p>
        </div>

        {/* Step content */}
        <div className="rounded-2xl border border-border bg-card p-6 shadow-soft dark:shadow-soft-dark">
          {step === 0 && (
            <Step1
              selected={interests}
              onToggle={toggleInterest}
              expertiseLevel={expertiseLevel}
              onExpertise={setExpertiseLevel}
              areas={meta.research_areas}
              levels={meta.expertise_levels}
            />
          )}
          {step === 1 && (
            <Step2
              affiliation={affiliation}
              onAffiliation={setAffiliation}
              position={position}
              onPosition={setPosition}
              language={language}
              onLanguage={setLanguage}
              sources={sources}
              onToggleSource={toggleSource}
              availableSources={meta.data_sources}
            />
          )}
          {step === 2 && (
            <Step3
              llm={llm}
              onLlm={setLlm}
              notifyEmail={notifyEmail}
              onNotifyEmail={setNotifyEmail}
              notifyWeekly={notifyWeekly}
              onNotifyWeekly={setNotifyWeekly}
            />
          )}

          {error && (
            <p className="mt-4 text-[12px] text-red-500">{error}</p>
          )}
        </div>

        {/* Navigation */}
        <div className="flex items-center justify-between">
          <button
            onClick={() => setStep((s) => s - 1)}
            disabled={step === 0}
            className="flex items-center gap-1.5 rounded-xl border border-border px-4 py-2 text-[13px] font-medium text-muted-foreground transition-colors hover:bg-muted disabled:opacity-40"
          >
            <ChevronLeft size={15} />
            Back
          </button>

          {step < TOTAL_STEPS - 1 ? (
            <button
              onClick={() => setStep((s) => s + 1)}
              disabled={!canNext()}
              className="flex items-center gap-1.5 rounded-xl bg-primary px-5 py-2 text-[13px] font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
            >
              Continue
              <ChevronRight size={15} />
            </button>
          ) : (
            <button
              onClick={handleFinish}
              disabled={submitting}
              className="flex items-center gap-1.5 rounded-xl bg-primary px-5 py-2 text-[13px] font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
            >
              {submitting ? (
                <><Loader2 size={14} className="animate-spin" /> Setting up...</>
              ) : (
                <><FlaskConical size={14} /> Start researching</>
              )}
            </button>
          )}
        </div>

        {/* Skip */}
        <p className="text-center text-[12px] text-muted-foreground">
          You can always update these settings later in{" "}
          <button
            onClick={() => router.push("/")}
            className="text-primary hover:underline"
          >
            Profile Settings
          </button>
        </p>
      </div>
    </div>
  );
}
