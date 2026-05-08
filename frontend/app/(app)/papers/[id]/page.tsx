"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import {
  ArrowLeft, ExternalLink, BookOpen, GitBranch, Bookmark,
  Quote, Users, Calendar, StickyNote, Plus, Trash2, Pin,
  PinOff, Loader2, Download, FileText, Tag, X, Pencil,
  CheckCircle2, ChevronRight,
} from "lucide-react";
import Link from "next/link";
import {
  fetchPaper, fetchPaperNotes, createPaperNote,
  updatePaperNote, deletePaperNote,
  fetchSimilarPapers, getBibTexUrl,
} from "@/lib/api";
import { formatDate } from "@/lib/utils";
import { useAuth } from "@/components/AuthProvider";
import { BookmarkDialog } from "@/components/BookmarkDialog";
import { cn } from "@/lib/utils";

// ─── Note interfaces ────────────────────────────────────────────────────────
interface PaperNote {
  id: string;
  paper_id: string;
  content: string;
  is_pinned: boolean;
  tags: string[];
  created_at: string;
  updated_at: string;
}

// ─── NoteCard ───────────────────────────────────────────────────────────────
function NoteCard({
  note,
  onUpdate,
  onDelete,
}: {
  note: PaperNote;
  onUpdate: (id: string, body: any) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(note.content);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!draft.trim()) return;
    setSaving(true);
    await onUpdate(note.id, { content: draft.trim() });
    setSaving(false);
    setEditing(false);
  };

  return (
    <div
      className={cn(
        "group rounded-xl border p-4 transition-all duration-150",
        note.is_pinned
          ? "border-primary/30 bg-primary/5"
          : "border-border bg-card hover:bg-muted/30"
      )}
    >
      {editing ? (
        <div className="space-y-2">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={3}
            autoFocus
            className="w-full resize-none rounded-lg border border-border bg-background px-3 py-2 text-[13px] text-foreground outline-none focus:border-primary/40 focus:ring-2 focus:ring-primary/10"
          />
          <div className="flex gap-2">
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-[12px] font-medium text-primary-foreground hover:opacity-90 disabled:opacity-60"
            >
              {saving ? <Loader2 size={11} className="animate-spin" /> : <CheckCircle2 size={11} />}
              Save
            </button>
            <button
              onClick={() => { setEditing(false); setDraft(note.content); }}
              className="rounded-lg border border-border px-3 py-1.5 text-[12px] font-medium text-muted-foreground hover:bg-muted"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div className="flex items-start gap-2">
          <p className="flex-1 text-[13px] leading-relaxed text-foreground whitespace-pre-wrap">
            {note.content}
          </p>
          <div className="flex shrink-0 items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
            <button
              onClick={() => onUpdate(note.id, { is_pinned: !note.is_pinned })}
              title={note.is_pinned ? "Unpin" : "Pin"}
              className="flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              {note.is_pinned ? <PinOff size={12} /> : <Pin size={12} />}
            </button>
            <button
              onClick={() => setEditing(true)}
              className="flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <Pencil size={12} />
            </button>
            <button
              onClick={() => onDelete(note.id)}
              className="flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
            >
              <Trash2 size={12} />
            </button>
          </div>
        </div>
      )}

      {note.tags && note.tags.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {note.tags.map((t) => (
            <span key={t} className="rounded-md bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
              #{t}
            </span>
          ))}
        </div>
      )}
      <p className="mt-2 text-[10px] text-muted-foreground">
        {new Date(note.updated_at).toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
      </p>
    </div>
  );
}

