import { useState, useEffect, useRef, useCallback } from "react";
import { LayoutDashboard, Mail, Calendar as CalendarIcon, Sparkles, CheckSquare, Settings, LogOut, Languages, Plus, Search, ChevronDown, X, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { translations, type Language } from "../translations";
import * as authService from "../services/auth";
import * as gmail from "../services/gmail";
import * as calendarService from "../services/calendar";
import * as tasksService from "../services/tasks";
import * as gemini from "../services/gemini";
import type { StoredAccount, AccountSummary, UserProfile, ChatMessage } from "../types";
import type { TaskList, Task } from "../services/tasks";
import DashboardView from "./dashboard/DashboardView";
import MailView from "./mail/MailView";
import CalendarView from "./calendar/CalendarView";
import TasksView from "./tasks/TasksView";
import ChatView from "./chat/ChatView";
import SettingsPanel from "./settings/SettingsPanel";
import ComposeModal from "./mail/ComposeModal";

export type AppTab = "dashboard" | "mail" | "calendar" | "tasks" | "ai";

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

const MOCK_TASK_LISTS: (TaskList & { accountEmail: string; accountColor: string })[] = [
  { id: "list1", title: "My Tasks", accountEmail: DEMO_ACCOUNTS[0].email, accountColor: DEMO_ACCOUNTS[0].color },
  { id: "list2", title: "Work Projects", accountEmail: DEMO_ACCOUNTS[1].email, accountColor: DEMO_ACCOUNTS[1].color },
  { id: "list3", title: "Shopping", accountEmail: DEMO_ACCOUNTS[0].email, accountColor: DEMO_ACCOUNTS[0].color },
];

const MOCK_TASKS: Task[] = [
  { id: "t1", title: "Review project proposal", notes: "Check budget section and timeline estimates", status: "needsAction", due: new Date(Date.now() + 86400000).toISOString(), listId: "list1", accountEmail: DEMO_ACCOUNTS[0].email, accountColor: DEMO_ACCOUNTS[0].color },
  { id: "t2", title: "Send weekly report", status: "needsAction", due: new Date(Date.now() + 172800000).toISOString(), listId: "list1", accountEmail: DEMO_ACCOUNTS[0].email, accountColor: DEMO_ACCOUNTS[0].color },
  { id: "t3", title: "Schedule team meeting", status: "completed", completed: new Date().toISOString(), listId: "list1", accountEmail: DEMO_ACCOUNTS[0].email, accountColor: DEMO_ACCOUNTS[0].color },
  { id: "t4", title: "Update API documentation", notes: "Include new endpoints for v2", status: "needsAction", listId: "list1", accountEmail: DEMO_ACCOUNTS[0].email, accountColor: DEMO_ACCOUNTS[0].color },
  { id: "t5", title: "Fix login bug", status: "needsAction", due: new Date(Date.now() + 43200000).toISOString(), listId: "list1", accountEmail: DEMO_ACCOUNTS[0].email, accountColor: DEMO_ACCOUNTS[0].color },
  { id: "t6", title: "Prepare Q3 presentation", notes: "Include revenue charts and growth metrics", status: "needsAction", due: new Date(Date.now() + 259200000).toISOString(), listId: "list2", accountEmail: DEMO_ACCOUNTS[1].email, accountColor: DEMO_ACCOUNTS[1].color },
  { id: "t7", title: "Code review for PR #42", status: "needsAction", listId: "list2", accountEmail: DEMO_ACCOUNTS[1].email, accountColor: DEMO_ACCOUNTS[1].color },
  { id: "t8", title: "Deploy staging environment", status: "completed", completed: new Date(Date.now() - 86400000).toISOString(), listId: "list2", accountEmail: DEMO_ACCOUNTS[1].email, accountColor: DEMO_ACCOUNTS[1].color },
  { id: "t9", title: "Interview candidate", notes: "Senior frontend position, 2pm slot", status: "needsAction", due: new Date(Date.now() + 172800000).toISOString(), listId: "list2", accountEmail: DEMO_ACCOUNTS[1].email, accountColor: DEMO_ACCOUNTS[1].color },
  { id: "t10", title: "Buy groceries", notes: "Milk, eggs, bread, vegetables", status: "needsAction", listId: "list3", accountEmail: DEMO_ACCOUNTS[0].email, accountColor: DEMO_ACCOUNTS[0].color },
  { id: "t11", title: "Pick up dry cleaning", status: "needsAction", due: new Date(Date.now() + 86400000).toISOString(), listId: "list3", accountEmail: DEMO_ACCOUNTS[0].email, accountColor: DEMO_ACCOUNTS[0].color },
  { id: "t12", title: "Order new monitor", status: "completed", completed: new Date(Date.now() - 172800000).toISOString(), listId: "list3", accountEmail: DEMO_ACCOUNTS[0].email, accountColor: DEMO_ACCOUNTS[0].color },
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
  const [activeTab, setActiveTab] = useState<AppTab>("dashboard");
  const [emails, setEmails] = useState<any[]>([]);
  const [calendarEvents, setCalendarEvents] = useState<any[]>([]);
  const [taskLists, setTaskLists] = useState<(TaskList & { accountEmail: string; accountColor: string })[]>([]);
  const [taskItems, setTaskItems] = useState<Task[]>([]);
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

  // Navigate-to-email from AI chat
  const [targetEmailId, setTargetEmailId] = useState<string | null>(null);

  // Pagination
  const [pageTokens, setPageTokens] = useState<Record<string, string | null>>({});
  const [hasMore, setHasMore] = useState(false);

  // Abort
  const abortRef = useRef<AbortController | null>(null);
  const calendarCreateRef = useRef<(() => void) | null>(null);

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
      setTaskLists(MOCK_TASK_LISTS);
      setTaskItems(MOCK_TASKS);
      return;
    }

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    try {
      const accounts = authService.getAllValidAccounts();
      if (accounts.length === 0) return;

      const [mailResult, calResult, tasksResult] = await Promise.all([
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
        tasksService.fetchAllAccountTasks(accounts, {
          accountFilter: accountFilter !== "all" ? accountFilter : undefined,
          showCompleted: true,
          signal: controller.signal,
        }),
      ]);

      if (!controller.signal.aborted) {
        setEmails(mailResult.items);
        setPageTokens(mailResult.pageTokens);
        setHasMore(mailResult.hasMore);
        setCalendarEvents(calResult.items);
        setTaskLists(tasksResult.taskLists);
        setTaskItems(tasksResult.tasks);
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
    try {
      await authService.withFreshToken(sendFromAccount, token =>
        gmail.sendMessage(token, params)
      );
      toast.success(t.actionSuccess);
      setShowCompose(false);
      setComposeReplyTo(null);
    } catch {
      toast.error(t.actionFailed);
    }
  }, [isDemo, sendFromAccount, t]);

  // ── Calendar Actions ──
  const handleCreateEvent = useCallback(async (event: { summary: string; description?: string; location?: string; start: string; end: string }, accountEmail?: string) => {
    const targetAccount = accountEmail || sendFromAccount;
    if (isDemo) {
      const demoAcct = DEMO_ACCOUNTS.find(a => a.email === targetAccount) || DEMO_ACCOUNTS[0];
      const demoEvent = {
        id: `ev${Date.now()}`, summary: event.summary,
        start: { dateTime: new Date(event.start).toISOString() },
        end: { dateTime: new Date(event.end).toISOString() },
        description: event.description, location: event.location,
        accountEmail: demoAcct.email, accountColor: demoAcct.color,
      };
      setCalendarEvents(prev => [...prev, demoEvent].sort((a, b) => {
        const tA = new Date(a.start?.dateTime || a.start?.date || 0).getTime();
        const tB = new Date(b.start?.dateTime || b.start?.date || 0).getTime();
        return tA - tB;
      }));
      toast.success(t.actionSuccess);
      return;
    }
    try {
      const accounts = authService.getAccounts();
      const acct = accounts.find(a => a.email === targetAccount);
      const newEvent = await authService.withFreshToken(targetAccount, token =>
        calendarService.createEvent(token, event)
      );
      setCalendarEvents(prev => [...prev, { ...newEvent, accountEmail: targetAccount, accountColor: acct?.color }].sort((a, b) => {
        const tA = new Date(a.start?.dateTime || a.start?.date || 0).getTime();
        const tB = new Date(b.start?.dateTime || b.start?.date || 0).getTime();
        return tA - tB;
      }));
      toast.success(t.actionSuccess);
    } catch {
      toast.error(t.actionFailed);
    }
  }, [isDemo, sendFromAccount, t]);

  const handleUpdateEvent = useCallback(async (eventId: string, event: { summary?: string; description?: string; location?: string; start?: string; end?: string }) => {
    if (isDemo) { toast.success(t.actionSuccess); return; }
    const existing = calendarEvents.find(e => e.id === eventId);
    const account = existing?.accountEmail || sendFromAccount;
    const updated = await authService.withFreshToken(account, token =>
      calendarService.updateEvent(token, eventId, event)
    );
    setCalendarEvents(prev => prev.map(e => e.id === eventId ? { ...updated, accountEmail: e.accountEmail, accountColor: e.accountColor } : e));
    toast.success(t.actionSuccess);
  }, [isDemo, calendarEvents, sendFromAccount, t]);

  const handleDeleteEvent = useCallback(async (eventId: string) => {
    if (isDemo) { toast.success(t.actionSuccess); return; }
    const event = calendarEvents.find(e => e.id === eventId);
    if (!event) return;
    try {
      await authService.withFreshToken(event.accountEmail || sendFromAccount, token =>
        calendarService.deleteEvent(token, eventId)
      );
      setCalendarEvents(prev => prev.filter(e => e.id !== eventId));
      toast.success(t.actionSuccess);
    } catch {
      toast.error(t.actionFailed);
    }
  }, [isDemo, calendarEvents, sendFromAccount, t]);

  // ── Tasks Actions ──
  const handleToggleTask = useCallback(async (listId: string, taskId: string, isCompleted: boolean) => {
    if (isDemo) {
      setTaskItems(prev => prev.map(t => t.id === taskId ? {
        ...t,
        status: isCompleted ? "needsAction" as const : "completed" as const,
        completed: isCompleted ? undefined : new Date().toISOString(),
      } : t));
      toast.success(isCompleted ? t.taskUncompleted : t.taskCompleted);
      return;
    }
    const task = taskItems.find(t => t.id === taskId);
    if (!task) return;
    try {
      await authService.withFreshToken(task.accountEmail!, token =>
        tasksService.updateTask(token, listId, taskId, isCompleted
          ? { status: "needsAction", completed: null as any }
          : { status: "completed" }
        )
      );
      setTaskItems(prev => prev.map(t => t.id === taskId ? {
        ...t,
        status: isCompleted ? "needsAction" as const : "completed" as const,
        completed: isCompleted ? undefined : new Date().toISOString(),
      } : t));
      toast.success(isCompleted ? t.taskUncompleted : t.taskCompleted);
    } catch { toast.error(t.actionFailed); }
  }, [isDemo, taskItems, t]);

  const handleCreateTask = useCallback(async (listId: string, task: { title: string; notes?: string; due?: string }) => {
    if (isDemo) {
      const list = taskLists.find(l => l.id === listId);
      const newTask: Task = {
        id: `t${Date.now()}`,
        title: task.title,
        notes: task.notes,
        due: task.due,
        status: "needsAction",
        listId,
        accountEmail: list?.accountEmail || DEMO_ACCOUNTS[0].email,
        accountColor: list?.accountColor || DEMO_ACCOUNTS[0].color,
      };
      setTaskItems(prev => [newTask, ...prev]);
      toast.success(t.actionSuccess);
      return;
    }
    const list = taskLists.find(l => l.id === listId);
    if (!list) return;
    try {
      const created = await authService.withFreshToken(list.accountEmail, token =>
        tasksService.createTask(token, listId, task)
      );
      setTaskItems(prev => [{ ...created, listId, accountEmail: list.accountEmail, accountColor: list.accountColor }, ...prev]);
      toast.success(t.actionSuccess);
    } catch { toast.error(t.actionFailed); }
  }, [isDemo, taskLists, t]);

  const handleDeleteTask = useCallback(async (listId: string, taskId: string) => {
    if (isDemo) {
      setTaskItems(prev => prev.filter(t => t.id !== taskId));
      toast.success(t.actionSuccess);
      return;
    }
    const task = taskItems.find(t => t.id === taskId);
    if (!task) return;
    try {
      await authService.withFreshToken(task.accountEmail!, token =>
        tasksService.deleteTask(token, listId, taskId)
      );
      setTaskItems(prev => prev.filter(t => t.id !== taskId));
      toast.success(t.actionSuccess);
    } catch { toast.error(t.actionFailed); }
  }, [isDemo, taskItems, t]);

  const handleCreateTaskList = useCallback(async (title: string, accountEmail?: string) => {
    const targetAccount = accountEmail || sendFromAccount;
    if (isDemo) {
      const demoAcct = DEMO_ACCOUNTS.find(a => a.email === targetAccount) || DEMO_ACCOUNTS[0];
      const newList = {
        id: `list${Date.now()}`,
        title,
        accountEmail: demoAcct.email,
        accountColor: demoAcct.color,
      };
      setTaskLists(prev => [...prev, newList]);
      toast.success(t.actionSuccess);
      return;
    }
    try {
      const created = await authService.withFreshToken(targetAccount, token =>
        tasksService.createTaskList(token, title)
      );
      const accounts = authService.getAccounts();
      const acct = accounts.find(a => a.email === targetAccount);
      setTaskLists(prev => [...prev, { ...created, accountEmail: targetAccount, accountColor: acct?.color || "#4285f4" }]);
      toast.success(t.actionSuccess);
    } catch { toast.error(t.actionFailed); }
  }, [isDemo, sendFromAccount, t]);

  const handleDeleteTaskList = useCallback(async (listId: string) => {
    if (isDemo) {
      setTaskLists(prev => prev.filter(l => l.id !== listId));
      toast.success(t.actionSuccess);
      return;
    }
    const list = taskLists.find(l => l.id === listId);
    if (!list) return;
    try {
      await authService.withFreshToken(list.accountEmail, token =>
        tasksService.deleteTaskList(token, listId)
      );
      setTaskLists(prev => prev.filter(l => l.id !== listId));
      setTaskItems(prev => prev.filter(t => t.listId !== listId));
      toast.success(t.actionSuccess);
    } catch { toast.error(t.actionFailed); }
  }, [isDemo, taskLists, t]);

  const handleClearCompleted = useCallback(async (listId: string) => {
    if (isDemo) {
      setTaskItems(prev => prev.filter(t => !(t.listId === listId && t.status === "completed")));
      toast.success(t.actionSuccess);
      return;
    }
    const list = taskLists.find(l => l.id === listId);
    if (!list) return;
    try {
      await authService.withFreshToken(list.accountEmail, token =>
        tasksService.clearCompleted(token, listId)
      );
      setTaskItems(prev => prev.filter(t => !(t.listId === listId && t.status === "completed")));
      toast.success(t.actionSuccess);
    } catch { toast.error(t.actionFailed); }
  }, [isDemo, taskLists, t]);

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

  // ── Navigate to specific email from AI chat ──
  const handleNavigateToEmail = useCallback((emailId: string) => {
    setTargetEmailId(emailId);
    setActiveTab("mail");
  }, []);

  // ── Logout ──
  const handleLogout = useCallback(() => {
    if (!isDemo) authService.logout();
    onLogout();
  }, [isDemo, onLogout]);

  // ── Workspace context for AI chat ──
  const workspaceContext = useCallback(() => {
    const emailSummaries = emails.slice(0, 20).map(e => {
      const from = e.payload?.headers?.find((h: any) => h.name?.toLowerCase() === "from")?.value || "";
      const subject = e.payload?.headers?.find((h: any) => h.name?.toLowerCase() === "subject")?.value || "";
      const isUnread = e.labelIds?.includes("UNREAD");
      return `- [${isUnread ? "UNREAD" : "read"}] From: ${from} | Subject: ${subject} | Snippet: ${e.snippet || ""}`;
    }).join("\n");

    const eventSummaries = calendarEvents.slice(0, 20).map(ev => {
      const start = ev.start?.dateTime || ev.start?.date || "";
      return `- ${ev.summary} | ${start} | ${ev.location || "No location"} | ${ev.description || ""}`;
    }).join("\n");

    const taskSummaries = taskItems.filter(t => t.status === "needsAction").slice(0, 20).map(t => {
      const due = t.due ? new Date(t.due).toLocaleDateString() : "no due date";
      return `- ${t.title} | Due: ${due}${t.notes ? ` | Notes: ${t.notes}` : ""}`;
    }).join("\n");

    return `EMAILS (latest 20):\n${emailSummaries}\n\nCALENDAR EVENTS:\n${eventSummaries}\n\nTASKS (pending):\n${taskSummaries}`;
  }, [emails, calendarEvents, taskItems]);

  // ── AI Action Executor (function calling) ──
  const executeAction = useCallback(async (name: string, args: Record<string, any>): Promise<{ success: boolean; message: string }> => {
    try {
      switch (name) {
        // ── Tasks ──
        case "create_task": {
          const list = args.listName
            ? taskLists.find(l => l.title.toLowerCase().includes(args.listName.toLowerCase()))
            : taskLists[0];
          if (!list) return { success: false, message: "Task list not found" };

          if (isDemo) {
            const newTask = {
              id: `t${Date.now()}`, title: args.title, notes: args.notes,
              due: args.due ? `${args.due}T00:00:00.000Z` : undefined,
              status: "needsAction" as const,
              listId: list.id,
              accountEmail: list.accountEmail, accountColor: list.accountColor,
            };
            setTaskItems(prev => [newTask, ...prev]);
          } else {
            const created = await authService.withFreshToken(list.accountEmail, token =>
              tasksService.createTask(token, list.id, {
                title: args.title, notes: args.notes,
                due: args.due ? `${args.due}T00:00:00.000Z` : undefined,
              })
            );
            setTaskItems(prev => [{ ...created, listId: list.id, accountEmail: list.accountEmail, accountColor: list.accountColor }, ...prev]);
          }
          return { success: true, message: `Task "${args.title}" created in "${list.title}"` };
        }
        case "complete_task": {
          const task = taskItems.find(t =>
            t.status === "needsAction" && t.title.toLowerCase().includes(args.title.toLowerCase())
          );
          if (!task) return { success: false, message: `No pending task matching "${args.title}" found` };

          const listForComplete = task.listId ? taskLists.find(l => l.id === task.listId) : taskLists.find(l => l.accountEmail === task.accountEmail);
          if (!isDemo && listForComplete) {
            await authService.withFreshToken(task.accountEmail!, token =>
              tasksService.updateTask(token, listForComplete.id, task.id, { status: "completed" })
            );
          }
          setTaskItems(prev => prev.map(t => t.id === task.id ? { ...t, status: "completed" as const, completed: new Date().toISOString() } : t));
          return { success: true, message: `Task "${task.title}" marked as completed` };
        }
        case "delete_task": {
          const task = taskItems.find(t =>
            t.title.toLowerCase().includes(args.title.toLowerCase())
          );
          if (!task) return { success: false, message: `No task matching "${args.title}" found` };

          const listForDelete = task.listId ? taskLists.find(l => l.id === task.listId) : taskLists.find(l => l.accountEmail === task.accountEmail);
          if (!isDemo && listForDelete) {
            await authService.withFreshToken(task.accountEmail!, token =>
              tasksService.deleteTask(token, listForDelete.id, task.id)
            );
          }
          setTaskItems(prev => prev.filter(t => t.id !== task.id));
          return { success: true, message: `Task "${task.title}" deleted` };
        }
        // ── Calendar ──
        case "create_event": {
          if (isDemo) {
            const newEvent = {
              id: `ev${Date.now()}`, summary: args.summary,
              start: { dateTime: new Date(args.start).toISOString() },
              end: { dateTime: new Date(args.end).toISOString() },
              description: args.description, location: args.location,
              accountEmail: DEMO_ACCOUNTS[0].email, accountColor: DEMO_ACCOUNTS[0].color,
            };
            setCalendarEvents(prev => [...prev, newEvent]);
          } else {
            const newEvent = await authService.withFreshToken(sendFromAccount, token =>
              calendarService.createEvent(token, {
                summary: args.summary, start: args.start, end: args.end,
                description: args.description, location: args.location,
              })
            );
            setCalendarEvents(prev => [...prev, { ...newEvent, accountEmail: sendFromAccount }]);
          }
          return { success: true, message: `Event "${args.summary}" created` };
        }
        case "delete_event": {
          const event = calendarEvents.find((e: any) =>
            e.summary?.toLowerCase().includes(args.title.toLowerCase())
          );
          if (!event) return { success: false, message: `No event matching "${args.title}" found` };

          if (!isDemo) {
            await authService.withFreshToken(event.accountEmail || sendFromAccount, token =>
              calendarService.deleteEvent(token, event.id)
            );
          }
          setCalendarEvents(prev => prev.filter((e: any) => e.id !== event.id));
          return { success: true, message: `Event "${event.summary}" deleted` };
        }
        // ── Email ──
        case "send_email": {
          if (isDemo) {
            return { success: true, message: `Email to "${args.to}" simulated (demo mode)` };
          }
          await authService.withFreshToken(sendFromAccount, token =>
            gmail.sendMessage(token, {
              to: args.to, subject: args.subject, body: args.body, cc: args.cc,
            })
          );
          return { success: true, message: `Email sent to "${args.to}" with subject "${args.subject}"` };
        }
        case "archive_email": {
          const email = emails.find((e: any) => {
            const subject = e.payload?.headers?.find((h: any) => h.name?.toLowerCase() === "subject")?.value || "";
            return subject.toLowerCase().includes(args.subject.toLowerCase());
          });
          if (!email) return { success: false, message: `No email matching "${args.subject}" found` };

          if (!isDemo) {
            await authService.withFreshToken(email.accountEmail, token =>
              gmail.modifyMessage(token, email.id, { removeLabelIds: ["INBOX"] })
            );
          }
          setEmails(prev => prev.filter((e: any) => e.id !== email.id));
          return { success: true, message: `Email "${args.subject}" archived` };
        }
        case "trash_email": {
          const email = emails.find((e: any) => {
            const subject = e.payload?.headers?.find((h: any) => h.name?.toLowerCase() === "subject")?.value || "";
            return subject.toLowerCase().includes(args.subject.toLowerCase());
          });
          if (!email) return { success: false, message: `No email matching "${args.subject}" found` };

          if (!isDemo) {
            await authService.withFreshToken(email.accountEmail, token =>
              gmail.trashMessage(token, email.id)
            );
          }
          setEmails(prev => prev.filter((e: any) => e.id !== email.id));
          return { success: true, message: `Email "${args.subject}" moved to trash` };
        }
        default:
          return { success: false, message: `Unknown action: ${name}` };
      }
    } catch (e: any) {
      return { success: false, message: e.message || "Action failed" };
    }
  }, [isDemo, emails, calendarEvents, taskItems, taskLists, sendFromAccount]);

  // ── Mobile detection ──
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener("resize", handler);
    return () => window.removeEventListener("resize", handler);
  }, []);

  const tabs: { id: AppTab; icon: typeof Mail; label: string }[] = [
    { id: "dashboard", icon: LayoutDashboard, label: t.dashboard },
    { id: "mail", icon: Mail, label: t.mail },
    { id: "calendar", icon: CalendarIcon, label: t.calendar },
    { id: "tasks", icon: CheckSquare, label: t.tasks },
    { id: "ai", icon: Sparkles, label: t.aiChat },
  ];

  return (
    <div className="h-dvh flex bg-[var(--bg)] overflow-hidden">
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
              <div key={id} className="relative group">
                <button
                  onClick={() => setActiveTab(id)}
                  className={`w-10 h-10 flex items-center justify-center rounded-[4px] t-transition ${
                    activeTab === id
                      ? "bg-[var(--blue-light)] text-[var(--blue)]"
                      : "text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-alt)]"
                  }`}
                >
                  <Icon className="size-5" />
                </button>
                {/* Tooltip */}
                <div className="absolute left-full top-1/2 -translate-y-1/2 ml-2 px-2.5 py-1 bg-[var(--text-primary)] text-[var(--bg)] text-xs font-medium rounded-[4px] whitespace-nowrap opacity-0 pointer-events-none group-hover:opacity-100 t-transition z-50">
                  {label}
                </div>
              </div>
            ))}
          </nav>

          {/* Bottom actions */}
          <div className="flex flex-col items-center gap-1 mt-auto">
            {[
              { onClick: () => onLangChange(lang === "en" ? "zh" : "en"), icon: Languages, tip: lang === "en" ? "中文" : "English" },
              { onClick: () => setShowSettings(true), icon: Settings, tip: t.settings },
              { onClick: handleLogout, icon: LogOut, tip: t.logout },
            ].map(({ onClick, icon: Icon, tip }) => (
              <div key={tip} className="relative group">
                <button
                  onClick={onClick}
                  className="w-10 h-10 flex items-center justify-center text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-alt)] rounded-[4px] t-transition"
                >
                  <Icon className="size-4" />
                </button>
                <div className="absolute left-full top-1/2 -translate-y-1/2 ml-2 px-2.5 py-1 bg-[var(--text-primary)] text-[var(--bg)] text-xs font-medium rounded-[4px] whitespace-nowrap opacity-0 pointer-events-none group-hover:opacity-100 t-transition z-50">
                  {tip}
                </div>
              </div>
            ))}
          </div>
        </aside>
      )}

      {/* ── Right Content Area ── */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* ── Top Bar ── */}
        <header className={`${isMobile ? "h-11" : "h-12"} flex items-center justify-between px-3 sm:px-4 border-b border-[var(--border-light)] bg-[var(--frost)] backdrop-blur-sm flex-shrink-0 z-20`}>
          {/* Mobile: logo + tab title */}
          {isMobile && (
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 bg-[var(--blue)] rounded-[4px] flex items-center justify-center flex-shrink-0">
                <Sparkles className="size-4 text-white" />
              </div>
              <h1 className="text-sm font-semibold text-[var(--text-primary)]">
                {tabs.find(t => t.id === activeTab)?.label}
              </h1>
            </div>
          )}

          {/* Desktop: active tab label */}
          {!isMobile && (
            <h1 className="text-sm font-semibold text-[var(--text-primary)]">
              {tabs.find(t => t.id === activeTab)?.label}
            </h1>
          )}

          <div className="flex items-center gap-1">
            {/* Compose / Create button */}
            {activeTab === "mail" && (
              <button
                onClick={() => { setComposeReplyTo(null); setShowCompose(true); }}
                className={`flex items-center gap-1.5 ${isMobile ? "size-9 justify-center" : "px-3 py-1.5"} text-sm font-medium text-white bg-[var(--blue)] hover:bg-[var(--blue-hover)] rounded-[4px] t-btn-transition`}
              >
                <Plus className="size-4" />
                {!isMobile && <span>{t.compose}</span>}
              </button>
            )}
            {activeTab === "calendar" && (
              <button
                onClick={() => { calendarCreateRef.current?.(); }}
                className={`flex items-center gap-1.5 ${isMobile ? "size-9 justify-center" : "px-3 py-1.5"} text-sm font-medium text-white bg-[var(--blue)] hover:bg-[var(--blue-hover)] rounded-[4px] t-btn-transition`}
              >
                <Plus className="size-4" />
                {!isMobile && <span>{t.newEvent}</span>}
              </button>
            )}

            {/* Account filter */}
            {profile?.accounts && profile.accounts.length > 1 && (
              <select
                value={accountFilter}
                onChange={e => setAccountFilter(e.target.value)}
                className={`${isMobile ? "h-9 px-1.5 text-xs max-w-[100px]" : "h-8 px-2 text-sm"} bg-transparent border border-[var(--border-light)] rounded-[4px] text-[var(--text-body)] t-transition`}
              >
                <option value="all">{t.allAccounts}</option>
                {profile.accounts.map(a => (
                  <option key={a.email} value={a.email}>{a.name}</option>
                ))}
              </select>
            )}

            {/* Mobile-only: settings / logout */}
            {isMobile && (
              <>
                <button
                  onClick={() => setShowSettings(true)}
                  className="size-9 flex items-center justify-center text-[var(--text-tertiary)] active:bg-[var(--bg-alt)] rounded-[4px] t-transition"
                >
                  <Settings className="size-[18px]" />
                </button>
              </>
            )}
          </div>
        </header>

        {/* ── Content ── */}
        <main className="flex-1 overflow-hidden">
          {activeTab === "dashboard" && (
            <DashboardView
              emails={emails}
              calendarEvents={calendarEvents}
              taskItems={taskItems}
              taskLists={taskLists}
              loading={loading}
              lang={lang}
              onNavigate={setActiveTab}
            />
          )}
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
              initialEmailId={targetEmailId}
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
              sendFromAccount={sendFromAccount}
              onCreateEvent={handleCreateEvent}
              onUpdateEvent={handleUpdateEvent}
              onDeleteEvent={handleDeleteEvent}
              onRegisterCreate={(fn) => { calendarCreateRef.current = fn; }}
            />
          )}
          {activeTab === "tasks" && (
            <TasksView
              taskLists={taskLists}
              tasks={taskItems}
              loading={loading}
              isDemo={isDemo}
              lang={lang}
              accounts={profile?.accounts || []}
              onToggleTask={handleToggleTask}
              onCreateTask={handleCreateTask}
              onDeleteTask={handleDeleteTask}
              onCreateList={handleCreateTaskList}
              onDeleteList={handleDeleteTaskList}
              onClearCompleted={handleClearCompleted}
              onRefresh={() => fetchData(searchQuery)}
            />
          )}
          {activeTab === "ai" && (
            <ChatView
              isDemo={isDemo}
              lang={lang}
              geminiApiKey={geminiApiKey}
              aiModel={settings.aiModel}
              workspaceContext={workspaceContext()}
              emails={emails}
              executeAction={executeAction}
              onOpenSettings={() => setShowSettings(true)}
              onNavigateToEmail={handleNavigateToEmail}
            />
          )}
        </main>

        {/* ── Mobile Bottom Nav ── */}
        {isMobile && (
          <nav className="flex items-stretch justify-around border-t border-[var(--border-light)] bg-[var(--frost)] backdrop-blur-sm flex-shrink-0 z-20 safe-area-pb">
            {tabs.map(({ id, icon: Icon, label }) => (
              <button
                key={id}
                onClick={() => setActiveTab(id)}
                className={`flex-1 flex flex-col items-center justify-center gap-0.5 py-2 min-h-[52px] t-transition relative active:bg-[var(--bg-alt)] ${
                  activeTab === id ? "text-[var(--blue)]" : "text-[var(--text-quaternary)]"
                }`}
              >
                {activeTab === id && (
                  <div className="absolute top-0 left-1/2 -translate-x-1/2 w-5 h-[2px] bg-[var(--blue)] rounded-full" />
                )}
                <Icon className="size-[22px]" />
                <span className="text-[10px] font-medium leading-none">{label}</span>
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
          onLangChange={onLangChange}
          onLogout={handleLogout}
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
