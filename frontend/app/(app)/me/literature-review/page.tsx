"use client";

import { useEffect, useState } from "react";
import { BookOpen, Sparkles, Download, Copy, Check } from "lucide-react";
import api, { generateLiteratureReview } from "@/lib/api";
import { useAuth } from "@/components/AuthProvider";

interface Folder {
  id: string;
  name: string;
  bookmark_count: number;
  children?: Folder[];
}

export default function LiteratureReviewPage() {
  const { user, loading } = useAuth();
  const [folders, setFolders] = useState<Folder[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [review, setReview] = useState<{
    folder: string;
    paper_count: number;
    review_md: string;
    fallback_used: boolean;
  } | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!user) return;
    api.get("/folders").then((r) => setFolders(r.data));
  }, [user]);

  const flat = (list: Folder[]): Folder[] => {
    const out: Folder[] = [];
    for (const f of list) {
      out.push(f);
      if (f.children) out.push(...flat(f.children));
    }
    return out;
  };

  const handleGenerate = async () => {
    if (!selected) return;
    setGenerating(true);
    setReview(null);
    try {
      const data = await generateLiteratureReview(selected);
      setReview(data);
    } catch (e: any) {
      alert(e?.response?.data?.detail || "Failed to generate review");
    } finally {
      setGenerating(false);
    }
  };

  const handleCopy = () => {
    if (!review) return;
    navigator.clipboard.writeText(review.review_md);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    if (!review) return;
    const blob = new Blob([review.review_md], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `lit-review-${review.folder.replace(/\s+/g, "-")}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (loading) return null;
  if (!user) return <div className="p-8">Login required.</div>;

  const allFolders = flat(folders);

  return (
    <div className="container max-w-5xl py-8">
      <div className="mb-6">
        <h1 className="text-3xl font-bold flex items-center gap-2">
          <Sparkles className="h-7 w-7 text-purple-500" />
          AI Literature Review
        </h1>
        <p className="text-muted-foreground mt-1">
          Tự động tổng hợp papers trong folder thành 1 literature review markdown.
        </p>
      </div>

      <div className="rounded-lg border border-border bg-card p-6 mb-6">
        <label className="block text-sm font-medium mb-2">Choose folder</label>
        <select
          value={selected || ""}
          onChange={(e) => setSelected(e.target.value || null)}
          className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
        >
          <option value="">Select a folder…</option>
          {allFolders.map((f) => (
            <option key={f.id} value={f.id}>
              📁 {f.name} ({f.bookmark_count} bookmarks)
            </option>
          ))}
        </select>

        <button
          onClick={handleGenerate}
          disabled={!selected || generating}
          className="mt-4 flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
        >
          <BookOpen className="h-4 w-4" />
          {generating ? "Đang tổng hợp (LLM)..." : "Generate Literature Review"}
        </button>
        <p className="text-xs text-muted-foreground mt-2">
          Sử dụng Ollama LLM (local). Mất 30-60s. Folder cần ít nhất 1 paper bookmark.
        </p>
      </div>

      {review && (
        <div className="rounded-lg border border-border bg-card overflow-hidden">
          <div className="flex items-center justify-between p-4 border-b border-border">
            <div>
              <h2 className="font-semibold">{review.folder}</h2>
              <p className="text-xs text-muted-foreground">
                {review.paper_count} papers ·{" "}
                {review.fallback_used ? "Fallback rendered" : "AI-generated"}
              </p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleCopy}
                className="flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs hover:bg-muted"
              >
                {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                {copied ? "Copied" : "Copy"}
              </button>
              <button
                onClick={handleDownload}
                className="flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs hover:bg-muted"
              >
                <Download className="h-3.5 w-3.5" />
                .md
              </button>
            </div>
          </div>
          <pre className="p-6 whitespace-pre-wrap text-sm leading-relaxed font-mono max-h-[70vh] overflow-y-auto">
            {review.review_md}
          </pre>
        </div>
      )}
    </div>
  );
}
