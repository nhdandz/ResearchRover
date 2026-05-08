"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  ChevronRight,
  ChevronDown,
  FolderOpen,
  Folder,
  Plus,
  MoreHorizontal,
  Pencil,
  Trash2,
  FolderPlus,
  PanelLeftClose,
  PanelLeftOpen,
  Library,
  GripVertical,
  FolderInput,
  CornerLeftUp,
  Sparkles,
  BellRing,
  Search,
  FileText,
  Rss,
} from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { useAuth } from "@/components/AuthProvider";
import { fetchFolders, createFolder, updateFolder, deleteFolder } from "@/lib/api";

interface FolderNode {
  id: string;
  parent_id: string | null;
  name: string;
  icon: string | null;
  position: number;
  created_at: string;
  updated_at: string;
  children: FolderNode[];
  bookmark_count: number;
}

// Drop position indicator
type DropPosition = "before" | "inside" | "after";

interface DragState {
  dragId: string;
  dragParentId: string | null;
}

interface DropTarget {
  targetId: string;
  position: DropPosition;
}

export function PersonalSidebar() {
  const { user } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [folders, setFolders] = useState<FolderNode[]>([]);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [newFolderParentId, setNewFolderParentId] = useState<string | null | undefined>(undefined);
  const [newFolderName, setNewFolderName] = useState("");
  const [contextMenu, setContextMenu] = useState<{ id: string; x: number; y: number } | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [moveToMenu, setMoveToMenu] = useState<string | null>(null);
  const contextRef = useRef<HTMLDivElement>(null);

  // Drag & drop state
  const [dragState, setDragState] = useState<DragState | null>(null);
  const [dropTarget, setDropTarget] = useState<DropTarget | null>(null);
  const dragExpandTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadFolders = useCallback(async () => {
    try {
      const data = await fetchFolders();
      setFolders(data);
    } catch {
      // Not authenticated or error
    }
  }, []);

  useEffect(() => {
    if (user) loadFolders();
    else setFolders([]);
  }, [user, loadFolders]);

  // Close context menu on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (contextRef.current && !contextRef.current.contains(e.target as Node)) {
        setContextMenu(null);
        setMoveToMenu(null);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  if (!user) return null;

  const toggleExpand = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleCreateFolder = async () => {
    if (!newFolderName.trim()) {
      setNewFolderParentId(undefined);
      return;
    }
    try {
      await createFolder({
        name: newFolderName.trim(),
        parent_id: newFolderParentId || null,
      });
      setNewFolderName("");
      setNewFolderParentId(undefined);
      await loadFolders();
    } catch {
      // Error
    }
  };

  const handleRename = async (id: string) => {
    if (!renameValue.trim()) {
      setRenamingId(null);
      return;
    }
    try {
      await updateFolder(id, { name: renameValue.trim() });
      setRenamingId(null);
      setRenameValue("");
      await loadFolders();
    } catch {
      // Error
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteFolder(id);
      await loadFolders();
    } catch {
      // Error
    }
  };

  const handleContextMenu = (e: React.MouseEvent, id: string) => {
    e.preventDefault();
    e.stopPropagation();
    setMoveToMenu(null);
    setContextMenu({ id, x: e.clientX, y: e.clientY });
  };

  // ── Drag & Drop helpers ──

  const isDescendant = (parentId: string, childId: string): boolean => {
    const parent = findFolder(folders, parentId);
    if (!parent) return false;
    for (const c of parent.children) {
      if (c.id === childId) return true;
      if (isDescendant(c.id, childId)) return true;
    }
    return false;
  };

  const getSiblings = (folderId: string): FolderNode[] => {
    const folder = findFolder(folders, folderId);
    if (!folder) return [];
    if (!folder.parent_id) return folders;
    const parent = findFolder(folders, folder.parent_id);
    return parent?.children || [];
  };

  const handleDragStart = (e: React.DragEvent, folder: FolderNode) => {
    e.stopPropagation();
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", folder.id);
    setDragState({ dragId: folder.id, dragParentId: folder.parent_id });
    // Make the drag image slightly transparent
    if (e.currentTarget instanceof HTMLElement) {
      e.currentTarget.style.opacity = "0.5";
    }
  };

  const handleDragEnd = (e: React.DragEvent) => {
    e.stopPropagation();
    if (e.currentTarget instanceof HTMLElement) {
      e.currentTarget.style.opacity = "1";
    }
    setDragState(null);
    setDropTarget(null);
    if (dragExpandTimeout.current) {
      clearTimeout(dragExpandTimeout.current);
      dragExpandTimeout.current = null;
    }
  };

  const handleDragOver = (e: React.DragEvent, targetFolder: FolderNode) => {
    e.preventDefault();
    e.stopPropagation();
    if (!dragState || dragState.dragId === targetFolder.id) {
      setDropTarget(null);
      return;
    }
    // Don't allow dropping onto own descendant
    if (isDescendant(dragState.dragId, targetFolder.id)) {
      setDropTarget(null);
      return;
    }

    e.dataTransfer.dropEffect = "move";

    // Determine drop position based on mouse Y within the element
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const y = e.clientY - rect.top;
    const height = rect.height;

    let position: DropPosition;
    if (y < height * 0.25) {
      position = "before";
    } else if (y > height * 0.75) {
      position = "after";
    } else {
      position = "inside";
      // Auto-expand folder when hovering inside for 600ms
      if (dragExpandTimeout.current) clearTimeout(dragExpandTimeout.current);
      dragExpandTimeout.current = setTimeout(() => {
        setExpandedIds((prev) => {
          const next = new Set(prev);
          next.add(targetFolder.id);
          return next;
        });
      }, 600);
    }

    if (position !== "inside" && dragExpandTimeout.current) {
      clearTimeout(dragExpandTimeout.current);
      dragExpandTimeout.current = null;
    }

    setDropTarget({ targetId: targetFolder.id, position });
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.stopPropagation();
    // Only clear if actually leaving the element (not entering a child)
    const related = e.relatedTarget as HTMLElement | null;
    if (!related || !(e.currentTarget as HTMLElement).contains(related)) {
      if (dropTarget?.targetId === (e.currentTarget as HTMLElement).dataset.folderId) {
        setDropTarget(null);
      }
    }
    if (dragExpandTimeout.current) {
      clearTimeout(dragExpandTimeout.current);
      dragExpandTimeout.current = null;
    }
  };

  const handleDrop = async (e: React.DragEvent, targetFolder: FolderNode) => {
    e.preventDefault();
    e.stopPropagation();

    if (!dragState || !dropTarget) {
      setDragState(null);
      setDropTarget(null);
      return;
    }

    const dragId = dragState.dragId;
    if (dragId === targetFolder.id) return;
    if (isDescendant(dragId, targetFolder.id)) return;

    try {
      if (dropTarget.position === "inside") {
        // Move as child of target folder
        const targetChildren = targetFolder.children;
        const newPosition = targetChildren.length > 0
          ? Math.max(...targetChildren.map((c) => c.position)) + 1
          : 0;
        await updateFolder(dragId, { parent_id: targetFolder.id, position: newPosition });
        setExpandedIds((prev) => {
          const next = new Set(prev);
          next.add(targetFolder.id);
          return next;
        });
      } else {
        // Move before or after the target, as sibling
        const targetParentId = targetFolder.parent_id;
        const siblings = getSiblings(targetFolder.id);
        const targetIdx = siblings.findIndex((f) => f.id === targetFolder.id);

        // Build new order: remove dragId from siblings if same parent, insert at new position
        const filteredSiblings = siblings.filter((f) => f.id !== dragId);
        let insertIdx = filteredSiblings.findIndex((f) => f.id === targetFolder.id);
        if (insertIdx === -1) insertIdx = filteredSiblings.length;
        if (dropTarget.position === "after") insertIdx += 1;

        // Update parent first
        await updateFolder(dragId, { parent_id: targetParentId });

        // Re-assign positions for all siblings
        const newOrder = [
          ...filteredSiblings.slice(0, insertIdx),
          { id: dragId },
          ...filteredSiblings.slice(insertIdx),
        ];
        await Promise.all(
          newOrder.map((item, idx) => updateFolder(item.id, { position: idx }))
        );
      }
    } catch {
      // Error
    }

    setDragState(null);
    setDropTarget(null);
    await loadFolders();
  };

  // Drop on the root area (to move folder to root level)
  const handleRootDragOver = (e: React.DragEvent) => {
    if (!dragState) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  };

  const handleRootDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    if (!dragState) return;

    const dragId = dragState.dragId;
    const dragFolder = findFolder(folders, dragId);
    // Only handle if dragged folder is not already at root
    if (dragFolder && dragFolder.parent_id !== null) {
      try {
        const newPosition = folders.length > 0
          ? Math.max(...folders.map((f) => f.position)) + 1
          : 0;
        await updateFolder(dragId, { parent_id: null, position: newPosition });
        await loadFolders();
      } catch {
        // Error
      }
    }

    setDragState(null);
    setDropTarget(null);
  };

  const handleMoveTo = async (folderId: string, newParentId: string | null) => {
    try {
      await updateFolder(folderId, { parent_id: newParentId });
      if (newParentId) {
        setExpandedIds((prev) => {
          const next = new Set(prev);
          next.add(newParentId);
          return next;
        });
      }
      await loadFolders();
    } catch {
      // Error
    }
    setContextMenu(null);
    setMoveToMenu(null);
  };

  const getMoveTargets = (excludeId: string): { id: string | null; name: string; depth: number }[] => {
    const excluded = new Set<string>();
    const collectDescendants = (node: FolderNode) => {
      excluded.add(node.id);
      node.children.forEach(collectDescendants);
    };
    const target = findFolder(folders, excludeId);
    if (target) collectDescendants(target);

    const result: { id: string | null; name: string; depth: number }[] = [];
    const current = findFolder(folders, excludeId);
    if (current?.parent_id) {
      result.push({ id: null, name: "Root (top level)", depth: 0 });
    }

    const flatten = (nodes: FolderNode[], depth: number) => {
      for (const node of nodes) {
        if (!excluded.has(node.id)) {
          result.push({ id: node.id, name: node.name, depth });
          flatten(node.children, depth + 1);
        }
      }
    };
    flatten(folders, 0);
    return result;
  };

  // ── Drop indicator styles ──
  const getDropIndicatorClass = (folderId: string): string => {
    if (!dropTarget || dropTarget.targetId !== folderId) return "";
    switch (dropTarget.position) {
      case "before":
        return "before:absolute before:left-2 before:right-2 before:top-0 before:h-[2px] before:rounded-full before:bg-primary";
      case "after":
        return "after:absolute after:left-2 after:right-2 after:bottom-0 after:h-[2px] after:rounded-full after:bg-primary";
      case "inside":
        return "ring-2 ring-primary/40 bg-primary/5";
      default:
        return "";
    }
  };

  const renderFolder = (folder: FolderNode, depth: number = 0) => {
    const isExpanded = expandedIds.has(folder.id);
    const hasChildren = folder.children.length > 0;
    const isRenaming = renamingId === folder.id;
    const isDragging = dragState?.dragId === folder.id;

    return (
      <div key={folder.id}>
        <div
          data-folder-id={folder.id}
          draggable={!isRenaming}
          onDragStart={(e) => handleDragStart(e, folder)}
          onDragEnd={handleDragEnd}
          onDragOver={(e) => handleDragOver(e, folder)}
          onDragLeave={handleDragLeave}
          onDrop={(e) => handleDrop(e, folder)}
          className={cn(
            "group relative flex items-center gap-1 rounded-lg px-2 py-1.5 text-[13px] transition-colors hover:bg-muted cursor-pointer",
            isDragging && "opacity-40",
            getDropIndicatorClass(folder.id),
          )}
          style={{ paddingLeft: `${depth * 16 + 8}px` }}
          onClick={() => {
            if (dragState) return;
            router.push(`/my-library?folder=${folder.id}`);
            if (hasChildren) toggleExpand(folder.id);
          }}
          onContextMenu={(e) => handleContextMenu(e, folder.id)}
        >
          {/* Drag handle */}
          <span
            className="shrink-0 cursor-grab opacity-0 group-hover:opacity-60 hover:!opacity-100 text-muted-foreground active:cursor-grabbing"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <GripVertical size={12} />
          </span>
          <button
            onClick={(e) => {
              e.stopPropagation();
              toggleExpand(folder.id);
            }}
            className="shrink-0 text-muted-foreground"
          >
            {hasChildren ? (
              isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />
            ) : (
              <span className="inline-block w-[14px]" />
            )}
          </button>
          {isExpanded ? (
            <FolderOpen size={14} className="shrink-0 text-primary" />
          ) : (
            <Folder size={14} className="shrink-0 text-muted-foreground" />
          )}
          {isRenaming ? (
            <input
              autoFocus
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              onBlur={() => handleRename(folder.id)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleRename(folder.id);
                if (e.key === "Escape") setRenamingId(null);
              }}
              onClick={(e) => e.stopPropagation()}
              className="flex-1 rounded bg-muted px-1 py-0.5 text-[12px] text-foreground outline-none"
            />
          ) : (
            <span className="flex-1 truncate text-foreground">{folder.name}</span>
          )}
          {folder.bookmark_count > 0 && !isRenaming && (
            <span className="shrink-0 text-[10px] text-muted-foreground">
              {folder.bookmark_count}
            </span>
          )}
          <button
            onClick={(e) => {
              e.stopPropagation();
              handleContextMenu(e, folder.id);
            }}
            className="shrink-0 opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-foreground"
          >
            <MoreHorizontal size={14} />
          </button>
        </div>
        {isExpanded && folder.children.map((child) => renderFolder(child, depth + 1))}
        {/* Inline new folder input under this folder */}
        {newFolderParentId === folder.id && (
          <div className="flex items-center gap-1 px-2 py-1" style={{ paddingLeft: `${(depth + 1) * 16 + 8}px` }}>
            <FolderPlus size={14} className="shrink-0 text-primary" />
            <input
              autoFocus
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              onBlur={handleCreateFolder}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleCreateFolder();
                if (e.key === "Escape") setNewFolderParentId(undefined);
              }}
              placeholder="Folder name"
              className="flex-1 rounded bg-muted px-1.5 py-0.5 text-[12px] text-foreground placeholder:text-muted-foreground/60 outline-none"
            />
          </div>
        )}
      </div>
    );
  };

  return (
    <>
      <aside
        className={cn(
          "sticky top-14 h-[calc(100vh-3.5rem)] shrink-0 border-r border-border bg-card/50 transition-all duration-200 overflow-y-auto",
          collapsed ? "w-0 overflow-hidden border-r-0" : "w-64"
        )}
      >
        {/* ── Personalization links ── */}
        {!collapsed && (
          <div className="border-b border-border px-2 py-3">
            <p className="mb-1.5 px-2 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
              Personalization
            </p>
            {[
              { href: "/me/feed", label: "My Feed", icon: Rss },
              { href: "/me/digest", label: "Weekly Digest", icon: Sparkles },
              { href: "/settings/searches", label: "Saved Searches", icon: Search },
              { href: "/settings/alerts", label: "Alerts", icon: BellRing },
            ].map(({ href, label, icon: Icon }) => (
              <Link
                key={href}
                href={href}
                onClick={() => {}}
                className={cn(
                  "flex items-center gap-2 rounded-lg px-2 py-1.5 text-[13px] transition-colors hover:bg-muted",
                  pathname === href ? "bg-muted/80 text-foreground font-medium" : "text-muted-foreground"
                )}
              >
                <Icon size={14} className={pathname === href ? "text-primary" : ""} />
                {label}
              </Link>
            ))}
          </div>
        )}

        <div className="flex items-center justify-between p-3 pb-2">
          <div className="flex items-center gap-2 text-[13px] font-semibold text-foreground">
            <Library size={15} className="text-primary" />
            My Library
          </div>
          <div className="flex items-center gap-0.5">
            <button
              onClick={() => {
                setNewFolderParentId(null);
                setNewFolderName("");
              }}
              className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              title="New folder"
            >
              <Plus size={14} />
            </button>
            <button
              onClick={() => setCollapsed(true)}
              className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              title="Collapse sidebar"
            >
              <PanelLeftClose size={14} />
            </button>
          </div>
        </div>

        {/* Root-level new folder input */}
        {newFolderParentId === null && (
          <div className="flex items-center gap-1 px-3 py-1">
            <FolderPlus size={14} className="shrink-0 text-primary" />
            <input
              autoFocus
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              onBlur={handleCreateFolder}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleCreateFolder();
                if (e.key === "Escape") setNewFolderParentId(undefined);
              }}
              placeholder="Folder name"
              className="flex-1 rounded bg-muted px-1.5 py-0.5 text-[12px] text-foreground placeholder:text-muted-foreground/60 outline-none"
            />
          </div>
        )}

        <div
          className={cn("px-1 pb-4 min-h-[60px]", dragState && "pb-16")}
          onDragOver={handleRootDragOver}
          onDrop={handleRootDrop}
        >
          {folders.length === 0 && newFolderParentId === undefined && (
            <div className="px-3 py-6 text-center text-[12px] text-muted-foreground">
              No folders yet. Click + to create one.
            </div>
          )}
          {folders.map((f) => renderFolder(f))}

          {/* Drop zone hint at bottom for moving to root */}
          {dragState && (
            <div className="mx-2 mt-2 flex items-center justify-center rounded-lg border-2 border-dashed border-primary/30 py-3 text-[11px] text-muted-foreground">
              Drop here to move to root
            </div>
          )}
        </div>
      </aside>

      {/* Expand button when collapsed */}
      {collapsed && (
        <button
          onClick={() => setCollapsed(false)}
          className="sticky top-16 z-10 ml-1 mt-2 flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-card text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          title="Expand sidebar"
        >
          <PanelLeftOpen size={14} />
        </button>
      )}

      {/* Context Menu */}
      {contextMenu && (
        <div
          ref={contextRef}
          className="fixed z-[100] w-48 rounded-xl border border-border bg-card p-1 shadow-lg"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Rename */}
          <button
            onClick={() => {
              setRenamingId(contextMenu.id);
              const folder = findFolder(folders, contextMenu.id);
              setRenameValue(folder?.name || "");
              setContextMenu(null);
            }}
            className="flex w-full items-center gap-2 rounded-lg px-3 py-1.5 text-[13px] text-foreground transition-colors hover:bg-muted"
          >
            <Pencil size={13} /> Rename
          </button>

          {/* New subfolder */}
          <button
            onClick={() => {
              setNewFolderParentId(contextMenu.id);
              setNewFolderName("");
              setExpandedIds((prev) => { const next = new Set(prev); next.add(contextMenu.id); return next; });
              setContextMenu(null);
            }}
            className="flex w-full items-center gap-2 rounded-lg px-3 py-1.5 text-[13px] text-foreground transition-colors hover:bg-muted"
          >
            <FolderPlus size={13} /> New subfolder
          </button>

          <div className="my-1 border-t border-border" />

          {/* Move to another folder */}
          <div className="relative">
            <button
              onClick={() => setMoveToMenu(moveToMenu ? null : contextMenu.id)}
              className="flex w-full items-center gap-2 rounded-lg px-3 py-1.5 text-[13px] text-foreground transition-colors hover:bg-muted"
            >
              <FolderInput size={13} /> Move to...
              <ChevronRight size={12} className="ml-auto text-muted-foreground" />
            </button>

            {/* Move-to submenu */}
            {moveToMenu === contextMenu.id && (
              <div className="absolute left-full top-0 ml-1 w-48 rounded-xl border border-border bg-card p-1 shadow-lg max-h-60 overflow-y-auto">
                {getMoveTargets(contextMenu.id).length === 0 ? (
                  <div className="px-3 py-2 text-[12px] text-muted-foreground">
                    No available targets
                  </div>
                ) : (
                  getMoveTargets(contextMenu.id).map((target) => (
                    <button
                      key={target.id ?? "root"}
                      onClick={() => handleMoveTo(contextMenu.id, target.id)}
                      className="flex w-full items-center gap-2 rounded-lg px-3 py-1.5 text-[13px] text-foreground transition-colors hover:bg-muted"
                    >
                      {target.id === null ? (
                        <CornerLeftUp size={13} className="shrink-0 text-muted-foreground" />
                      ) : (
                        <Folder size={13} className="shrink-0 text-muted-foreground" />
                      )}
                      <span
                        className="truncate"
                        style={{ paddingLeft: target.id !== null ? `${target.depth * 10}px` : undefined }}
                      >
                        {target.name}
                      </span>
                    </button>
                  ))
                )}
              </div>
            )}
          </div>

          <div className="my-1 border-t border-border" />

          {/* Delete */}
          <button
            onClick={() => {
              handleDelete(contextMenu.id);
              setContextMenu(null);
            }}
            className="flex w-full items-center gap-2 rounded-lg px-3 py-1.5 text-[13px] text-red-500 transition-colors hover:bg-red-500/10"
          >
            <Trash2 size={13} /> Delete
          </button>
        </div>
      )}
    </>
  );
}

function findFolder(folders: FolderNode[], id: string): FolderNode | null {
  for (const f of folders) {
    if (f.id === id) return f;
    const found = findFolder(f.children, id);
    if (found) return found;
  }
  return null;
}
