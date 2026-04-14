import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import {
  Search, Archive, Trash2, MailOpen, Mail as MailIcon, ArrowLeft,
  Paperclip, FileText, Image, File, Download, ExternalLink,
  Sparkles, Loader2, RefreshCw, Eye, X, Send, Bot
} from "lucide-react";
import { toast } from "sonner";
import { translations, type Language } from "../../translations";
import type { AccountSummary } from "../../types";
import * as authService from "../../services/auth";
import * as gmail from "../../services/gmail";
import * as gemini from "../../services/gemini";
import { base64ToBlob } from "../../services/apiHelpers";

// ── Helpers ──

function getHeader(payload: any, name: string): string {
  return payload?.headers?.find((h: any) => h.name.toLowerCase() === name.toLowerCase())?.value || "";
}

function decodeEmailBody(payload: any): { html: string; text: string } {
  if (!payload) return { html: "", text: "" };
  let bodyText = "", bodyHtml = "";
  const decode = (str: string) => {
    try {
      let b64 = str.replace(/-/g, "+").replace(/_/g, "/");
      while (b64.length % 4) b64 += "=";
      const decoded = atob(b64);
      const bytes = new Uint8Array(decoded.length);
      for (let i = 0; i < decoded.length; i++) bytes[i] = decoded.charCodeAt(i);
      return new TextDecoder("utf-8").decode(bytes);
    } catch { return ""; }
  };
  const getBody = (part: any) => {
    if (part.body?.data) {
      const d = decode(part.body.data);
      if (part.mimeType === "text/html") bodyHtml = d;
      else if (part.mimeType === "text/plain") bodyText = d;
    }
    if (part.parts) part.parts.forEach(getBody);
  };
  getBody(payload);
  return { html: bodyHtml, text: bodyText };
}

