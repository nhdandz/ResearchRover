import axios from "axios";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

const api = axios.create({
  baseURL: API_BASE,
  headers: { "Content-Type": "application/json" },
});

export async function fetchPapers(params?: Record<string, any>) {
  const { data } = await api.get("/papers", { params });
  return data;
}

export async function fetchPaper(id: string) {
  const { data } = await api.get(`/papers/${id}`);
  return data;
}

export async function fetchPaperStats(params?: Record<string, any>) {
  const { data } = await api.get("/papers/stats", { params });
  return data;
}

export async function fetchPaperCategories(): Promise<string[]> {
  const { data } = await api.get("/papers/categories");
  return data.categories;
}

export async function triggerCollectPapers() {
  const { data } = await api.post("/papers/collect");
  return data;
}

export async function triggerEnrichCitations() {
  const { data } = await api.post("/papers/enrich-citations");
  return data;
}

export async function fetchAuthorAnalytics(params?: Record<string, any>) {
  const { data } = await api.get("/papers/analytics/authors", { params });
  return data;
}

export async function fetchKeywordAnalytics(params?: Record<string, any>) {
  const { data } = await api.get("/papers/analytics/keywords", { params });
  return data;
}

export async function fetchCoAuthorNetwork(params?: Record<string, any>) {
  const { data } = await api.get("/papers/analytics/network", { params });
  return data;
}

export async function fetchKeywordTrends(params?: Record<string, any>) {
  const { data } = await api.get("/papers/analytics/trends", { params });
  return data;
}

