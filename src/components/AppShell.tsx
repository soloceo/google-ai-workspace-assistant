import { useState, useEffect, useRef, useCallback } from "react";
import { Mail, Calendar as CalendarIcon, Sparkles, Settings, LogOut, Languages, Plus, Search, ChevronDown, X, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { translations, type Language } from "../translations";
import * as authService from "../services/auth";
import * as gmail from "../services/gmail";
import * as calendarService from "../services/calendar";
import * as gemini from "../services/gemini";
import type { StoredAccount, AccountSummary, UserProfile, ChatMessage } from "../types";
import MailView from "./mail/MailView";
import CalendarView from "./calendar/CalendarView";
import ChatView from "./chat/ChatView";
import SettingsPanel from "./settings/SettingsPanel";
import ComposeModal from "./mail/ComposeModal";

export type AppTab = "mail" | "calendar" | "ai";

// Demo data
const DEMO_ACCOUNTS: AccountSummary[] = [
  { email: "me@gmail.com", name: "My Gmail", color: "#ea4335" },
  { email: "work@company.com", name: "Work Account", color: "#4285f4" },
];

const MOCK_SENDERS = [
  "Sarah Miller <sarah@example.com>", "Alex Chen <alex@team.co>", "Billing <billing@service.com>",
  "Lisa Wang <lisa@design.io>", "Tom Johnson <tom@corp.com>", "HR Team <hr@company.org>",
  "David Kim <david@startup.dev>", "Emily Zhang <emily@agency.co>", "Support <support@saas.com>",
  "James Lee <james@vendor.net>", "Maria Garcia <maria@partner.biz>", "Newsletter <news@tech.io>",
  "Kevin Wu <kevin@finance.co>", "Rachel Park <rachel@marketing.co>", "Mike Brown <mike@eng.team>",
];
const MOCK_SUBJECTS = [
  "Project Proposal - Phase 2", "Invoice #2024-0456", "Re: Client Demo Timeline",
  "Weekly Report Summary", "Meeting Notes - Q2 Planning", "Design Review Feedback",
  "Budget Approval Needed", "New Feature Request", "Performance Review Schedule",
  "Team Offsite Plans", "Contract Renewal", "Product Launch Update",
  "Customer Feedback Report", "Security Update Required", "Holiday Schedule Reminder",
  "Onboarding Checklist", "API Integration Guide", "Quarterly Results",
  "Urgent: Server Downtime", "Partnership Opportunity", "Training Session Invite",
  "Sprint Retrospective", "Expense Report Due", "Office Renovation Notice",
  "Welcome New Team Members", "System Maintenance Window",
];
const MOCK_SNIPPETS = [
  "Please review the attached proposal and provide your feedback by end of week.",
  "Your subscription has been renewed. Next billing: May 10, 2026.",
  "Just wanted to check in on the timeline. Are we still on track?",
  "Here's the summary of this week's progress across all teams.",
  "Attached are the notes from today's planning session.",
  "Great work on the mockups! A few minor suggestions...",
  "We need approval for the Q3 budget by Thursday.",
  "Users have been requesting this feature since last quarter.",
  "Let's schedule your review for next week. Please pick a time slot.",
  "Location confirmed for the offsite. Details inside.",
  "The contract is up for renewal next month. Please review terms.",
  "Launch date moved to April 28. Updated timeline attached.",
  "NPS score improved by 12 points this quarter!",
  "Critical security patch available. Please update ASAP.",
  "Reminder: Office closed Dec 25 - Jan 1.",
];

const MOCK_EMAILS: any[] = Array.from({ length: 50 }, (_, i) => {
  const acct = DEMO_ACCOUNTS[i % 2];
  return {
    id: String(i + 1),
    snippet: MOCK_SNIPPETS[i % MOCK_SNIPPETS.length],
    labelIds: i % 3 === 0 ? ["UNREAD", "INBOX"] : ["INBOX"],
    accountEmail: acct.email,
    accountColor: acct.color,
    internalDate: String(Date.now() - i * 3600000),
    payload: {
      headers: [
        { name: "From", value: MOCK_SENDERS[i % MOCK_SENDERS.length] },
        { name: "Subject", value: MOCK_SUBJECTS[i % MOCK_SUBJECTS.length] + (i > 25 ? ` (${i})` : "") },
        { name: "Date", value: new Date(Date.now() - i * 3600000).toUTCString() },
        { name: "Message-ID", value: `<mock${i + 1}@example.com>` },
      ],
    },
  };
});

const MOCK_EVENTS: any[] = [
  { id: "1", summary: "Team Sync", start: { dateTime: new Date().toISOString() }, end: { dateTime: new Date(Date.now() + 3600000).toISOString() }, description: "Weekly sync with the engineering team.", accountEmail: DEMO_ACCOUNTS[1].email, accountColor: DEMO_ACCOUNTS[1].color },
  { id: "2", summary: "Design Review", start: { dateTime: new Date(Date.now() + 3600000).toISOString() }, end: { dateTime: new Date(Date.now() + 7200000).toISOString() }, description: "Reviewing the new workspace UI mockups.", accountEmail: DEMO_ACCOUNTS[0].email, accountColor: DEMO_ACCOUNTS[0].color },
  { id: "3", summary: "1:1 with Manager", start: { dateTime: new Date(Date.now() + 86400000).toISOString() }, end: { dateTime: new Date(Date.now() + 86400000 + 1800000).toISOString() }, description: "Weekly 1:1 catch-up.", location: "Meeting Room A", accountEmail: DEMO_ACCOUNTS[1].email, accountColor: DEMO_ACCOUNTS[1].color },
  { id: "4", summary: "Product Launch Planning", start: { dateTime: new Date(Date.now() + 172800000).toISOString() }, end: { dateTime: new Date(Date.now() + 172800000 + 3600000).toISOString() }, description: "Final planning session for product launch.", accountEmail: DEMO_ACCOUNTS[0].email, accountColor: DEMO_ACCOUNTS[0].color },
];

// Settings
function loadSettings() {
  try {
    const saved = localStorage.getItem("workspace_settings");
    if (saved) return JSON.parse(saved);
  } catch {}
  return { aiModel: "gemini-2.5-flash", signature: "", theme: "light" };
}

function applyTheme(theme: string) {
  const root = document.documentElement;
  if (theme === "dark" || (theme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches)) {
    root.classList.add("dark");
  } else {
    root.classList.remove("dark");
  }
}

function saveSettingsToStorage(s: Record<string, any>) {
  try {
    const existing = JSON.parse(localStorage.getItem("workspace_settings") || "{}");
    localStorage.setItem("workspace_settings", JSON.stringify({ ...existing, ...s }));
  } catch {
    localStorage.setItem("workspace_settings", JSON.stringify(s));
  }
}

interface AppShellProps {
  isDemo: boolean;
  lang: Language;
  onLangChange: (l: Language) => void;
  onLogout: () => void;
}

export default function AppShell({ isDemo, lang, onLangChange, onLogout }: AppShellProps) {
  const t = translations[lang];

  // ── Core State ──
  const [activeTab, setActiveTab] = useState<AppTab>("mail");
  const [emails, setEmails] = useState<any[]>([]);
  const [calendarEvents, setCalendarEvents] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [accountFilter, setAccountFilter] = useState("all");
  const [sendFromAccount, setSendFromAccount] = useState("");

  // Settings
  const [settings, setSettings] = useState(loadSettings);
  const [geminiApiKey, setGeminiApiKeyState] = useState(gemini.getGeminiApiKey());
  const [showSettings, setShowSettings] = useState(false);

  // Compose
  const [showCompose, setShowCompose] = useState(false);
  const [composeReplyTo, setComposeReplyTo] = useState<any>(null);

  // Search
  const [searchQuery, setSearchQuery] = useState("");

  // Pagination
  const [pageTokens, setPageTokens] = useState<Record<string, string | null>>({});
  const [hasMore, setHasMore] = useState(false);

  // Abort
  const abortRef = useRef<AbortController | null>(null);

  // ── Theme ──
  useEffect(() => { applyTheme(settings.theme); }, [settings.theme]);
  useEffect(() => {
    if (settings.theme !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = () => applyTheme("system");
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, [settings.theme]);

  // ── Load Profile ──
  useEffect(() => {
    if (isDemo) {
      setProfile({ name: DEMO_ACCOUNTS[0].name, email: DEMO_ACCOUNTS[0].email, accounts: DEMO_ACCOUNTS });
      setSendFromAccount(DEMO_ACCOUNTS[0].email);
    } else {
      const accounts = authService.getAccounts();
      if (accounts.length > 0) {
        const primary = accounts[0];
        setProfile({
          name: primary.name, email: primary.email, picture: primary.picture,
          accounts: accounts.map(a => ({ email: a.email, name: a.name, picture: a.picture, color: a.color })),
        });
        setSendFromAccount(primary.email);
      }
    }
  }, [isDemo]);

  // ── Fetch Data ──
  const fetchData = useCallback(async (query?: string) => {
    if (isDemo) {
      const filtered = query
        ? MOCK_EMAILS.filter(e => {
            const subject = e.payload.headers.find((h: any) => h.name === "Subject")?.value || "";
            return subject.toLowerCase().includes(query.toLowerCase()) || e.snippet.toLowerCase().includes(query.toLowerCase());
          })
        : MOCK_EMAILS;
      setEmails(filtered);
      setCalendarEvents(MOCK_EVENTS);
      return;
    }

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    try {
      const accounts = authService.getAllValidAccounts();
      if (accounts.length === 0) return;

      const [mailResult, calResult] = await Promise.all([
        gmail.fetchAllAccountEmails(accounts, {
          q: query || undefined,
          labelIds: ["INBOX"],
          accountFilter: accountFilter !== "all" ? accountFilter : undefined,
          signal: controller.signal,
        }),
        calendarService.fetchAllAccountEvents(accounts, {
          accountFilter: accountFilter !== "all" ? accountFilter : undefined,
          signal: controller.signal,
        }),
      ]);

      if (!controller.signal.aborted) {
        setEmails(mailResult.items);
        setPageTokens(mailResult.pageTokens);
        setHasMore(mailResult.hasMore);
        setCalendarEvents(calResult.items);
      }
    } catch (e: any) {
      if (e.name !== "AbortError") {
        console.error("Fetch error:", e);
        toast.error(t.failedLoad.replace("{tab}", "data"));
      }
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }, [isDemo, accountFilter, t]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // ── Load More ──
  const loadMore = useCallback(async () => {
    if (isDemo || !hasMore) return;
    const accounts = authService.getAllValidAccounts();
    try {
      const result = await gmail.fetchAllAccountEmails(accounts, {
        q: searchQuery || undefined,
        labelIds: ["INBOX"],
        pageTokens,
        accountFilter: accountFilter !== "all" ? accountFilter : undefined,
      });
      setEmails(prev => [...prev, ...result.items]);
      setPageTokens(result.pageTokens);
      setHasMore(result.hasMore);
    } catch (e) {
      console.error("Load more error:", e);
    }
  }, [isDemo, hasMore, pageTokens, searchQuery, accountFilter]);

  // ── Search ──
  const handleSearch = useCallback((q: string) => {
    setSearchQuery(q);
    fetchData(q);
  }, [fetchData]);

  // ── Email Actions ──
  const handleArchive = useCallback(async (emailId: string, accountEmail: string) => {
    if (isDemo) { toast.info(t.demoSendSimulated); return; }
    try {
      await authService.withFreshToken(accountEmail, token =>
        gmail.modifyMessage(token, emailId, { removeLabelIds: ["INBOX"] })
      );
      setEmails(prev => prev.filter(e => e.id !== emailId));
      toast.success(t.actionSuccess);
    } catch { toast.error(t.actionFailed); }
  }, [isDemo, t]);

  const handleTrash = useCallback(async (emailId: string, accountEmail: string) => {
    if (isDemo) { toast.info(t.demoSendSimulated); return; }
    try {
      await authService.withFreshToken(accountEmail, token =>
        gmail.trashMessage(token, emailId)
      );
      setEmails(prev => prev.filter(e => e.id !== emailId));
      toast.success(t.actionSuccess);
    } catch { toast.error(t.actionFailed); }
  }, [isDemo, t]);

  const handleToggleRead = useCallback(async (emailId: string, accountEmail: string, isUnread: boolean) => {
    if (isDemo) { toast.info(t.demoSendSimulated); return; }
    try {
      await authService.withFreshToken(accountEmail, token =>
        gmail.modifyMessage(token, emailId, isUnread ? { removeLabelIds: ["UNREAD"] } : { addLabelIds: ["UNREAD"] })
      );
      setEmails(prev => prev.map(e => e.id === emailId ? {
        ...e, labelIds: isUnread
          ? (e.labelIds || []).filter((l: string) => l !== "UNREAD")
          : [...(e.labelIds || []), "UNREAD"]
      } : e));
      toast.success(t.actionSuccess);
    } catch { toast.error(t.actionFailed); }
  }, [isDemo, t]);

  // ── Send Email ──
  const handleSendEmail = useCallback(async (params: {
    to: string; cc?: string; bcc?: string; subject: string; body: string;
    threadId?: string; messageId?: string;
    attachments?: Array<{ filename: string; mimeType: string; data: string }>;
  }) => {
    if (isDemo) {
      toast.success(params.threadId ? t.demoReplySimulated : t.demoSendSimulated);
      return;
    }
    await authService.withFreshToken(sendFromAccount, token =>
      gmail.sendMessage(token, params)
    );
    toast.success(t.actionSuccess);
    setShowCompose(false);
    setComposeReplyTo(null);
  }, [isDemo, sendFromAccount, t]);

  // ── Calendar Actions ──
  const handleCreateEvent = useCallback(async (event: { summary: string; description?: string; location?: string; start: string; end: string }) => {
    if (isDemo) { toast.info(t.demoSendSimulated); return; }
    const newEvent = await authService.withFreshToken(sendFromAccount, token =>
      calendarService.createEvent(token, event)
    );
    setCalendarEvents(prev => [...prev, { ...newEvent, accountEmail: sendFromAccount }].sort((a, b) => {
      const tA = new Date(a.start?.dateTime || a.start?.date || 0).getTime();
      const tB = new Date(b.start?.dateTime || b.start?.date || 0).getTime();
      return tA - tB;
    }));
    toast.success(t.actionSuccess);
  }, [isDemo, sendFromAccount, t]);

  const handleUpdateEvent = useCallback(async (eventId: string, event: { summary?: string; description?: string; location?: string; start?: string; end?: string }) => {
    if (isDemo) { toast.info(t.demoSendSimulated); return; }
    const updated = await authService.withFreshToken(sendFromAccount, token =>
      calendarService.updateEvent(token, eventId, event)
    );
    setCalendarEvents(prev => prev.map(e => e.id === eventId ? { ...updated, accountEmail: e.accountEmail, accountColor: e.accountColor } : e));
    toast.success(t.actionSuccess);
  }, [isDemo, sendFromAccount, t]);

  const handleDeleteEvent = useCallback(async (eventId: string) => {
    if (isDemo) { toast.info(t.demoSendSimulated); return; }
    const event = calendarEvents.find(e => e.id === eventId);
    if (!event) return;
    await authService.withFreshToken(event.accountEmail || sendFromAccount, token =>
      calendarService.deleteEvent(token, eventId)
    );
    setCalendarEvents(prev => prev.filter(e => e.id !== eventId));
    toast.success(t.actionSuccess);
  }, [isDemo, calendarEvents, sendFromAccount, t]);

  // ── Account Management ──
  const handleAddAccount = useCallback(async () => {
    if (isDemo) { toast.info(t.demoConnectGoogle); return; }
    try {
      const newAccount = await authService.addAccount();
      const accounts = authService.getAccounts();
      setProfile(prev => ({
        ...prev!,
        accounts: accounts.map(a => ({ email: a.email, name: a.name, picture: a.picture, color: a.color })),
      }));
      toast.success(t.accountAdded);
      fetchData();
    } catch (e: any) {
      if (e.message !== "User cancelled") toast.error(e.message);
    }
  }, [isDemo, t, fetchData]);

  const handleRemoveAccount = useCallback((email: string) => {
    if (isDemo) return;
    const accounts = profile?.accounts || [];
    if (accounts.length <= 1) { toast.error(t.cannotRemoveLast); return; }
    authService.removeAccount(email);
    const remaining = authService.getAccounts();
    setProfile(prev => ({
      ...prev!,
      accounts: remaining.map(a => ({ email: a.email, name: a.name, picture: a.picture, color: a.color })),
    }));
    if (accountFilter === email) setAccountFilter("all");
    if (sendFromAccount === email && remaining.length > 0) setSendFromAccount(remaining[0].email);
    toast.success(t.accountRemoved);
    fetchData();
  }, [isDemo, profile, accountFilter, sendFromAccount, t, fetchData]);

  // ── Settings ──
  const handleSaveSettings = useCallback((newSettings: { aiModel: string; signature: string; theme: string }) => {
    setSettings(newSettings);
    saveSettingsToStorage(newSettings);
    applyTheme(newSettings.theme);
    toast.success(t.settingsSaved);
  }, [t]);

  const handleSaveApiKey = useCallback((key: string) => {
    gemini.setGeminiApiKey(key);
    setGeminiApiKeyState(key);
    toast.success(t.settingsSaved);
  }, [t]);

  // ── Reply ──
  const handleReply = useCallback((email: any) => {
    setComposeReplyTo(email);
    setShowCompose(true);
  }, []);

  // ── Logout ──
  const handleLogout = useCallback(() => {
    if (!isDemo) authService.logout();
    onLogout();
  }, [isDemo, onLogout]);

  // ── Workspace context for AI chat ──
  const workspaceContext = useCallback(() => {
    const emailSummaries = emails.slice(0, 20).map(e => {
      const from = e.payload?.headers?.find((h: any) => h.name === "From")?.value || "";
      const subject = e.payload?.headers?.find((h: any) => h.name === "Subject")?.value || "";
      const isUnread = e.labelIds?.includes("UNREAD");
      return `- [${isUnread ? "UNREAD" : "read"}] From: ${from} | Subject: ${subject} | Snippet: ${e.snippet || ""}`;
    }).join("\n");

    const eventSummaries = calendarEvents.slice(0, 20).map(ev => {
      const start = ev.start?.dateTime || ev.start?.date || "";
      return `- ${ev.summary} | ${start} | ${ev.location || "No location"} | ${ev.description || ""}`;
    }).join("\n");

    return `EMAILS (latest 20):\n${emailSummaries}\n\nCALENDAR EVENTS:\n${eventSummaries}`;
  }, [emails, calendarEvents]);

  // ── Mobile detection ──
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener("resize", handler);
    return () => window.removeEventListener("resize", handler);
  }, []);

  const tabs: { id: AppTab; icon: typeof Mail; label: string }[] = [
    { id: "mail", icon: Mail, label: t.mail },
    { id: "calendar", icon: CalendarIcon, label: t.calendar },
    { id: "ai", icon: Sparkles, label: t.aiChat },
  ];

  return (
    <div className="h-screen flex bg-[var(--bg)] overflow-hidden">
      {/* ── Desktop Left Sidebar ── */}
      {!isMobile && (
        <aside className="w-[60px] flex flex-col items-center py-4 gap-1 border-r border-[var(--border-light)] bg-[var(--frost)] backdrop-blur-sm flex-shrink-0 z-20">
          {/* Logo */}
          <div className="w-8 h-8 bg-[var(--blue)] rounded-[4px] flex items-center justify-center mb-4">
            <Sparkles className="size-4 text-white" />
          </div>

          {/* Nav tabs */}
          <nav className="flex flex-col items-center gap-1 flex-1">
            {tabs.map(({ id, icon: Icon, label }) => (
              <button
                key={id}
                onClick={() => setActiveTab(id)}
                title={label}
                className={`w-10 h-10 flex items-center justify-center rounded-[4px] t-transition ${
                  activeTab === id
                    ? "bg-[var(--blue-light)] text-[var(--blue)]"
                    : "text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-alt)]"
                }`}
              >
                <Icon className="size-5" />
              </button>
            ))}
          </nav>

          {/* Bottom actions */}
          <div className="flex flex-col items-center gap-1 mt-auto">
            <button
              onClick={() => onLangChange(lang === "en" ? "zh" : "en")}
              className="w-10 h-10 flex items-center justify-center text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-alt)] rounded-[4px] t-transition"
              title={lang === "en" ? "中文" : "English"}
            >
              <Languages className="size-4" />
            </button>
            <button
              onClick={() => setShowSettings(true)}
              className="w-10 h-10 flex items-center justify-center text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-alt)] rounded-[4px] t-transition"
              title={lang === "zh" ? "设置" : "Settings"}
            >
              <Settings className="size-4" />
            </button>
            <button
              onClick={handleLogout}
              className="w-10 h-10 flex items-center justify-center text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-alt)] rounded-[4px] t-transition"
              title={lang === "zh" ? "退出" : "Logout"}
            >
              <LogOut className="size-4" />
            </button>
          </div>
        </aside>
      )}

      {/* ── Right Content Area ── */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* ── Top Bar ── */}
        <header className="h-12 flex items-center justify-between px-4 border-b border-[var(--border-light)] bg-[var(--frost)] backdrop-blur-sm flex-shrink-0 z-20">
          {/* Mobile: logo + app name */}
          {isMobile && (
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 bg-[var(--blue)] rounded-[4px] flex items-center justify-center flex-shrink-0">
                <Sparkles className="size-4 text-white" />
              </div>
            </div>
          )}

          {/* Desktop: active tab label */}
          {!isMobile && (
            <h1 className="text-sm font-semibold text-[var(--text-primary)]">
              {tabs.find(t => t.id === activeTab)?.label}
            </h1>
          )}

          <div className="flex items-center gap-1">
            {/* Compose button */}
            {activeTab === "mail" && (
              <button
                onClick={() => { setComposeReplyTo(null); setShowCompose(true); }}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-white bg-[var(--blue)] hover:bg-[var(--blue-hover)] rounded-[4px] t-btn-transition"
              >
                <Plus className="size-4" />
                <span className="hidden sm:inline">{t.compose}</span>
              </button>
            )}
            {activeTab === "calendar" && (
              <button
                onClick={() => {
                  const now = new Date();
                  const end = new Date(now.getTime() + 3600000);
                  const fmt = (d: Date) => d.toISOString().slice(0, 16);
                  handleCreateEvent({ summary: lang === "zh" ? "新事件" : "New Event", start: fmt(now), end: fmt(end) });
                }}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-white bg-[var(--blue)] hover:bg-[var(--blue-hover)] rounded-[4px] t-btn-transition"
              >
                <Plus className="size-4" />
                <span className="hidden sm:inline">{t.newEvent}</span>
              </button>
            )}

            {/* Account filter */}
            {profile?.accounts && profile.accounts.length > 1 && (
              <select
                value={accountFilter}
                onChange={e => setAccountFilter(e.target.value)}
                className="h-8 px-2 text-sm bg-transparent border border-[var(--border-light)] rounded-[4px] text-[var(--text-body)] t-transition"
              >
                <option value="all">{t.allAccounts}</option>
                {profile.accounts.map(a => (
                  <option key={a.email} value={a.email}>{a.name}</option>
                ))}
              </select>
            )}

            {/* Mobile-only: language / settings / logout */}
            {isMobile && (
              <>
                <button
                  onClick={() => onLangChange(lang === "en" ? "zh" : "en")}
                  className="size-8 flex items-center justify-center text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-alt)] rounded-[4px] t-transition"
                  title={lang === "en" ? "中文" : "English"}
                >
                  <Languages className="size-4" />
                </button>
                <button
                  onClick={() => setShowSettings(true)}
                  className="size-8 flex items-center justify-center text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-alt)] rounded-[4px] t-transition"
                >
                  <Settings className="size-4" />
                </button>
                <button
                  onClick={handleLogout}
                  className="size-8 flex items-center justify-center text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-alt)] rounded-[4px] t-transition"
                >
                  <LogOut className="size-4" />
                </button>
              </>
            )}
          </div>
        </header>

        {/* ── Content ── */}
        <main className="flex-1 overflow-hidden">
          {activeTab === "mail" && (
            <MailView
              emails={emails}
              loading={loading}
              isDemo={isDemo}
              lang={lang}
              hasMore={hasMore}
              geminiApiKey={geminiApiKey}
              aiModel={settings.aiModel}
              signature={settings.signature}
              sendFromAccount={sendFromAccount}
              accounts={profile?.accounts || []}
              onSearch={handleSearch}
              onArchive={handleArchive}
              onTrash={handleTrash}
              onToggleRead={handleToggleRead}
              onReply={handleReply}
              onLoadMore={loadMore}
              onRefresh={() => fetchData(searchQuery)}
            />
          )}
          {activeTab === "calendar" && (
            <CalendarView
              events={calendarEvents}
              loading={loading}
              isDemo={isDemo}
              lang={lang}
              accounts={profile?.accounts || []}
              onCreateEvent={handleCreateEvent}
              onUpdateEvent={handleUpdateEvent}
              onDeleteEvent={handleDeleteEvent}
            />
          )}
          {activeTab === "ai" && (
            <ChatView
              isDemo={isDemo}
              lang={lang}
              geminiApiKey={geminiApiKey}
              aiModel={settings.aiModel}
              workspaceContext={workspaceContext()}
            />
          )}
        </main>

        {/* ── Mobile Bottom Nav ── */}
        {isMobile && (
          <nav className="h-14 flex items-center justify-around border-t border-[var(--border-light)] bg-[var(--frost)] backdrop-blur-sm flex-shrink-0 z-20 safe-area-pb">
            {tabs.map(({ id, icon: Icon, label }) => (
              <button
                key={id}
                onClick={() => setActiveTab(id)}
                className={`flex flex-col items-center gap-0.5 px-3 py-1 t-transition ${
                  activeTab === id ? "text-[var(--blue)]" : "text-[var(--text-tertiary)]"
                }`}
              >
                <Icon className="size-5" />
                <span className="text-[10px] font-medium">{label}</span>
              </button>
            ))}
          </nav>
        )}
      </div>

      {/* ── Modals ── */}
      {showSettings && (
        <SettingsPanel
          lang={lang}
          settings={settings}
          geminiApiKey={geminiApiKey}
          accounts={profile?.accounts || []}
          isDemo={isDemo}
          onSave={handleSaveSettings}
          onSaveApiKey={handleSaveApiKey}
          onAddAccount={handleAddAccount}
          onRemoveAccount={handleRemoveAccount}
          onClose={() => setShowSettings(false)}
        />
      )}

      {showCompose && (
        <ComposeModal
          lang={lang}
          isDemo={isDemo}
          replyTo={composeReplyTo}
          accounts={profile?.accounts || []}
          sendFromAccount={sendFromAccount}
          onSendFromChange={setSendFromAccount}
          signature={settings.signature}
          geminiApiKey={geminiApiKey}
          aiModel={settings.aiModel}
          onSend={handleSendEmail}
          onClose={() => { setShowCompose(false); setComposeReplyTo(null); }}
        />
      )}
    </div>
  );
}
