import { useState, useEffect, useRef, useCallback } from "react";
import {
  Sparkles, Send, Trash2, Loader2, User, Bot,
  CheckSquare, Calendar, Mail, Lightbulb, ChevronRight, KeyRound, NotebookPen,
} from "lucide-react";
import { toast } from "sonner";
import { translations, type Language } from "../../translations";
import * as gemini from "../../services/gemini";
import type { ChatMessage } from "../../types";

function escapeHtml(str: string): string {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function renderMarkdown(text: string): string {
  // Extract code blocks first (preserve raw content)
  const codeBlocks: string[] = [];
  let safe = text.replace(/```(\w*)\n([\s\S]*?)```/g, (_, _lang, code) => {
    codeBlocks.push(`<pre><code>${escapeHtml(code.trimEnd())}</code></pre>`);
    return `\n%%CODE_BLOCK_${codeBlocks.length - 1}%%\n`;
  });
  const inlineCodes: string[] = [];
  safe = safe.replace(/`([^`]+)`/g, (_, code) => {
    inlineCodes.push(`<code>${escapeHtml(code)}</code>`);
    return `%%INLINE_CODE_${inlineCodes.length - 1}%%`;
  });

  // Escape remaining HTML
  safe = escapeHtml(safe);

  // Inline formatting
  safe = safe
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>');

  // Process line by line for clean block-level rendering
  const lines = safe.split('\n');
  const out: string[] = [];
  let inList = false;

  for (const line of lines) {
    const trimmed = line.trim();

    // Code block placeholder
    if (trimmed.startsWith('%%CODE_BLOCK_')) {
      if (inList) { out.push('</ul>'); inList = false; }
      out.push(trimmed);
      continue;
    }

    // Empty line = paragraph break
    if (!trimmed) {
      if (inList) { out.push('</ul>'); inList = false; }
      out.push('');
      continue;
    }

    // Headings
    if (trimmed.startsWith('### ')) {
      if (inList) { out.push('</ul>'); inList = false; }
      out.push(`<h3>${trimmed.slice(4)}</h3>`);
      continue;
    }
    if (trimmed.startsWith('## ')) {
      if (inList) { out.push('</ul>'); inList = false; }
      out.push(`<h2>${trimmed.slice(3)}</h2>`);
      continue;
    }
    if (trimmed.startsWith('# ')) {
      if (inList) { out.push('</ul>'); inList = false; }
      out.push(`<h1>${trimmed.slice(2)}</h1>`);
      continue;
    }

    // Unordered list items (- or *)
    const listMatch = trimmed.match(/^[-*]\s+(.+)/);
    if (listMatch) {
      if (!inList) { out.push('<ul>'); inList = true; }
      out.push(`<li>${listMatch[1]}</li>`);
      continue;
    }

    // Numbered list items
    const numMatch = trimmed.match(/^\d+\.\s+(.+)/);
    if (numMatch) {
      if (!inList) { out.push('<ul>'); inList = true; }
      out.push(`<li>${numMatch[1]}</li>`);
      continue;
    }

    // Regular text line
    if (inList) { out.push('</ul>'); inList = false; }
    out.push(trimmed);
  }

  if (inList) out.push('</ul>');

  // Join with <br/> for non-empty adjacent text lines, blank lines become paragraph breaks
  let html = '';
  for (let i = 0; i < out.length; i++) {
    const cur = out[i];
    if (!cur) {
      // Blank line — skip consecutive blanks
      if (html && !html.endsWith('<br/>')) html += '<br/>';
      continue;
    }
    html += cur;
    // Add <br/> between plain text lines (not after block elements)
    const next = out[i + 1];
    if (next && !cur.startsWith('<') && !next.startsWith('<') && next !== '') {
      html += '<br/>';
    }
  }

  // Restore code blocks and inline codes
  codeBlocks.forEach((block, i) => { html = html.replace(`%%CODE_BLOCK_${i}%%`, block); });
  inlineCodes.forEach((code, i) => { html = html.replace(`%%INLINE_CODE_${i}%%`, code); });

  return html;
}

/** Inject clickable links for email subjects mentioned inline in AI responses */
function injectEmailLinks(html: string, emails: any[]): string {
  if (!emails.length || !html) return html;

  // Build subject → emailId map (only subjects long enough to avoid false positives)
  const entries: { escaped: string; id: string }[] = [];
  const seen = new Set<string>();
  for (const email of emails) {
    const subject = email.payload?.headers?.find((h: any) => h.name?.toLowerCase() === "subject")?.value || "";
    if (!subject || subject.length < 4 || seen.has(email.id)) continue;
    seen.add(email.id);
    entries.push({ escaped: escapeHtml(subject), id: email.id });
  }

  if (!entries.length) return html;

  // Sort longest first so longer subjects match before shorter substrings
  entries.sort((a, b) => b.escaped.length - a.escaped.length);

  let result = html;
  const linked = new Set<string>();

  for (const { escaped, id } of entries) {
    if (linked.has(id)) continue;
    // Only replace if found in the HTML (will match inside text nodes and <strong> etc.)
    const idx = result.indexOf(escaped);
    if (idx === -1) continue;

    // Don't replace if already inside an <a> tag (check backwards for unclosed <a)
    const before = result.slice(0, idx);
    const lastAOpen = before.lastIndexOf("<a ");
    const lastAClose = before.lastIndexOf("</a>");
    if (lastAOpen > lastAClose) continue;

    linked.add(id);
    const replacement = `<a class="email-inline-link" data-email-id="${id}" role="button" tabindex="0">${escaped}<svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block;vertical-align:middle;margin-left:3px;margin-top:-1px"><rect width="20" height="16" x="2" y="4" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/></svg></a>`;
    result = result.slice(0, idx) + replacement + result.slice(idx + escaped.length);
  }

  return result;
}

