"use client";

import { useCallback, useEffect, useState } from "react";
import { X, Download, FileText } from "lucide-react";
import { downloadDocument, fetchDocumentContent } from "@/lib/api";

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

interface FileViewerModalProps {
  document: DocumentItem;
  onClose: () => void;
}

function getFileExtension(filename: string): string {
  const parts = filename.split(".");
  return parts.length > 1 ? parts.pop()!.toLowerCase() : "";
}

function isPreviewableText(contentType: string, ext: string): boolean {
  const textTypes = ["text/plain", "text/markdown", "text/csv", "text/html", "application/json", "text/xml"];
  const textExts = [
    "txt", "md", "csv", "json", "xml", "html", "log", "yml", "yaml",
    "py", "js", "ts", "jsx", "tsx", "rs", "go", "java", "c", "cpp",
    "h", "hpp", "cs", "rb", "php", "sh", "bash", "zsh", "bat",
    "sql", "r", "m", "swift", "kt", "scala", "lua", "pl",
    "toml", "ini", "cfg", "conf", "env", "gitignore", "dockerfile",
    "makefile", "cmake", "gradle", "properties",
  ];
  return textTypes.includes(contentType) || contentType.startsWith("text/") || textExts.includes(ext);
}

function isPdf(contentType: string, ext: string): boolean {
  return contentType === "application/pdf" || ext === "pdf";
}

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  const lines = text.split("\n");
  for (const line of lines) {
    if (line.trim() === "") continue;
    const cells: string[] = [];
    let current = "";
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (inQuotes) {
        if (ch === '"' && line[i + 1] === '"') {
          current += '"';
          i++;
        } else if (ch === '"') {
          inQuotes = false;
        } else {
          current += ch;
        }
      } else {
        if (ch === '"') {
          inQuotes = true;
        } else if (ch === ",") {
          cells.push(current);
          current = "";
        } else {
          current += ch;
        }
      }
    }
    cells.push(current);
    rows.push(cells);
  }
  return rows;
}

export default function FileViewerModal({ document: doc, onClose }: FileViewerModalProps) {
  const [loading, setLoading] = useState(true);
  const [textContent, setTextContent] = useState<string | null>(null);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const ext = getFileExtension(doc.original_filename);
  const canPreviewText = isPreviewableText(doc.content_type, ext);
  const canPreviewPdf = isPdf(doc.content_type, ext);
  const isCsv = ext === "csv" || doc.content_type === "text/csv";
  const isMarkdown = ext === "md" || doc.content_type === "text/markdown";

  useEffect(() => {
    let cancelled = false;

    async function loadContent() {
      setLoading(true);
      setError(null);

      try {
        if (canPreviewPdf) {
          const response = await downloadDocument(doc.id);
          if (cancelled) return;
          const blob = new Blob([response.data], { type: "application/pdf" });
          const url = URL.createObjectURL(blob);
          setPdfUrl(url);
        } else if (canPreviewText) {
          const data = await fetchDocumentContent(doc.id);
          if (cancelled) return;
          setTextContent(data.content);
        }
      } catch {
        if (!cancelled) setError("Failed to load file content");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadContent();
    return () => {
      cancelled = true;
    };
  }, [doc.id, canPreviewPdf, canPreviewText]);

  // Cleanup blob URL
  useEffect(() => {
    return () => {
      if (pdfUrl) URL.revokeObjectURL(pdfUrl);
    };
  }, [pdfUrl]);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  const handleDownload = useCallback(async () => {
    try {
      const response = await downloadDocument(doc.id);
      const url = URL.createObjectURL(new Blob([response.data]));
      const link = window.document.createElement("a");
      link.href = url;
      link.download = doc.original_filename;
      window.document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch {}
  }, [doc]);

  const renderContent = () => {
    if (loading) {
      return (
        <div className="flex flex-1 items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-muted border-t-primary" />
        </div>
      );
    }

    if (error) {
      return (
        <div className="flex flex-1 flex-col items-center justify-center gap-3">
          <FileText size={40} className="text-muted-foreground/30" />
          <p className="text-[13px] text-muted-foreground">{error}</p>
          <button
            onClick={handleDownload}
            className="flex items-center gap-2 rounded-xl border border-border px-4 py-2 text-[12px] font-medium text-foreground hover:bg-muted transition-colors"
          >
            <Download size={13} /> Try Download
          </button>
        </div>
      );
    }

    // PDF preview
    if (canPreviewPdf && pdfUrl) {
      return (
        <iframe
          src={pdfUrl}
          className="flex-1 w-full border-0 rounded-b-2xl"
          title={doc.original_filename}
        />
      );
    }

    // CSV as table
    if (canPreviewText && isCsv && textContent) {
      const rows = parseCsv(textContent);
      const header = rows[0] || [];
      const body = rows.slice(1);
      return (
        <div className="flex-1 overflow-auto p-4">
          <table className="w-full text-[12px] border-collapse">
            <thead>
              <tr>
                {header.map((cell, i) => (
                  <th
                    key={i}
                    className="sticky top-0 bg-muted px-3 py-2 text-left font-semibold text-foreground border border-border"
                  >
                    {cell}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {body.map((row, ri) => (
                <tr key={ri} className="hover:bg-muted/30">
                  {row.map((cell, ci) => (
                    <td key={ci} className="px-3 py-1.5 text-foreground border border-border">
                      {cell}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    }

    // Text / Markdown
    if (canPreviewText && textContent !== null) {
      return (
        <div className="flex-1 overflow-auto p-6">
          <pre className="whitespace-pre-wrap break-words text-[13px] leading-relaxed text-foreground font-mono">
            {textContent}
          </pre>
        </div>
      );
    }

    // Non-previewable files
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4">
        <FileText size={48} className="text-muted-foreground/30" />
        <div className="text-center">
          <p className="text-[14px] font-medium text-foreground">{doc.original_filename}</p>
          <p className="mt-1 text-[12px] text-muted-foreground">
            Preview is not available for this file type.
          </p>
        </div>
        <button
          onClick={handleDownload}
          className="flex items-center gap-2 rounded-xl bg-primary px-6 py-2.5 text-[13px] font-medium text-primary-foreground hover:bg-primary/90"
        >
          <Download size={14} /> Download File
        </button>
      </div>
    );
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="flex flex-col bg-card border border-border rounded-2xl shadow-2xl"
        style={{ width: "80vw", height: "80vh" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-5 py-3">
          <h2 className="text-[14px] font-semibold text-foreground truncate max-w-[60%]">
            {doc.original_filename}
          </h2>
          <div className="flex items-center gap-2">
            <button
              onClick={handleDownload}
              className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12px] font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
            >
              <Download size={14} /> Download
            </button>
            <button
              onClick={onClose}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Body */}
        {renderContent()}
      </div>
    </div>
  );
}