export async function importPapers(file: File) {
  const formData = new FormData();
  formData.append("file", file);
  const { data } = await api.post("/papers/import", formData, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return data;
}

export async function fetchTopicCoOccurrence(params?: Record<string, any>) {
  const { data } = await api.get("/papers/analytics/topic-network", { params });
  return data;
}

export async function fetchCitationTimeline(params?: Record<string, any>) {
  const { data } = await api.get("/papers/analytics/citation-timeline", { params });
  return data;
}

export async function fetchCategoryHeatmap(params?: Record<string, any>) {
  const { data } = await api.get("/papers/analytics/category-heatmap", { params });
  return data;
}

export async function fetchTopicCorrelation(params?: Record<string, any>) {
  const { data } = await api.get("/papers/analytics/topic-correlation", { params });
  return data;
}

export async function fetchInstitutionRanking(params?: Record<string, any>) {
  const { data } = await api.get("/papers/analytics/institutions", { params });
  return data;
}

export async function compareAuthors(authorNames: string[]) {
  const { data } = await api.post("/papers/analytics/author-comparison", {
    author_names: authorNames,
  });
  return data;
}

export async function fetchResearchLandscape(params?: Record<string, any>) {
  const { data } = await api.get("/papers/analytics/landscape", { params });
  return data;
}

export async function fetchRepos(params?: Record<string, any>) {
  const { data } = await api.get("/repos", { params });
  return data;
}

export async function fetchKnownTopics(): Promise<string[]> {
  const { data } = await api.get("/repos/topics");
  return data.topics;
}

export async function fetchRepoStats(params?: Record<string, any>) {
  const { data } = await api.get("/repos/stats", { params });
  return data;
}

export async function fetchRepo(id: string) {
  const { data } = await api.get(`/repos/${id}`);
  return data;
}

export async function triggerCollectRepos() {
  const { data } = await api.post("/repos/collect");
  return data;
}

export async function triggerUpdateAllRepos() {
  const { data } = await api.post("/repos/update-all");
  return data;
}

export async function search(q: string, type?: string) {
  const { data } = await api.get("/search", { params: { q, type } });
  return data;
}

export async function fetchTrendingPapers(params?: Record<string, any>) {
  const { data } = await api.get("/trending/papers", { params });
  return data;
}

export async function fetchTrendingRepos(params?: Record<string, any>) {
  const { data } = await api.get("/trending/repos", { params });
  return data;
}

export async function fetchTrendingFilters() {
  const { data } = await api.get("/trending/filters");
  return data;
}

export async function fetchTechRadar() {
  const { data } = await api.get("/trending/tech-radar");
  return data;
}

export async function triggerTechRadarGenerate() {
  const { data } = await api.post("/trending/tech-radar/generate");
  return data;
}

export async function fetchHFModels(params?: Record<string, any>) {
  const { data } = await api.get("/trending/hf-models", { params });
  return data;
}

export async function fetchHFPapers() {
  const { data } = await api.get("/trending/hf-papers");
  return data;
}

export async function fetchHFFilters() {
  const { data } = await api.get("/trending/hf-filters");
  return data;
}

export async function fetchHFModelDetail(modelId: string) {
  const { data } = await api.get(`/trending/hf-model-detail/${encodeURIComponent(modelId)}`);
  return data;
}

export async function fetchHFStats() {
  const { data } = await api.get("/trending/hf-stats");
  return data;
}

export async function triggerCollectHFModels() {
  const { data } = await api.post("/trending/hf-models/collect");
  return data;
}

export async function triggerCollectHFPapers() {
  const { data } = await api.post("/trending/hf-papers/collect");
  return data;
}

export async function sendChatMessage(question: string, filters?: any) {
  const { data } = await api.post("/chat", { question, filters });
  return data;
}

// ── Conversations API ──

export async function fetchConversations() {
  const { data } = await api.get("/chat/conversations");
  return data;
}

export async function createConversation(title?: string, mode: string = "global", contextMode: string = "rag") {
  const { data } = await api.post("/chat/conversations", { title, mode, context_mode: contextMode });
  return data;
}

export async function fetchConversation(id: string) {
  const { data } = await api.get(`/chat/conversations/${id}`);
  return data;
}

export async function deleteConversation(id: string) {
  await api.delete(`/chat/conversations/${id}`);
}

export async function sendConversationMessage(conversationId: string, question: string, filters?: any) {
  const { data } = await api.post(`/chat/conversations/${conversationId}/messages`, { question, filters });
  return data;
}

export async function fetchAlerts(params?: Record<string, any>) {
  const { data } = await api.get("/alerts", { params });
  return data;
}

export async function fetchWeeklyReport() {
  const { data } = await api.get("/reports/weekly");
  return data;
}

export async function fetchReportHistory(limit: number = 10) {
  const { data } = await api.get("/reports/history", { params: { limit } });
  return data;
}

export async function triggerReportGenerate() {
  const { data } = await api.post("/reports/generate");
  return data;
}

// ── Auth API ──

export async function loginUser(email: string, password: string) {
  const { data } = await api.post("/auth/login", { email, password });
  return data;
}

export async function registerUser(email: string, username: string, password: string) {
  const { data } = await api.post("/auth/register", { email, username, password });
  return data;
}

export async function refreshToken(refresh_token: string) {
  const { data } = await api.post("/auth/refresh", { refresh_token });
  return data;
}

export async function fetchMe() {
  const { data } = await api.get("/auth/me");
  return data;
}

// ── Folders API ──

export async function fetchFolders() {
  const { data } = await api.get("/folders");
  return data;
}

export async function createFolder(body: {
  name: string;
  parent_id?: string | null;
  icon?: string | null;
  position?: number;
}) {
  const { data } = await api.post("/folders", body);
  return data;
}

export async function updateFolder(
  id: string,
  body: { name?: string; parent_id?: string | null; icon?: string | null; position?: number }
) {
  const { data } = await api.patch(`/folders/${id}`, body);
  return data;
}

export async function deleteFolder(id: string) {
  await api.delete(`/folders/${id}`);
}

// ── Bookmarks API ──

export async function fetchBookmarks(folderId: string) {
  const { data } = await api.get(`/bookmarks/folder/${folderId}`);
  return data;
}

export async function createBookmark(body: {
  folder_id: string;
  item_type: string;
  item_id?: string | null;
  external_url?: string | null;
  external_title?: string | null;
  external_metadata?: Record<string, any> | null;
  note?: string | null;
}) {
  const { data } = await api.post("/bookmarks", body);
  return data;
}

export async function updateBookmark(
  id: string,
  body: { folder_id?: string; note?: string; reading_status?: string }
) {
  const { data } = await api.patch(`/bookmarks/${id}`, body);
  return data;
}

export async function deleteBookmark(id: string) {
  await api.delete(`/bookmarks/${id}`);
}

// ── Folder Contents API (Drive-like) ──

export async function fetchFolderContents(folderId: string) {
  const { data } = await api.get(`/folders/${folderId}/contents`);
  return data;
}

// ── Documents API ──

export async function uploadDocument(
  folderId: string,
  file: File,
  onProgress?: (percent: number) => void
) {
  const formData = new FormData();
  formData.append("file", file);
  const { data } = await api.post(`/documents/upload/${folderId}`, formData, {
    headers: { "Content-Type": "multipart/form-data" },
    onUploadProgress: (e) => {
      if (onProgress && e.total) {
        onProgress(Math.round((e.loaded * 100) / e.total));
      }
    },
  });
  return data;
}

export async function downloadDocument(id: string) {
  const response = await api.get(`/documents/${id}/download`, {
    responseType: "blob",
  });
  return response;
}

export async function updateDocument(
  id: string,
  body: { folder_id?: string; note?: string }
) {
  const { data } = await api.patch(`/documents/${id}`, body);
  return data;
}

export async function deleteDocument(id: string) {
  await api.delete(`/documents/${id}`);
}

export async function fetchDocumentContent(id: string) {
  const { data } = await api.get(`/documents/${id}/content`);
  return data;
}

export async function savePaperToFolder(paperId: string, folderId: string) {
  const { data } = await api.post("/documents/save-paper", {
    paper_id: paperId,
    folder_id: folderId,
  });
  return data;
}

// ── Document Chat API ──

export async function fetchDocumentLibrary() {
  const { data } = await api.get("/chat/documents/library");
  return data;
}

export async function embedDocuments(documentIds: string[], paperIds: string[] = []) {
  const { data } = await api.post("/chat/documents/embed", {
    document_ids: documentIds,
    paper_ids: paperIds,
  });
  return data;
}

export async function embedRepos(repoIds: string[]) {
  const { data } = await api.post("/chat/documents/embed-repo", {
    repo_ids: repoIds,
  });
  return data;
}

export async function fetchEmbedStatus(documentIds: string[]) {
  const { data } = await api.get("/chat/documents/embed-status", {
    params: { document_ids: documentIds.join(",") },
  });
  return data;
}

export async function updateContextMode(conversationId: string, contextMode: string) {
  const { data } = await api.patch(`/chat/conversations/${conversationId}/context-mode`, {
    context_mode: contextMode,
  });
  return data;
}

export async function setConversationDocuments(conversationId: string, documentIds: string[]) {
  const { data } = await api.put(`/chat/conversations/${conversationId}/documents`, {
    document_ids: documentIds,
  });
  return data;
}

export async function fetchConversationDocuments(conversationId: string) {
  const { data } = await api.get(`/chat/conversations/${conversationId}/documents`);
  return data;
}

// ── Community Posts API ──

export async function fetchCommunityPosts(params?: Record<string, any>) {
  const { data } = await api.get("/community/posts", { params });
  return data;
}

export async function fetchCommunityFilters() {
  const { data } = await api.get("/community/posts/filters");
  return data;
}

export async function fetchCommunityStats(params?: Record<string, any>) {
  const { data } = await api.get("/community/posts/stats", { params });
  return data;
}

export async function fetchCommunityKeywords(params?: Record<string, any>) {
  const { data } = await api.get("/community/posts/keywords", { params });
  return data;
}

export async function triggerCollectCommunity() {
  const { data } = await api.post("/community/posts/collect");
  return data;
}

// ── GitHub Discussions API ──

export async function fetchGithubDiscussions(params?: Record<string, any>) {
  const { data } = await api.get("/community/discussions", { params });
  return data;
}

export async function fetchDiscussionFilters() {
  const { data } = await api.get("/community/discussions/filters");
  return data;
}

export async function fetchDiscussionStats() {
  const { data } = await api.get("/community/discussions/stats");
  return data;
}

export async function triggerCollectDiscussions() {
  const { data } = await api.post("/community/discussions/collect");
  return data;
}

// ── OpenReview API ──

export async function fetchOpenReviewNotes(params?: Record<string, any>) {
  const { data } = await api.get("/community/openreview", { params });
  return data;
}

export async function fetchOpenReviewFilters() {
  const { data } = await api.get("/community/openreview/filters");
  return data;
}

export async function fetchOpenReviewStats() {
  const { data } = await api.get("/community/openreview/stats");
  return data;
}

export async function fetchOpenReviewKeywords(params?: Record<string, any>) {
  const { data } = await api.get("/community/openreview/keywords", { params });
  return data;
}

export async function triggerCollectOpenReview() {
  const { data } = await api.post("/community/openreview/collect");
  return data;
}

export default api;


// ── User Profile API ──

export async function updateUserProfile(body: Record<string, any>) {
  const { data } = await api.patch("/auth/me/profile", body);
  return data;
}

export async function getOnboardingMeta() {
  const { data } = await api.get("/auth/onboarding-meta");
  return data;
}

export async function completeOnboarding(body: Record<string, any>) {
  const { data } = await api.post("/auth/me/onboarding", body);
  return data;
}

// ── User Alerts API ──

export async function fetchUserAlerts(params?: Record<string, any>) {
  const { data } = await api.get("/me/alerts", { params });
  return data;
}

export async function createUserAlert(body: {
  alert_type: string;
  label: string;
  config: Record<string, any>;
  channel?: string;
  frequency?: string;
}) {
  const { data } = await api.post("/me/alerts", body);
  return data;
}

export async function updateUserAlert(id: string, body: Record<string, any>) {
  const { data } = await api.patch(`/me/alerts/${id}`, body);
  return data;
}

export async function deleteUserAlert(id: string) {
  await api.delete(`/me/alerts/${id}`);
}

export async function toggleAllUserAlerts(is_active: boolean) {
  const { data } = await api.patch("/me/alerts", null, { params: { is_active } });
  return data;
}


// ── Personal Feed API ──

export async function fetchMyFeed(params?: Record<string, any>) {
  const { data } = await api.get("/me/feed", { params });
  return data;
}

export async function markFeedItems(item_ids: string[], action: "read" | "dismiss" | "unread") {
  await api.post("/me/feed/mark", { item_ids, action });
}

export async function markAllFeedRead() {
  await api.post("/me/feed/mark-all-read");
}

// ── Personal Digest API ──

export async function fetchLatestDigest() {
  const { data } = await api.get("/me/digest/latest");
  return data;
}

export async function fetchDigestHistory(limit = 10) {
  const { data } = await api.get("/me/digest/history", { params: { limit } });
  return data;
}

export async function triggerDigestGeneration() {
  const { data } = await api.post("/me/digest/generate");
  return data;
}

// ── Saved Searches API ──

export async function fetchSavedSearches() {
  const { data } = await api.get("/me/saved-searches");
  return data;
}

export async function createSavedSearch(body: {
  name: string;
  query: string;
  search_type?: string;
  filters?: Record<string, any> | null;
  notify_new_results?: boolean;
  frequency?: string;
}) {
  const { data } = await api.post("/me/saved-searches", body);
  return data;
}

export async function updateSavedSearch(id: string, body: Record<string, any>) {
  const { data } = await api.patch(`/me/saved-searches/${id}`, body);
  return data;
}

export async function deleteSavedSearch(id: string) {
  await api.delete(`/me/saved-searches/${id}`);
}

export async function runSavedSearch(id: string) {
  const { data } = await api.post(`/me/saved-searches/${id}/run`);
  return data;
}

export async function markSavedSearchViewed(id: string) {
  await api.post(`/me/saved-searches/${id}/viewed`);
}

// ── Paper Notes API (Phase 3) ──

export async function fetchPaperNotes(itemId: string, isPaper = true) {
  const params = isPaper ? { paper_id: itemId } : { item_id: itemId };
  const { data } = await api.get("/me/notes", { params });
  return data;
}

export async function createPaperNote(body: { paper_id?: string; item_id?: string; content: string; is_pinned?: boolean; tags?: string[] }) {
  const { data } = await api.post("/me/notes", body);
  return data;
}

export async function updatePaperNote(noteId: string, body: { content?: string; is_pinned?: boolean; tags?: string[] }) {
  const { data } = await api.patch(`/me/notes/${noteId}`, body);
  return data;
}

export async function deletePaperNote(noteId: string) {
  await api.delete(`/me/notes/${noteId}`);
}

// ── Similar Papers + BibTeX (Phase 3) ──

export async function fetchSimilarPapers(paperId: string, limit = 6) {
  const { data } = await api.get(`/papers/${paperId}/similar`, { params: { limit } });
  return data;
}

export function getBibTexUrl(paperId: string): string {
  const base = (api.defaults.baseURL || "").replace(/\/$/, "");
  return `${base}/papers/${paperId}/export/bibtex`;
}

export async function fetchSimilarRepos(repoId: string, limit = 6) {
  const { data } = await api.get(`/repos/${repoId}/similar`, { params: { limit } });
  return data;
}

// ── Notifications (P0 fix) ──

export interface Notification {
  id: string;
  notification_type: string;
  severity: "info" | "success" | "warning" | "critical";
  title: string;
  body: string | null;
  link: string | null;
  data: Record<string, any> | null;
  is_read: boolean;
  read_at: string | null;
  delivered_in_app: boolean;
  delivered_email: boolean;
  delivered_webhook: boolean;
  created_at: string;
}

export async function fetchNotifications(params?: {
  skip?: number;
  limit?: number;
  unread_only?: boolean;
  notification_type?: string;
}) {
  const { data } = await api.get("/me/notifications", { params });
  return data as { unread_count: number; total_count: number; items: Notification[] };
}

export async function fetchUnreadCount() {
  const { data } = await api.get("/me/notifications/unread-count");
  return data as { unread_count: number };
}

export async function markNotifications(
  notification_ids: string[],
  action: "read" | "unread" | "delete",
) {
  await api.post("/me/notifications/mark", { notification_ids, action });
}

export async function markAllNotificationsRead() {
  await api.post("/me/notifications/mark-all-read");
}

export async function clearReadNotifications() {
  await api.delete("/me/notifications/clear-read");
}

export async function getNotificationPreferences() {
  const { data } = await api.get("/me/notifications/preferences");
  return data;
}

export async function updateNotificationPreferences(prefs: Record<string, any>) {
  const { data } = await api.put("/me/notifications/preferences", prefs);
  return data;
}

export async function sendTestNotification() {
  const { data } = await api.post("/me/notifications/test");
  return data;
}

// ── Intelligence (buzz, concepts, KG, comparison) ──

export async function fetchBuzzPapers(params?: {
  period?: "day" | "week" | "month";
  sort?: "buzz_score" | "buzz_velocity";
  limit?: number;
}) {
  const { data } = await api.get("/intelligence/buzz", { params });
  return data;
}

export async function fetchPaperSignals(paperId: string) {
  const { data } = await api.get(`/intelligence/papers/${paperId}/signals`);
  return data;
}

export async function fetchTrendingConcepts(params?: {
  status?: "hot" | "rising" | "stable" | "declining" | "stale";
  limit?: number;
}) {
  const { data } = await api.get("/intelligence/concepts/trending", { params });
  return data;
}

export async function fetchConceptTimeline(concept: string) {
  const { data } = await api.get(
    `/intelligence/concepts/${encodeURIComponent(concept)}/timeline`,
  );
  return data;
}

export async function compareAuthorsByIds(a: string, b: string) {
  const { data } = await api.get("/intelligence/compare/authors", { params: { a, b } });
  return data;
}

export async function compareConcepts(a: string, b: string) {
  const { data } = await api.get("/intelligence/compare/concepts", { params: { a, b } });
  return data;
}

export async function fetchKnowledgeGraph(params?: {
  seed_paper_id?: string;
  seed_concept?: string;
  max_nodes?: number;
}) {
  const { data } = await api.get("/intelligence/knowledge-graph", { params });
  return data;
}

export async function fetchAffiliationDistribution(limit = 50) {
  const { data } = await api.get("/intelligence/geographic/affiliations", { params: { limit } });
  return data;
}

// ── Authors ──

export async function fetchAuthorsList(params?: {
  search?: string;
  sort?: "paper_count" | "citation_count" | "h_index";
  skip?: number;
  limit?: number;
}) {
  const { data } = await api.get("/authors", { params });
  return data;
}

export async function fetchAuthor(authorId: string) {
  const { data } = await api.get(`/authors/${authorId}`);
  return data;
}

export async function fetchCoauthors(authorId: string, limit = 20) {
  const { data } = await api.get(`/authors/${authorId}/coauthors`, { params: { limit } });
  return data;
}

export async function fetchAuthorNetwork(authorId: string, depth = 1) {
  const { data } = await api.get(`/authors/${authorId}/network`, { params: { depth } });
  return data;
}

// ── Research Assistant (AI features) ──

export async function fetchReadingQueue(limit = 20) {
  const { data } = await api.get("/me/assistant/reading-queue", { params: { limit } });
  return data;
}

export async function fetchLiteratureGaps() {
  const { data } = await api.get("/me/assistant/literature-gaps");
  return data;
}

export async function generateLiteratureReview(folderId: string) {
  const { data } = await api.post(`/me/assistant/literature-review`, null, {
    params: { folder_id: folderId },
  });
  return data;
}

export async function checkPaperCOI(paperId: string) {
  const { data } = await api.get(`/me/assistant/coi-check/paper/${paperId}`);
  return data;
}