// ─── Notes Panel ────────────────────────────────────────────────────────────
function NotesPanel({ paperId }: { paperId: string }) {
  const [notes, setNotes] = useState<PaperNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [newContent, setNewContent] = useState("");
  const [newTags, setNewTags] = useState("");
  const [adding, setAdding] = useState(false);
  const [showAdd, setShowAdd] = useState(false);

  useEffect(() => {
    fetchPaperNotes(paperId)
      .then((data) => setNotes(Array.isArray(data) ? data : data.items ?? []))
      .catch(() => setNotes([]))
      .finally(() => setLoading(false));
  }, [paperId]);

  const handleCreate = async () => {
    if (!newContent.trim()) return;
    setAdding(true);
    try {
      const tags = newTags
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean);
      const note = await createPaperNote({ paper_id: paperId, content: newContent.trim(), tags });
      setNotes((prev) => [note, ...prev]);
      setNewContent("");
      setNewTags("");
      setShowAdd(false);
    } finally {
      setAdding(false);
    }
  };

  const handleUpdate = async (id: string, body: any) => {
    const updated = await updatePaperNote(id, body);
    setNotes((prev) => prev.map((n) => (n.id === id ? updated : n)));
  };

  const handleDelete = async (id: string) => {
    await deletePaperNote(id);
    setNotes((prev) => prev.filter((n) => n.id !== id));
  };

  const pinned = notes.filter((n) => n.is_pinned);
  const unpinned = notes.filter((n) => !n.is_pinned);

  return (
    <div className="rounded-2xl border border-border bg-card p-6 shadow-soft dark:shadow-soft-dark">
      <div className="flex items-center justify-between">
        <h3 className="flex items-center gap-2 text-[15px] font-semibold tracking-tight text-foreground">
          <StickyNote size={16} className="text-amber-500" />
          My Notes
          {notes.length > 0 && (
            <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
              {notes.length}
            </span>
          )}
        </h3>
        <button
          onClick={() => setShowAdd((v) => !v)}
          className="flex items-center gap-1.5 rounded-xl border border-border px-3 py-1.5 text-[12px] font-medium text-muted-foreground hover:border-primary/30 hover:bg-primary/5 hover:text-primary transition-all duration-150"
        >
          {showAdd ? <X size={13} /> : <Plus size={13} />}
          {showAdd ? "Cancel" : "Add note"}
        </button>
      </div>

      {/* Add note form */}
      {showAdd && (
        <div className="mt-4 space-y-3 rounded-xl border border-primary/20 bg-primary/5 p-4">
          <textarea
            value={newContent}
            onChange={(e) => setNewContent(e.target.value)}
            placeholder="Write your note, insight, or annotation..."
            rows={3}
            autoFocus
            className="w-full resize-none rounded-lg border border-border bg-background px-3 py-2 text-[13px] text-foreground placeholder:text-muted-foreground/50 outline-none focus:border-primary/40 focus:ring-2 focus:ring-primary/10"
          />
          <div className="flex items-center gap-2">
            <div className="flex flex-1 items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-2">
              <Tag size={12} className="shrink-0 text-muted-foreground" />
              <input
                value={newTags}
                onChange={(e) => setNewTags(e.target.value)}
                placeholder="Tags: nlp, rag, important (comma-separated)"
                className="flex-1 bg-transparent text-[12px] text-foreground placeholder:text-muted-foreground/50 outline-none"
              />
            </div>
            <button
              onClick={handleCreate}
              disabled={adding || !newContent.trim()}
              className="flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-[12px] font-medium text-primary-foreground hover:opacity-90 disabled:opacity-60 transition-opacity"
            >
              {adding ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} />}
              Add
            </button>
          </div>
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-8">
          <Loader2 size={18} className="animate-spin text-muted-foreground" />
        </div>
      )}

      {/* Empty state */}
      {!loading && notes.length === 0 && !showAdd && (
        <div className="py-8 text-center">
          <StickyNote size={28} className="mx-auto text-muted-foreground/20 mb-3" />
          <p className="text-[13px] text-muted-foreground">No notes yet. Add your first annotation.</p>
        </div>
      )}

      {/* Notes list */}
      {!loading && notes.length > 0 && (
        <div className="mt-4 space-y-2">
          {pinned.map((n) => (
            <NoteCard key={n.id} note={n} onUpdate={handleUpdate} onDelete={handleDelete} />
          ))}
          {unpinned.map((n) => (
            <NoteCard key={n.id} note={n} onUpdate={handleUpdate} onDelete={handleDelete} />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Similar Papers Panel ────────────────────────────────────────────────────
function SimilarPapersPanel({ paperId }: { paperId: string }) {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchSimilarPapers(paperId, 6)
      .then((data) => setItems(data.items ?? []))
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  }, [paperId]);

  if (loading)
    return (
      <div className="rounded-2xl border border-border bg-card p-6 shadow-soft dark:shadow-soft-dark">
        <h3 className="flex items-center gap-2 text-[15px] font-semibold tracking-tight text-foreground">
          <FileText size={16} className="text-primary" /> Similar Papers
        </h3>
        <div className="flex items-center justify-center py-8">
          <Loader2 size={18} className="animate-spin text-muted-foreground" />
        </div>
      </div>
    );

  if (items.length === 0) return null;

  return (
    <div className="rounded-2xl border border-border bg-card p-6 shadow-soft dark:shadow-soft-dark">
      <h3 className="flex items-center gap-2 text-[15px] font-semibold tracking-tight text-foreground">
        <FileText size={16} className="text-primary" /> Similar Papers
      </h3>
      <div className="mt-4 space-y-2">
        {items.map((item) => (
          <Link
            key={item.id}
            href={`/papers/${item.id}`}
            className="group flex items-start gap-3 rounded-xl border border-border p-4 transition-all duration-150 hover:bg-muted/50 hover:border-primary/20"
          >
            <div className="min-w-0 flex-1">
              <p className="text-[13px] font-medium leading-snug text-foreground group-hover:text-primary transition-colors line-clamp-2">
                {item.title}
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                {item.categories?.[0] && (
                  <span className="rounded-md bg-muted px-1.5 py-0.5 font-medium">
                    {item.categories[0]}
                  </span>
                )}
                {item.published_date && (
                  <span>{item.published_date.slice(0, 4)}</span>
                )}
                {item.citation_count > 0 && (
                  <span className="text-amber-500 dark:text-amber-400">{item.citation_count} citations</span>
                )}
                {item.score != null && (
                  <span className="text-primary font-medium">{Math.round(item.score * 100)}% similar</span>
                )}
              </div>
            </div>
            <ChevronRight size={14} className="mt-1 shrink-0 text-muted-foreground/40 group-hover:text-primary transition-colors" />
          </Link>
        ))}
      </div>
    </div>
  );
}

// ─── Main Page ───────────────────────────────────────────────────────────────
export default function PaperDetailPage() {
  const { id } = useParams();
  const { user } = useAuth();
  const [paper, setPaper] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [showBookmark, setShowBookmark] = useState(false);
  const [bibDownloading, setBibDownloading] = useState(false);

  useEffect(() => {
    if (id) {
      fetchPaper(id as string)
        .then((data) => setPaper(data))
        .catch(() => {})
        .finally(() => setLoading(false));
    }
  }, [id]);

  const handleBibTexDownload = async () => {
    setBibDownloading(true);
    try {
      const url = getBibTexUrl(id as string);
      const a = document.createElement("a");
      a.href = url;
      a.download = `paper_${id}.bib`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } finally {
      setTimeout(() => setBibDownloading(false), 800);
    }
  };

  if (loading)
    return (
      <div className="flex items-center justify-center py-32">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-muted border-t-primary" />
      </div>
    );

  if (!paper)
    return (
      <div className="py-32 text-center text-[15px] text-muted-foreground">
        Paper not found.
      </div>
    );

  const p = paper.paper || paper;

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      {/* Back */}
      <Link
        href="/papers"
        className="inline-flex items-center gap-1.5 text-[13px] font-medium text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft size={14} /> Back to papers
      </Link>

      {/* Hero card */}
      <div className="rounded-2xl border border-border bg-card p-8 shadow-soft dark:shadow-soft-dark">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <div className="flex items-start gap-3">
              <BookOpen size={20} className="mt-1 shrink-0 text-primary" />
              <div>
                <h1 className="text-2xl font-semibold tracking-tighter text-foreground">
                  {p.title}
                </h1>
                <div className="mt-3 flex flex-wrap items-center gap-2 text-[13px]">
                  <span className="flex items-center gap-1.5 text-muted-foreground">
                    <Calendar size={13} /> {formatDate(p.published_date)}
                  </span>
                  {p.arxiv_id && (
                    <a
                      href={`https://arxiv.org/abs/${p.arxiv_id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 text-primary hover:underline"
                    >
                      arxiv:{p.arxiv_id} <ExternalLink size={10} />
                    </a>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            {/* BibTeX export */}
            <button
              onClick={handleBibTexDownload}
              disabled={bibDownloading}
              title="Export BibTeX"
              className="flex items-center gap-1.5 rounded-xl border border-border bg-card px-3 py-2.5 text-[12px] font-medium text-muted-foreground shadow-soft transition-all duration-150 hover:bg-muted hover:border-primary/30 hover:text-foreground dark:shadow-soft-dark"
            >
              {bibDownloading ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />}
              BibTeX
            </button>

            {user && (
              <button
                onClick={() => setShowBookmark(true)}
                className="flex items-center gap-2 rounded-xl border border-border bg-card px-4 py-2.5 text-[13px] font-medium text-foreground shadow-soft transition-all duration-150 hover:bg-muted hover:border-primary/30 dark:shadow-soft-dark"
              >
                <Bookmark size={13} /> Save
              </button>
            )}
          </div>
        </div>

        {/* Stats row */}
        <div className="mt-6 flex flex-wrap gap-6">
          <div className="flex items-center gap-2 text-[14px]">
            <Quote size={15} className="text-primary" />
            <span className="font-semibold text-foreground">{p.citation_count || 0}</span>
            <span className="text-muted-foreground">citations</span>
          </div>
          <div className="flex items-center gap-2 text-[14px]">
            <Quote size={15} className="text-amber-500 dark:text-amber-400" />
            <span className="font-semibold text-foreground">{p.influential_citation_count || 0}</span>
            <span className="text-muted-foreground">influential</span>
          </div>
        </div>

        {/* Categories */}
        {p.categories && p.categories.length > 0 && (
          <div className="mt-5 flex flex-wrap gap-2">
            {p.categories.map((cat: string) => (
              <span
                key={cat}
                className="rounded-xl bg-primary/10 px-2.5 py-1 text-[12px] font-medium text-primary"
              >
                {cat}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Details grid */}
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        {/* Authors */}
        {p.authors && p.authors.length > 0 && (
          <div className="rounded-2xl border border-border bg-card p-6 shadow-soft dark:shadow-soft-dark">
            <h3 className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
              <Users size={13} /> Authors
            </h3>
            <p className="mt-3 text-[14px] leading-relaxed text-foreground">
              {p.authors.map((a: any) => a.name).join(", ")}
            </p>
          </div>
        )}

        {/* Abstract */}
        {p.abstract && (
          <div className={cn(
            "rounded-2xl border border-border bg-card p-6 shadow-soft dark:shadow-soft-dark",
            !(p.authors && p.authors.length > 0) ? "md:col-span-2" : ""
          )}>
            <h3 className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
              Abstract
            </h3>
            <p className="mt-3 text-[14px] leading-relaxed text-foreground">
              {p.abstract}
            </p>
          </div>
        )}
      </div>

      {/* AI Summary */}
      {p.summary && (
        <div className="rounded-2xl border border-primary/20 bg-primary/5 p-6">
          <h3 className="text-[11px] font-semibold uppercase tracking-widest text-primary">
            AI Summary
          </h3>
          <p className="mt-3 text-[14px] leading-relaxed text-foreground">
            {p.summary}
          </p>
        </div>
      )}

      {/* Linked Repos */}
      {paper.linked_repos?.length > 0 && (
        <div className="rounded-2xl border border-border bg-card p-6 shadow-soft dark:shadow-soft-dark">
          <h2 className="flex items-center gap-2 text-lg font-semibold tracking-tighter text-foreground">
            <GitBranch size={18} /> Linked Repositories
          </h2>
          <div className="mt-5 space-y-2">
            {paper.linked_repos.map((repo: any) => (
              <Link
                key={repo.id}
                href={`/repos/${repo.id}`}
                className="block rounded-xl border border-border p-4 transition-all duration-150 hover:bg-muted/50 hover:border-primary/20"
              >
                <p className="text-[13px] font-medium text-foreground">
                  {repo.full_name || repo.repo_id}
                </p>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  Confidence: {((repo.confidence_score || 0) * 100).toFixed(0)}% | {repo.link_type}
                </p>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Similar Papers */}
      <SimilarPapersPanel paperId={id as string} />

      {/* Personal Notes — only for logged-in users */}
      {user && <NotesPanel paperId={id as string} />}

      <BookmarkDialog
        open={showBookmark}
        onClose={() => setShowBookmark(false)}
        prefill={{
          item_type: "paper",
          item_id: id as string,
          external_title: p.title,
        }}
      />
    </div>
  );
}
