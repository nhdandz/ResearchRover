"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import {
  FileText,
  GitBranch,
  Globe,
  Box,
  Trash2,
  StickyNote,
  Plus,
  FolderOpen,
  Folder as FolderIcon,
  LayoutGrid,
  List,
  ExternalLink,
  Upload,
  Download,
  ChevronRight,
  File,
  Image,
  Code,
  Bookmark,
  Eye,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/components/AuthProvider";
import {
  fetchFolders,
  fetchFolderContents,
  fetchPaper,
  fetchRepo,
  deleteBookmark,
  deleteFolder,
  deleteDocument,
  uploadDocument,
  downloadDocument,
  savePaperToFolder,
} from "@/lib/api";
import { BookmarkDialog } from "@/components/BookmarkDialog";
import FileViewerModal from "@/components/FileViewerModal";

// ── Types ──

interface BreadcrumbItem {
  id: string;
  name: string;
}

interface FolderItem {
  id: string;
  parent_id: string | null;
  name: string;
  icon: string | null;
  position: number;
  created_at: string;
  updated_at: string;
  bookmark_count: number;
}

interface BookmarkItem {
  id: string;
  folder_id: string;
  item_type: string;
  item_id: string | null;
  external_url: string | null;
  external_title: string | null;
  external_metadata: Record<string, any> | null;
  note: string | null;
  created_at: string;
}

interface DocumentItem {
  id: string;
  folder_id: string;
  filename: string;
  original_filename: string;
  content_type: string;
  file_size: number;
  note: string | null;
  created_at: string;
}

interface UploadProgress {
  file: File;
  percent: number;
  done: boolean;
  error?: string;
}

// ── Helpers ──

const bookmarkTypeConfig: Record<string, { icon: any; color: string; label: string }> = {
  paper: { icon: FileText, color: "text-blue-500", label: "Paper" },
  repo: { icon: GitBranch, color: "text-orange-500", label: "Repository" },
  huggingface: { icon: Box, color: "text-yellow-500", label: "HuggingFace" },
  external: { icon: Globe, color: "text-emerald-500", label: "External" },
};

function getFileIcon(contentType: string) {
  if (contentType.startsWith("image/")) return { icon: Image, color: "text-green-500" };
  if (contentType === "application/pdf") return { icon: FileText, color: "text-red-500" };
  if (
    contentType.includes("javascript") ||
    contentType.includes("json") ||
    contentType.includes("xml") ||
    contentType.includes("html") ||
    contentType.includes("css") ||
    contentType.includes("python") ||
    contentType.includes("text/plain")
  )
    return { icon: Code, color: "text-gray-500" };
  return { icon: File, color: "text-blue-500" };
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  return `${months}mo ago`;
}

// ── Component ──

