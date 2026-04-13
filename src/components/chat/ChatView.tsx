import { useState, useEffect, useRef, useCallback } from "react";
import { Sparkles, Send, Trash2, Loader2, User, Bot } from "lucide-react";
import { toast } from "sonner";
import { translations, type Language } from "../../translations";
import * as gemini from "../../services/gemini";
import type { ChatMessage } from "../../types";

function renderMarkdown(text: string): string {
  return text
    .replace(/```(\w*)\n([\s\S]*?)```/g, '<pre><code>$2</code></pre>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/^### (.+)$/gm, '<h3>$1</h3>')
    .replace(/^## (.+)$/gm, '<h2>$1</h2>')
    .replace(/^# (.+)$/gm, '<h1>$1</h1>')
    .replace(/^- (.+)$/gm, '<li>$1</li>')
    .replace(/(<li>[\s\S]*?<\/li>)/g, '<ul>$1</ul>')
    .replace(/<\/ul>\s*<ul>/g, '')
    .replace(/\n\n/g, '</p><p>')
    .replace(/\n/g, '<br/>');
}

interface ChatViewProps {
  isDemo: boolean;
  lang: Language;
  geminiApiKey: string;
  aiModel: string;
  workspaceContext: string;
}

export default function ChatView({ isDemo, lang, geminiApiKey, aiModel, workspaceContext }: ChatViewProps) {
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
      const history = messagesRef.current.slice(-10).map(m => ({ role: m.role, text: m.text }));

      const stream = gemini.chatStream(geminiApiKey, {
        message: text.trim(),
        history,
        context: workspaceContext,
        lang,
        model: aiModel,
      });

      let accumulated = "";
      for await (const chunk of stream) {
        accumulated += chunk;
        const current = accumulated;
        setMessages(prev =>
          prev.map(m => m.id === assistantId ? { ...m, text: current } : m)
        );
      }
    } catch (e: any) {
      if (e.name !== "AbortError") {
        setMessages(prev =>
          prev.map(m => m.id === assistantId ? { ...m, text: t.aiChatError } : m)
        );
        toast.error(t.aiChatError);
      }
    } finally {
      setStreaming(false);
    }
  }, [geminiApiKey, workspaceContext, lang, aiModel, t]);

  const clearChat = useCallback(() => {
    setMessages([]);
    localStorage.removeItem("ai_chat_history");
  }, []);

  const quickChips = [
    { label: t.chipTodayFocus, prompt: lang === "zh" ? "帮我总结今天的重点事项" : "Summarize my focus for today" },
    { label: t.chipWeekPlan, prompt: lang === "zh" ? "帮我规划这周的安排" : "Plan my week" },
    { label: t.chipUnreadSummary, prompt: lang === "zh" ? "总结我未读的邮件" : "Summarize my unread emails" },
    { label: t.chipScheduleConflicts, prompt: lang === "zh" ? "检查我的日程是否有冲突" : "Check for schedule conflicts" },
  ];

  return (
    <div className="h-full flex flex-col">
      {/* ── Messages ── */}
      <div className="flex-1 overflow-y-auto">
        {messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center px-4">
            <div className="w-12 h-12 rounded-full bg-[var(--blue-light)] flex items-center justify-center mb-4">
              <Sparkles className="size-6 text-[var(--blue)]" />
            </div>
            <h2 className="text-lg font-medium text-[var(--text-primary)] mb-1">{t.aiAssistant}</h2>
            <p className="text-sm text-[var(--text-tertiary)] text-center mb-6">{t.aiChatWelcome}</p>

            {/* Quick chips */}
            <div className="flex flex-wrap gap-2 justify-center max-w-md">
              {quickChips.map(chip => (
                <button
                  key={chip.label}
                  onClick={() => sendMessage(chip.prompt)}
                  disabled={streaming}
                  className="px-3 py-1.5 text-sm text-[var(--text-body)] bg-[var(--bg-alt)] hover:bg-[var(--bg-active)] rounded-[4px] t-transition disabled:opacity-50"
                >
                  {chip.label}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="max-w-2xl mx-auto px-4 py-4 space-y-4">
            {messages.map(msg => (
              <div key={msg.id} className={`flex gap-3 animate-fade-in ${msg.role === "user" ? "justify-end" : ""}`}>
                {msg.role === "assistant" && (
                  <div className="w-7 h-7 rounded-full bg-[var(--blue-light)] flex items-center justify-center flex-shrink-0 mt-0.5">
                    <Bot className="size-4 text-[var(--blue)]" />
                  </div>
                )}
                <div className={`max-w-[80%] ${
                  msg.role === "user"
                    ? "bg-[var(--blue)] text-white px-4 py-2.5 rounded-[4px]"
                    : "text-[var(--text-body)]"
                }`}>
                  {msg.role === "assistant" ? (
                    msg.text ? (
                      <div
                        className="chat-markdown text-sm"
                        dangerouslySetInnerHTML={{ __html: renderMarkdown(msg.text) }}
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
      <div className="border-t border-[var(--border-light)] px-4 py-3">
        <div className="max-w-2xl mx-auto flex items-center gap-2">
          {messages.length > 0 && (
            <button
              onClick={clearChat}
              className="size-9 flex items-center justify-center text-[var(--text-placeholder)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-alt)] rounded-[4px] t-transition flex-shrink-0"
              title={t.clearChat}
            >
              <Trash2 className="size-4" />
            </button>
          )}
          <div className="flex-1 relative">
            <input
              type="text"
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey && !streaming) sendMessage(input); }}
              placeholder={t.aiChatPlaceholder}
              disabled={streaming}
              className="w-full h-10 pl-4 pr-11 text-sm bg-[var(--bg-alt)] border-none rounded-[4px] text-[var(--text-body)] placeholder:text-[var(--text-placeholder)] focus:outline-none focus:ring-2 focus:ring-[var(--blue)] t-transition disabled:opacity-50"
            />
            <button
              onClick={() => sendMessage(input)}
              disabled={streaming || !input.trim()}
              className="absolute right-1 top-1/2 -translate-y-1/2 size-8 flex items-center justify-center text-[var(--blue)] hover:bg-[var(--blue-light)] rounded-[4px] t-transition disabled:opacity-30"
            >
              {streaming ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
            </button>
          </div>
        </div>

        {/* Quick chips when there are messages */}
        {messages.length > 0 && (
          <div className="max-w-2xl mx-auto flex flex-wrap gap-1.5 mt-2">
            {quickChips.map(chip => (
              <button
                key={chip.label}
                onClick={() => sendMessage(chip.prompt)}
                disabled={streaming}
                className="px-2 py-1 text-xs text-[var(--text-tertiary)] bg-[var(--bg-alt)] hover:bg-[var(--bg-active)] rounded-[4px] t-transition disabled:opacity-50"
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
