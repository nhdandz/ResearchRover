"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import {
  Send,
  Bot,
  User,
  BookOpen,
  ExternalLink,
  Sparkles,
  Plus,
  Trash2,
  MessageSquare,
  LogIn,
  PanelLeftClose,
  PanelLeft,
  Globe,
  FileText,
  Settings2,
  Search,
  FileCode,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/AuthProvider";
import {
  sendChatMessage,
  fetchConversations,
  createConversation,
  fetchConversation,
  deleteConversation,
  sendConversationMessage,
  setConversationDocuments,
  updateContextMode,
} from "@/lib/api";
import DocumentPickerModal from "@/components/chat/DocumentPickerModal";

interface Citation {
  title?: string;
  source?: string;
  url?: string;
  type?: string;
  relevance_score?: number;
}

interface Message {
  id?: string;
  role: "user" | "assistant";
  content: string;
  citations?: Citation[];
  confidence?: number;
}

interface ConversationItem {
  id: string;
  title: string | null;
  mode: string;
  context_mode: string;
  created_at: string;
  updated_at: string;
  last_message_preview: string | null;
}

export default function ChatPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();

  const [conversations, setConversations] = useState<ConversationItem[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [activeMode, setActiveMode] = useState<"global" | "documents">("global");
  const [contextMode, setContextMode] = useState<"rag" | "full_context">("rag");
  const [activeDocumentIds, setActiveDocumentIds] = useState<string[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [pickerOpen, setPickerOpen] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    inputRef.current?.focus();
  }, [activeConversationId]);

  // Load conversations list
  const loadConversations = useCallback(async () => {
    if (!user) return;
    try {
      const data = await fetchConversations();
      setConversations(data);
    } catch {
      // silently fail
    }
  }, [user]);

  useEffect(() => {
    loadConversations();
  }, [loadConversations]);

  // Redirect if not logged in
  if (authLoading) {
    return (
      <div className="flex h-[calc(100vh-8rem)] items-center justify-center">
        <div className="text-sm text-muted-foreground">Loading...</div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex h-[calc(100vh-8rem)] flex-col items-center justify-center gap-4">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10">
          <LogIn size={32} className="text-primary" />
        </div>
        <p className="text-sm text-muted-foreground">Please sign in to use AI Chat</p>
        <button
          onClick={() => router.push("/login")}
          className="rounded-xl bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground transition-all hover:brightness-110"
        >
          Sign In
        </button>
      </div>
    );
  }

  const handleNewChat = () => {
    setActiveConversationId(null);
    setMessages([]);
    setActiveMode("global");
    setContextMode("rag");
    setActiveDocumentIds([]);
  };

  const handleSelectConversation = async (id: string) => {
    setActiveConversationId(id);
    try {
      const data = await fetchConversation(id);
      setActiveMode(data.mode || "global");
      setContextMode(data.context_mode || "rag");
      setActiveDocumentIds(data.document_ids || []);
      setMessages(
        data.messages.map((m: any) => ({
          id: m.id,
          role: m.role,
          content: m.content,
          citations: m.citations,
          confidence: m.confidence,
        }))
      );
    } catch {
      setMessages([]);
    }
  };

  const handleDeleteConversation = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await deleteConversation(id);
      setConversations((prev) => prev.filter((c) => c.id !== id));
      if (activeConversationId === id) {
        setActiveConversationId(null);
        setMessages([]);
        setActiveMode("global");
        setContextMode("rag");
        setActiveDocumentIds([]);
      }
    } catch {
      // silently fail
    }
  };

  const handleModeToggle = async () => {
    if (activeMode === "global") {
      // Switch to document mode — open picker
      setActiveMode("documents");
      setPickerOpen(true);
    } else {
      // Switch back to global
      setActiveMode("global");
      setContextMode("rag");
      setActiveDocumentIds([]);
      // If there's an active conversation, create a new global one
      setActiveConversationId(null);
      setMessages([]);
    }
  };

  const handleDocumentsConfirmed = async (docIds: string[]) => {
    setPickerOpen(false);
    setActiveDocumentIds(docIds);

    if (docIds.length === 0) {
      setActiveMode("global");
      return;
    }

    // Create a document-mode conversation if needed
    let convId = activeConversationId;
    if (!convId || activeMode !== "documents") {
      try {
        const conv = await createConversation(undefined, "documents", contextMode);
        convId = conv.id;
        setActiveConversationId(convId);
        setMessages([]);
        await loadConversations();
      } catch {
        return;
      }
    }

    // Set documents on conversation
    try {
      await setConversationDocuments(convId!, docIds);
    } catch (err) {
      console.error("Failed to set conversation documents:", err);
    }
  };

  const handleContextModeToggle = async (mode: "rag" | "full_context") => {
    setContextMode(mode);
    if (activeConversationId) {
      try {
        await updateContextMode(activeConversationId, mode);
      } catch {
        // silently fail
      }
    }
  };

  const handleManageSources = () => {
    setPickerOpen(true);
  };

  const handleSend = async () => {
    const q = input.trim();
    if (!q || loading) return;

    setInput("");
    setMessages((prev) => [...prev, { role: "user", content: q }]);
    setLoading(true);

    try {
      let convId = activeConversationId;

      // Create new conversation if needed
      if (!convId) {
        const conv = await createConversation(undefined, activeMode, contextMode);
        convId = conv.id;
        setActiveConversationId(convId);

        // If document mode, set documents on the new conversation
        if (activeMode === "documents" && activeDocumentIds.length > 0) {
          await setConversationDocuments(convId!, activeDocumentIds);
        }
      }

      // Send message through conversation endpoint
      const data = await sendConversationMessage(convId!, q);

      // Replace the optimistic user message and add assistant response
      setMessages((prev) => {
        const withoutLast = prev.slice(0, -1);
        return [
          ...withoutLast,
          ...data.map((m: any) => ({
            id: m.id,
            role: m.role,
            content: m.content,
            citations: m.citations,
            confidence: m.confidence,
          })),
        ];
      });

      // Refresh conversations list
      await loadConversations();
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "Sorry, something went wrong. Please try again." },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const suggestions =
    activeMode === "documents"
      ? [
          "Summarize the key points of these documents",
          "What are the main findings?",
          "Compare the arguments across the documents",
        ]
      : [
          "What are the latest trends in LLMs?",
          "Summarize recent papers on RAG",
          "Which repos implement transformer architectures?",
        ];

  return (
    <div className="flex h-[calc(100vh-8rem)] gap-0">
      {/* Sidebar */}
      <div
        className={`flex flex-col border-r border-border bg-card/50 transition-all duration-200 ${
          sidebarOpen ? "w-72" : "w-0 overflow-hidden border-r-0"
        }`}
      >
        <div className="flex items-center justify-between p-3">
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Conversations
          </span>
          <button
            onClick={handleNewChat}
            className="flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            title="New Chat"
          >
            <Plus size={16} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-2 pb-2">
          {conversations.length === 0 ? (
            <p className="px-2 py-4 text-center text-xs text-muted-foreground">
              No conversations yet
            </p>
          ) : (
            conversations.map((conv) => (
              <button
                key={conv.id}
                onClick={() => handleSelectConversation(conv.id)}
                className={`group mb-1 flex w-full items-start gap-2 rounded-xl px-3 py-2.5 text-left text-sm transition-colors ${
                  activeConversationId === conv.id
                    ? "bg-primary/10 text-primary"
                    : "text-foreground hover:bg-muted"
                }`}
              >
                {conv.mode === "documents" ? (
                  <FileText size={14} className="mt-0.5 shrink-0 text-blue-500" />
                ) : (
                  <MessageSquare size={14} className="mt-0.5 shrink-0" />
                )}
                <div className="flex-1 overflow-hidden">
                  <p className="truncate text-[13px] font-medium">
                    {conv.title || "New Chat"}
                  </p>
                  {conv.last_message_preview && (
                    <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                      {conv.last_message_preview}
                    </p>
                  )}
                </div>
                <button
                  onClick={(e) => handleDeleteConversation(conv.id, e)}
                  className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded text-muted-foreground opacity-0 transition-all hover:bg-red-500/10 hover:text-red-500 group-hover:opacity-100"
                >
                  <Trash2 size={12} />
                </button>
              </button>
            ))
          )}
        </div>
      </div>

      {/* Main chat area */}
      <div className="flex flex-1 flex-col">
        {/* Header */}
        <div className="flex items-center gap-3 border-b border-border px-4 py-3">
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            {sidebarOpen ? <PanelLeftClose size={16} /> : <PanelLeft size={16} />}
          </button>
          <Sparkles size={20} className="text-primary" />
          <div className="flex-1">
            <h1 className="text-sm font-semibold text-foreground">Research Assistant</h1>
            <p className="text-[11px] text-muted-foreground">
              {activeMode === "documents"
                ? `Chatting with ${activeDocumentIds.length} document${activeDocumentIds.length !== 1 ? "s" : ""}`
                : "Ask questions about papers, repos, and trends"}
            </p>
          </div>

          {/* Mode toggle */}
          <div className="flex items-center gap-1 rounded-xl border border-border bg-background p-0.5">
            <button
              onClick={() => activeMode !== "global" && handleModeToggle()}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-all ${
                activeMode === "global"
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Globe size={13} />
              Knowledge Base
            </button>
            <button
              onClick={() => activeMode !== "documents" && handleModeToggle()}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-all ${
                activeMode === "documents"
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <FileText size={13} />
              My Documents
              {activeMode === "documents" && activeDocumentIds.length > 0 && (
                <span className="flex h-4 min-w-[16px] items-center justify-center rounded-full bg-primary-foreground/20 px-1 text-[10px]">
                  {activeDocumentIds.length}
                </span>
              )}
            </button>
          </div>

          {/* Manage Sources button (only in document mode) */}
          {activeMode === "documents" && activeDocumentIds.length > 0 && (
            <button
              onClick={handleManageSources}
              className="flex h-8 items-center gap-1.5 rounded-lg border border-border px-3 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <Settings2 size={13} />
              Manage Sources
            </button>
          )}

          {/* Context mode toggle (only in document mode) */}
          {activeMode === "documents" && activeDocumentIds.length > 0 && (
            <div className="flex items-center gap-1 rounded-xl border border-border bg-background p-0.5">
              <button
                onClick={() => handleContextModeToggle("rag")}
                className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-all ${
                  contextMode === "rag"
                    ? "bg-blue-500 text-white shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
                title="Retrieve relevant chunks via semantic search"
              >
                <Search size={13} />
                RAG
              </button>
              <button
                onClick={() => handleContextModeToggle("full_context")}
                className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-all ${
                  contextMode === "full_context"
                    ? "bg-blue-500 text-white shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
                title="Send full document content to LLM"
              >
                <FileCode size={13} />
                Full Context
              </button>
            </div>
          )}
        </div>

        {/* Messages area */}
        <div className="flex-1 space-y-5 overflow-y-auto p-5">
          {/* Empty state */}
          {messages.length === 0 && (
            <div className="flex h-full items-center justify-center">
              <div className="text-center">
                <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10">
                  {activeMode === "documents" ? (
                    <FileText size={32} className="text-primary" />
                  ) : (
                    <Bot size={32} className="text-primary" />
                  )}
                </div>
                <p className="mt-4 text-sm text-muted-foreground">
                  {activeMode === "documents"
                    ? activeDocumentIds.length > 0
                      ? "Ask questions about your selected documents."
                      : "Select documents from your library to start chatting."
                    : "Ask me anything about your research knowledge base."}
                </p>
                <div className="mt-5 flex flex-wrap justify-center gap-2">
                  {suggestions.map((s) => (
                    <button
                      key={s}
                      onClick={() => setInput(s)}
                      className="rounded-full border border-border bg-card px-3.5 py-1.5 text-xs text-muted-foreground transition-all hover:border-primary/50 hover:bg-primary/5 hover:text-foreground"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Message list */}
          {messages.map((msg, i) => (
            <div
              key={msg.id || i}
              className={`flex gap-3 ${msg.role === "user" ? "justify-end" : ""}`}
            >
              {msg.role === "assistant" && (
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/15">
                  <Bot size={16} className="text-primary" />
                </div>
              )}

              <div
                className={`max-w-[78%] rounded-2xl px-4 py-3 text-sm ${
                  msg.role === "user"
                    ? "bg-primary text-primary-foreground"
                    : "bg-secondary text-secondary-foreground"
                }`}
              >
                {msg.role === "assistant" ? (
                  <div className="prose-chat">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                      {msg.content}
                    </ReactMarkdown>
                  </div>
                ) : (
                  <p className="whitespace-pre-wrap">{msg.content}</p>
                )}

                {msg.citations && msg.citations.length > 0 && (
                  <div className="mt-3 border-t border-border/50 pt-3">
                    <p className="mb-2 text-xs font-medium text-muted-foreground">
                      Sources ({msg.citations.length})
                    </p>
                    <div className="flex flex-col gap-1.5">
                      {msg.citations.map((cite, j) => (
                        <a
                          key={j}
                          href={cite.url || "#"}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="group flex items-start gap-2 rounded-lg border border-border/50 bg-background/50 px-3 py-2 text-xs transition-all hover:border-primary/30 hover:bg-primary/5"
                        >
                          <BookOpen size={12} className="mt-0.5 shrink-0 text-primary" />
                          <span className="flex-1 text-foreground/80 group-hover:text-foreground">
                            {cite.title || cite.source || `Source ${j + 1}`}
                          </span>
                          {cite.url && (
                            <ExternalLink
                              size={10}
                              className="mt-0.5 shrink-0 text-muted-foreground"
                            />
                          )}
                        </a>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {msg.role === "user" && (
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted">
                  <User size={16} className="text-muted-foreground" />
                </div>
              )}
            </div>
          ))}

          {/* Loading indicator */}
          {loading && (
            <div className="flex gap-3">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/15">
                <Bot size={16} className="text-primary" />
              </div>
              <div className="rounded-2xl bg-secondary px-4 py-3 text-sm text-muted-foreground">
                <span className="inline-flex items-center gap-1">
                  <span>Thinking</span>
                  <span className="flex gap-0.5">
                    <span className="inline-block h-1.5 w-1.5 animate-bounce rounded-full bg-primary/60 [animation-delay:0ms]" />
                    <span className="inline-block h-1.5 w-1.5 animate-bounce rounded-full bg-primary/60 [animation-delay:150ms]" />
                    <span className="inline-block h-1.5 w-1.5 animate-bounce rounded-full bg-primary/60 [animation-delay:300ms]" />
                  </span>
                </span>
              </div>
            </div>
          )}

          <div ref={endRef} />
        </div>

        {/* Input area */}
        <div className="border-t border-border p-4">
          <div className="flex gap-2">
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSend()}
              placeholder={
                activeMode === "documents"
                  ? "Ask about your documents..."
                  : "Ask a research question..."
              }
              className="flex-1 rounded-xl border border-border bg-card px-4 py-3 text-sm text-foreground placeholder-muted-foreground outline-none transition-colors focus:border-primary focus:ring-1 focus:ring-primary/20"
            />
            <button
              onClick={handleSend}
              disabled={loading || !input.trim()}
              className="rounded-xl bg-primary px-5 py-3 text-sm text-primary-foreground transition-all hover:brightness-110 disabled:opacity-40"
            >
              <Send size={16} />
            </button>
          </div>
        </div>
      </div>

      {/* Document Picker Modal */}
      <DocumentPickerModal
        isOpen={pickerOpen}
        onClose={() => {
          setPickerOpen(false);
          // If no documents were selected, revert to global mode
          if (activeDocumentIds.length === 0) {
            setActiveMode("global");
          }
        }}
        onConfirm={handleDocumentsConfirmed}
        initialDocumentIds={activeDocumentIds}
      />
    </div>
  );
}
