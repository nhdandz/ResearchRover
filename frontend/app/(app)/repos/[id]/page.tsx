"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import {
  ArrowLeft, ExternalLink, Star, GitFork, Eye, BookOpen,
  AlertCircle, Calendar, Tag, Shield, FileText, Container,
  Bookmark, GitBranch, StickyNote, Plus, Trash2, Pin, PinOff,
  Loader2, ChevronRight, CheckCircle2, Pencil, X,
} from "lucide-react";
import Link from "next/link";
import {
  fetchRepo, fetchSimilarRepos,
  fetchPaperNotes, createPaperNote, updatePaperNote, deletePaperNote,
} from "@/lib/api";
import { formatDate, formatNumber } from "@/lib/utils";
import { useAuth } from "@/components/AuthProvider";
import { BookmarkDialog } from "@/components/BookmarkDialog";
import { cn } from "@/lib/utils";

// ─── Note types ──────────────────────────────────────────────────────────────
interface RepoNote {
  id: string;
  content: string;
  is_pinned: boolean;
  tags: string[];
  updated_at: string;
}

// ─── NoteCard (reused for repos) ─────────────────────────────────────────────
function NoteCard({
  note,
  onUpdate,
  onDelete,
}: {
  note: RepoNote;
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
    <div className={cn(
      "group rounded-xl border p-4 transition-all duration-150",
      note.is_pinned ? "border-primary/30 bg-primary/5" : "border-border bg-card hover:bg-muted/30"
    )}>
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
            <button onClick={handleSave} disabled={saving}
              className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-[12px] font-medium text-primary-foreground hover:opacity-90 disabled:opacity-60">
              {saving ? <Loader2 size={11} className="animate-spin" /> : <CheckCircle2 size={11} />} Save
            </button>
            <button onClick={() => { setEditing(false); setDraft(note.content); }}
              className="rounded-lg border border-border px-3 py-1.5 text-[12px] font-medium text-muted-foreground hover:bg-muted">
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div className="flex items-start gap-2">
          <p className="flex-1 text-[13px] leading-relaxed text-foreground whitespace-pre-wrap">{note.content}</p>
          <div className="flex shrink-0 items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
            <button onClick={() => onUpdate(note.id, { is_pinned: !note.is_pinned })}
              className="flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground">
              {note.is_pinned ? <PinOff size={12} /> : <Pin size={12} />}
            </button>
            <button onClick={() => setEditing(true)}
              className="flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground">
              <Pencil size={12} />
            </button>
            <button onClick={() => onDelete(note.id)}
              className="flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground hover:bg-destructive/10 hover:text-destructive">
              <Trash2 size={12} />
            </button>
          </div>
        </div>
      )}
      {note.tags?.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {note.tags.map((t) => (
            <span key={t} className="rounded-md bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">#{t}</span>
          ))}
        </div>
      )}
      <p className="mt-2 text-[10px] text-muted-foreground">
        {new Date(note.updated_at).toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
      </p>
    </div>
  );
}