export default function MyLibraryPage() {
  const { user } = useAuth();
  const searchParams = useSearchParams();
  const router = useRouter();
  const folderId = searchParams.get("folder");

  // State
  const [rootFolders, setRootFolders] = useState<FolderItem[]>([]);
  const [breadcrumb, setBreadcrumb] = useState<BreadcrumbItem[]>([]);
  const [subfolders, setSubfolders] = useState<FolderItem[]>([]);
  const [bookmarks, setBookmarks] = useState<BookmarkItem[]>([]);
  const [documents, setDocuments] = useState<DocumentItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [viewMode, setViewMode] = useState<"grid" | "list">("list");
  const [showDialog, setShowDialog] = useState(false);
  const [resolvedTitles, setResolvedTitles] = useState<Record<string, string>>({});
  const [uploads, setUploads] = useState<UploadProgress[]>([]);
  const [isDragOver, setIsDragOver] = useState(false);
  const [viewingDocument, setViewingDocument] = useState<DocumentItem | null>(null);
  const [savingPaperId, setSavingPaperId] = useState<string | null>(null);
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    type: "folder" | "bookmark" | "document";
    item: any;
  } | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const dropRef = useRef<HTMLDivElement>(null);

  // ── Data loading ──

  const loadRootFolders = useCallback(async () => {
    if (!user) return;
    try {
      const data = await fetchFolders();
      setRootFolders(data);
    } catch {
      setRootFolders([]);
    }
  }, [user]);

  const loadFolderContents = useCallback(
    async (id: string) => {
      if (!user) return;
      setLoading(true);
      try {
        const data = await fetchFolderContents(id);
        setBreadcrumb(data.breadcrumb || []);
        setSubfolders(data.subfolders || []);
        setBookmarks(data.bookmarks || []);
        setDocuments(data.documents || []);
      } catch {
        setBreadcrumb([]);
        setSubfolders([]);
        setBookmarks([]);
        setDocuments([]);
      } finally {
        setLoading(false);
      }
    },
    [user]
  );

  useEffect(() => {
    if (!user) return;
    if (folderId) {
      loadFolderContents(folderId);
    } else {
      loadRootFolders();
    }
  }, [folderId, user, loadFolderContents, loadRootFolders]);

  // ── Resolve bookmark titles ──

  useEffect(() => {
    const toResolve = bookmarks.filter(
      (b) => !b.external_title && b.item_id && (b.item_type === "paper" || b.item_type === "repo")
    );
    if (toResolve.length === 0) return;
    const resolve = async () => {
      const titles: Record<string, string> = {};
      await Promise.all(
        toResolve.map(async (b) => {
          try {
            if (b.item_type === "paper") {
              const data = await fetchPaper(b.item_id!);
              titles[b.id] = (data.paper || data).title || b.item_id!;
            } else if (b.item_type === "repo") {
              const data = await fetchRepo(b.item_id!);
              const r = data.repo || data;
              titles[b.id] = r.full_name || r.name || b.item_id!;
            }
          } catch {}
        })
      );
      setResolvedTitles((prev) => ({ ...prev, ...titles }));
    };
    resolve();
  }, [bookmarks]);

  // ── Upload handling ──

  const handleUploadFiles = useCallback(
    async (files: FileList | File[]) => {
      if (!folderId) return;
      const fileArr = Array.from(files);
      const newUploads: UploadProgress[] = fileArr.map((f) => ({
        file: f,
        percent: 0,
        done: false,
      }));
      setUploads((prev) => [...prev, ...newUploads]);

      for (let i = 0; i < fileArr.length; i++) {
        try {
          await uploadDocument(folderId, fileArr[i], (percent) => {
            setUploads((prev) =>
              prev.map((u) => (u.file === fileArr[i] ? { ...u, percent } : u))
            );
          });
          setUploads((prev) =>
            prev.map((u) => (u.file === fileArr[i] ? { ...u, done: true, percent: 100 } : u))
          );
        } catch {
          setUploads((prev) =>
            prev.map((u) =>
              u.file === fileArr[i] ? { ...u, done: true, error: "Upload failed" } : u
            )
          );
        }
      }
      // Refresh contents after all uploads
      loadFolderContents(folderId);
      // Clear completed uploads after a delay
      setTimeout(() => {
        setUploads((prev) => prev.filter((u) => !u.done));
      }, 3000);
    },
    [folderId, loadFolderContents]
  );

  // ── Drag-drop ──

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragOver(false);
      if (e.dataTransfer.files?.length) {
        handleUploadFiles(e.dataTransfer.files);
      }
    },
    [handleUploadFiles]
  );

  // ── Actions ──

  const handleDeleteBookmark = async (id: string) => {
    await deleteBookmark(id);
    setBookmarks((prev) => prev.filter((b) => b.id !== id));
  };

  const handleDeleteDocument = async (id: string) => {
    await deleteDocument(id);
    setDocuments((prev) => prev.filter((d) => d.id !== id));
  };

  const handleDeleteFolder = async (id: string) => {
    await deleteFolder(id);
    if (folderId) {
      loadFolderContents(folderId);
    } else {
      loadRootFolders();
    }
  };

  const handleDownload = async (doc: DocumentItem) => {
    try {
      const response = await downloadDocument(doc.id);
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement("a");
      link.href = url;
      link.download = doc.original_filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch {}
  };

  const handleSavePaper = async (bookmark: BookmarkItem) => {
    if (!bookmark.item_id || !bookmark.folder_id || savingPaperId) return;
    setSavingPaperId(bookmark.item_id);
    try {
      await savePaperToFolder(bookmark.item_id, bookmark.folder_id);
      // Refresh folder contents to show the new document
      if (folderId) loadFolderContents(folderId);
    } catch {
      // silently fail
    } finally {
      setSavingPaperId(null);
    }
  };

  const getBookmarkTitle = (b: BookmarkItem) => {
    if (b.external_title) return b.external_title;
    if (resolvedTitles[b.id]) return resolvedTitles[b.id];
    if (b.external_url) return b.external_url;
    return `${b.item_type} - ${b.item_id}`;
  };

  const getBookmarkLink = (b: BookmarkItem) => {
    if (b.item_type === "paper" && b.item_id) return `/papers/${b.item_id}`;
    if (b.item_type === "repo" && b.item_id) return `/repos/${b.item_id}`;
    if (b.external_url) return b.external_url;
    return null;
  };

  // Close context menu on click outside
  useEffect(() => {
    const handler = () => setContextMenu(null);
    window.addEventListener("click", handler);
    return () => window.removeEventListener("click", handler);
  }, []);

  // ── Render: Not signed in ──

  if (!user) {
    return (
      <div className="flex flex-col items-center justify-center py-32 text-center">
        <FolderOpen size={48} className="text-muted-foreground/30" />
        <h2 className="mt-4 text-lg font-semibold text-foreground">Sign in to access your library</h2>
        <p className="mt-1 text-[13px] text-muted-foreground">
          Create folders and bookmark your favorite papers, repos, and resources.
        </p>
        <button
          onClick={() => router.push("/login")}
          className="mt-4 rounded-xl bg-primary px-6 py-2.5 text-[13px] font-medium text-primary-foreground hover:bg-primary/90"
        >
          Sign In
        </button>
      </div>
    );
  }

  // ── Render: Root view (no folder selected) ──

  if (!folderId) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <FolderOpen size={20} className="text-primary" />
            <h1 className="text-xl font-semibold tracking-tight text-foreground">My Library</h1>
          </div>
        </div>

        {rootFolders.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border py-16 text-center">
            <FolderOpen size={36} className="text-muted-foreground/30" />
            <p className="mt-3 text-[13px] text-muted-foreground">
              No folders yet. Create a folder from the sidebar to get started.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
            {rootFolders.map((f) => (
              <button
                key={f.id}
                onClick={() => router.push(`/my-library?folder=${f.id}`)}
                className="flex flex-col items-center gap-2 rounded-xl border border-border bg-card p-4 transition-all hover:bg-muted/50 hover:shadow-sm"
              >
                <FolderIcon size={32} className="text-primary" />
                <span className="text-[13px] font-medium text-foreground text-center line-clamp-2">
                  {f.name}
                </span>
                {f.bookmark_count > 0 && (
                  <span className="text-[10px] text-muted-foreground">
                    {f.bookmark_count} items
                  </span>
                )}
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }

  // ── Render: Folder contents view ──

  const totalItems = subfolders.length + bookmarks.length + documents.length;

  const sortedDocuments = [...documents].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );
  const sortedBookmarks = [...bookmarks].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );

  return (
    <div
      ref={dropRef}
      className="relative space-y-6"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Drag overlay */}
      {isDragOver && (
        <div className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center bg-primary/5 backdrop-blur-sm">
          <div className="flex flex-col items-center gap-3 rounded-2xl border-2 border-dashed border-primary bg-card p-12 shadow-lg">
            <Upload size={48} className="text-primary" />
            <p className="text-lg font-semibold text-foreground">Drop files here to upload</p>
          </div>
        </div>
      )}

      {/* Breadcrumb */}
      <div className="flex items-center gap-1.5 text-[13px]">
        <button
          onClick={() => router.push("/my-library")}
          className="text-muted-foreground hover:text-primary transition-colors"
        >
          My Library
        </button>
        {breadcrumb.map((crumb, i) => (
          <span key={crumb.id} className="flex items-center gap-1.5">
            <ChevronRight size={12} className="text-muted-foreground/50" />
            {i === breadcrumb.length - 1 ? (
              <span className="font-medium text-foreground">{crumb.name}</span>
            ) : (
              <button
                onClick={() => router.push(`/my-library?folder=${crumb.id}`)}
                className="text-muted-foreground hover:text-primary transition-colors"
              >
                {crumb.name}
              </button>
            )}
          </span>
        ))}
      </div>

      {/* Toolbar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-semibold tracking-tight text-foreground">
            {breadcrumb.length > 0 ? breadcrumb[breadcrumb.length - 1].name : "Loading..."}
          </h1>
          <span className="rounded-lg bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
            {totalItems} items
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setViewMode("list")}
            className={cn(
              "flex h-8 w-8 items-center justify-center rounded-lg transition-colors",
              viewMode === "list"
                ? "bg-primary/10 text-primary"
                : "text-muted-foreground hover:bg-muted"
            )}
          >
            <List size={15} />
          </button>
          <button
            onClick={() => setViewMode("grid")}
            className={cn(
              "flex h-8 w-8 items-center justify-center rounded-lg transition-colors",
              viewMode === "grid"
                ? "bg-primary/10 text-primary"
                : "text-muted-foreground hover:bg-muted"
            )}
          >
            <LayoutGrid size={15} />
          </button>
          <button
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-2 rounded-xl border border-border bg-card px-4 py-2 text-[13px] font-medium text-foreground hover:bg-muted transition-colors"
          >
            <Upload size={14} /> Upload
          </button>
          <button
            onClick={() => setShowDialog(true)}
            className="flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-[13px] font-medium text-primary-foreground hover:bg-primary/90"
          >
            <Plus size={14} /> Add Bookmark
          </button>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            className="hidden"
            onChange={(e) => {
              if (e.target.files?.length) {
                handleUploadFiles(e.target.files);
                e.target.value = "";
              }
            }}
          />
        </div>
      </div>

      {/* Loading */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-muted border-t-primary" />
        </div>
      ) : (
        <>
          {/* Subfolders */}
          {subfolders.length > 0 && (
            <div>
              <h3 className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Folders
              </h3>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
                {subfolders.map((sf) => (
                  <button
                    key={sf.id}
                    onClick={() => router.push(`/my-library?folder=${sf.id}`)}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      setContextMenu({
                        x: e.clientX,
                        y: e.clientY,
                        type: "folder",
                        item: sf,
                      });
                    }}
                    className="group flex flex-col items-center gap-2 rounded-xl border border-border bg-card p-4 transition-all hover:bg-muted/50 hover:shadow-sm"
                  >
                    <FolderIcon size={28} className="text-primary" />
                    <span className="text-[13px] font-medium text-foreground text-center line-clamp-2">
                      {sf.name}
                    </span>
                    {sf.bookmark_count > 0 && (
                      <span className="text-[10px] text-muted-foreground">
                        {sf.bookmark_count} items
                      </span>
                    )}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* My Files section */}
          {sortedDocuments.length > 0 && (
            <div>
              <h3 className="mb-3 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                <Upload size={12} />
                My Files
                <span className="rounded-md bg-muted px-1.5 py-0.5 text-[10px] font-medium normal-case">
                  {sortedDocuments.length}
                </span>
              </h3>
              {viewMode === "list" ? (
                <div className="space-y-1.5">
                  {sortedDocuments.map((d) => {
                    const fileInfo = getFileIcon(d.content_type);
                    const FileIcon = fileInfo.icon;
                    return (
                      <div
                        key={`doc-${d.id}`}
                        onContextMenu={(e) => {
                          e.preventDefault();
                          setContextMenu({
                            x: e.clientX,
                            y: e.clientY,
                            type: "document",
                            item: d,
                          });
                        }}
                        className="flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-3 transition-colors hover:bg-muted/50"
                      >
                        <FileIcon size={16} className={cn("shrink-0", fileInfo.color)} />
                        <div className="flex-1 min-w-0">
                          <button
                            onClick={() => setViewingDocument(d)}
                            className="text-[13px] font-medium text-foreground hover:text-primary hover:underline text-left truncate block max-w-full"
                          >
                            {d.original_filename}
                          </button>
                          {d.note && (
                            <p className="mt-0.5 flex items-center gap-1 text-[11px] text-muted-foreground truncate">
                              <StickyNote size={10} className="shrink-0" /> {d.note}
                            </p>
                          )}
                        </div>
                        <span className="shrink-0 text-[11px] text-muted-foreground w-20 text-right">
                          {formatFileSize(d.file_size)}
                        </span>
                        <span className="shrink-0 text-[11px] text-muted-foreground w-16 text-right">
                          {timeAgo(d.created_at)}
                        </span>
                        <button
                          onClick={() => handleDownload(d)}
                          className="shrink-0 text-muted-foreground transition-colors hover:text-primary"
                        >
                          <Download size={14} />
                        </button>
                        <button
                          onClick={() => handleDeleteDocument(d.id)}
                          className="shrink-0 text-muted-foreground transition-colors hover:text-red-500"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {sortedDocuments.map((d) => {
                    const fileInfo = getFileIcon(d.content_type);
                    const FileIcon = fileInfo.icon;
                    return (
                      <div
                        key={`doc-${d.id}`}
                        onContextMenu={(e) => {
                          e.preventDefault();
                          setContextMenu({
                            x: e.clientX,
                            y: e.clientY,
                            type: "document",
                            item: d,
                          });
                        }}
                        className="group relative rounded-xl border border-border bg-card p-4 transition-colors hover:bg-muted/50"
                      >
                        <div className="flex items-start gap-2">
                          <FileIcon size={16} className={cn("mt-0.5 shrink-0", fileInfo.color)} />
                          <div className="flex-1 min-w-0">
                            <button
                              onClick={() => setViewingDocument(d)}
                              className="text-[13px] font-medium text-foreground hover:text-primary text-left line-clamp-2"
                            >
                              {d.original_filename}
                            </button>
                            {d.note && (
                              <p className="mt-1 text-[11px] text-muted-foreground line-clamp-2">
                                {d.note}
                              </p>
                            )}
                          </div>
                        </div>
                        <div className="mt-3 flex items-center justify-between">
                          <span className="text-[10px] text-muted-foreground">
                            {formatFileSize(d.file_size)}
                          </span>
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] text-muted-foreground">
                              {timeAgo(d.created_at)}
                            </span>
                            <button
                              onClick={() => handleDownload(d)}
                              className="opacity-0 group-hover:opacity-100 text-muted-foreground transition-all hover:text-primary"
                            >
                              <Download size={13} />
                            </button>
                            <button
                              onClick={() => handleDeleteDocument(d.id)}
                              className="opacity-0 group-hover:opacity-100 text-muted-foreground transition-all hover:text-red-500"
                            >
                              <Trash2 size={13} />
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Bookmarks section */}
          {sortedBookmarks.length > 0 && (
            <div>
              <h3 className="mb-3 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                <Bookmark size={12} />
                Bookmarks
                <span className="rounded-md bg-muted px-1.5 py-0.5 text-[10px] font-medium normal-case">
                  {sortedBookmarks.length}
                </span>
              </h3>
              {viewMode === "list" ? (
                <div className="space-y-1.5">
                  {sortedBookmarks.map((b) => {
                    const cfg = bookmarkTypeConfig[b.item_type] || bookmarkTypeConfig.external;
                    const Icon = cfg.icon;
                    const link = getBookmarkLink(b);
                    return (
                      <div
                        key={`bm-${b.id}`}
                        onContextMenu={(e) => {
                          e.preventDefault();
                          setContextMenu({
                            x: e.clientX,
                            y: e.clientY,
                            type: "bookmark",
                            item: b,
                          });
                        }}
                        className="flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-3 transition-colors hover:bg-muted/50"
                      >
                        <Icon size={16} className={cn("shrink-0", cfg.color)} />
                        <div className="flex-1 min-w-0">
                          {link ? (
                            link.startsWith("/") ? (
                              <button
                                onClick={() => router.push(link)}
                                className="text-[13px] font-medium text-foreground hover:text-primary hover:underline text-left truncate block max-w-full"
                              >
                                {getBookmarkTitle(b)}
                              </button>
                            ) : (
                              <a
                                href={link}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-center gap-1 text-[13px] font-medium text-foreground hover:text-primary hover:underline truncate"
                              >
                                {getBookmarkTitle(b)}
                                <ExternalLink size={10} className="shrink-0" />
                              </a>
                            )
                          ) : (
                            <span className="text-[13px] font-medium text-foreground truncate block">
                              {getBookmarkTitle(b)}
                            </span>
                          )}
                          {b.note && (
                            <p className="mt-0.5 flex items-center gap-1 text-[11px] text-muted-foreground truncate">
                              <StickyNote size={10} className="shrink-0" /> {b.note}
                            </p>
                          )}
                        </div>
                        <span className="shrink-0 rounded-lg bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                          {cfg.label}
                        </span>
                        <span className="shrink-0 text-[11px] text-muted-foreground w-16 text-right">
                          {timeAgo(b.created_at)}
                        </span>
                        {b.item_type === "paper" && b.item_id && (
                          <button
                            onClick={() => handleSavePaper(b)}
                            disabled={savingPaperId === b.item_id}
                            className="shrink-0 text-muted-foreground transition-colors hover:text-primary disabled:opacity-50"
                            title="Download PDF to folder"
                          >
                            {savingPaperId === b.item_id ? (
                              <div className="h-3.5 w-3.5 animate-spin rounded-full border-[1.5px] border-muted border-t-primary" />
                            ) : (
                              <Download size={14} />
                            )}
                          </button>
                        )}
                        <button
                          onClick={() => handleDeleteBookmark(b.id)}
                          className="shrink-0 text-muted-foreground transition-colors hover:text-red-500"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {sortedBookmarks.map((b) => {
                    const cfg = bookmarkTypeConfig[b.item_type] || bookmarkTypeConfig.external;
                    const Icon = cfg.icon;
                    const link = getBookmarkLink(b);
                    return (
                      <div
                        key={`bm-${b.id}`}
                        onContextMenu={(e) => {
                          e.preventDefault();
                          setContextMenu({
                            x: e.clientX,
                            y: e.clientY,
                            type: "bookmark",
                            item: b,
                          });
                        }}
                        className="group relative rounded-xl border border-border bg-card p-4 transition-colors hover:bg-muted/50"
                      >
                        <div className="flex items-start gap-2">
                          <Icon size={16} className={cn("mt-0.5 shrink-0", cfg.color)} />
                          <div className="flex-1 min-w-0">
                            {link ? (
                              link.startsWith("/") ? (
                                <button
                                  onClick={() => router.push(link)}
                                  className="text-[13px] font-medium text-foreground hover:text-primary text-left line-clamp-2"
                                >
                                  {getBookmarkTitle(b)}
                                </button>
                              ) : (
                                <a
                                  href={link}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-[13px] font-medium text-foreground hover:text-primary line-clamp-2"
                                >
                                  {getBookmarkTitle(b)}
                                </a>
                              )
                            ) : (
                              <span className="text-[13px] font-medium text-foreground line-clamp-2">
                                {getBookmarkTitle(b)}
                              </span>
                            )}
                            {b.note && (
                              <p className="mt-1 text-[11px] text-muted-foreground line-clamp-2">
                                {b.note}
                              </p>
                            )}
                          </div>
                        </div>
                        <div className="mt-3 flex items-center justify-between">
                          <span className="rounded-lg bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                            {cfg.label}
                          </span>
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] text-muted-foreground">
                              {timeAgo(b.created_at)}
                            </span>
                            {b.item_type === "paper" && b.item_id && (
                              <button
                                onClick={() => handleSavePaper(b)}
                                disabled={savingPaperId === b.item_id}
                                className="opacity-0 group-hover:opacity-100 text-muted-foreground transition-all hover:text-primary disabled:opacity-50"
                                title="Download PDF to folder"
                              >
                                {savingPaperId === b.item_id ? (
                                  <div className="h-3 w-3 animate-spin rounded-full border-[1.5px] border-muted border-t-primary" />
                                ) : (
                                  <Download size={13} />
                                )}
                              </button>
                            )}
                            <button
                              onClick={() => handleDeleteBookmark(b.id)}
                              className="opacity-0 group-hover:opacity-100 text-muted-foreground transition-all hover:text-red-500"
                            >
                              <Trash2 size={13} />
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Empty state */}
          {totalItems === 0 && (
            <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border py-16 text-center">
              <FolderOpen size={36} className="text-muted-foreground/30" />
              <p className="mt-3 text-[13px] text-muted-foreground">
                This folder is empty. Upload files or add bookmarks to get started.
              </p>
              <div className="mt-4 flex items-center gap-2">
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="flex items-center gap-2 rounded-xl border border-border bg-card px-4 py-2 text-[13px] font-medium text-foreground hover:bg-muted"
                >
                  <Upload size={14} /> Upload File
                </button>
                <button
                  onClick={() => setShowDialog(true)}
                  className="flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-[13px] font-medium text-primary-foreground hover:bg-primary/90"
                >
                  <Plus size={14} /> Add Bookmark
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {/* Upload progress */}
      {uploads.length > 0 && (
        <div className="fixed bottom-6 right-6 z-40 w-80 space-y-2">
          {uploads.map((u, i) => (
            <div key={i} className="rounded-xl border border-border bg-card p-3 shadow-lg">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[12px] font-medium text-foreground truncate max-w-[200px]">
                  {u.file.name}
                </span>
                {u.error ? (
                  <span className="text-[11px] text-red-500">{u.error}</span>
                ) : u.done ? (
                  <span className="text-[11px] text-green-500">Done</span>
                ) : (
                  <span className="text-[11px] text-muted-foreground">{u.percent}%</span>
                )}
              </div>
              <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                <div
                  className={cn(
                    "h-full rounded-full transition-all duration-300",
                    u.error ? "bg-red-500" : u.done ? "bg-green-500" : "bg-primary"
                  )}
                  style={{ width: `${u.percent}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Context menu */}
      {contextMenu && (
        <div
          className="fixed z-50 min-w-[160px] rounded-xl border border-border bg-card py-1.5 shadow-lg"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onClick={(e) => e.stopPropagation()}
        >
          {contextMenu.type === "document" && (
            <>
              <button
                onClick={() => {
                  setViewingDocument(contextMenu.item);
                  setContextMenu(null);
                }}
                className="flex w-full items-center gap-2 px-3 py-1.5 text-[13px] text-foreground hover:bg-muted"
              >
                <Eye size={14} /> View
              </button>
              <button
                onClick={() => {
                  handleDownload(contextMenu.item);
                  setContextMenu(null);
                }}
                className="flex w-full items-center gap-2 px-3 py-1.5 text-[13px] text-foreground hover:bg-muted"
              >
                <Download size={14} /> Download
              </button>
              <button
                onClick={() => {
                  handleDeleteDocument(contextMenu.item.id);
                  setContextMenu(null);
                }}
                className="flex w-full items-center gap-2 px-3 py-1.5 text-[13px] text-red-500 hover:bg-muted"
              >
                <Trash2 size={14} /> Delete
              </button>
            </>
          )}
          {contextMenu.type === "bookmark" && (
            <>
              {getBookmarkLink(contextMenu.item) && (
                <button
                  onClick={() => {
                    const link = getBookmarkLink(contextMenu.item);
                    if (link) {
                      if (link.startsWith("/")) router.push(link);
                      else window.open(link, "_blank");
                    }
                    setContextMenu(null);
                  }}
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-[13px] text-foreground hover:bg-muted"
                >
                  <ExternalLink size={14} /> Open
                </button>
              )}
              {contextMenu.item.item_type === "paper" && contextMenu.item.item_id && (
                <button
                  onClick={() => {
                    handleSavePaper(contextMenu.item);
                    setContextMenu(null);
                  }}
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-[13px] text-foreground hover:bg-muted"
                >
                  <Download size={14} /> Download PDF
                </button>
              )}
              <button
                onClick={() => {
                  handleDeleteBookmark(contextMenu.item.id);
                  setContextMenu(null);
                }}
                className="flex w-full items-center gap-2 px-3 py-1.5 text-[13px] text-red-500 hover:bg-muted"
              >
                <Trash2 size={14} /> Delete
              </button>
            </>
          )}
          {contextMenu.type === "folder" && (
            <button
              onClick={() => {
                handleDeleteFolder(contextMenu.item.id);
                setContextMenu(null);
              }}
              className="flex w-full items-center gap-2 px-3 py-1.5 text-[13px] text-red-500 hover:bg-muted"
            >
              <Trash2 size={14} /> Delete Folder
            </button>
          )}
        </div>
      )}

      {viewingDocument && (
        <FileViewerModal
          document={viewingDocument}
          onClose={() => setViewingDocument(null)}
        />
      )}

      <BookmarkDialog
        open={showDialog}
        onClose={() => {
          setShowDialog(false);
          if (folderId) loadFolderContents(folderId);
        }}
        prefill={undefined}
      />
    </div>
  );
}