export type ActionExecutor = (name: string, args: Record<string, any>) => Promise<{ success: boolean; message: string }>;

interface ChatViewProps {
  isDemo: boolean;
  lang: Language;
  geminiApiKey: string;
  aiModel: string;
  workspaceContext: string;
  emails: any[];
  executeAction: ActionExecutor;
  onOpenSettings?: () => void;
  onNavigateToEmail?: (emailId: string) => void;
}

export default function ChatView({ isDemo, lang, geminiApiKey, aiModel, workspaceContext, emails, executeAction, onOpenSettings, onNavigateToEmail }: ChatViewProps) {
  const t = translations[lang];

  const [messages, setMessages] = useState<ChatMessage[]>(() => {
    try {
      const saved = localStorage.getItem("ai_chat_history");
      if (saved) return JSON.parse(saved).map((m: any) => ({ ...m, timestamp: new Date(m.timestamp) }));
    } catch {}
    return [];
  });
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const messagesRef = useRef(messages);

  useEffect(() => { messagesRef.current = messages; }, [messages]);

  // Persist chat
  useEffect(() => {
    if (streaming) return;
    const timer = setTimeout(() => {
      localStorage.setItem("ai_chat_history", JSON.stringify(messages.slice(-50)));
    }, 500);
    return () => clearTimeout(timer);
  }, [messages, streaming]);

  // Auto-scroll
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Cleanup
  useEffect(() => {
    return () => { abortRef.current?.abort(); };
  }, []);

  const sendMessage = useCallback(async (text: string) => {
    if (!text.trim()) return;
    if (!geminiApiKey) { toast.error(t.noApiKey); return; }

    // Abort any in-flight stream
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    const userMsg: ChatMessage = {
      id: `user-${Date.now()}`,
      role: "user",
      text: text.trim(),
      timestamp: new Date(),
    };

    const assistantId = `assistant-${Date.now()}`;
    const assistantMsg: ChatMessage = {
      id: assistantId,
      role: "assistant",
      text: "",
      timestamp: new Date(),
    };

    setMessages(prev => [...prev, userMsg, assistantMsg]);
    setInput("");
    setStreaming(true);

    try {
      // Capture history from current state (not stale ref)
      const history = [...messages, userMsg].slice(-10).map(m => ({ role: m.role, text: m.text }));

      const stream = gemini.chatStreamWithTools(
        geminiApiKey,
        {
          message: text.trim(),
          history,
          context: workspaceContext,
          lang,
          model: aiModel,
          signal: controller.signal,
        },
        executeAction,
      );

      let accumulated = "";
      for await (const chunk of stream) {
        if (controller.signal.aborted) break;
        accumulated += chunk;
        const current = accumulated;
        setMessages(prev =>
          prev.map(m => m.id === assistantId ? { ...m, text: current } : m)
        );
      }
    } catch (e: any) {
      if (e.name !== "AbortError" && !controller.signal.aborted) {
        setMessages(prev =>
          prev.map(m => m.id === assistantId ? { ...m, text: t.aiChatError } : m)
        );
        toast.error(t.aiChatError);
      }
    } finally {
      if (!controller.signal.aborted) setStreaming(false);
    }
  }, [geminiApiKey, workspaceContext, lang, aiModel, executeAction, messages, t]);

  const clearChat = useCallback(() => {
    setMessages([]);
    localStorage.removeItem("ai_chat_history");
  }, []);

  // ── Capability categories with example prompts ──
  const categories = [
    {
      icon: CheckSquare,
      label: t.aiCatTasks,
      color: "text-emerald-500",
      bg: "bg-emerald-500/10",
      examples: [
        { text: t.aiExTask1, prompt: lang === "zh" ? "这周有哪些任务要完成？" : "What tasks are due this week?" },
        { text: t.aiExTask2, prompt: lang === "zh" ? "哪些任务已经逾期了？" : "Which tasks are overdue?" },
        { text: t.aiExTask3, prompt: lang === "zh" ? "帮我创建一个新任务" : "Create a task for me" },
      ],
    },
    {
      icon: Calendar,
      label: t.aiCatCalendar,
      color: "text-blue-500",
      bg: "bg-blue-500/10",
      examples: [
        { text: t.aiExCal1, prompt: lang === "zh" ? "我今天有什么安排？" : "What's on my schedule today?" },
        { text: t.aiExCal2, prompt: lang === "zh" ? "这周日程有冲突吗？" : "Any schedule conflicts this week?" },
        { text: t.aiExCal3, prompt: lang === "zh" ? "帮我创建一个新日程" : "Help me create a new event" },
      ],
    },
    {
      icon: Mail,
      label: t.aiCatEmail,
      color: "text-orange-500",
      bg: "bg-orange-500/10",
      examples: [
        { text: t.aiExMail1, prompt: lang === "zh" ? "总结我的未读邮件" : "Summarize my unread emails" },
        { text: t.aiExMail2, prompt: lang === "zh" ? "搜索这个月重要的邮件" : "Search for important emails this month" },
        { text: t.aiExMail3, prompt: lang === "zh" ? "有哪些紧急邮件需要处理？" : "Any urgent emails I should handle?" },
      ],
    },
    {
      icon: Lightbulb,
      label: t.aiCatAnalysis,
      color: "text-amber-500",
      bg: "bg-amber-500/10",
      examples: [
        { text: t.aiExAnalysis1, prompt: lang === "zh" ? "今天我应该关注什么？" : "What should I focus on today?" },
        { text: t.aiExAnalysis2, prompt: lang === "zh" ? "给我一个今日简报" : "Give me a daily briefing" },
        { text: t.aiExAnalysis3, prompt: lang === "zh" ? "帮我规划这周的工作" : "Plan my week ahead" },
      ],
    },
    {
      icon: NotebookPen,
      label: t.notes,
      color: "text-purple-500",
      bg: "bg-purple-500/10",
      examples: [
        { text: lang === "zh" ? "我这个月花了多少？" : "How much did I spend this month?",
          prompt: lang === "zh" ? "我这个月的账目支出是多少？按分类列出" : "Summarize this month's expenses by category" },
        { text: lang === "zh" ? "本月佣金收入" : "This month's commission income",
          prompt: lang === "zh" ? "本月收到的佣金总额是多少？" : "What's my total commission income this month?" },
        { text: lang === "zh" ? "搜索我拍过的照片" : "Search my saved photos",
          prompt: lang === "zh" ? "我上次拍的商品是什么？" : "What products did I photograph recently?" },
      ],
    },
  ];

  // Quick chips for when messages exist
  const quickChips = [
    { label: t.chipTodayFocus, prompt: lang === "zh" ? "帮我总结今天的重点事项" : "Summarize my focus for today" },
    { label: lang === "zh" ? "本月账目" : "This month's ledger",
      prompt: lang === "zh" ? "本月收入、支出和净收分别是多少？" : "What's my income, expense, and net this month?" },
    { label: t.chipUnreadSummary, prompt: lang === "zh" ? "总结我未读的邮件" : "Summarize my unread emails" },
    { label: t.chipScheduleConflicts, prompt: lang === "zh" ? "检查我的日程是否有冲突" : "Check for schedule conflicts" },
  ];

  const hasApiKey = !!geminiApiKey;

  return (
    <div className="h-full flex flex-col">
      {/* ── Messages ── */}
      <div className="flex-1 overflow-y-auto">
        {messages.length === 0 ? (
          <div className="h-full overflow-y-auto">
            <div className="max-w-xl mx-auto px-3 sm:px-4 py-4 sm:py-6 pb-8 sm:pb-16">
              {/* Hero */}
              <div className="text-center mb-3 sm:mb-6">
                <div className="w-10 h-10 sm:w-14 sm:h-14 rounded-xl sm:rounded-2xl bg-[var(--blue-light)] flex items-center justify-center mx-auto mb-2 sm:mb-4">
                  <Sparkles className="size-5 sm:size-7 text-[var(--blue)]" />
                </div>
                <h2 className="text-base sm:text-lg font-semibold text-[var(--text-primary)] mb-0.5 sm:mb-1">{t.aiWelcomeTitle}</h2>
                <p className="text-[13px] sm:text-sm text-[var(--text-tertiary)] leading-snug sm:leading-relaxed max-w-md mx-auto">{t.aiWelcomeSubtitle}</p>
              </div>

              {/* API Key Banner */}
              {!hasApiKey && (
                <button
                  onClick={onOpenSettings}
                  className="w-full flex items-center gap-2.5 p-2.5 sm:p-3 mb-4 sm:mb-5 bg-amber-500/10 border border-amber-500/20 rounded-[4px] text-left hover:bg-amber-500/15 active:bg-amber-500/15 t-transition"
                >
                  <KeyRound className="size-5 text-amber-500 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-[var(--text-primary)]">{t.apiKeyMissing}</p>
                    <p className="text-xs text-[var(--text-tertiary)] mt-0.5">{t.geminiApiKeyDesc}</p>
                  </div>
                  <span className="text-xs font-medium text-amber-600 flex-shrink-0">{t.apiKeySetup} →</span>
                </button>
              )}

              {/* Capability Categories */}
              <div className="space-y-2 sm:space-y-3">
                {categories.map(cat => (
                  <div key={cat.label} className="bg-[var(--bg-alt)] rounded-[4px] overflow-hidden">
                    {/* Category Header */}
                    <div className="flex items-center gap-2 px-3 pt-2.5 sm:pt-3 pb-1">
                      <div className={`w-5 h-5 sm:w-6 sm:h-6 rounded-md ${cat.bg} flex items-center justify-center`}>
                        <cat.icon className={`size-3 sm:size-3.5 ${cat.color}`} />
                      </div>
                      <span className="text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wide">{cat.label}</span>
                    </div>
                    {/* Example Prompts */}
                    <div className="px-1.5 pb-1.5">
                      {cat.examples.map(ex => (
                        <button
                          key={ex.text}
                          onClick={() => sendMessage(ex.prompt)}
                          disabled={streaming || !hasApiKey}
                          className="w-full flex items-center gap-2 px-2.5 py-2 text-left text-sm text-[var(--text-body)] hover:bg-[var(--bg-active)] active:bg-[var(--bg-active)] rounded-[4px] t-transition disabled:opacity-40 disabled:cursor-not-allowed group"
                        >
                          <ChevronRight className="size-3 text-[var(--text-quaternary)] group-hover:text-[var(--blue)] t-transition flex-shrink-0" />
                          <span className="truncate">{ex.text}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>

              {/* Footer */}
              <p className="text-center text-xs text-[var(--text-quaternary)] mt-5">{t.aiPoweredBy}</p>
            </div>
          </div>
        ) : (
          <div className="max-w-2xl mx-auto px-3 sm:px-4 py-3 sm:py-4 space-y-3 sm:space-y-4">
            {messages.map(msg => (
              <div key={msg.id} className={`flex gap-2 sm:gap-3 animate-fade-in ${msg.role === "user" ? "justify-end" : ""}`}>
                {msg.role === "assistant" && (
                  <div className="w-7 h-7 rounded-full bg-[var(--blue-light)] flex items-center justify-center flex-shrink-0 mt-0.5">
                    <Bot className="size-4 text-[var(--blue)]" />
                  </div>
                )}
                <div className={`max-w-[85%] sm:max-w-[80%] ${
                  msg.role === "user"
                    ? "bg-[var(--blue)] text-white px-3.5 sm:px-4 py-2.5 rounded-2xl rounded-tr-md sm:rounded-[4px]"
                    : "text-[var(--text-body)]"
                }`}>
                  {msg.role === "assistant" ? (
                    msg.text ? (
                      <div
                        className="chat-markdown text-sm"
                        dangerouslySetInnerHTML={{ __html: injectEmailLinks(renderMarkdown(msg.text), emails) }}
                        onClick={(e) => {
                          const link = (e.target as HTMLElement).closest(".email-inline-link");
                          if (link) {
                            e.preventDefault();
                            const emailId = link.getAttribute("data-email-id");
                            if (emailId && onNavigateToEmail) onNavigateToEmail(emailId);
                          }
                        }}
                      />
                    ) : (
                      <div className="flex gap-1 py-2">
                        <div className="w-1.5 h-1.5 rounded-full bg-[var(--text-placeholder)] typing-dot" />
                        <div className="w-1.5 h-1.5 rounded-full bg-[var(--text-placeholder)] typing-dot" />
                        <div className="w-1.5 h-1.5 rounded-full bg-[var(--text-placeholder)] typing-dot" />
                      </div>
                    )
                  ) : (
                    <p className="text-sm">{msg.text}</p>
                  )}
                </div>
                {msg.role === "user" && (
                  <div className="w-7 h-7 rounded-full bg-[var(--bg-alt)] flex items-center justify-center flex-shrink-0 mt-0.5">
                    <User className="size-4 text-[var(--text-tertiary)]" />
                  </div>
                )}
              </div>
            ))}
            <div ref={endRef} />
          </div>
        )}
      </div>

      {/* ── Input ── */}
      <div className="border-t border-[var(--border-light)] px-3 sm:px-4 py-2 sm:py-3 pb-3 sm:pb-3">
        <div className="max-w-2xl mx-auto flex items-center gap-1.5 sm:gap-2">
          {messages.length > 0 && (
            <button
              onClick={clearChat}
              className="size-10 sm:size-9 flex items-center justify-center text-[var(--text-placeholder)] hover:text-[var(--text-primary)] active:bg-[var(--bg-alt)] hover:bg-[var(--bg-alt)] rounded-[4px] t-transition flex-shrink-0"
              title={t.clearChat}
            >
              <Trash2 className="size-[18px] sm:size-4" />
            </button>
          )}
          <div className="flex-1 relative">
            <input
              type="text"
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey && !streaming) sendMessage(input); }}
              placeholder={hasApiKey ? t.aiTryAsking : t.apiKeyMissing}
              disabled={streaming || !hasApiKey}
              className="w-full h-11 sm:h-10 pl-4 pr-12 text-sm bg-[var(--bg-alt)] border-none rounded-full sm:rounded-[4px] text-[var(--text-body)] placeholder:text-[var(--text-placeholder)] focus:outline-none focus:ring-2 focus:ring-[var(--blue)] t-transition disabled:opacity-50"
            />
            <button
              onClick={() => sendMessage(input)}
              disabled={streaming || !input.trim() || !hasApiKey}
              className="absolute right-1.5 top-1/2 -translate-y-1/2 size-8 flex items-center justify-center text-white bg-[var(--blue)] rounded-full sm:rounded-[4px] t-transition disabled:opacity-30 disabled:bg-[var(--text-placeholder)]"
            >
              {streaming ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
            </button>
          </div>
        </div>

        {/* Quick chips when there are messages */}
        {messages.length > 0 && (
          <div className="max-w-2xl mx-auto flex gap-1.5 mt-2 overflow-x-auto no-scrollbar">
            {quickChips.map(chip => (
              <button
                key={chip.label}
                onClick={() => sendMessage(chip.prompt)}
                disabled={streaming}
                className="px-2.5 py-1.5 text-xs text-[var(--text-tertiary)] bg-[var(--bg-alt)] hover:bg-[var(--bg-active)] active:bg-[var(--bg-active)] rounded-full sm:rounded-[4px] t-transition disabled:opacity-50 whitespace-nowrap flex-shrink-0"
              >
                {chip.label}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