// ─── Notes Panel ─────────────────────────────────────────────────────────────
function NotesPanel({ repoId }: { repoId: string }) {
  const [notes, setNotes] = useState<RepoNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [newContent, setNewContent] = useState("");
  const [newTags, setNewTags] = useState("");
  const [adding, setAdding] = useState(false);
  const [showAdd, setShowAdd] = useState(false);

  useEffect(() => {
    fetchPaperNotes(repoId, false)
      .then((data) => setNotes(Array.isArray(data) ? data : data.items ?? []))
      .catch(() => setNotes([]))
      .finally(() => setLoading(false));
  }, [repoId]);

  const handleCreate = async () => {
    if (!newContent.trim()) return;
    setAdding(true);
    try {
      const tags = newTags.split(",").map((t) => t.trim()).filter(Boolean);
      const note = await createPaperNote({ item_id: repoId, content: newContent.trim(), tags });
      setNotes((prev) => [note, ...prev]);
      setNewContent(""); setNewTags(""); setShowAdd(false);
    } finally { setAdding(false); }
  };

  const handleUpdate = async (id: string, body: any) => {
    const updated = await updatePaperNote(id, body);
    setNotes((prev) => prev.map((n) => (n.id === id ? updated : n)));
  };

  const handleDelete = async (id: string) => {
    await deletePaperNote(id);
    setNotes((prev) => prev.filter((n) => n.id !== id));
  };

  return (
    <div className="rounded-2xl border border-border bg-card p-6 shadow-soft dark:shadow-soft-dark">
      <div className="flex items-center justify-between">
        <h3 className="flex items-center gap-2 text-[15px] font-semibold tracking-tight text-foreground">
          <StickyNote size={16} className="text-amber-500" />
          My Notes
          {notes.length > 0 && (
            <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">{notes.length}</span>
          )}
        </h3>
        <button onClick={() => setShowAdd((v) => !v)}
          className="flex items-center gap-1.5 rounded-xl border border-border px-3 py-1.5 text-[12px] font-medium text-muted-foreground hover:border-primary/30 hover:bg-primary/5 hover:text-primary transition-all duration-150">
          {showAdd ? <X size={13} /> : <Plus size={13} />}
          {showAdd ? "Cancel" : "Add note"}
        </button>
      </div>

      {showAdd && (
        <div className="mt-4 space-y-3 rounded-xl border border-primary/20 bg-primary/5 p-4">
          <textarea value={newContent} onChange={(e) => setNewContent(e.target.value)}
            placeholder="Write your note or annotation..." rows={3} autoFocus
            className="w-full resize-none rounded-lg border border-border bg-background px-3 py-2 text-[13px] text-foreground placeholder:text-muted-foreground/50 outline-none focus:border-primary/40 focus:ring-2 focus:ring-primary/10" />
          <div className="flex items-center gap-2">
            <input value={newTags} onChange={(e) => setNewTags(e.target.value)}
              placeholder="Tags: llm, training (comma-separated)"
              className="flex-1 rounded-lg border border-border bg-background px-3 py-2 text-[12px] text-foreground placeholder:text-muted-foreground/50 outline-none focus:border-primary/40" />
            <button onClick={handleCreate} disabled={adding || !newContent.trim()}
              className="flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-[12px] font-medium text-primary-foreground hover:opacity-90 disabled:opacity-60 transition-opacity">
              {adding ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} />} Add
            </button>
          </div>
        </div>
      )}

      {loading && <div className="flex items-center justify-center py-8"><Loader2 size={18} className="animate-spin text-muted-foreground" /></div>}
      {!loading && notes.length === 0 && !showAdd && (
        <div className="py-8 text-center">
          <StickyNote size={28} className="mx-auto text-muted-foreground/20 mb-3" />
          <p className="text-[13px] text-muted-foreground">No notes yet.</p>
        </div>
      )}
      {!loading && notes.length > 0 && (
        <div className="mt-4 space-y-2">
          {notes.filter(n => n.is_pinned).map((n) => <NoteCard key={n.id} note={n} onUpdate={handleUpdate} onDelete={handleDelete} />)}
          {notes.filter(n => !n.is_pinned).map((n) => <NoteCard key={n.id} note={n} onUpdate={handleUpdate} onDelete={handleDelete} />)}
        </div>
      )}
    </div>
  );
}

