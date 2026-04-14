import { useState, useCallback, useRef, useEffect } from "react";
import { X, Paperclip, Sparkles, Loader2, Send, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { translations, type Language } from "../../translations";
import type { AccountSummary } from "../../types";
import * as gemini from "../../services/gemini";
import { arrayBufferToBase64 } from "../../services/apiHelpers";

function getHeader(payload: any, name: string): string {
  return payload?.headers?.find((h: any) => h.name.toLowerCase() === name.toLowerCase())?.value || "";
}

interface ComposeModalProps {
  lang: Language;
  isDemo: boolean;
  replyTo: any | null;
  accounts: AccountSummary[];
  sendFromAccount: string;
  onSendFromChange: (email: string) => void;
  signature: string;
  geminiApiKey: string;
  aiModel: string;
  onSend: (params: {
    to: string; cc?: string; bcc?: string; subject: string; body: string;
    threadId?: string; messageId?: string;
    attachments?: Array<{ filename: string; mimeType: string; data: string }>;
  }) => Promise<void>;
  onClose: () => void;
}

export default function ComposeModal({
  lang, isDemo, replyTo, accounts, sendFromAccount, onSendFromChange,
  signature, geminiApiKey, aiModel, onSend, onClose,
}: ComposeModalProps) {
  const t = translations[lang];

  const isReply = !!replyTo;
  const replyFrom = replyTo ? getHeader(replyTo.payload, "From") : "";
  const replySubject = replyTo ? getHeader(replyTo.payload, "Subject") : "";
  const replyMessageId = replyTo ? getHeader(replyTo.payload, "Message-ID") : "";

  const [to, setTo] = useState(isReply ? (replyFrom.match(/<(.+)>/)?.[1] || replyFrom) : "");
  const [cc, setCc] = useState("");
  const [bcc, setBcc] = useState("");
  const [subject, setSubject] = useState(isReply ? (replySubject.startsWith("Re:") ? replySubject : `Re: ${replySubject}`) : "");
  const [body, setBody] = useState("");
  const [showCcBcc, setShowCcBcc] = useState(false);
  const [attachments, setAttachments] = useState<File[]>([]);
  const [sending, setSending] = useState(false);

  // AI Draft
  const [draftPrompt, setDraftPrompt] = useState("");
  const [showDraftInput, setShowDraftInput] = useState(false);
  const [drafting, setDrafting] = useState(false);

  const attachmentsRef = useRef(attachments);
  attachmentsRef.current = attachments;

  const handleAddAttachment = useCallback(() => {
    const input = document.createElement("input");
    input.type = "file";
    input.multiple = true;
    input.onchange = () => {
      if (!input.files) return;
      const newFiles = Array.from(input.files);
      // Use ref for accurate size check (avoids stale closure)
      const total = [...attachmentsRef.current, ...newFiles].reduce((sum, f) => sum + f.size, 0);
      if (total > 25 * 1024 * 1024) {
        toast.error(t.totalSizeLimit);
        return;
      }
      for (const f of newFiles) {
        if (f.size > 25 * 1024 * 1024) {
          toast.error(t.fileTooLarge);
          return;
        }
      }
      setAttachments(prev => [...prev, ...newFiles]);
      input.onchange = null; // Clean up to allow GC
    };
    input.click();
  }, [t]);

  const handleSend = useCallback(async () => {
    if (!to.trim()) return;
    setSending(true);
    try {
      // Prepare attachments as base64
      let attData: Array<{ filename: string; mimeType: string; data: string }> | undefined;
      if (attachments.length > 0) {
        attData = await Promise.all(
          attachments.map(async f => ({
            filename: f.name,
            mimeType: f.type || "application/octet-stream",
            data: arrayBufferToBase64(await f.arrayBuffer()),
          }))
        );
      }

      const fullBody = signature ? `${body}\n\n${signature}` : body;

      await onSend({
        to: to.trim(),
        cc: cc.trim() || undefined,
        bcc: bcc.trim() || undefined,
        subject,
        body: fullBody,
        threadId: replyTo?.threadId,
        messageId: replyMessageId || undefined,
        attachments: attData,
      });
    } catch (e: any) {
      toast.error(t.actionFailed);
    } finally {
      setSending(false);
    }
  }, [to, cc, bcc, subject, body, signature, attachments, replyTo, replyMessageId, onSend, t]);

  const handleAiDraft = useCallback(async () => {
    if (!geminiApiKey) { toast.error(t.noApiKey); return; }
    setDrafting(true);
    try {
      const context = isReply
        ? `Original email from: ${replyFrom}\nSubject: ${replySubject}\nSnippet: ${replyTo?.snippet || ""}`
        : undefined;

      const result = await gemini.generateDraft(geminiApiKey, {
        prompt: draftPrompt || (isReply ? "" : "Write a professional email"),
        context,
        lang,
        model: aiModel,
        isReply,
        currentDraft: body || undefined,
      });

      setBody(result.draft);
      setShowDraftInput(false);
      setDraftPrompt("");
    } catch {
      toast.error(t.aiDraftFailed);
    } finally {
      setDrafting(false);
    }
  }, [geminiApiKey, draftPrompt, isReply, replyFrom, replySubject, replyTo, body, lang, aiModel, t]);

  // Escape key handler
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !sending) onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [sending, onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      {/* Backdrop — guard during send */}
      <div className="absolute inset-0 bg-black/30" onClick={() => { if (!sending) onClose(); }} />

      {/* Modal */}
      <div className="relative w-full sm:max-w-lg bg-[var(--bg)] sm:rounded-[4px] rounded-t-2xl flex flex-col max-h-[95vh] sm:max-h-[90vh] animate-fade-in">
        {/* Drag handle (mobile) */}
        <div className="flex justify-center pt-2 pb-0 sm:hidden">
          <div className="w-8 h-1 rounded-full bg-[var(--border-medium)]" />
        </div>
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-2.5 sm:py-3 border-b border-[var(--border-light)]">
          <h2 className="text-sm font-medium text-[var(--text-primary)] truncate pr-2">
            {isReply ? `${t.reply}: ${replySubject}` : t.compose}
          </h2>
          <button onClick={() => { if (!sending) onClose(); }} className="size-9 sm:size-7 flex items-center justify-center text-[var(--text-tertiary)] active:bg-[var(--bg-alt)] hover:bg-[var(--bg-alt)] rounded-[4px] t-transition flex-shrink-0">
            <X className="size-5 sm:size-4" />
          </button>
        </div>

        {/* Form */}
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
          {/* Send from */}
          {accounts.length > 1 && (
            <div className="flex items-center gap-2">
              <label className="text-[13px] sm:text-xs text-[var(--text-tertiary)] w-12">{t.sendFrom}</label>
              <select
                value={sendFromAccount}
                onChange={e => onSendFromChange(e.target.value)}
                className="flex-1 h-8 px-2 text-sm bg-[var(--bg-alt)] border-none rounded-[4px] text-[var(--text-body)]"
              >
                {accounts.map(a => <option key={a.email} value={a.email}>{a.name} ({a.email})</option>)}
              </select>
            </div>
          )}

          {/* To */}
          <div className="flex items-center gap-2">
            <label className="text-[13px] sm:text-xs text-[var(--text-tertiary)] w-12">{t.to}</label>
            <input
              type="email"
              value={to}
              onChange={e => setTo(e.target.value)}
              className="flex-1 h-8 px-2 text-sm bg-[var(--bg-alt)] border-none rounded-[4px] text-[var(--text-body)] placeholder:text-[var(--text-placeholder)] focus:outline-none focus:ring-2 focus:ring-[var(--blue)]"
              autoFocus={!isReply}
            />
            {!showCcBcc && (
              <button onClick={() => setShowCcBcc(true)} className="text-[13px] sm:text-xs text-[var(--text-tertiary)] hover:text-[var(--blue)] t-transition">
                {t.addCcBcc}
              </button>
            )}
          </div>

          {showCcBcc && (
            <>
              <div className="flex items-center gap-2">
                <label className="text-[13px] sm:text-xs text-[var(--text-tertiary)] w-12">{t.cc}</label>
                <input type="email" value={cc} onChange={e => setCc(e.target.value)}
                  className="flex-1 h-8 px-2 text-sm bg-[var(--bg-alt)] border-none rounded-[4px] text-[var(--text-body)] placeholder:text-[var(--text-placeholder)] focus:outline-none focus:ring-2 focus:ring-[var(--blue)]" />
              </div>
              <div className="flex items-center gap-2">
                <label className="text-[13px] sm:text-xs text-[var(--text-tertiary)] w-12">{t.bcc}</label>
                <input type="email" value={bcc} onChange={e => setBcc(e.target.value)}
                  className="flex-1 h-8 px-2 text-sm bg-[var(--bg-alt)] border-none rounded-[4px] text-[var(--text-body)] placeholder:text-[var(--text-placeholder)] focus:outline-none focus:ring-2 focus:ring-[var(--blue)]" />
              </div>
            </>
          )}

          {/* Subject (only for new compose) */}
          {!isReply && (
            <div className="flex items-center gap-2">
              <label className="text-[13px] sm:text-xs text-[var(--text-tertiary)] w-12">{t.subject}</label>
              <input
                type="text"
                value={subject}
                onChange={e => setSubject(e.target.value)}
                className="flex-1 h-8 px-2 text-sm bg-[var(--bg-alt)] border-none rounded-[4px] text-[var(--text-body)] placeholder:text-[var(--text-placeholder)] focus:outline-none focus:ring-2 focus:ring-[var(--blue)]"
              />
            </div>
          )}

          {/* Body */}
          <textarea
            value={body}
            onChange={e => setBody(e.target.value)}
            placeholder={isReply ? t.writeReply : t.body}
            rows={8}
            className="w-full px-3 py-2 text-sm bg-[var(--bg-alt)] border-none rounded-[4px] text-[var(--text-body)] placeholder:text-[var(--text-placeholder)] focus:outline-none focus:ring-2 focus:ring-[var(--blue)] resize-none"
            autoFocus={isReply}
          />

          {/* Attachments */}
          {attachments.length > 0 && (
            <div className="space-y-1">
              {attachments.map((f, i) => (
                <div key={i} className="flex items-center gap-2 px-2 py-1 bg-[var(--bg-alt)] rounded-[4px] text-sm">
                  <Paperclip className="size-3 text-[var(--text-tertiary)]" />
                  <span className="flex-1 truncate text-[var(--text-body)]">{f.name}</span>
                  <button onClick={() => setAttachments(prev => prev.filter((_, j) => j !== i))}
                    className="size-5 flex items-center justify-center text-[var(--text-placeholder)] hover:text-[var(--danger)] t-transition">
                    <X className="size-3" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* AI Draft Input */}
          {showDraftInput && (
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={draftPrompt}
                onChange={e => setDraftPrompt(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") handleAiDraft(); }}
                placeholder={isReply ? t.draftReply : "Describe what to write..."}
                className="flex-1 h-8 px-2 text-sm bg-[var(--blue-light)] border-none rounded-[4px] text-[var(--text-body)] placeholder:text-[var(--text-placeholder)] focus:outline-none focus:ring-2 focus:ring-[var(--blue)]"
                autoFocus
              />
              <button onClick={handleAiDraft} disabled={drafting}
                className="h-8 px-3 text-sm font-medium text-white bg-[var(--blue)] hover:bg-[var(--blue-hover)] rounded-[4px] t-btn-transition disabled:opacity-50">
                {drafting ? <Loader2 className="size-4 animate-spin" /> : "Go"}
              </button>
              <button onClick={() => setShowDraftInput(false)}
                className="size-8 flex items-center justify-center text-[var(--text-tertiary)] hover:bg-[var(--bg-alt)] rounded-[4px] t-transition">
                <X className="size-4" />
              </button>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center gap-1.5 sm:gap-2 px-4 py-2.5 sm:py-3 border-t border-[var(--border-light)] safe-area-pb-modal">
          <button onClick={handleSend} disabled={sending || !to.trim()}
            className="flex items-center gap-2 px-5 h-10 sm:h-9 text-sm font-medium text-white bg-[var(--blue)] hover:bg-[var(--blue-hover)] rounded-[4px] t-btn-transition disabled:opacity-50">
            {sending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
            {t.send}
          </button>
          <button onClick={handleAddAttachment}
            className="size-10 sm:size-9 flex items-center justify-center text-[var(--text-tertiary)] hover:text-[var(--text-primary)] active:bg-[var(--bg-alt)] hover:bg-[var(--bg-alt)] rounded-[4px] t-transition"
            title={t.addAttachment}>
            <Paperclip className="size-[18px] sm:size-4" />
          </button>
          {geminiApiKey && (
            <button onClick={() => setShowDraftInput(v => !v)}
              className="size-10 sm:size-9 flex items-center justify-center text-[var(--text-tertiary)] hover:text-[var(--blue)] active:bg-[var(--blue-light)] hover:bg-[var(--blue-light)] rounded-[4px] t-transition"
              title={t.draftReply}>
              <Sparkles className="size-[18px] sm:size-4" />
            </button>
          )}
          <div className="flex-1" />
          <button onClick={() => { if (!sending) onClose(); }} disabled={sending}
            className="px-3 sm:px-4 h-10 sm:h-9 text-sm text-[var(--text-tertiary)] hover:text-[var(--text-primary)] active:bg-[var(--bg-alt)] hover:bg-[var(--bg-alt)] rounded-[4px] t-transition disabled:opacity-50">
            {t.cancel}
          </button>
        </div>
      </div>
    </div>
  );
}