function sanitizeHtml(html: string): string {
  // Use DOMParser for robust sanitization instead of fragile regex
  const doc = new DOMParser().parseFromString(html, "text/html");
  const dangerousTags = [
    "script", "style", "iframe", "object", "embed", "form", "base",
    "meta", "link", "svg", "math", "noscript", "template", "applet",
  ];
  dangerousTags.forEach(tag => doc.querySelectorAll(tag).forEach(el => el.remove()));
  doc.querySelectorAll("*").forEach(el => {
    Array.from(el.attributes).forEach(attr => {
      const name = attr.name.toLowerCase();
      const value = attr.value.toLowerCase().trim();
      if (name.startsWith("on")) { el.removeAttribute(attr.name); return; }
      if (["href", "src", "action", "formaction", "xlink:href"].includes(name) &&
          (/^(javascript|vbscript|data\s*:)/i.test(value))) {
        el.removeAttribute(attr.name);
      }
      if (name === "style" && /expression\s*\(|url\s*\(|@import|-moz-binding/i.test(value)) {
        el.removeAttribute(attr.name);
      }
    });
  });
  return doc.body.innerHTML;
}

function getAttachments(payload: any): any[] {
  const attachments: any[] = [];
  const walk = (part: any) => {
    if (part.filename && part.body?.attachmentId) {
      attachments.push(part);
    }
    if (part.parts) part.parts.forEach(walk);
  };
  if (payload) walk(payload);
  return attachments;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / 1048576).toFixed(1) + " MB";
}

function formatDate(dateStr: string, lang: Language): string {
  try {
    const d = new Date(dateStr);
    const now = new Date();
    const isToday = d.toDateString() === now.toDateString();
    if (isToday) return d.toLocaleTimeString(lang === "zh" ? "zh-CN" : "en-US", { hour: "2-digit", minute: "2-digit" });
    return d.toLocaleDateString(lang === "zh" ? "zh-CN" : "en-US", { month: "short", day: "numeric" });
  } catch { return dateStr; }
}

function getFileIcon(mimeType: string) {
  if (mimeType?.startsWith("image/")) return Image;
  if (mimeType?.includes("pdf")) return FileText;
  return File;
}

// ── Component ──

interface MailViewProps {
  emails: any[];
  loading: boolean;
  isDemo: boolean;
  lang: Language;
  hasMore: boolean;
  geminiApiKey: string;
  aiModel: string;
  signature: string;
  sendFromAccount: string;
  accounts: AccountSummary[];
  initialEmailId?: string | null;
  onSearch: (q: string) => void;
  onArchive: (id: string, account: string) => void;
  onTrash: (id: string, account: string) => void;
  onToggleRead: (id: string, account: string, isUnread: boolean) => void;
  onReply: (email: any) => void;
  onLoadMore: () => void;
  onRefresh: () => void;
}

export default function MailView({
  emails, loading, isDemo, lang, hasMore,
  geminiApiKey, aiModel, signature, sendFromAccount, accounts,
  initialEmailId,
  onSearch, onArchive, onTrash, onToggleRead, onReply, onLoadMore, onRefresh,
}: MailViewProps) {
  const t = translations[lang];

  const [selectedEmail, setSelectedEmail] = useState<any>(null);
  const [searchInput, setSearchInput] = useState("");
  const [aiInsight, setAiInsight] = useState<{ summary: string; action: string } | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [lightbox, setLightbox] = useState<{ src: string; type: string } | null>(null);
  const [attachAnalysis, setAttachAnalysis] = useState<Record<string, { loading: boolean; result: any }>>({});
  const listRef = useRef<HTMLDivElement>(null);

  // Auto-select email when navigated from AI chat
  useEffect(() => {
    if (initialEmailId) {
      const email = emails.find(e => e.id === initialEmailId);
      if (email) setSelectedEmail(email);
    }
  }, [initialEmailId, emails]);

  // Keyboard navigation
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      const idx = emails.findIndex(em => em.id === selectedEmail?.id);
      if (e.key === "j" && idx < emails.length - 1) {
        setSelectedEmail(emails[idx + 1]);
      } else if (e.key === "k" && idx > 0) {
        setSelectedEmail(emails[idx - 1]);
      } else if (e.key === "Escape") {
        setSelectedEmail(null);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [emails, selectedEmail]);

  // AI Insight on email select
  useEffect(() => {
    setAiInsight(null);
  }, [selectedEmail?.id]);

  const handleAnalyze = useCallback(async () => {
    if (!geminiApiKey) { toast.error(t.noApiKey); return; }
    if (!selectedEmail) return;
    setAiLoading(true);
    try {
      const result = await gemini.processItem(geminiApiKey, {
        item: {
          from: getHeader(selectedEmail.payload, "From"),
          subject: getHeader(selectedEmail.payload, "Subject"),
          snippet: selectedEmail.snippet,
        },
        type: "email",
        lang,
        model: aiModel,
      });
      setAiInsight(result);
    } catch {
      toast.error(t.aiError);
    } finally {
      setAiLoading(false);
    }
  }, [geminiApiKey, selectedEmail, lang, aiModel, t]);

  // Download attachment
  const handleDownload = useCallback(async (att: any) => {
    if (isDemo) { toast.info(t.demoDownload); return; }
    if (!selectedEmail?.accountEmail) return;
    try {
      const blob = await authService.withFreshToken(selectedEmail.accountEmail, token =>
        gmail.downloadAttachment(token, selectedEmail.id, att.body.attachmentId, att.mimeType)
      );
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = att.filename;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      toast.error(t.downloadFailed);
    }
  }, [isDemo, selectedEmail, t]);

  // Preview attachment
  const handlePreview = useCallback(async (att: any) => {
    if (isDemo) { toast.info(t.demoDownload); return; }
    if (!selectedEmail?.accountEmail) return;
    try {
      const blob = await authService.withFreshToken(selectedEmail.accountEmail, token =>
        gmail.downloadAttachment(token, selectedEmail.id, att.body.attachmentId, att.mimeType)
      );
      const url = URL.createObjectURL(blob);
      setLightbox(prev => {
        if (prev) URL.revokeObjectURL(prev.src);
        return { src: url, type: att.mimeType.startsWith("image/") ? "image" : "pdf" };
      });
    } catch {
      toast.error(t.downloadFailed);
    }
  }, [isDemo, selectedEmail, t]);

  // Analyze attachment with AI
  const handleAttachmentAnalysis = useCallback(async (att: any, analysisType: string) => {
    if (!geminiApiKey) { toast.error(t.noApiKey); return; }
    if (isDemo || !selectedEmail?.accountEmail) return;
    const key = `${att.body.attachmentId}-${analysisType}`;
    setAttachAnalysis(prev => ({ ...prev, [key]: { loading: true, result: null } }));
    try {
      const attData = await authService.withFreshToken(selectedEmail.accountEmail, token =>
        gmail.getAttachment(token, selectedEmail.id, att.body.attachmentId)
      );
      const result = await gemini.analyzeAttachment(geminiApiKey, {
        base64data: attData.data,
        mimeType: att.mimeType,
        analysisType,
        lang,
        model: aiModel,
      });
      setAttachAnalysis(prev => ({ ...prev, [key]: { loading: false, result: result.analysis } }));
    } catch {
      setAttachAnalysis(prev => ({ ...prev, [key]: { loading: false, result: null } }));
      toast.error(t.aiError);
    }
  }, [geminiApiKey, isDemo, selectedEmail, lang, aiModel, t]);

  // Cleanup lightbox URL on unmount
  useEffect(() => {
    return () => {
      if (lightbox) URL.revokeObjectURL(lightbox.src);
    };
  }, []);

  // Sync selectedEmail with refreshed emails array
  useEffect(() => {
    if (selectedEmail) {
      const updated = emails.find(e => e.id === selectedEmail.id);
      if (updated && updated !== selectedEmail) setSelectedEmail(updated);
      else if (!updated) setSelectedEmail(null);
    }
  }, [emails]);

  // Infinite scroll (guard with loading to prevent duplicate calls)
  useEffect(() => {
    if (!hasMore || loading || !listRef.current) return;
    const observer = new IntersectionObserver(entries => {
      if (entries[0]?.isIntersecting) onLoadMore();
    }, { root: listRef.current, threshold: 0.1 });
    const sentinel = listRef.current.querySelector("[data-sentinel]");
    if (sentinel) observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasMore, loading, onLoadMore, emails.length]);

  // Mobile: show detail or list
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  useEffect(() => {
    const h = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener("resize", h);
    return () => window.removeEventListener("resize", h);
  }, []);

  const showDetail = isMobile && selectedEmail;
  const showList = !isMobile || !selectedEmail;

  const emailBody = useMemo(() => selectedEmail ? decodeEmailBody(selectedEmail.payload) : null, [selectedEmail]);
  const attachments = useMemo(() => selectedEmail ? getAttachments(selectedEmail.payload) : [], [selectedEmail]);

  return (
    <div className="h-full flex">
      {/* ── Email List ── */}
      {showList && (
        <div className={`${isMobile ? "w-full" : "w-[380px] lg:w-[420px]"} flex flex-col border-r border-[var(--border-light)] flex-shrink-0`}>
          {/* Search bar */}
          <div className="px-3 py-2 border-b border-[var(--border-light)]">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-[var(--text-placeholder)]" />
              <input
                type="text"
                value={searchInput}
                onChange={e => setSearchInput(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") onSearch(searchInput); }}
                placeholder={t.searchPlaceholder.replace("{tab}", t.mail)}
                className={`w-full ${isMobile ? "h-10" : "h-9"} pl-9 pr-3 text-sm bg-[var(--bg-alt)] border-none rounded-[4px] text-[var(--text-body)] placeholder:text-[var(--text-placeholder)] focus:outline-none focus:ring-2 focus:ring-[var(--blue)] t-transition`}
              />
            </div>
          </div>

          {/* Email list */}
          <div ref={listRef} className="flex-1 overflow-y-auto">
            {loading && emails.length === 0 ? (
              <div className="p-4 space-y-3">
                {Array.from({ length: 8 }).map((_, i) => (
                  <div key={i} className="animate-pulse space-y-2">
                    <div className="h-3 bg-[var(--bg-alt)] rounded w-1/3" />
                    <div className="h-3 bg-[var(--bg-alt)] rounded w-2/3" />
                    <div className="h-3 bg-[var(--bg-alt)] rounded w-1/2" />
                  </div>
                ))}
              </div>
            ) : emails.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-[var(--text-placeholder)] text-sm">
                <MailIcon className="size-8 mb-2 opacity-30" />
                {t.noItemsFound}
              </div>
            ) : (
              <>
                {emails.map(email => {
                  const from = getHeader(email.payload, "From");
                  const subject = getHeader(email.payload, "Subject");
                  const date = getHeader(email.payload, "Date");
                  const isUnread = email.labelIds?.includes("UNREAD");
                  const isSelected = selectedEmail?.id === email.id;
                  const senderName = from.includes("<") ? from.split("<")[0].trim().replace(/"/g, "") : from;

                  return (
                    <button
                      key={email.id}
                      onClick={() => setSelectedEmail(email)}
                      className={`w-full text-left px-3 sm:px-4 py-2.5 sm:py-3 border-b border-[var(--border-light)] t-transition active:bg-[var(--bg-active)] ${
                        isSelected
                          ? "bg-[var(--blue-light)]"
                          : "hover:bg-[var(--bg-hover)]"
                      }`}
                    >
                      <div className="flex items-start gap-2">
                        {/* Account color dot + unread indicator */}
                        <div className="flex flex-col items-center gap-1 mt-1.5 flex-shrink-0">
                          {email.accountColor && (
                            <div
                              className="w-2 h-2 rounded-full"
                              style={{ backgroundColor: email.accountColor }}
                            />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2">
                            <span className={`text-[13px] sm:text-sm truncate ${isUnread ? "font-semibold text-[var(--text-primary)]" : "text-[var(--text-body)]"}`}>
                              {senderName}
                            </span>
                            <span className="text-[11px] text-[var(--text-placeholder)] flex-shrink-0">
                              {formatDate(date, lang)}
                            </span>
                          </div>
                          <p className={`text-[13px] sm:text-sm truncate mt-0.5 ${isUnread ? "font-medium text-[var(--text-primary)]" : "text-[var(--text-body)]"}`}>
                            {subject}
                          </p>
                          <p className="text-xs text-[var(--text-tertiary)] truncate mt-0.5">
                            {email.snippet}
                          </p>
                        </div>
                      </div>
                    </button>
                  );
                })}
                {/* Sentinel for infinite scroll */}
                {hasMore && <div data-sentinel className="h-10 flex items-center justify-center">
                  <Loader2 className="size-4 animate-spin text-[var(--text-placeholder)]" />
                </div>}
              </>
            )}
          </div>
        </div>
      )}

      {/* ── Email Detail ── */}
      {(selectedEmail && (!isMobile || showDetail)) ? (
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Detail header */}
          <div className="flex items-center gap-1.5 px-3 sm:px-4 py-2 border-b border-[var(--border-light)] flex-shrink-0">
            {isMobile && (
              <button
                onClick={() => setSelectedEmail(null)}
                className="size-10 flex items-center justify-center text-[var(--text-tertiary)] active:bg-[var(--bg-alt)] rounded-[4px] t-transition -ml-1"
              >
                <ArrowLeft className="size-5" />
              </button>
            )}
            <div className="flex-1" />

            {/* Actions */}
            <button onClick={() => { onArchive(selectedEmail.id, selectedEmail.accountEmail); setSelectedEmail(null); }}
              className={`${isMobile ? "size-10" : "size-8"} flex items-center justify-center text-[var(--text-tertiary)] hover:text-[var(--text-primary)] active:bg-[var(--bg-alt)] hover:bg-[var(--bg-alt)] rounded-[4px] t-transition`}
              title={t.archive}>
              <Archive className={isMobile ? "size-[18px]" : "size-4"} />
            </button>
            <button onClick={() => { onTrash(selectedEmail.id, selectedEmail.accountEmail); setSelectedEmail(null); }}
              className={`${isMobile ? "size-10" : "size-8"} flex items-center justify-center text-[var(--text-tertiary)] hover:text-[var(--text-primary)] active:bg-[var(--bg-alt)] hover:bg-[var(--bg-alt)] rounded-[4px] t-transition`}
              title={t.trash}>
              <Trash2 className={isMobile ? "size-[18px]" : "size-4"} />
            </button>
            <button onClick={() => onToggleRead(selectedEmail.id, selectedEmail.accountEmail, selectedEmail.labelIds?.includes("UNREAD"))}
              className={`${isMobile ? "size-10" : "size-8"} flex items-center justify-center text-[var(--text-tertiary)] hover:text-[var(--text-primary)] active:bg-[var(--bg-alt)] hover:bg-[var(--bg-alt)] rounded-[4px] t-transition`}
              title={selectedEmail.labelIds?.includes("UNREAD") ? t.markRead : t.markUnread}>
              {selectedEmail.labelIds?.includes("UNREAD") ? <MailOpen className={isMobile ? "size-[18px]" : "size-4"} /> : <MailIcon className={isMobile ? "size-[18px]" : "size-4"} />}
            </button>
            <button onClick={() => onReply(selectedEmail)}
              className={`flex items-center gap-1.5 ${isMobile ? "size-10 justify-center" : "px-3 py-1.5"} text-sm font-medium text-white bg-[var(--blue)] hover:bg-[var(--blue-hover)] rounded-[4px] t-btn-transition`}
            >
              <Send className={isMobile ? "size-[18px]" : "size-3.5"} />
              {!isMobile && t.reply}
            </button>
          </div>

          {/* Detail content */}
          <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-4 sm:py-5">
            {/* Subject */}
            <h1 className="text-xl font-medium text-[var(--text-primary)] mb-4">
              {getHeader(selectedEmail.payload, "Subject")}
            </h1>

            {/* From / Date */}
            <div className="mb-6">
              <div className="flex items-center gap-3">
                {selectedEmail.accountColor && (
                  <div className="w-9 h-9 sm:w-8 sm:h-8 rounded-full flex items-center justify-center text-white text-xs font-medium flex-shrink-0"
                    style={{ backgroundColor: selectedEmail.accountColor }}>
                    {getHeader(selectedEmail.payload, "From").charAt(0).toUpperCase()}
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-[var(--text-primary)] truncate">
                    {getHeader(selectedEmail.payload, "From")}
                  </p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <p className="text-xs text-[var(--text-tertiary)] truncate">
                      {getHeader(selectedEmail.payload, "Date")}
                    </p>
                    <a
                      href={`https://mail.google.com/mail/u/0/#inbox/${selectedEmail.id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 text-xs text-[var(--text-tertiary)] hover:text-[var(--blue)] t-transition flex-shrink-0"
                    >
                      <ExternalLink className="size-3" />
                      <span className="hidden sm:inline">{t.viewInGmail}</span>
                      <span className="sm:hidden">Gmail</span>
                    </a>
                  </div>
                </div>
              </div>
            </div>

            {/* Body */}
            <div className="mb-6">
              {emailBody?.html ? (
                <div
                  className="email-html-content"
                  dangerouslySetInnerHTML={{ __html: sanitizeHtml(emailBody.html) }}
                />
              ) : (
                <pre className="text-sm text-[var(--text-body)] whitespace-pre-wrap font-sans">
                  {emailBody?.text || selectedEmail.snippet}
                </pre>
              )}
            </div>

            {/* Attachments */}
            {attachments.length > 0 && (
              <div className="mb-6">
                <p className="text-xs font-medium text-[var(--text-tertiary)] mb-2 uppercase tracking-wide">
                  {attachments.length} {t.attachments}
                </p>
                <div className="space-y-2">
                  {attachments.map((att, i) => {
                    const Icon = getFileIcon(att.mimeType);
                    const canPreview = att.mimeType?.startsWith("image/") || att.mimeType?.includes("pdf");
                    return (
                      <div key={i} className="bg-[var(--bg-alt)] rounded-[4px]">
                        <div className="flex items-center gap-3 p-3">
                          <Icon className="size-5 text-[var(--text-tertiary)] flex-shrink-0" />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm text-[var(--text-primary)] truncate">{att.filename}</p>
                            <p className="text-xs text-[var(--text-placeholder)]">{formatFileSize(att.body?.size || 0)}</p>
                          </div>
                          <div className="flex items-center gap-1">
                            {canPreview && (
                              <button onClick={() => handlePreview(att)}
                                className="size-7 flex items-center justify-center text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] rounded-[4px] t-transition"
                                title={t.preview}>
                                <Eye className="size-3.5" />
                              </button>
                            )}
                            <button onClick={() => handleDownload(att)}
                              className="size-7 flex items-center justify-center text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] rounded-[4px] t-transition"
                              title="Download">
                              <Download className="size-3.5" />
                            </button>
                            {/* AI Analysis buttons */}
                            {geminiApiKey && (
                              <button onClick={() => handleAttachmentAnalysis(att, "summary")}
                                className="size-7 flex items-center justify-center text-[var(--text-tertiary)] hover:text-[var(--blue)] hover:bg-[var(--blue-light)] rounded-[4px] t-transition"
                                title={t.documentSummary}>
                                {attachAnalysis[`${att.body.attachmentId}-summary`]?.loading
                                  ? <Loader2 className="size-3.5 animate-spin" />
                                  : <Sparkles className="size-3.5" />}
                              </button>
                            )}
                          </div>
                        </div>
                        {/* Analysis result — below the attachment row */}
                        {attachAnalysis[`${att.body.attachmentId}-summary`]?.result && (
                          <div className="px-3 pb-3">
                            <div className="p-3 bg-[var(--bg)] border border-[var(--border-light)] rounded-[4px] text-sm text-[var(--text-body)]">
                              {typeof attachAnalysis[`${att.body.attachmentId}-summary`].result === "string"
                                ? attachAnalysis[`${att.body.attachmentId}-summary`].result
                                : JSON.stringify(attachAnalysis[`${att.body.attachmentId}-summary`].result, null, 2)}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* AI Insights */}
            <div className="border-t border-[var(--border-light)] pt-5">
              {aiInsight ? (
                <div className="space-y-3 animate-fade-in">
                  <div className="flex items-center gap-2 mb-2">
                    <Bot className="size-4 text-[var(--blue)]" />
                    <span className="text-xs font-medium text-[var(--blue)] uppercase tracking-wide">{t.aiAssistant}</span>
                  </div>
                  <div>
                    <p className="text-xs font-medium text-[var(--text-tertiary)] mb-1">{t.summary}</p>
                    <p className="text-sm text-[var(--text-body)]">{aiInsight.summary}</p>
                  </div>
                  {aiInsight.action && (
                    <div>
                      <p className="text-xs font-medium text-[var(--text-tertiary)] mb-1">{t.action}</p>
                      <p className="text-sm text-[var(--text-body)]">{aiInsight.action}</p>
                    </div>
                  )}
                </div>
              ) : (
                <button
                  onClick={handleAnalyze}
                  disabled={aiLoading}
                  className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-[var(--blue)] bg-[var(--blue-light)] hover:bg-[var(--blue-border)] rounded-[4px] t-btn-transition disabled:opacity-50"
                >
                  {aiLoading ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
                  {aiLoading ? t.analyzing : t.aiAnalyze}
                </button>
              )}
            </div>
          </div>
        </div>
      ) : !isMobile ? (
        /* Empty state for desktop */
        <div className="flex-1 flex items-center justify-center text-[var(--text-placeholder)]">
          <div className="text-center space-y-2">
            <MailIcon className="size-10 mx-auto opacity-20" />
            <p className="text-sm">{t.selectItem}</p>
            <p className="text-xs">{t.browseHint}</p>
          </div>
        </div>
      ) : null}

      {/* Lightbox */}
      {lightbox && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4" onClick={() => { URL.revokeObjectURL(lightbox.src); setLightbox(null); }}>
          <button className="absolute top-4 right-4 size-10 flex items-center justify-center bg-white/10 hover:bg-white/20 rounded-full text-white t-transition" onClick={e => { e.stopPropagation(); URL.revokeObjectURL(lightbox.src); setLightbox(null); }}>
            <X className="size-5" />
          </button>
          {lightbox.type === "image" ? (
            <img src={lightbox.src} alt="" className="max-w-full max-h-full object-contain rounded-[4px]" onClick={e => e.stopPropagation()} />
          ) : (
            <iframe src={lightbox.src} sandbox="allow-same-origin" className="w-full max-w-4xl h-[80vh] bg-white rounded-[4px]" onClick={e => e.stopPropagation()} />
          )}
        </div>
      )}
    </div>
  );
}