// ─── Similar Repos Panel ──────────────────────────────────────────────────────
function SimilarReposPanel({ repoId }: { repoId: string }) {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchSimilarRepos(repoId, 6)
      .then((data) => setItems(data.items ?? []))
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  }, [repoId]);

  if (loading) return (
    <div className="rounded-2xl border border-border bg-card p-6 shadow-soft dark:shadow-soft-dark">
      <h3 className="flex items-center gap-2 text-[15px] font-semibold tracking-tight text-foreground">
        <GitBranch size={16} className="text-[hsl(var(--accent))]" /> Similar Repositories
      </h3>
      <div className="flex items-center justify-center py-8"><Loader2 size={18} className="animate-spin text-muted-foreground" /></div>
    </div>
  );

  if (items.length === 0) return null;

  return (
    <div className="rounded-2xl border border-border bg-card p-6 shadow-soft dark:shadow-soft-dark">
      <h3 className="flex items-center gap-2 text-[15px] font-semibold tracking-tight text-foreground">
        <GitBranch size={16} className="text-[hsl(var(--accent))]" /> Similar Repositories
      </h3>
      <div className="mt-4 space-y-2">
        {items.map((item) => (
          <Link key={item.id} href={`/repos/${item.id}`}
            className="group flex items-start gap-3 rounded-xl border border-border p-4 transition-all duration-150 hover:bg-muted/50 hover:border-primary/20">
            <div className="min-w-0 flex-1">
              <p className="text-[13px] font-medium text-foreground group-hover:text-primary transition-colors">{item.full_name}</p>
              {item.description && (
                <p className="mt-1 text-[11px] text-muted-foreground line-clamp-1">{item.description}</p>
              )}
              <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                {item.primary_language && (
                  <span className="rounded-md bg-muted px-1.5 py-0.5 font-medium text-foreground">{item.primary_language}</span>
                )}
                {item.stars_count > 0 && (
                  <span className="flex items-center gap-0.5 text-amber-500 dark:text-amber-400 font-medium">
                    <Star size={10} /> {formatNumber(item.stars_count)}
                  </span>
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

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function RepoDetailPage() {
  const { id } = useParams();
  const { user } = useAuth();
  const [repo, setRepo] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [showBookmark, setShowBookmark] = useState(false);

  useEffect(() => {
    if (id) {
      fetchRepo(id as string)
        .then((data) => setRepo(data))
        .catch(() => {})
        .finally(() => setLoading(false));
    }
  }, [id]);

  if (loading)
    return <div className="flex items-center justify-center py-32"><div className="h-6 w-6 animate-spin rounded-full border-2 border-muted border-t-primary" /></div>;

  if (!repo)
    return <div className="py-32 text-center text-[15px] text-muted-foreground">Repository not found.</div>;

  const r = repo.repo || repo;

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <Link href="/repos" className="inline-flex items-center gap-1.5 text-[13px] font-medium text-muted-foreground transition-colors hover:text-foreground">
        <ArrowLeft size={14} /> Back to repositories
      </Link>

      {/* Hero card */}
      <div className="rounded-2xl border border-border bg-card p-8 shadow-soft dark:shadow-soft-dark">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <h1 className="text-2xl font-semibold tracking-tighter text-foreground">{r.full_name}</h1>
            {r.description && <p className="mt-3 text-[15px] leading-relaxed text-muted-foreground">{r.description}</p>}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {user && (
              <button onClick={() => setShowBookmark(true)}
                className="flex items-center gap-2 rounded-xl border border-border bg-card px-4 py-2.5 text-[13px] font-medium text-foreground shadow-soft transition-all duration-150 hover:bg-muted hover:border-primary/30 dark:shadow-soft-dark">
                <Bookmark size={13} /> Save
              </button>
            )}
            {r.html_url && (
              <a href={r.html_url} target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-2 rounded-xl border border-border bg-card px-4 py-2.5 text-[13px] font-medium text-foreground shadow-soft transition-all duration-150 hover:bg-muted dark:shadow-soft-dark">
                GitHub <ExternalLink size={13} />
              </a>
            )}
          </div>
        </div>

        <div className="mt-6 flex flex-wrap gap-6">
          {[
            { icon: Star, value: formatNumber(r.stars_count || 0), label: "stars", color: "text-amber-500 dark:text-amber-400" },
            { icon: GitFork, value: formatNumber(r.forks_count || 0), label: "forks", color: "text-muted-foreground" },
            { icon: Eye, value: formatNumber(r.watchers_count || 0), label: "watchers", color: "text-muted-foreground" },
            { icon: AlertCircle, value: r.open_issues_count || 0, label: "issues", color: "text-muted-foreground" },
          ].map(({ icon: Icon, value, label, color }) => (
            <div key={label} className="flex items-center gap-2 text-[14px]">
              <Icon size={15} className={color} />
              <span className="font-semibold text-foreground">{value}</span>
              <span className="text-muted-foreground">{label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Details grid */}
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <div className="rounded-2xl border border-border bg-card p-6 shadow-soft dark:shadow-soft-dark">
          <h3 className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">Language</h3>
          {r.primary_language ? (
            <span className="mt-3 inline-block rounded-xl bg-primary/10 px-3 py-1.5 text-[13px] font-medium text-primary">{r.primary_language}</span>
          ) : (
            <p className="mt-3 text-[13px] text-muted-foreground">Unknown</p>
          )}
          {r.topics?.length > 0 && (
            <>
              <h3 className="mt-6 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">Topics</h3>
              <div className="mt-3 flex flex-wrap gap-2">
                {r.topics.map((t: string) => (
                  <span key={t} className="rounded-xl bg-[hsl(var(--accent)/0.1)] px-2.5 py-1 text-[12px] font-medium text-[hsl(var(--accent))]">{t}</span>
                ))}
              </div>
            </>
          )}
        </div>

        <div className="rounded-2xl border border-border bg-card p-6 shadow-soft dark:shadow-soft-dark">
          <h3 className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">Details</h3>
          <div className="mt-4 space-y-4">
            {[
              { icon: Calendar, label: "Created", value: formatDate(r.created_at) },
              { icon: Calendar, label: "Updated", value: formatDate(r.updated_at) },
              { icon: Tag, label: "Last Release", value: r.last_release_tag || "-" },
            ].map(({ icon: Icon, label, value }) => (
              <div key={label}>
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-2 text-[13px] text-muted-foreground"><Icon size={14} /> {label}</span>
                  <span className="text-[13px] font-medium text-foreground">{value}</span>
                </div>
                <div className="mt-4 border-t border-border" />
              </div>
            ))}
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">Quality</span>
              <div className="flex items-center gap-2">
                {r.has_readme && <span className="flex items-center gap-1 rounded-xl bg-emerald-500/10 px-2.5 py-1 text-[11px] font-medium text-emerald-600 dark:text-emerald-400"><FileText size={11} /> README</span>}
                {r.has_license && <span className="flex items-center gap-1 rounded-xl bg-primary/10 px-2.5 py-1 text-[11px] font-medium text-primary"><Shield size={11} /> License</span>}
                {r.has_docker && <span className="flex items-center gap-1 rounded-xl bg-cyan-500/10 px-2.5 py-1 text-[11px] font-medium text-cyan-600 dark:text-cyan-400"><Container size={11} /> Docker</span>}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* AI Summary */}
      {(repo.readme_summary || r.summary) && (
        <div className="rounded-2xl border border-primary/20 bg-primary/5 p-6">
          <h3 className="text-[11px] font-semibold uppercase tracking-widest text-primary">AI Summary</h3>
          <p className="mt-3 text-[14px] leading-relaxed text-foreground">{repo.readme_summary || r.summary}</p>
        </div>
      )}

      {/* Linked Papers */}
      {repo.linked_papers?.length > 0 && (
        <div className="rounded-2xl border border-border bg-card p-6 shadow-soft dark:shadow-soft-dark">
          <h2 className="flex items-center gap-2 text-lg font-semibold tracking-tighter text-foreground">
            <BookOpen size={18} /> Linked Papers
          </h2>
          <div className="mt-5 space-y-2">
            {repo.linked_papers.map((paper: any) => (
              <Link key={paper.id} href={`/papers/${paper.id}`}
                className="block rounded-xl border border-border p-4 transition-all duration-150 hover:bg-muted/50 hover:border-primary/20">
                <p className="text-[13px] font-medium text-foreground">{paper.title || paper.paper_id}</p>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  Confidence: {((paper.confidence_score || 0) * 100).toFixed(0)}% | {paper.link_type}
                </p>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Similar Repositories */}
      <SimilarReposPanel repoId={id as string} />

      {/* Personal Notes */}
      {user && <NotesPanel repoId={id as string} />}

      <BookmarkDialog
        open={showBookmark}
        onClose={() => setShowBookmark(false)}
        prefill={{ item_type: "repo", item_id: id as string, external_title: r.full_name }}
      />
    </div>
  );
}
