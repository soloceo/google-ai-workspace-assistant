import React, { Component, useState, useEffect, useRef, useCallback, useMemo } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Mail,
  Calendar as CalendarIcon,
  Sparkles,
  Search,
  Plus,
  Settings,
  Clock,
  CheckCircle2,
  MessageSquare,
  RefreshCw,
  LogOut,
  Languages,
  X,
  Archive,
  Trash2,
  MailOpen,
  Mail as MailIcon,
  Pencil,
  CheckSquare,
  Square,
  Paperclip,
  FileText,
  Image,
  File,
  Send,
  Bot,
  User,
  Download,
  ExternalLink,
  ArrowLeft,
  ChevronDown,
  Eye,
  ZoomIn,
  Star,
  Loader2,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { translations, Language } from "../translations";
import * as authService from '../services/auth';
import * as gmail from '../services/gmail';
import * as calendarService from '../services/calendar';
import * as gemini from '../services/gemini';
import { base64ToBlob } from '../services/apiHelpers';
import type { ChatMessage, Email, CalendarEvent, AccountSummary, UserProfile } from '../types';

type AppTab = "mail" | "calendar" | "ai";

// Demo accounts for multi-account showcase
const DEMO_ACCOUNTS: AccountSummary[] = [
  { email: "me@gmail.com", name: "My Gmail", color: "#ea4335" },
  { email: "work@company.com", name: "Work Account", color: "#4285f4" },
];

// Generate 50+ mock emails for realistic scroll testing
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

const MOCK_ATTACHMENTS: Record<number, any[]> = {
  0: [{ filename: "Proposal_v2.pdf", mimeType: "application/pdf", body: { size: 2456000, attachmentId: "demo-att-1" } }],
  4: [
    { filename: "meeting-notes.docx", mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", body: { size: 145000, attachmentId: "demo-att-2" } },
    { filename: "timeline.xlsx", mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", body: { size: 89000, attachmentId: "demo-att-3" } },
  ],
  7: [{ filename: "mockup-v3.png", mimeType: "image/png", body: { size: 3200000, attachmentId: "demo-att-4" } }],
};

const MOCK_EMAILS: any[] = Array.from({ length: 50 }, (_, i) => {
  const acct = DEMO_ACCOUNTS[i % 2]; // Alternate between 2 demo accounts
  return {
    id: String(i + 1),
    snippet: MOCK_SNIPPETS[i % MOCK_SNIPPETS.length],
    labelIds: i % 3 === 0 ? ["UNREAD", "INBOX"] : ["INBOX"],
    accountEmail: acct.email,
    accountColor: acct.color,
    payload: {
      headers: [
        { name: "From", value: MOCK_SENDERS[i % MOCK_SENDERS.length] },
        { name: "Subject", value: MOCK_SUBJECTS[i % MOCK_SUBJECTS.length] + (i > 25 ? ` (${i})` : "") },
        { name: "Date", value: new Date(Date.now() - i * 3600000).toUTCString() },
        { name: "Message-ID", value: `<mock${i + 1}@example.com>` },
      ],
      ...(MOCK_ATTACHMENTS[i] ? { parts: MOCK_ATTACHMENTS[i] } : {}),
    },
  };
});

const MOCK_EVENTS: any[] = [
  {
    id: "1",
    summary: "Team Sync",
    start: { dateTime: new Date().toISOString() },
    end: { dateTime: new Date(Date.now() + 3600000).toISOString() },
    description: "Weekly sync with the engineering team. Discuss sprint progress and blockers.",
    accountEmail: DEMO_ACCOUNTS[1].email,
    accountColor: DEMO_ACCOUNTS[1].color,
  },
  {
    id: "2",
    summary: "Design Review",
    start: { dateTime: new Date(Date.now() + 3600000).toISOString() },
    end: { dateTime: new Date(Date.now() + 7200000).toISOString() },
    description: "Reviewing the new workspace UI mockups with the design team.",
    accountEmail: DEMO_ACCOUNTS[0].email,
    accountColor: DEMO_ACCOUNTS[0].color,
  },
  {
    id: "3",
    summary: "1:1 with Manager",
    start: { dateTime: new Date(Date.now() + 86400000).toISOString() },
    end: { dateTime: new Date(Date.now() + 86400000 + 1800000).toISOString() },
    description: "Weekly 1:1 catch-up. Topics: career growth, project priorities.",
    location: "Meeting Room A",
    accountEmail: DEMO_ACCOUNTS[1].email,
    accountColor: DEMO_ACCOUNTS[1].color,
  },
];

// Settings persistence
function loadSettings() {
  try {
    const saved = localStorage.getItem("workspace_settings");
    if (saved) return JSON.parse(saved);
  } catch (_) {}
  return { aiModel: "gemini-2.5-flash", signature: "", theme: "light" as "light" | "dark" | "system" };
}

function applyTheme(theme: string) {
  const root = document.documentElement;
  if (theme === "dark" || (theme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches)) {
    root.classList.add("dark");
  } else {
    root.classList.remove("dark");
  }
}

function saveSettingsToStorage(s: { aiModel: string; signature: string; theme: string }) {
  localStorage.setItem("workspace_settings", JSON.stringify(s));
}

// Decode email body
function decodeEmailBody(payload: any): { html: string; text: string } {
  if (!payload) return { html: "", text: "" };
  let bodyText = "";
  let bodyHtml = "";

  const decodeBase64 = (str: string) => {
    try {
      let b64 = str.replace(/-/g, "+").replace(/_/g, "/");
      while (b64.length % 4) b64 += "=";
      const decoded = atob(b64);
      const bytes = new Uint8Array(decoded.length);
      for (let i = 0; i < decoded.length; i++) bytes[i] = decoded.charCodeAt(i);
      return new TextDecoder("utf-8").decode(bytes);
    } catch (_) {
      return "";
    }
  };

  const getBody = (part: any) => {
    if (part.body?.data) {
      const decoded = decodeBase64(part.body.data);
      if (part.mimeType === "text/html") bodyHtml = decoded;
      else if (part.mimeType === "text/plain") bodyText = decoded;
    }
    if (part.parts) part.parts.forEach(getBody);
  };

  getBody(payload);
  return { html: bodyHtml, text: bodyText };
}

// Sanitize HTML — strip scripts, styles, event handlers, and dangerous elements
const sanitizeHtml = (html: string): string => {
  // Strip all script/style/event handlers, rely on iframe sandbox for isolation
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/\son\w+="[^"]*"/gi, "")
    .replace(/\son\w+='[^']*'/gi, "")
    .replace(/\son\w+=\S+/gi, "")
    .replace(/javascript:/gi, "blocked:")
    .replace(/data:\s*text\/html/gi, "blocked:")
    .replace(/<iframe[\s\S]*?<\/iframe>/gi, "")
    .replace(/<object[\s\S]*?<\/object>/gi, "")
    .replace(/<embed[\s\S]*?>/gi, "")
    .replace(/<form[\s\S]*?<\/form>/gi, "");
};

// @ts-ignore — React types not installed; runtime class works fine
class ErrorBoundary extends Component<
  { children: React.ReactNode },
  { hasError: boolean }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    // @ts-ignore
    this.state = { hasError: false };
  }
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  render() {
    // @ts-ignore
    if (this.state.hasError) {
      return (
        <div className="h-screen flex items-center justify-center bg-gm-bg">
          <div className="text-center space-y-4">
            <p className="text-xl text-gm-text-primary">Something went wrong</p>
            <button
              onClick={() => {
                // @ts-ignore
                this.setState({ hasError: false });
                window.location.reload();
              }}
              className="px-4 py-2 bg-[#1a73e8] text-white rounded-lg"
            >
              Reload
            </button>
          </div>
        </div>
      );
    }
    // @ts-ignore
    return this.props.children;
  }
}

export default function WorkspaceAssistant({
  isDemo = false,
  lang,
  onLangChange,
  onLogout: onLogoutProp,
}: {
  isDemo?: boolean;
  lang: Language;
  onLangChange: (l: Language) => void;
  onLogout?: () => void;
}) {
  const [activeTab, setActiveTab] = useState<AppTab>("ai");
  const [data, setData] = useState<{
    mail: any[];
    calendar: any[];
  }>({ mail: [], calendar: [] });
  const [loading, setLoading] = useState(true);
  const [selectedItem, setSelectedItem] = useState<any>(null);
  const [aiInsights, setAiInsights] = useState<{ summary: string; action: string } | null>(null);
  const [processing, setProcessing] = useState(false);

  // Compose / Reply
  const [isReplying, setIsReplying] = useState(false);
  const [replyContent, setReplyContent] = useState("");
  const [sendingReply, setSendingReply] = useState(false);
  const [isComposingNew, setIsComposingNew] = useState(false);
  const [composeTo, setComposeTo] = useState("");
  const [composeCc, setComposeCc] = useState("");
  const [composeBcc, setComposeBcc] = useState("");
  const [composeSubject, setComposeSubject] = useState("");
  const [composeBody, setComposeBody] = useState("");
  const [composeStart, setComposeStart] = useState("");
  const [composeEnd, setComposeEnd] = useState("");
  const [showCcBcc, setShowCcBcc] = useState(false);

  // Attachments for compose & reply
  const [composeAttachments, setComposeAttachments] = useState<File[]>([]);
  const [replyAttachments, setReplyAttachments] = useState<File[]>([]);

  // Attachment analysis state
  const [attachmentAnalysis, setAttachmentAnalysis] = useState<Record<string, { loading: boolean; result: any }>>({});

  // Attachment lightbox state
  const [lightbox, setLightbox] = useState<{ src: string; type: "image" | "pdf" } | null>(null);

  // AI Draft
  const [isDrafting, setIsDrafting] = useState(false);
  const [draftPrompt, setDraftPrompt] = useState("");
  const [showDraftInput, setShowDraftInput] = useState(false);
  const [draftTarget, setDraftTarget] = useState<"compose" | "reply" | null>(null);

  // Search
  const [searchQuery, setSearchQuery] = useState("");
  const [isSearching, setIsSearching] = useState(false);

  // Label/Folder Navigation (Feature 9)
  const [activeLabel, setActiveLabel] = useState("INBOX");
  const [labels, setLabels] = useState<{id: string, name: string, type: string, accountEmail?: string}[]>([]);

  // Email Classifications (Feature 16)
  const [emailClassifications, setEmailClassifications] = useState<Record<string, {priority: string, category: string}>>({});

  // Settings
  const [showSettings, setShowSettings] = useState(false);
  const [settings, setSettings] = useState(loadSettings);
  const [geminiApiKey, setGeminiApiKeyState] = useState(gemini.getGeminiApiKey());

  // Apply theme on mount and when changed
  useEffect(() => {
    applyTheme(settings.theme);
  }, [settings.theme]);

  // Listen for system theme changes
  useEffect(() => {
    if (settings.theme !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = () => applyTheme("system");
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, [settings.theme]);

  // Pagination — multi-account: map of accountEmail → pageToken
  const [pageTokens, setPageTokens] = useState<{ mail: Record<string, string | null>; calendar: Record<string, string | null> }>({ mail: {}, calendar: {} });
  const [loadingMore, setLoadingMore] = useState(false);

  // Infinite scroll sentinel ref
  const sentinelRef = useRef<HTMLDivElement>(null);

  // Batch selection
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [batchMode, setBatchMode] = useState(false);

  // AI Chat — with localStorage persistence
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>(() => {
    try {
      const saved = localStorage.getItem("ai_chat_history");
      if (saved) {
        const parsed = JSON.parse(saved);
        return parsed.map((m: any) => ({ ...m, timestamp: new Date(m.timestamp) }));
      }
    } catch {}
    return [];
  });
  const [chatInput, setChatInput] = useState("");
  const [chatStreaming, setChatStreaming] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Persist chat history (debounced)
  useEffect(() => {
    if (chatStreaming) return; // Don't save mid-stream
    const timer = setTimeout(() => {
      // Keep last 50 messages to avoid localStorage bloat
      const toSave = chatMessages.slice(-50);
      localStorage.setItem("ai_chat_history", JSON.stringify(toSave));
    }, 500);
    return () => clearTimeout(timer);
  }, [chatMessages, chatStreaming]);

  // Confirm dialog
  const [confirmAction, setConfirmAction] = useState<{ message: string; onConfirm: () => void } | null>(null);

  // Calendar editing
  const [editingEvent, setEditingEvent] = useState<CalendarEvent | null>(null);

  // User profile
  const [profile, setProfile] = useState<UserProfile | null>(null);

  // Multi-account
  const [accountFilter, setAccountFilter] = useState<string>("all"); // "all" or specific email
  const [sendFromAccount, setSendFromAccount] = useState<string>(""); // email to send from

  // Mobile
  const [showSidebar, setShowSidebar] = useState(false);
  const isMobile = useIsMobile();

  // Calendar grid
  const [calendarSelectedDate, setCalendarSelectedDate] = useState(new Date());
  const [calendarShowAll, setCalendarShowAll] = useState(false);

  // Abort controller ref
  const abortRef = useRef<AbortController | null>(null);

  const t = translations[lang];

  // Load user profile
  useEffect(() => {
    if (isDemo) {
      // Set demo profile with multi-account
      setProfile({
        name: DEMO_ACCOUNTS[0].name,
        email: DEMO_ACCOUNTS[0].email,
        accounts: DEMO_ACCOUNTS,
      });
      setSendFromAccount(DEMO_ACCOUNTS[0].email);
    } else {
      const accounts = authService.getAccounts();
      if (accounts.length > 0) {
        const primary = accounts[0];
        const p: UserProfile = {
          name: primary.name,
          email: primary.email,
          picture: primary.picture,
          accounts: accounts.map(a => ({ email: a.email, name: a.name, picture: a.picture, color: a.color })),
        };
        setProfile(p);
        if (p.accounts?.length && !sendFromAccount) {
          setSendFromAccount(p.accounts[0].email);
        }
      }
    }
  }, [isDemo]);

  // Fetch Gmail labels on mount (Feature 9)
  useEffect(() => {
    if (isDemo) {
      setLabels([
        { id: "INBOX", name: "INBOX", type: "system" },
        { id: "SENT", name: "SENT", type: "system" },
        { id: "DRAFT", name: "DRAFT", type: "system" },
        { id: "TRASH", name: "TRASH", type: "system" },
        { id: "STARRED", name: "STARRED", type: "system" },
      ]);
    } else {
      (async () => {
        try {
          const accounts = authService.getAllValidAccounts();
          const allLabels: any[] = [];
          await Promise.all(accounts.map(async (acct) => {
            try {
              const labels = await gmail.listLabels(acct.access_token);
              for (const label of labels) {
                allLabels.push({ ...label, accountEmail: acct.email, accountColor: acct.color });
              }
            } catch (e) { console.error('Labels error:', e); }
          }));
          setLabels(allLabels);
        } catch (e) { console.error('Failed to fetch labels:', e); }
      })();
    }
  }, [isDemo]);

  // Add another Google account
  const handleAddAccount = async () => {
    try {
      await authService.addAccount();
      // Refresh profile from stored accounts
      const accounts = authService.getAccounts();
      if (accounts.length > 0) {
        const primary = accounts[0];
        setProfile({
          name: primary.name,
          email: primary.email,
          picture: primary.picture,
          accounts: accounts.map(a => ({ email: a.email, name: a.name, picture: a.picture, color: a.color })),
        });
        toast.success(t.accountAdded);
      }
    } catch (e) { console.error('Add account error:', e); }
  };

  // Remove an account
  const handleRemoveAccount = async (email: string) => {
    try {
      authService.removeAccount(email);
      const accounts = authService.getAccounts();
      const p: UserProfile = {
        name: accounts[0]?.name || '',
        email: accounts[0]?.email || '',
        picture: accounts[0]?.picture,
        accounts: accounts.map(a => ({ email: a.email, name: a.name, picture: a.picture, color: a.color })),
      };
      setProfile(p);
      // Reset filter if removed account was active filter
      if (accountFilter === email) setAccountFilter("all");
      if (sendFromAccount === email && p.accounts?.length) {
        setSendFromAccount(p.accounts[0].email);
      }
      toast.success(t.accountRemoved);
    } catch (error: any) {
      toast.error(error.message || t.cannotRemoveLast);
    }
  };

  // Load data on tab change
  useEffect(() => {
    if (activeTab !== "ai") loadData();
    setSelectedItem(null);
    setSelectedIds(new Set());
    setBatchMode(false);
    return () => abortRef.current?.abort();
  }, [activeTab, isDemo]);

  // Reload when label changes (Feature 9)
  useEffect(() => {
    if (activeTab === "mail") loadData();
  }, [activeLabel]);

  // Helper: check if any account still has more pages (Feature 12)
  const hasMorePages = useCallback((tab: "mail" | "calendar") => {
    const tokens = pageTokens[tab];
    return Object.values(tokens).some((v) => v != null);
  }, [pageTokens]);

  const loadData = useCallback(
    async (append = false) => {
      if (append) setLoadingMore(true);
      else setLoading(true);

      if (isDemo) {
        setData({ mail: MOCK_EMAILS, calendar: MOCK_EVENTS });
        setLoading(false);
        setLoadingMore(false);
        return;
      }

      // Abort previous request
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const accounts = authService.getAllValidAccounts();
        const tabKey = activeTab as "mail" | "calendar";

        if (activeTab === "mail") {
          const accountTokens = pageTokens[tabKey];
          const passTokens = append && Object.keys(accountTokens).length > 0 && Object.values(accountTokens).some((v) => v != null)
            ? accountTokens
            : undefined;

          const labelIds = activeLabel && activeLabel !== "INBOX" ? [activeLabel] : ["INBOX"];

          const result = await gmail.fetchAllAccountEmails(accounts, {
            q: searchQuery.trim() || undefined,
            labelIds,
            pageTokens: passTokens || undefined,
            accountFilter: accountFilter && accountFilter !== "all" ? accountFilter : undefined,
          });

          if (controller.signal.aborted) return;

          const newItems = result.items;
          const newTokens = result.pageTokens;

          setData((prev) => {
            const currentList = append ? prev.mail : [];
            const combined = [...currentList, ...newItems];
            const unique = Array.from(
              new Map(combined.map((item: any) => [item.id, item])).values()
            );
            return { ...prev, mail: unique };
          });

          setPageTokens((prev) => ({ ...prev, mail: newTokens }));
        } else {
          // Calendar
          const result = await calendarService.fetchAllAccountEvents(accounts, {
            q: searchQuery.trim() || undefined,
            accountFilter: accountFilter && accountFilter !== "all" ? accountFilter : undefined,
          });

          if (controller.signal.aborted) return;

          const newItems = result.items;
          const newTokens: Record<string, string | null> = result.nextPageToken
            ? { _default: result.nextPageToken }
            : {};

          setData((prev) => {
            const currentList = append ? prev.calendar : [];
            const combined = [...currentList, ...newItems];
            const unique = Array.from(
              new Map(combined.map((item: any) => [item.id, item])).values()
            );
            return { ...prev, calendar: unique };
          });

          setPageTokens((prev) => ({ ...prev, calendar: newTokens }));
        }
      } catch (error: any) {
        if (error.name === "AbortError") return;
        toast.error(`${t.failedLoad.replace("{tab}", t[activeTab])}: ${error.message}`);
        if (error.message.includes("Token expired") || error.message.includes("Unauthorized")) {
          // Token expired — could trigger re-auth flow
          console.error("Auth error during data fetch:", error);
        }
        if (!append) setData((prev) => ({ ...prev, [activeTab]: [] }));
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [activeTab, isDemo, pageTokens, searchQuery, accountFilter, activeLabel, t]
  );

  // Reload data when account filter changes
  useEffect(() => {
    if (activeTab !== "ai") loadData();
  }, [accountFilter]);

  // Server-side search with debounce (Feature 11 enhancement)
  useEffect(() => {
    if (!searchQuery.trim()) {
      setIsSearching(false);
      return;
    }
    setIsSearching(true);
    const timer = setTimeout(() => {
      loadData();
      setIsSearching(false);
    }, 500);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // IntersectionObserver for infinite scroll (Feature 12)
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;
    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (entry.isIntersecting && !loadingMore && !loading) {
          const tabKey = activeTab as "mail" | "calendar";
          const tokens = pageTokens[tabKey];
          const hasMore = Object.values(tokens).some((v) => v != null);
          if (hasMore) {
            loadData(true);
          }
        }
      },
      { rootMargin: "200px" }
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [activeTab, pageTokens, loadingMore, loading, loadData]);

  // Email classification (Feature 16) — after emails load
  useEffect(() => {
    if (activeTab !== "mail" || data.mail.length === 0) return;

    // Load from localStorage cache first
    let cached: Record<string, {priority: string, category: string}> = {};
    try {
      const stored = localStorage.getItem("ai_email_classifications");
      if (stored) cached = JSON.parse(stored);
    } catch {}

    // Apply cached classifications
    if (Object.keys(cached).length > 0) {
      setEmailClassifications((prev) => ({ ...prev, ...cached }));
    }

    if (isDemo) {
      // Generate fake classifications for demo
      const priorities = ["urgent", "high", "normal", "normal", "low"];
      const categories = ["work", "personal", "finance", "newsletter", "work", "work"];
      const demoClassifications: Record<string, {priority: string, category: string}> = {};
      data.mail.forEach((email: any, i: number) => {
        if (!cached[email.id]) {
          demoClassifications[email.id] = {
            priority: priorities[i % priorities.length],
            category: categories[i % categories.length],
          };
        }
      });
      if (Object.keys(demoClassifications).length > 0) {
        const merged = { ...cached, ...demoClassifications };
        setEmailClassifications((prev) => ({ ...prev, ...merged }));
        try { localStorage.setItem("ai_email_classifications", JSON.stringify(merged)); } catch {}
      }
      return;
    }

    // Find un-classified emails and batch call API
    const unclassified = data.mail.filter((email: any) => !cached[email.id]).slice(0, 20);
    if (unclassified.length === 0) return;

    const emailSummaries = unclassified.map((email: any) => ({
      id: email.id,
      from: email.payload?.headers?.find((h: any) => h.name === "From")?.value || "",
      subject: email.payload?.headers?.find((h: any) => h.name === "Subject")?.value || "",
      snippet: email.snippet || "",
    }));

    const apiKey = gemini.getGeminiApiKey();
    if (!apiKey) return; // No API key configured

    gemini.classifyEmails(apiKey, { emails: emailSummaries, lang }).then((res) => {
      const classificationsList = res.classifications || [];
      if (Array.isArray(classificationsList)) {
        const classMap: Record<string, {priority: string, category: string}> = {};
        for (const c of classificationsList) {
          classMap[c.id] = { priority: c.priority, category: c.category };
        }
        const merged = { ...cached, ...classMap };
        setEmailClassifications((prev) => ({ ...prev, ...merged }));
        try { localStorage.setItem("ai_email_classifications", JSON.stringify(merged)); } catch {}
      }
    }).catch(() => {});
  }, [activeTab, data.mail, isDemo]);

  // AI processing — server-side
  const processWithAI = async (item: any) => {
    if (isDemo) {
      setProcessing(true);
      setTimeout(() => {
        setAiInsights({
          summary:
            lang === "zh"
              ? "这是一个演示摘要。AI 正在分析您的内容并提供智能建议。"
              : "This is a demo summary. The AI analyzes your content and provides smart suggestions.",
          action:
            lang === "zh"
              ? "建议：回复确认并安排后续会议"
              : "Suggested: Reply to confirm and schedule a follow-up",
        });
        setProcessing(false);
      }, 1200);
      return;
    }

    setProcessing(true);
    try {
      const apiKey = gemini.getGeminiApiKey();
      if (!apiKey) { toast.error((t as any).noApiKey || 'Please configure Gemini API key in settings'); setProcessing(false); return; }
      const result = await gemini.processItem(apiKey, { item, type: activeTab, lang, model: settings.aiModel });
      setAiInsights(result);
    } catch (error: any) {
      toast.error(`${t.aiError}: ${error.message}`);
    } finally {
      setProcessing(false);
    }
  };

  // AI Draft — server-side (demo mode simulates)
  const handleDraftWithAI = async () => {
    if (!draftPrompt.trim()) return;
    setIsDrafting(true);
    try {
      if (isDemo) {
        // Simulate AI draft in demo mode
        await new Promise((r) => setTimeout(r, 1200));
        const demoDraft = lang === "zh"
          ? `您好，\n\n关于"${draftPrompt}"，以下是我的回复：\n\n感谢您的来信。我已仔细阅读了您的需求，以下是我的建议...\n\n此致\n敬礼`
          : `Hello,\n\nRegarding "${draftPrompt}", here is my response:\n\nThank you for your message. I have carefully reviewed your request, and here are my suggestions...\n\nBest regards`;
        const draft = demoDraft + (settings.signature ? `\n\n${settings.signature}` : "");
        if (draftTarget === "compose") setComposeBody(draft);
        else if (draftTarget === "reply") setReplyContent(draft);
        setShowDraftInput(false);
        setDraftPrompt("");
        return;
      }

      let context = "";
      if (draftTarget === "reply" && selectedItem) {
        const subject = getHeader(selectedItem, "Subject");
        context = `Email to reply to:\nSubject: ${subject}\nBody: ${selectedItem?.snippet}`;
      }

      const apiKey = gemini.getGeminiApiKey();
      if (!apiKey) { toast.error('Please configure Gemini API key in settings'); setIsDrafting(false); return; }
      const result = await gemini.generateDraft(apiKey, { prompt: draftPrompt, context, lang, model: settings.aiModel });

      const draft = result.draft + (settings.signature ? `\n\n${settings.signature}` : "");
      if (draftTarget === "compose") setComposeBody(draft);
      else if (draftTarget === "reply") setReplyContent(draft);

      setShowDraftInput(false);
      setDraftPrompt("");
    } catch (error: any) {
      toast.error(`${t.aiDraftFailed}: ${error.message}`);
    } finally {
      setIsDrafting(false);
    }
  };

  // Email header helper
  const getHeader = (item: any, name: string) =>
    item?.payload?.headers?.find(
      (h: any) => h.name.toLowerCase() === name.toLowerCase()
    )?.value || "";

  // ── Actions ────────────────────────────────────────────────

  const handleSelectItem = (item: any) => {
    if (batchMode) {
      toggleSelection(item.id);
      return;
    }
    setIsComposingNew(false);
    setShowSettings(false);
    setEditingEvent(null);
    setSelectedItem(item);
    setAiInsights(null);
    setIsReplying(false);
  };

  const handleNew = () => {
    setIsComposingNew(true);
    setSelectedItem(null);
    setShowSettings(false);
    setEditingEvent(null);

    // Restore draft from localStorage
    try {
      const draft = JSON.parse(localStorage.getItem(`draft_${activeTab}`) || "{}");
      setComposeTo(draft.to || "");
      setComposeCc(draft.cc || "");
      setComposeBcc(draft.bcc || "");
      setComposeSubject(draft.subject || "");
      setComposeBody(draft.body || "");
      setShowCcBcc(!!(draft.cc || draft.bcc));
    } catch {
      setComposeTo(""); setComposeCc(""); setComposeBcc("");
      setComposeSubject(""); setComposeBody(""); setShowCcBcc(false);
    }

    if (activeTab === "calendar") {
      const now = new Date();
      now.setMinutes(0, 0, 0);
      const end = new Date(now.getTime() + 3600000);
      const fmt = (d: Date) => {
        const p = (n: number) => n.toString().padStart(2, "0");
        return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
      };
      setComposeStart(fmt(now));
      setComposeEnd(fmt(end));
    }
  };

  // Convert File to base64 attachment object
  const fileToBase64 = (file: File): Promise<{ filename: string; mimeType: string; data: string }> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const base64 = (reader.result as string).split(",")[1] || "";
        resolve({ filename: file.name, mimeType: file.type || "application/octet-stream", data: base64 });
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };

  const handleSend = async () => {
    setSendingReply(true);
    try {
      if (isDemo) {
        // Simulate send in demo mode
        await new Promise(r => setTimeout(r, 600));
        toast.success(t.demoSendSimulated);
        setIsComposingNew(false);
        resetCompose();
        setComposeAttachments([]);
        setSendingReply(false);
        return;
      }
      if (activeTab === "calendar") {
        if (!composeSubject.trim() || !composeStart || !composeEnd) return;
        const token = sendFromAccount ? authService.getValidToken(sendFromAccount) : authService.getFirstValidToken();
        if (!token) { toast.error('No valid token available'); setSendingReply(false); return; }
        await calendarService.createEvent(token, {
          summary: composeSubject,
          description: composeBody,
          start: new Date(composeStart).toISOString(),
          end: new Date(composeEnd).toISOString(),
        });
      } else {
        if (!composeTo.trim() || !composeBody.trim()) return;
        const attachments = composeAttachments.length > 0
          ? await Promise.all(composeAttachments.map(fileToBase64))
          : undefined;
        const token = sendFromAccount ? authService.getValidToken(sendFromAccount) : authService.getFirstValidToken();
        if (!token) { toast.error('No valid token available'); setSendingReply(false); return; }
        await gmail.sendMessage(token, {
          to: composeTo,
          cc: composeCc || undefined,
          bcc: composeBcc || undefined,
          subject: composeSubject,
          body: composeBody,
          threadId: undefined,
          messageId: undefined,
          attachments,
        });
      }
      toast.success(t.actionSuccess);
      setIsComposingNew(false);
      resetCompose();
      setComposeAttachments([]);
      loadData();
    } catch (error: any) {
      toast.error(`${t.actionFailed}: ${error.message}`);
    } finally {
      setSendingReply(false);
    }
  };

  const handleSendReply = async () => {
    if (!replyContent.trim()) return;
    setSendingReply(true);
    try {
      if (isDemo) {
        await new Promise(r => setTimeout(r, 600));
        toast.success(t.demoReplySimulated);
        setIsReplying(false);
        setReplyContent("");
        setReplyAttachments([]);
        setSendingReply(false);
        return;
      }

      const to = getHeader(selectedItem, "From");
      let subject = getHeader(selectedItem, "Subject");
      if (!/^re:/i.test(subject)) subject = `Re: ${subject}`;
      const msgId = getHeader(selectedItem, "Message-ID") || getHeader(selectedItem, "Message-Id");
      const date = getHeader(selectedItem, "Date");

      const quote = `\n\nOn ${date}, ${to} wrote:\n> ${selectedItem?.snippet}`;

      const replyAtts = replyAttachments.length > 0
        ? await Promise.all(replyAttachments.map(fileToBase64))
        : undefined;

      const selectedAcctEmail = selectedItem?.accountEmail || sendFromAccount;
      const token = selectedAcctEmail ? authService.getValidToken(selectedAcctEmail) : authService.getFirstValidToken();
      if (!token) { toast.error('No valid token available'); setSendingReply(false); return; }
      await gmail.sendMessage(token, {
        to,
        subject,
        body: replyContent + quote,
        messageId: msgId,
        threadId: selectedItem?.threadId,
        attachments: replyAtts,
      });
      toast.success(t.actionSuccess);
      setIsReplying(false);
      setReplyContent("");
      setReplyAttachments([]);
    } catch (error: any) {
      toast.error(`${t.actionFailed}: ${error.message}`);
    } finally {
      setSendingReply(false);
    }
  };

  // Attachment analysis handler
  const handleAnalyzeAttachment = async (messageId: string, attachmentId: string, filename: string, mimeType: string, analysisType: string) => {
    const key = `${messageId}-${attachmentId}`;
    setAttachmentAnalysis(prev => ({ ...prev, [key]: { loading: true, result: null } }));

    try {
      if (isDemo) {
        await new Promise(r => setTimeout(r, 1500));
        const fakeResults: Record<string, any> = {
          summary: {
            type: "text",
            content: lang === "zh"
              ? `## 文档摘要\n\n**文件**: ${filename}\n\n这是一份关于项目提案的文档。主要包含以下内容：\n\n- 项目目标和范围\n- 时间表和里程碑\n- 预算估算\n- 团队分工`
              : `## Document Summary\n\n**File**: ${filename}\n\nThis document contains a project proposal with the following sections:\n\n- Project objectives and scope\n- Timeline and milestones\n- Budget estimation\n- Team assignments`,
          },
          contract: {
            type: "json",
            content: {
              parties: ["Company A", "Company B"],
              effectiveDate: "2026-01-15",
              termination: "2027-01-15",
              value: "$50,000",
              keyTerms: lang === "zh" ? ["保密条款", "知识产权", "赔偿责任", "终止条件"] : ["Confidentiality", "IP Rights", "Liability", "Termination"],
              riskLevel: lang === "zh" ? "低风险" : "Low Risk",
            },
          },
          invoice: {
            type: "json",
            content: {
              invoiceNumber: "INV-2026-0456",
              vendor: "Acme Services",
              amount: "$2,450.00",
              dueDate: "2026-05-01",
              items: [
                { description: lang === "zh" ? "咨询服务" : "Consulting Services", amount: "$2,000.00" },
                { description: lang === "zh" ? "差旅费" : "Travel Expenses", amount: "$450.00" },
              ],
              status: lang === "zh" ? "待支付" : "Pending",
            },
          },
          general: {
            type: "text",
            content: lang === "zh"
              ? `## 分析结果\n\n**文件**: ${filename}\n**类型**: ${mimeType}\n\n此文件包含结构化数据。文件大小适中，格式规范。\n\n### 建议\n\n- 可以安全分享\n- 建议备份存档`
              : `## Analysis Result\n\n**File**: ${filename}\n**Type**: ${mimeType}\n\nThis file contains structured data. File size is moderate and format is standard.\n\n### Recommendations\n\n- Safe to share\n- Recommend archiving a backup`,
          },
        };
        setAttachmentAnalysis(prev => ({
          ...prev,
          [key]: { loading: false, result: fakeResults[analysisType] || fakeResults.general },
        }));
        toast.success(t.analysisComplete);
        return;
      }

      // Find the email to get its accountEmail
      const emailItem = data.mail.find((m: any) => m.id === messageId);
      const acctEmail = emailItem?.accountEmail;
      const token = acctEmail ? authService.getValidToken(acctEmail) : authService.getFirstValidToken();
      const apiKey = gemini.getGeminiApiKey();
      if (!token || !apiKey) {
        toast.error(!token ? 'No valid token available' : 'Please configure Gemini API key in settings');
        setAttachmentAnalysis(prev => ({ ...prev, [key]: { loading: false, result: null } }));
        return;
      }
      // Step 1: Get attachment data from Gmail
      const attData = await gmail.getAttachment(token, messageId, attachmentId);
      // Step 2: Analyze with Gemini (convert URL-safe base64 to standard)
      const base64data = attData.data.replace(/-/g, '+').replace(/_/g, '/');
      const result = await gemini.analyzeAttachment(apiKey, { base64data, mimeType, analysisType, lang, model: settings.aiModel });
      setAttachmentAnalysis(prev => ({
        ...prev,
        [key]: { loading: false, result },
      }));
      toast.success(t.analysisComplete);
    } catch (error: any) {
      setAttachmentAnalysis(prev => ({
        ...prev,
        [key]: { loading: false, result: null },
      }));
      toast.error(`${t.actionFailed}: ${error.message}`);
    }
  };

  const confirmThen = (message: string, fn: () => void) => {
    setConfirmAction({ message, onConfirm: fn });
  };

  const handleMailAction = async (
    action: "archive" | "trash" | "markRead" | "markUnread",
    messageId: string
  ) => {
    if (action === "trash") {
      confirmThen(t.confirmTrash, () => executeMailAction("trash", messageId));
      return;
    }
    executeMailAction(action, messageId);
  };

  const executeMailAction = async (
    action: "archive" | "trash" | "markRead" | "markUnread",
    messageId: string
  ) => {
    // Find the email to get its accountEmail
    const email = data.mail.find(m => m.id === messageId);
    const acctEmail = (email as any)?.accountEmail;
    const token = acctEmail ? authService.getValidToken(acctEmail) : authService.getFirstValidToken();
    if (!token) { toast.error('No valid token available'); return; }

    try {
      if (action === "trash") {
        await gmail.trashMessage(token, messageId);
      } else {
        const addLabelIds: string[] = [];
        const removeLabelIds: string[] = [];
        if (action === "archive") removeLabelIds.push("INBOX");
        else if (action === "markRead") removeLabelIds.push("UNREAD");
        else if (action === "markUnread") addLabelIds.push("UNREAD");
        await gmail.modifyMessage(token, messageId, { addLabelIds, removeLabelIds });
      }
      toast.success(t.actionSuccess);

      if (action === "archive" || action === "trash") {
        setData((prev) => ({
          ...prev,
          mail: prev.mail.filter((m) => m.id !== messageId),
        }));
        if (selectedItem?.id === messageId) setSelectedItem(null);
      } else {
        setData((prev) => ({
          ...prev,
          mail: prev.mail.map((m) => {
            if (m.id !== messageId) return m;
            const labels = m.labelIds || [];
            return {
              ...m,
              labelIds:
                action === "markRead"
                  ? labels.filter((l) => l !== "UNREAD")
                  : [...labels, "UNREAD"],
            };
          }),
        }));
      }
    } catch (error: any) {
      toast.error(`${t.actionFailed}: ${error.message}`);
    }
  };

  // Batch actions
  const toggleSelection = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleBatchAction = (action: "archive" | "trash" | "markRead") => {
    if (selectedIds.size === 0) return;
    if (action === "trash") {
      confirmThen(t.confirmTrash, () => executeBatchAction("trash"));
      return;
    }
    executeBatchAction(action);
  };

  const executeBatchAction = async (action: "archive" | "trash" | "markRead") => {
    const ids: string[] = Array.from(selectedIds);
    try {
      // Group messages by account for proper token usage
      const token = authService.getFirstValidToken();
      if (!token) { toast.error('No valid token available'); return; }

      if (action === "trash") {
        // Trash each message individually (Gmail API doesn't have batch trash)
        await Promise.all(ids.map(async (msgId: string) => {
          const emailItem = data.mail.find((m: any) => m.id === msgId);
          const acctEmail = (emailItem as any)?.accountEmail as string | undefined;
          const msgToken = acctEmail ? authService.getValidToken(acctEmail) : token;
          if (msgToken) await gmail.trashMessage(msgToken, msgId);
        }));
      } else {
        const removeLabelIds = action === "archive" ? ["INBOX"] : action === "markRead" ? ["UNREAD"] : [];
        // Use batch modify — group by account
        const accountGroups: Record<string, string[]> = {};
        for (const msgId of ids) {
          const emailItem = data.mail.find((m: any) => m.id === msgId);
          const acctKey = ((emailItem as any)?.accountEmail as string) || '_default';
          if (!accountGroups[acctKey]) accountGroups[acctKey] = [];
          accountGroups[acctKey].push(msgId);
        }
        await Promise.all(Object.entries(accountGroups).map(async ([acctKey, groupIds]) => {
          const groupToken = acctKey !== '_default' ? authService.getValidToken(acctKey) : token;
          if (groupToken) {
            await gmail.batchModifyMessages(groupToken, { ids: groupIds, removeLabelIds });
          }
        }));
      }
      toast.success(t.actionSuccess);
      if (action === "archive" || action === "trash") {
        setData((prev) => ({
          ...prev,
          mail: prev.mail.filter((m) => !selectedIds.has(m.id)),
        }));
      }
      setSelectedIds(new Set());
      setBatchMode(false);
    } catch (error: any) {
      toast.error(`${t.actionFailed}: ${error.message}`);
    }
  };

  // Calendar actions
  const handleCalendarDelete = (eventId: string) => {
    confirmThen(t.confirmDelete, async () => {
      try {
        const event = data.calendar.find((e: any) => e.id === eventId);
        const acctEmail = event?.accountEmail;
        const token = acctEmail ? authService.getValidToken(acctEmail) : authService.getFirstValidToken();
        if (!token) { toast.error('No valid token available'); return; }
        await calendarService.deleteEvent(token, eventId);
        toast.success(t.actionSuccess);
        setData((prev) => ({
          ...prev,
          calendar: prev.calendar.filter((e) => e.id !== eventId),
        }));
        setSelectedItem(null);
      } catch (error: any) {
        toast.error(`${t.actionFailed}: ${error.message}`);
      }
    });
  };

  const handleCalendarUpdate = async (event: CalendarEvent) => {
    try {
      const acctEmail = (event as any).accountEmail;
      const token = acctEmail ? authService.getValidToken(acctEmail) : authService.getFirstValidToken();
      if (!token) { toast.error('No valid token available'); return; }
      const result = await calendarService.updateEvent(token, event.id, {
        summary: event.summary,
        description: event.description,
        start: event.start?.dateTime,
        end: event.end?.dateTime,
      });
      const updatedEvent = result || event;
      setData((prev) => ({
        ...prev,
        calendar: prev.calendar.map((e) => (e.id === event.id ? updatedEvent : e)),
      }));
      setEditingEvent(null);
      setSelectedItem(updatedEvent);
      toast.success(t.actionSuccess);
    } catch (error: any) {
      toast.error(`${t.actionFailed}: ${error.message}`);
    }
  };

  const handleLogout = () => {
    authService.logout();
    onLogoutProp?.();
  };

  const handleSettings = () => {
    setShowSettings(true);
  };

  const saveSettings = () => {
    saveSettingsToStorage(settings);
    toast.success(t.settingsSaved);
    setShowSettings(false);
  };

  const resetCompose = () => {
    setComposeTo("");
    setComposeCc("");
    setComposeBcc("");
    setComposeSubject("");
    setComposeBody("");
    setShowCcBcc(false);
    localStorage.removeItem(`draft_${activeTab}`);
  };

  // Auto-save compose draft to localStorage
  useEffect(() => {
    if (!isComposingNew) return;
    const hasContent = composeTo || composeCc || composeBcc || composeSubject || composeBody;
    if (hasContent) {
      localStorage.setItem(`draft_${activeTab}`, JSON.stringify({
        to: composeTo, cc: composeCc, bcc: composeBcc,
        subject: composeSubject, body: composeBody,
      }));
    }
  }, [isComposingNew, composeTo, composeCc, composeBcc, composeSubject, composeBody, activeTab]);

  // Build workspace context for AI chat
  const buildChatContext = useCallback(() => {
    const getHeader = (email: Email, name: string) =>
      email.payload?.headers?.find((h: any) => h.name === name)?.value || "";

    const mailContext = data.mail.map((m, i) => {
      const from = getHeader(m, "From");
      const subject = getHeader(m, "Subject");
      const date = getHeader(m, "Date");
      const unread = m.labelIds?.includes("UNREAD") ? "[UNREAD]" : "";
      const attachments = getAttachments(m.payload);
      const attachStr = attachments.length > 0 ? ` [📎 ${attachments.map((a: any) => a.filename).join(", ")}]` : "";
      return `${i + 1}. ${unread} From: ${from} | Subject: ${subject} | Date: ${date} | Snippet: ${m.snippet}${attachStr}`;
    }).join("\n");

    const calContext = data.calendar.map((e, i) => {
      const start = e.start?.dateTime ? new Date(e.start.dateTime).toLocaleString() : e.start?.date || "";
      const end = e.end?.dateTime ? new Date(e.end.dateTime).toLocaleString() : "";
      return `${i + 1}. ${e.summary} | ${start}${end ? ` — ${end}` : ""} | ${e.description || "No description"}${e.location ? ` | 📍 ${e.location}` : ""}`;
    }).join("\n");

    return `=== EMAILS (${data.mail.length} total) ===\n${mailContext || "(none)"}\n\n=== CALENDAR EVENTS (${data.calendar.length} total) ===\n${calContext || "(none)"}`;
  }, [data.mail, data.calendar]);

  // Send chat message
  const handleChatSend = useCallback(async (message?: string) => {
    const text = (message || chatInput).trim();
    if (!text || chatStreaming) return;

    const userMsg: ChatMessage = {
      id: Date.now().toString(),
      role: "user",
      text,
      timestamp: new Date(),
    };

    setChatMessages((prev) => [...prev, userMsg]);
    setChatInput("");
    setChatStreaming(true);

    const assistantId = (Date.now() + 1).toString();
    const assistantMsg: ChatMessage = {
      id: assistantId,
      role: "assistant",
      text: "",
      timestamp: new Date(),
    };
    setChatMessages((prev) => [...prev, assistantMsg]);

    if (isDemo) {
      // Demo mode — rich simulated responses based on actual mock data
      const unreadMails = data.mail.filter(m => m.labelIds?.includes("UNREAD"));
      const getMailInfo = (m: any) => {
        const from = m.payload?.headers?.find((h: any) => h.name === "From")?.value?.replace(/<.*>/, "").trim() || "";
        const subj = m.payload?.headers?.find((h: any) => h.name === "Subject")?.value || "";
        return { from, subj };
      };
      const fmtTime = (e: any) => e.start?.dateTime ? new Date(e.start.dateTime).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "";

      const demoResponses: Record<string, { zh: string; en: string }> = {
        "focus": {
          zh: "## 📋 今日工作重点\n\n" +
            "### 📧 需要处理的邮件 (" + unreadMails.length + " 封未读)\n\n" +
            unreadMails.slice(0, 5).map((m, i) => { const info = getMailInfo(m); return `${i + 1}. ${m.accountColor === "#ea4335" ? "🔴" : "🔵"} **${info.from}** — ${info.subj}`; }).join("\n") +
            "\n\n### 📅 今日日程\n\n" +
            (data.calendar.length > 0
              ? data.calendar.slice(0, 3).map((e, i) => `${i + 1}. ⏰ **${e.summary}** ${fmtTime(e) ? `(${fmtTime(e)})` : ""} ${e.location ? `📍 ${e.location}` : ""}`).join("\n")
              : "✅ 今天没有日程安排，可以专注处理邮件") +
            "\n\n### 💡 建议优先级\n\n1. 先回复 **" + (unreadMails[0] ? getMailInfo(unreadMails[0]).from : "") + "** 的邮件（标记为紧急）\n2. 准备下午的会议材料\n3. 处理其余未读邮件",
          en: "## 📋 Today's Focus\n\n" +
            "### 📧 Emails to Handle (" + unreadMails.length + " unread)\n\n" +
            unreadMails.slice(0, 5).map((m, i) => { const info = getMailInfo(m); return `${i + 1}. ${m.accountColor === "#ea4335" ? "🔴" : "🔵"} **${info.from}** — ${info.subj}`; }).join("\n") +
            "\n\n### 📅 Today's Schedule\n\n" +
            (data.calendar.length > 0
              ? data.calendar.slice(0, 3).map((e, i) => `${i + 1}. ⏰ **${e.summary}** ${fmtTime(e) ? `(${fmtTime(e)})` : ""} ${e.location ? `📍 ${e.location}` : ""}`).join("\n")
              : "✅ No events today — focus on emails") +
            "\n\n### 💡 Suggested Priority\n\n1. Reply to **" + (unreadMails[0] ? getMailInfo(unreadMails[0]).from : "") + "**'s email (marked urgent)\n2. Prepare for afternoon meetings\n3. Process remaining unread emails",
        },
        "week": {
          zh: "## 📅 本周安排概览\n\n" +
            "### 日程事件\n\n" +
            data.calendar.map((e, i) => {
              const d = e.start?.dateTime ? new Date(e.start.dateTime) : null;
              const day = d ? ["周日","周一","周二","周三","周四","周五","周六"][d.getDay()] : "";
              return `${i + 1}. **${day}** ${fmtTime(e)} — ${e.summary}`;
            }).join("\n") +
            "\n\n### 📧 需要跟进的邮件\n\n" +
            data.mail.slice(0, 3).map((m, i) => { const info = getMailInfo(m); return `- **${info.from}**: ${info.subj}`; }).join("\n") +
            "\n\n### 📊 本周数据\n\n| 类别 | 数量 |\n|------|------|\n| 总邮件 | " + data.mail.length + " 封 |\n| 未读 | " + unreadMails.length + " 封 |\n| 日程 | " + data.calendar.length + " 个 |\n\n💡 **建议**：周初适合清理积压邮件，为本周的会议做准备。",
          en: "## 📅 This Week at a Glance\n\n" +
            "### Schedule\n\n" +
            data.calendar.map((e, i) => {
              const d = e.start?.dateTime ? new Date(e.start.dateTime) : null;
              const day = d ? ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"][d.getDay()] : "";
              return `${i + 1}. **${day}** ${fmtTime(e)} — ${e.summary}`;
            }).join("\n") +
            "\n\n### 📧 Emails to Follow Up\n\n" +
            data.mail.slice(0, 3).map((m, i) => { const info = getMailInfo(m); return `- **${info.from}**: ${info.subj}`; }).join("\n") +
            "\n\n### 📊 This Week's Stats\n\n| Category | Count |\n|----------|-------|\n| Total Emails | " + data.mail.length + " |\n| Unread | " + unreadMails.length + " |\n| Events | " + data.calendar.length + " |\n\n💡 **Tip**: Start the week by clearing your inbox backlog and prepping for meetings.",
        },
        "unread": {
          zh: "## 📧 未读邮件摘要 (" + unreadMails.length + " 封)\n\n" +
            unreadMails.map((m, i) => {
              const info = getMailInfo(m);
              const acct = m.accountColor === "#ea4335" ? "个人邮箱" : "工作邮箱";
              return `### ${i + 1}. ${info.subj}\n- **发件人**: ${info.from}\n- **账号**: ${acct}\n- **摘要**: ${m.snippet?.slice(0, 80)}...`;
            }).join("\n\n") +
            "\n\n---\n\n⚡ **快速操作建议**：前 2 封邮件看起来比较紧急，建议优先回复。",
          en: "## 📧 Unread Email Summary (" + unreadMails.length + ")\n\n" +
            unreadMails.map((m, i) => {
              const info = getMailInfo(m);
              const acct = m.accountColor === "#ea4335" ? "Personal" : "Work";
              return `### ${i + 1}. ${info.subj}\n- **From**: ${info.from}\n- **Account**: ${acct}\n- **Preview**: ${m.snippet?.slice(0, 80)}...`;
            }).join("\n\n") +
            "\n\n---\n\n⚡ **Quick Action**: The first 2 emails appear urgent — consider replying to those first.",
        },
        "conflict": {
          zh: "## 🔍 日程冲突检查\n\n" +
            (data.calendar.length < 2
              ? "✅ **没有发现冲突！** 你的 " + data.calendar.length + " 个日程安排时间均不重叠。\n\n"
              : "⚠️ 发现以下需要注意的事项：\n\n- **" + (data.calendar[0]?.summary || "") + "** 和 **" + (data.calendar[1]?.summary || "") + "** 时间比较接近，注意预留出行/准备时间\n\n") +
            "### 📅 完整日程\n\n" +
            data.calendar.map((e, i) => `${i + 1}. ${fmtTime(e)} **${e.summary}** ${e.location ? `(📍 ${e.location})` : ""}`).join("\n") +
            "\n\n💡 **建议**：在会议之间预留 15 分钟缓冲时间。",
          en: "## 🔍 Schedule Conflict Check\n\n" +
            (data.calendar.length < 2
              ? "✅ **No conflicts found!** Your " + data.calendar.length + " events don't overlap.\n\n"
              : "⚠️ Heads up:\n\n- **" + (data.calendar[0]?.summary || "") + "** and **" + (data.calendar[1]?.summary || "") + "** are close together — allow travel/prep time\n\n") +
            "### 📅 Full Schedule\n\n" +
            data.calendar.map((e, i) => `${i + 1}. ${fmtTime(e)} **${e.summary}** ${e.location ? `(📍 ${e.location})` : ""}`).join("\n") +
            "\n\n💡 **Tip**: Keep 15-minute buffers between meetings.",
        },
        "draft": {
          zh: "## ✍️ 邮件草稿\n\n我可以帮你草拟以下类型的邮件：\n\n1. **回复邮件** — 告诉我你想回复哪封邮件，以及大致内容\n2. **新邮件** — 告诉我收件人和主题\n3. **会议邀请** — 我可以根据日历信息生成\n\n💡 **示例**：「帮我回复 Sarah 的项目提案邮件，说我会在周五前审阅完毕」",
          en: "## ✍️ Email Draft\n\nI can help draft these types of emails:\n\n1. **Reply** — Tell me which email and your key points\n2. **New Email** — Tell me the recipient and topic\n3. **Meeting Invite** — I can generate based on your calendar\n\n💡 **Example**: \"Draft a reply to Sarah's project proposal saying I'll review by Friday\"",
        },
        "default": {
          zh: "👋 你好！我是你的 AI 办公助手。\n\n我可以帮你：\n\n- 📧 **邮件管理** — 总结未读邮件、草拟回复\n- 📅 **日程安排** — 查看日程、检查冲突\n- 📊 **工作分析** — 今日重点、本周概览\n- ✍️ **内容起草** — 邮件回复、会议纪要\n\n目前你有 **" + data.mail.length + " 封邮件**（" + unreadMails.length + " 封未读）和 **" + data.calendar.length + " 个日程**。\n\n试试问我：「今天有什么需要关注的？」",
          en: "👋 Hello! I'm your AI workspace assistant.\n\nI can help with:\n\n- 📧 **Email Management** — Summarize unread, draft replies\n- 📅 **Schedule** — View events, check conflicts\n- 📊 **Work Analysis** — Daily focus, weekly overview\n- ✍️ **Drafting** — Email replies, meeting notes\n\nYou have **" + data.mail.length + " emails** (" + unreadMails.length + " unread) and **" + data.calendar.length + " events**.\n\nTry asking: \"What should I focus on today?\"",
        },
      };

      // Smart keyword matching for demo responses
      const lowerText = text.toLowerCase();
      let demoKey = "default";
      if (lowerText.match(/今日|今天|today|focus|重点|priority|关注|整理/)) demoKey = "focus";
      else if (lowerText.match(/本周|week|this week|安排|overview|周/)) demoKey = "week";
      else if (lowerText.match(/未读|unread|summary|摘要|总结.*邮/)) demoKey = "unread";
      else if (lowerText.match(/冲突|conflict|clash|重叠/)) demoKey = "conflict";
      else if (lowerText.match(/日程|schedule|calendar|事件|event/)) demoKey = "conflict";
      else if (lowerText.match(/草稿|draft|写|compose|回复.*邮|reply|起草/)) demoKey = "draft";

      const response = demoResponses[demoKey]?.[lang as "zh"|"en"] || demoResponses["default"][lang as "zh"|"en"];

      // Simulate typing
      let idx = 0;
      const typeInterval = setInterval(() => {
        idx += Math.floor(Math.random() * 3) + 2;
        if (idx >= response.length) {
          idx = response.length;
          clearInterval(typeInterval);
          setChatStreaming(false);
        }
        setChatMessages((prev) =>
          prev.map((m) => m.id === assistantId ? { ...m, text: response.slice(0, idx) } : m)
        );
      }, 20);
      return;
    }

    // Real mode — stream from Gemini via service layer
    try {
      const apiKey = gemini.getGeminiApiKey();
      if (!apiKey) {
        setChatMessages((prev) =>
          prev.map((m) => m.id === assistantId ? { ...m, text: `⚠️ ${(t as any).noApiKey || 'Please configure Gemini API key in settings'}` } : m)
        );
        setChatStreaming(false);
        return;
      }

      const context = buildChatContext();
      const history = chatMessages.map((m) => ({ role: m.role === "user" ? "user" : "model", text: m.text }));

      const stream = gemini.chatStream(apiKey, { message: text, history, context, lang, model: settings.aiModel });
      let fullText = "";
      for await (const chunk of stream) {
        fullText += chunk;
        setChatMessages((prev) =>
          prev.map((m) => m.id === assistantId ? { ...m, text: fullText } : m)
        );
      }
    } catch (error: any) {
      setChatMessages((prev) =>
        prev.map((m) => m.id === assistantId ? { ...m, text: `⚠️ ${t.aiChatError}: ${error.message}` } : m)
      );
    } finally {
      setChatStreaming(false);
    }
  }, [chatInput, chatStreaming, isDemo, data, lang, settings.aiModel, chatMessages, buildChatContext, t]);

  // Auto-scroll chat to bottom
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages]);

  const filteredData = useMemo(() => {
    if (activeTab === "ai") return [];
    let items = data[activeTab] || [];
    // Client-side account filter for demo mode
    if (isDemo && accountFilter && accountFilter !== "all") {
      items = items.filter((item: any) => item.accountEmail === accountFilter);
    }
    // Client-side label filter for demo mode (Feature 9)
    if (isDemo && activeTab === "mail" && activeLabel !== "INBOX") {
      if (activeLabel === "SENT") {
        items = items.slice(0, 3).map((item: any) => ({ ...item, labelIds: ["SENT"] }));
      } else if (activeLabel === "DRAFT") {
        items = items.slice(0, 2).map((item: any) => ({ ...item, labelIds: ["DRAFT"] }));
      } else if (activeLabel === "STARRED") {
        items = items.filter((_: any, i: number) => i % 5 === 0);
      } else if (activeLabel === "TRASH") {
        items = [];
      }
    }
    // Client-side search for demo mode
    if (isDemo && searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      items = items.filter((item: any) => {
        if (activeTab === "mail") {
          const from = item.payload?.headers?.find((h: any) => h.name === "From")?.value || "";
          const subject = item.payload?.headers?.find((h: any) => h.name === "Subject")?.value || "";
          return from.toLowerCase().includes(q) || subject.toLowerCase().includes(q) || (item.snippet || "").toLowerCase().includes(q);
        }
        return (item.summary || "").toLowerCase().includes(q) || (item.description || "").toLowerCase().includes(q);
      });
    }
    return items;
  }, [data, activeTab, isDemo, accountFilter, searchQuery, activeLabel, profile]);

  // Calendar date-filtered events
  const calendarFilteredEvents = useMemo(() => {
    if (activeTab !== "calendar") return filteredData;
    if (calendarShowAll) return filteredData;
    return filteredData.filter((e: any) => {
      const eventDate = new Date(e.start?.dateTime || e.start?.date || '');
      return eventDate.toDateString() === calendarSelectedDate.toDateString();
    });
  }, [activeTab, filteredData, calendarSelectedDate, calendarShowAll]);

  // Display data: calendar-filtered for calendar tab, filteredData for others
  const displayData = activeTab === "calendar" ? calendarFilteredEvents : filteredData;

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || (e.target as HTMLElement)?.isContentEditable) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      switch (e.key) {
        case "j": {
          // Next item
          if (displayData.length === 0) return;
          const idx = selectedItem ? displayData.findIndex((d: any) => d.id === selectedItem.id) : -1;
          const next = displayData[idx + 1] || displayData[0];
          if (next) handleSelectItem(next);
          e.preventDefault();
          break;
        }
        case "k": {
          // Previous item
          if (displayData.length === 0) return;
          const idx = selectedItem ? displayData.findIndex((d: any) => d.id === selectedItem.id) : displayData.length;
          const prev = displayData[idx - 1] || displayData[displayData.length - 1];
          if (prev) handleSelectItem(prev);
          e.preventDefault();
          break;
        }
        case "r":
          if (activeTab === "mail" && selectedItem && !isDemo) {
            setIsReplying(true);
            e.preventDefault();
          }
          break;
        case "e":
          if (activeTab === "mail" && selectedItem && !isDemo) {
            handleMailAction("archive", selectedItem.id);
            e.preventDefault();
          }
          break;
        case "#":
          if (selectedItem && !isDemo) {
            if (activeTab === "mail") handleMailAction("trash", selectedItem.id);
            else if (activeTab === "calendar") handleCalendarDelete(selectedItem.id);
            e.preventDefault();
          }
          break;
        case "c":
          if (!selectedItem) {
            handleNew();
            e.preventDefault();
          }
          break;
        case "Escape":
          if (isComposingNew) { setIsComposingNew(false); e.preventDefault(); }
          else if (showSettings) { setShowSettings(false); e.preventDefault(); }
          else if (selectedItem) { setSelectedItem(null); e.preventDefault(); }
          break;
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [displayData, selectedItem, activeTab, isDemo, isComposingNew, showSettings]);

  const isSendDisabled = () => {
    if (sendingReply) return true;
    if (activeTab === "mail") return !composeTo.trim() || !composeBody.trim();
    if (activeTab === "calendar") return !composeSubject.trim() || !composeStart || !composeEnd;
    return true;
  };

  const unreadCount = useMemo(() => data.mail.filter((m: any) => m.labelIds?.includes("UNREAD")).length, [data.mail]);

  // ── Render ─────────────────────────────────────────────────

  return (
    <ErrorBoundary>
    <div className="flex h-screen bg-gm-bg text-gm-text font-sans overflow-hidden">
      {/* Navigation Rail — hidden on mobile, shown as bottom bar */}
      <nav
        className={cn(
          "flex-shrink-0 border-r border-gm-border flex flex-col items-center py-4 gap-4 bg-gm-bg-dim",
          isMobile
            ? "fixed bottom-0 left-0 right-0 flex-row justify-around px-2 gap-0 border-r-0 border-t z-50"
            : "w-[72px]"
        )}
        style={isMobile ? { paddingTop: 8, paddingBottom: "max(8px, env(safe-area-inset-bottom))" } : undefined}
      >
        {!isMobile && (
          <div className="mb-4">
            <div className="w-10 h-10 bg-[#1a73e8] rounded-2xl flex items-center justify-center text-white shadow-md text-lg font-bold select-none">
              G
            </div>
          </div>
        )}

        <NavIcon icon={Bot} active={activeTab === "ai"} onClick={() => { setActiveTab("ai"); }} label={t.aiChat} isMobile={isMobile} />
        <NavIcon icon={Mail} active={activeTab === "mail"} onClick={() => { setActiveTab("mail"); setSearchQuery(""); }} label={t.mail} badge={unreadCount} isMobile={isMobile} />
        <NavIcon icon={CalendarIcon} active={activeTab === "calendar"} onClick={() => { setActiveTab("calendar"); setSearchQuery(""); }} label={t.calendar} isMobile={isMobile} />

        {!isMobile && (
          <div className="mt-auto flex flex-col gap-4 pb-4">
            <NavIcon icon={Languages} active={false} onClick={() => onLangChange(lang === "en" ? "zh" : "en")} label={lang === "en" ? "中文" : "EN"} />
            <NavIcon icon={Settings} active={false} onClick={handleSettings} label={t.settings} />
            <NavIcon icon={LogOut} active={false} onClick={handleLogout} label={t.logout} />
          </div>
        )}
      </nav>

      {/* Main Content */}
      <div className={cn("flex-1 flex flex-col min-w-0", isMobile && "pb-16")}>
        {/* Top Bar */}
        <header className="h-14 border-b border-gm-border flex items-center px-4 gap-3 flex-shrink-0">
          {activeTab === "ai" ? (
            <div className="flex-1 flex items-center gap-2">
              <Bot className="h-5 w-5 text-gm-blue" />
              <span className="font-medium text-gm-text-primary">{t.aiChat}</span>
              {chatMessages.length > 0 && (
                <Button variant="ghost" size="sm" onClick={() => { setChatMessages([]); localStorage.removeItem("ai_chat_history"); }} className="text-gm-text-secondary text-xs ml-2 h-7">
                  {t.clearChat}
                </Button>
              )}
            </div>
          ) : (
            <>
              {/* Account filter — show when multi-account */}
              {profile?.accounts && profile.accounts.length > 1 && (
                <select
                  value={accountFilter}
                  onChange={(e) => setAccountFilter(e.target.value)}
                  aria-label="Account filter"
                  className="text-xs bg-gm-bg-container border border-gm-border rounded-lg px-2 py-1.5 text-gm-text-primary outline-none focus:ring-1 focus:ring-gm-blue cursor-pointer flex-shrink-0"
                >
                  <option value="all">{t.allAccounts}</option>
                  {profile.accounts.map(a => (
                    <option key={a.email} value={a.email}>
                      {a.name || a.email}
                    </option>
                  ))}
                </select>
              )}
              <div className="flex-1 max-w-2xl relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gm-text-secondary" />
                <input
                  type="text"
                  placeholder={t.searchPlaceholder.replace("{tab}", t[activeTab as "mail" | "calendar"])}
                  aria-label="Search"
                  className="w-full bg-gm-bg-container border-none rounded-lg py-2 pl-10 pr-4 text-sm focus:bg-gm-bg focus:ring-2 focus:ring-gm-blue transition-all outline-none"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
                {/* Feature 11: Searching indicator and results count */}
                {isSearching && (
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gm-text-secondary flex items-center gap-1">
                    <Loader2 className="h-3 w-3 animate-spin" />
                    {t.searching}
                  </span>
                )}
                {searchQuery.trim() && !isSearching && !loading && (
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gm-text-secondary">
                    {t.searchResults.replace("{n}", String(displayData.length))}
                  </span>
                )}
              </div>
            </>
          )}
          <div className="flex items-center gap-1">
            {isMobile && (
              <Button variant="ghost" size="icon" onClick={handleSettings} className="text-gm-text-secondary h-9 w-9">
                <Settings className="h-4 w-4" />
              </Button>
            )}
            <Button variant="ghost" size="icon" onClick={() => loadData()} className="text-gm-text-secondary h-9 w-9">
              <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
            </Button>
            <Avatar className="h-8 w-8 border border-gm-border">
              {profile?.picture && <AvatarImage src={profile.picture} />}
              <AvatarFallback className="bg-[#1a73e8] text-white text-xs">
                {profile?.name?.[0] || "U"}
              </AvatarFallback>
            </Avatar>
          </div>
        </header>

        <div className="flex-1 flex overflow-hidden">
          {activeTab === "ai" ? (
            <AIChatPanel
              messages={chatMessages}
              input={chatInput}
              setInput={setChatInput}
              streaming={chatStreaming}
              onSend={handleChatSend}
              chatEndRef={chatEndRef}
              lang={lang}
              t={t}
              isMobile={isMobile}
              onClearChat={() => { setChatMessages([]); localStorage.removeItem("ai_chat_history"); }}
              data={data}
              onDraftReply={(subject: string) => {
                setActiveTab("mail");
                setIsComposingNew(true);
                setComposeSubject(subject ? `Re: ${subject}` : "");
                setComposeBody("");
              }}
              onArchiveEmail={(messageId: string) => {
                handleMailAction("archive", messageId);
              }}
            />
          ) : (
          <>
          {/* List Panel */}
          <div
            className={cn(
              "flex-shrink-0 border-r border-gm-border flex flex-col bg-gm-bg",
              isMobile
                ? selectedItem || isComposingNew
                  ? "hidden"
                  : "w-full"
                : "w-[380px]"
            )}
          >
            {/* New + Batch bar */}
            <div className="p-3 flex gap-2">
              <Button
                onClick={handleNew}
                className="flex-1 justify-start gap-2 bg-gm-bg hover:bg-gm-bg-container text-gm-text border border-gm-border shadow-sm rounded-2xl py-5"
              >
                <Plus className="h-5 w-5 text-gm-blue" />
                <span className="font-medium text-sm">
                  {activeTab === "mail" ? t.compose : t.newEvent}
                </span>
              </Button>
              {activeTab === "mail" && !isDemo && (
                <Button
                  variant={batchMode ? "default" : "outline"}
                  size="icon"
                  onClick={() => {
                    setBatchMode(!batchMode);
                    setSelectedIds(new Set());
                  }}
                  className={cn("rounded-2xl h-[44px] w-[44px]", batchMode && "bg-[#1a73e8]")}
                >
                  <CheckSquare className="h-4 w-4" />
                </Button>
              )}
            </div>

            {/* Batch action bar */}
            {batchMode && selectedIds.size > 0 && (
              <div className="px-3 pb-2 flex gap-2">
                <Badge variant="secondary" className="text-xs">
                  {selectedIds.size} {t.selected}
                </Badge>
                <Button size="sm" variant="ghost" onClick={() => handleBatchAction("archive")} className="text-xs h-7 gap-1">
                  <Archive className="h-3 w-3" />{t.archive}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => handleBatchAction("trash")} className="text-xs h-7 gap-1 text-red-600">
                  <Trash2 className="h-3 w-3" />{t.trash}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => handleBatchAction("markRead")} className="text-xs h-7 gap-1">
                  <MailOpen className="h-3 w-3" />{t.markRead}
                </Button>
              </div>
            )}

            {/* Feature 9: Label/Folder tab bar -- shown in mail tab when search is not active */}
            {activeTab === "mail" && !searchQuery.trim() && (
              <div className="flex gap-1 px-3 pb-2 overflow-x-auto scrollbar-hide flex-shrink-0">
                {[
                  { id: "INBOX", icon: Mail, label: t.inbox },
                  { id: "SENT", icon: Send, label: t.sent },
                  { id: "DRAFT", icon: FileText, label: t.drafts },
                  { id: "TRASH", icon: Trash2, label: t.trash },
                  { id: "STARRED", icon: Star, label: t.starred },
                ].map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => setActiveLabel(tab.id)}
                    className={cn(
                      "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors flex-shrink-0",
                      activeLabel === tab.id
                        ? "bg-gm-blue-bg text-gm-blue"
                        : "text-gm-text-secondary hover:bg-gm-bg-dim"
                    )}
                  >
                    <tab.icon className="h-3.5 w-3.5" />
                    {tab.label}
                  </button>
                ))}
              </div>
            )}

            {/* Calendar Grid */}
            {activeTab === "calendar" && (
              <>
                <CalendarGrid
                  events={data.calendar}
                  selectedDate={calendarSelectedDate}
                  onSelectDate={(date) => {
                    setCalendarSelectedDate(date);
                    setCalendarShowAll(false);
                  }}
                  lang={lang}
                />
                <div className="px-3 pb-2 flex items-center justify-between border-b border-gm-border flex-shrink-0">
                  <span className="text-xs text-gm-text-secondary">
                    {calendarShowAll
                      ? (lang === "zh" ? "显示所有日程" : "All events")
                      : (lang === "zh"
                        ? `${calendarSelectedDate.getMonth() + 1}月${calendarSelectedDate.getDate()}日的日程`
                        : `Events on ${new Intl.DateTimeFormat("en", { month: "short", day: "numeric" }).format(calendarSelectedDate)}`
                      )
                    }
                  </span>
                  <button
                    onClick={() => setCalendarShowAll(!calendarShowAll)}
                    className="text-[11px] text-gm-blue font-medium px-2 py-0.5 rounded-full hover:bg-gm-blue-bg transition-colors"
                  >
                    {calendarShowAll
                      ? (lang === "zh" ? "仅显示选中日期" : "Selected date only")
                      : (lang === "zh" ? "显示所有日程" : "Show all")
                    }
                  </button>
                </div>
              </>
            )}

            <div className="flex-1 overflow-y-auto overscroll-contain">
              <AnimatePresence mode="wait">
              <motion.div
                key={activeTab}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.15 }}
              >
              {loading ? (
                <div className="p-4 space-y-3">
                  {[1, 2, 3, 4].map((i) => (
                    <Skeleton key={i} className="h-[72px] w-full rounded-lg" />
                  ))}
                </div>
              ) : displayData.length > 0 ? (
                <div className="divide-y divide-gm-border">
                  {displayData.map((item: any) => {
                    const isUnread = activeTab === "mail" && item?.labelIds?.includes("UNREAD");
                    const isSelected = selectedIds.has(item.id);
                    return (
                      <div
                        key={item.id}
                        role="button"
                        tabIndex={0}
                        onClick={() => handleSelectItem(item)}
                        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') handleSelectItem(item); }}
                        className={cn(
                          "p-3 cursor-pointer hover:bg-gm-bg-dim transition-colors flex gap-2",
                          selectedItem?.id === item.id && !batchMode && "bg-gm-blue-bg border-l-4 border-gm-blue",
                          isSelected && "bg-gm-blue-bg"
                        )}
                      >
                        {batchMode && activeTab === "mail" && (
                          <div className="flex items-center pr-1">
                            {isSelected ? (
                              <CheckSquare className="h-4 w-4 text-gm-blue" />
                            ) : (
                              <Square className="h-4 w-4 text-gm-text-secondary" />
                            )}
                          </div>
                        )}
                        {activeTab === "mail" && !batchMode && (
                          <div className="w-2 pt-1.5 flex-shrink-0">
                            {isUnread ? (
                              <div className="w-2 h-2 rounded-full" style={{ backgroundColor: item.accountColor || "#1a73e8" }} />
                            ) : item.accountColor && profile?.accounts && profile.accounts.length > 1 ? (
                              <div className="w-1.5 h-1.5 rounded-full opacity-40" style={{ backgroundColor: item.accountColor }} />
                            ) : null}
                          </div>
                        )}
                        {activeTab === "calendar" && item.accountColor && profile?.accounts && profile.accounts.length > 1 && (
                          <div className="w-1.5 pt-0.5 flex-shrink-0">
                            <div className="w-1.5 h-full rounded-full min-h-[32px]" style={{ backgroundColor: item.accountColor }} />
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <div className="flex justify-between items-start mb-0.5 gap-2">
                            <span className={cn("text-sm truncate flex-1", isUnread ? "font-bold text-gm-text-primary" : "font-medium text-gm-text")}>
                              {activeTab === "mail"
                                ? getHeader(item, "From").replace(/<.*>/, "").trim()
                                : activeTab === "calendar"
                                ? item?.summary
                                : item?.title}
                            </span>
                            <span className={cn("text-[11px] flex-shrink-0", isUnread ? "font-bold text-gm-blue" : "text-gm-text-secondary")}>
                              {activeTab === "mail"
                                ? formatDate(getHeader(item, "Date"))
                                : activeTab === "calendar"
                                ? formatDate(item?.start?.dateTime || item?.start?.date)
                                : ""}
                            </span>
                            {/* Feature 16: Priority badge */}
                            {activeTab === "mail" && emailClassifications[item.id]?.priority === "urgent" && (
                              <span className="w-2 h-2 rounded-full bg-red-500 flex-shrink-0" title={t.urgent} />
                            )}
                            {activeTab === "mail" && emailClassifications[item.id]?.priority === "high" && (
                              <span className="w-2 h-2 rounded-full bg-orange-400 flex-shrink-0" title={t.highPriority} />
                            )}
                          </div>
                          {activeTab === "mail" && (
                            <p className={cn("text-xs truncate flex items-center gap-1", isUnread ? "font-medium text-gm-text-primary" : "text-gm-text-secondary")}>
                              {getAttachments(item?.payload).length > 0 && <Paperclip className="h-3 w-3 flex-shrink-0" />}
                              {getHeader(item, "Subject")}
                              {/* Feature 16: Category badge */}
                              {emailClassifications[item.id]?.category && (
                                <span className="ml-1 text-[10px] text-gm-text-secondary opacity-60 flex-shrink-0">
                                  {emailClassifications[item.id].category === "work" ? t.work
                                    : emailClassifications[item.id].category === "personal" ? t.personal
                                    : emailClassifications[item.id].category === "finance" ? t.finance
                                    : emailClassifications[item.id].category === "newsletter" ? t.newsletter
                                    : emailClassifications[item.id].category}
                                </span>
                              )}
                            </p>
                          )}
                          <p className="text-xs text-gm-text-secondary line-clamp-1 mt-0.5">
                            {activeTab === "mail" ? item?.snippet : activeTab === "calendar" ? item?.description : item?.body}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                  {/* Feature 12: Infinite scroll sentinel */}
                  {hasMorePages(activeTab as "mail" | "calendar") ? (
                    <div ref={sentinelRef} className="p-4 flex justify-center">
                      {loadingMore && (
                        <Loader2 className="h-5 w-5 animate-spin text-gm-text-secondary" />
                      )}
                    </div>
                  ) : (
                    displayData.length > 10 && (
                      <div className="p-3 text-center text-xs text-gm-text-secondary opacity-50">
                        {t.noMoreResults}
                      </div>
                    )
                  )}
                </div>
              ) : (
                <div className="p-12 text-center space-y-4">
                  <div className="mx-auto w-24 h-24 rounded-full bg-gm-blue-bg-faint flex items-center justify-center">
                    {activeTab === "mail" ? <Mail className="h-10 w-10 text-gm-blue opacity-60" /> : <CalendarIcon className="h-10 w-10 text-gm-blue opacity-60" />}
                  </div>
                  <div className="space-y-1">
                    <p className="text-sm font-medium text-gm-text-secondary">
                      {t.noItemsFound}
                    </p>
                    <p className="text-xs text-gm-text-secondary opacity-60">
                      {lang === "zh"
                        ? activeTab === "mail" ? "尝试刷新或调整搜索条件" : "暂无日程安排"
                        : activeTab === "mail" ? "Try refreshing or adjust your search" : "No events scheduled"}
                    </p>
                  </div>
                </div>
              )}
              </motion.div>
              </AnimatePresence>
            </div>
          </div>

          {/* Detail Panel */}
          <AnimatePresence mode="wait">
          {(isMobile ? (selectedItem || isComposingNew) : true) && (
          <motion.div
            key={isMobile ? "detail-open" : "detail-static"}
            initial={isMobile ? { x: "100%" } : false}
            animate={isMobile ? { x: 0 } : undefined}
            exit={isMobile ? { x: "100%" } : undefined}
            transition={{ type: "spring", stiffness: 400, damping: 35 }}
            className={cn(
              "flex-1 min-w-0 bg-gm-bg overflow-y-auto overscroll-contain",
              isMobile && "fixed inset-0 z-[60]"
            )}
          >
            {/* Mobile back button */}
            {isMobile && (selectedItem || isComposingNew) && (
              <div className="p-2 border-b border-gm-border bg-gm-bg">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setSelectedItem(null);
                    setIsComposingNew(false);
                  }}
                  className="gap-1 text-gm-blue"
                >
                  ← {t.back}
                </Button>
              </div>
            )}

            <AnimatePresence mode="wait">
            {isComposingNew ? (
              <motion.div key="compose" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.12 }}>
              <ComposePanel
                activeTab={activeTab}
                composeTo={composeTo}
                setComposeTo={setComposeTo}
                composeCc={composeCc}
                setComposeCc={setComposeCc}
                composeBcc={composeBcc}
                setComposeBcc={setComposeBcc}
                composeSubject={composeSubject}
                setComposeSubject={setComposeSubject}
                composeBody={composeBody}
                setComposeBody={setComposeBody}
                composeStart={composeStart}
                setComposeStart={setComposeStart}
                composeEnd={composeEnd}
                setComposeEnd={setComposeEnd}
                showCcBcc={showCcBcc}
                setShowCcBcc={setShowCcBcc}
                showDraftInput={showDraftInput && draftTarget === "compose"}
                draftPrompt={draftPrompt}
                setDraftPrompt={setDraftPrompt}
                isDrafting={isDrafting}
                onDraft={() => handleDraftWithAI()}
                onShowDraft={() => { setDraftTarget("compose"); setShowDraftInput(true); }}
                onHideDraft={() => setShowDraftInput(false)}
                sendDisabled={isSendDisabled()}
                sending={sendingReply}
                onSend={handleSend}
                onClose={() => setIsComposingNew(false)}
                lang={lang}
                t={t}
                accounts={profile?.accounts}
                sendFromAccount={sendFromAccount}
                setSendFromAccount={setSendFromAccount}
                composeAttachments={composeAttachments}
                setComposeAttachments={setComposeAttachments}
              />
              </motion.div>
            ) : selectedItem ? (
              <motion.div key={`detail-${selectedItem.id}`} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.12 }}>
              <DetailPanel
                activeTab={activeTab}
                item={selectedItem}
                aiInsights={aiInsights}
                processing={processing}
                onProcessAI={processWithAI}
                isReplying={isReplying}
                setIsReplying={setIsReplying}
                replyContent={replyContent}
                setReplyContent={setReplyContent}
                sendingReply={sendingReply}
                onSendReply={handleSendReply}
                onMailAction={handleMailAction}
                onCalendarDelete={handleCalendarDelete}
                onCalendarEdit={(event: CalendarEvent) => setEditingEvent(event)}
                editingEvent={editingEvent}
                onCalendarUpdate={handleCalendarUpdate}
                onCancelEventEdit={() => setEditingEvent(null)}
                showDraftInput={showDraftInput && draftTarget === "reply"}
                draftPrompt={draftPrompt}
                setDraftPrompt={setDraftPrompt}
                isDrafting={isDrafting}
                onDraft={() => handleDraftWithAI()}
                onShowDraft={() => { setDraftTarget("reply"); setShowDraftInput(true); }}
                onHideDraft={() => setShowDraftInput(false)}
                getHeader={getHeader}
                lang={lang}
                t={t}
                isDemo={isDemo}
                replyAttachments={replyAttachments}
                setReplyAttachments={setReplyAttachments}
                attachmentAnalysis={attachmentAnalysis}
                onAnalyzeAttachment={handleAnalyzeAttachment}
                onOpenLightbox={setLightbox}
                handleMailAction={handleMailAction}
                handleSendFn={handleSend}
                setIsComposingNew={setIsComposingNew}
                setComposeTo={setComposeTo}
                setComposeSubject={setComposeSubject}
                setComposeBody={setComposeBody}
              />
              </motion.div>
            ) : (
              <motion.div key="empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.2 }} className="h-full">
              <div className="h-full flex flex-col items-center justify-center text-gm-text-secondary">
                <div className="w-28 h-28 rounded-full bg-gm-blue-bg-faint flex items-center justify-center mb-5">
                  {activeTab === "mail" ? <Mail className="h-12 w-12 text-gm-blue opacity-50" /> : <CalendarIcon className="h-12 w-12 text-gm-blue opacity-50" />}
                </div>
                <p className="text-base font-medium text-gm-text-secondary opacity-60">{t.selectItem}</p>
                <p className="text-xs text-gm-text-secondary opacity-40 mt-1">
                  {t.browseHint}
                </p>
              </div>
              </motion.div>
            )}
            </AnimatePresence>
          </motion.div>
          )}
          </AnimatePresence>
          </>
          )}
        </div>
      </div>

      <AnimatePresence>
      {confirmAction && (
        <ConfirmDialog
          message={confirmAction.message}
          onConfirm={() => { confirmAction.onConfirm(); setConfirmAction(null); }}
          onCancel={() => setConfirmAction(null)}
          t={t}
        />
      )}
      </AnimatePresence>

      {/* Attachment Lightbox */}
      <AnimatePresence>
      {lightbox && (
        <AttachmentLightbox
          src={lightbox.src}
          type={lightbox.type}
          onClose={() => setLightbox(null)}
          t={t}
        />
      )}
      </AnimatePresence>

      {/* Settings Modal — renders as overlay above everything */}
      <AnimatePresence>
      {showSettings && (
        <SettingsPanel
          settings={settings}
          setSettings={setSettings}
          onSave={saveSettings}
          onClose={() => setShowSettings(false)}
          lang={lang}
          t={t}
          accounts={profile?.accounts}
          onAddAccount={handleAddAccount}
          onRemoveAccount={handleRemoveAccount}
          isDemo={isDemo}
          geminiApiKey={geminiApiKey}
          onGeminiApiKeyChange={(key: string) => { setGeminiApiKeyState(key); gemini.setGeminiApiKey(key); }}
        />
      )}
      </AnimatePresence>
    </div>
    </ErrorBoundary>
  );
}

// ── CalendarGrid ─────────────────────────────────────────────

function CalendarGrid({ events, selectedDate, onSelectDate, lang }: {
  events: CalendarEvent[];
  selectedDate: Date;
  onSelectDate: (date: Date) => void;
  lang: string;
}) {
  const [viewMonth, setViewMonth] = useState(() => new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1));
  const today = new Date();

  const year = viewMonth.getFullYear();
  const month = viewMonth.getMonth();

  // Build the 6x7 grid of dates
  const firstDay = new Date(year, month, 1);
  const startOffset = firstDay.getDay(); // 0=Sun
  const gridDates: Date[] = [];
  for (let i = 0; i < 42; i++) {
    const d = new Date(year, month, 1 - startOffset + i);
    gridDates.push(d);
  }

  // Map events to date keys for dot indicators
  const eventDateMap = useMemo(() => {
    const map: Record<string, Set<string>> = {};
    events.forEach((e) => {
      const dt = new Date(e.start?.dateTime || e.start?.date || '');
      const key = dt.toDateString();
      if (!map[key]) map[key] = new Set();
      map[key].add(e.accountColor || '#1a73e8');
    });
    return map;
  }, [events]);

  const dayHeaders = lang === "zh"
    ? ["日", "一", "二", "三", "四", "五", "六"]
    : ["S", "M", "T", "W", "T", "F", "S"];

  const monthLabel = lang === "zh"
    ? `${year}年${month + 1}月`
    : `${new Intl.DateTimeFormat("en", { month: "long" }).format(viewMonth)} ${year}`;

  const isToday = (d: Date) => d.toDateString() === today.toDateString();
  const isSelected = (d: Date) => d.toDateString() === selectedDate.toDateString();
  const isCurrentMonth = (d: Date) => d.getMonth() === month;

  const goToToday = () => {
    const now = new Date();
    setViewMonth(new Date(now.getFullYear(), now.getMonth(), 1));
    onSelectDate(now);
  };

  return (
    <div className="px-3 pb-2 flex-shrink-0">
      {/* Month header */}
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-1">
          <button
            onClick={() => setViewMonth(new Date(year, month - 1, 1))}
            className="p-1 rounded-full hover:bg-gm-bg-dim text-gm-text-secondary transition-colors"
            aria-label="Previous month"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="text-sm font-medium text-gm-text-primary min-w-[100px] text-center">
            {monthLabel}
          </span>
          <button
            onClick={() => setViewMonth(new Date(year, month + 1, 1))}
            className="p-1 rounded-full hover:bg-gm-bg-dim text-gm-text-secondary transition-colors"
            aria-label="Next month"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
        <button
          onClick={goToToday}
          className="text-xs text-gm-blue font-medium px-2 py-0.5 rounded-full hover:bg-gm-blue-bg transition-colors"
        >
          {lang === "zh" ? "今天" : "Today"}
        </button>
      </div>

      {/* Day-of-week headers */}
      <div className="grid grid-cols-7 mb-0.5">
        {dayHeaders.map((d, i) => (
          <div key={i} className="text-center text-[10px] font-medium text-gm-text-secondary py-0.5">
            {d}
          </div>
        ))}
      </div>

      {/* Day grid */}
      <div className="grid grid-cols-7">
        {gridDates.map((d, i) => {
          const dateKey = d.toDateString();
          const dots = eventDateMap[dateKey];
          const dotColors = dots ? Array.from(dots).slice(0, 3) : [];
          return (
            <button
              key={i}
              onClick={() => onSelectDate(d)}
              className={cn(
                "relative flex flex-col items-center justify-center w-9 h-9 mx-auto rounded-full text-xs transition-colors",
                isSelected(d) && "bg-gm-blue text-white font-medium",
                !isSelected(d) && isToday(d) && "ring-1 ring-gm-blue text-gm-blue font-medium",
                !isSelected(d) && !isToday(d) && isCurrentMonth(d) && "text-gm-text hover:bg-gm-bg-dim",
                !isCurrentMonth(d) && !isSelected(d) && "text-gm-text-secondary opacity-40"
              )}
            >
              {d.getDate()}
              {dotColors.length > 0 && (
                <div className="absolute bottom-0.5 flex gap-[2px]">
                  {dotColors.map((color, ci) => (
                    <span
                      key={ci}
                      className={cn("w-1 h-1 rounded-full", isSelected(d) ? "bg-white" : "")}
                      style={!isSelected(d) ? { backgroundColor: color } : undefined}
                    />
                  ))}
                </div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ── Sub-components ───────────────────────────────────────────

function NavIcon({ icon: Icon, active, onClick, label, badge, isMobile }: { icon: any; active: boolean; onClick: () => void; label: string; badge?: number; isMobile?: boolean }) {
  return (
    <button
      onClick={onClick}
      title={label}
      aria-label={label}
      aria-current={active ? "page" : undefined}
      className={cn(
        "rounded-2xl flex items-center justify-center transition-all relative",
        isMobile ? "flex-col gap-0.5 w-16 h-14 rounded-xl" : "w-12 h-12",
        active ? "bg-gm-blue-bg text-gm-blue" : "text-gm-text-secondary hover:bg-gm-bg-container"
      )}
    >
      <div className="relative">
        <Icon className="h-5 w-5" />
        {badge != null && badge > 0 && (
          <span className="absolute -top-1.5 -right-2.5 bg-red-500 text-white text-[9px] font-bold rounded-full min-w-[16px] h-4 flex items-center justify-center px-1">
            {badge > 99 ? "99+" : badge}
          </span>
        )}
      </div>
      {isMobile && <span className="text-[10px] leading-none">{label}</span>}
    </button>
  );
}

function SettingsPanel({ settings, setSettings, onSave, onClose, lang, t, accounts, onAddAccount, onRemoveAccount, isDemo, geminiApiKey, onGeminiApiKeyChange }: any) {
  const [showApiKey, setShowApiKey] = useState(false);
  const [apiKeyStatus, setApiKeyStatus] = useState<'idle' | 'testing' | 'success' | 'error'>('idle');
  const [apiKeyError, setApiKeyError] = useState('');

  const testApiKey = async () => {
    if (!geminiApiKey?.trim()) return;
    setApiKeyStatus('testing');
    setApiKeyError('');
    try {
      const { GoogleGenAI } = await import('@google/genai');
      const client = new GoogleGenAI({ apiKey: geminiApiKey });
      const result = await client.models.generateContent({
        model: settings.aiModel || 'gemini-2.5-flash',
        contents: 'Reply with exactly: OK',
      });
      const text = result.text || '';
      if (text) {
        setApiKeyStatus('success');
      } else {
        setApiKeyStatus('error');
        setApiKeyError(lang === 'zh' ? '\u6a21\u578b\u65e0\u54cd\u5e94' : 'No response from model');
      }
    } catch (e: any) {
      setApiKeyStatus('error');
      const msg = e.message || '';
      if (msg.includes('API_KEY_INVALID') || msg.includes('401')) {
        setApiKeyError(lang === 'zh' ? 'API Key \u65e0\u6548\uff0c\u8bf7\u68c0\u67e5' : 'Invalid API Key');
      } else if (msg.includes('PERMISSION_DENIED') || msg.includes('403')) {
        setApiKeyError(lang === 'zh' ? 'API Key \u6ca1\u6709\u6743\u9650' : 'Permission denied');
      } else if (msg.includes('RATE_LIMIT') || msg.includes('429')) {
        // Rate limited but key is valid
        setApiKeyStatus('success');
      } else {
        setApiKeyError(lang === 'zh' ? `\u8fde\u63a5\u5931\u8d25: ${msg.slice(0, 60)}` : `Connection failed: ${msg.slice(0, 60)}`);
      }
    }
  };
  return (
    <div className="fixed inset-0 z-[700] flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      {/* Modal */}
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 10 }}
        transition={{ type: "spring", stiffness: 400, damping: 30 }}
        className="relative w-full max-w-lg max-h-[90vh] bg-gm-bg rounded-2xl shadow-2xl border border-gm-border overflow-hidden mx-4"
      >
        {/* Header */}
        <div className="flex justify-between items-center px-6 py-4 border-b border-gm-border bg-gm-bg-dim sticky top-0 z-10">
          <h1 className="text-lg font-medium text-gm-text-primary">{t.settingsTitle}</h1>
          <Button variant="ghost" size="icon" onClick={onClose} className="h-8 w-8 rounded-full"><X className="h-4 w-4" /></Button>
        </div>

        {/* Scrollable Content */}
        <div className="overflow-y-auto max-h-[calc(90vh-130px)] p-6 space-y-6">
          {/* Account Management Section */}
          <div className="space-y-3">
            <label className="text-sm font-medium text-gm-text-primary">{t.accounts}</label>
            <p className="text-xs text-gm-text-secondary">{t.manageAccounts}</p>
            <div className="space-y-2">
              {(accounts || []).map((a: any) => (
                <div key={a.email} className="flex items-center gap-3 p-3 border border-gm-border rounded-xl bg-gm-bg-dim">
                  <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: a.color }} />
                  <Avatar className="h-8 w-8 border border-gm-border flex-shrink-0">
                    {a.picture && <AvatarImage src={a.picture} />}
                    <AvatarFallback className="text-[10px] bg-gm-bg-container text-gm-text-secondary">
                      {a.name?.[0] || "?"}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gm-text-primary truncate">{a.name}</p>
                    <p className="text-xs text-gm-text-secondary truncate">{a.email}</p>
                  </div>
                  {!isDemo && (accounts || []).length > 1 && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => onRemoveAccount(a.email)}
                      className="text-red-500 hover:text-red-700 hover:bg-red-50 h-7 px-2 text-xs flex-shrink-0"
                    >
                      <Trash2 className="h-3 w-3 mr-1" />
                      {t.removeAccount}
                    </Button>
                  )}
                </div>
              ))}
            </div>
            {isDemo ? (
              <p className="text-[11px] text-gm-text-secondary text-center py-2">
                {t.demoConnectGoogle}
              </p>
            ) : (
              <Button
                variant="outline"
                onClick={onAddAccount}
                className="w-full gap-2 rounded-xl border-dashed border-gm-border-strong hover:bg-gm-bg-dim text-gm-text-secondary"
              >
                <Plus className="h-4 w-4" />
                {t.addAccount}
              </Button>
            )}
          </div>

          {/* Gemini API Key */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-gm-text-primary">{t.geminiApiKey || "Gemini API Key"}</label>
            <p className="text-xs text-gm-text-secondary">{t.geminiApiKeyDesc || "Get your key from aistudio.google.com"}</p>
            <div className="relative">
              <input
                type={showApiKey ? "text" : "password"}
                value={geminiApiKey || ''}
                onChange={(e) => { onGeminiApiKeyChange?.(e.target.value); setApiKeyStatus('idle'); setApiKeyError(''); }}
                placeholder="AIza..."
                className="w-full p-3 pr-10 border border-gm-border-strong rounded-lg focus:outline-none focus:ring-2 focus:ring-gm-blue bg-gm-bg text-gm-text text-sm"
              />
              <button
                type="button"
                onClick={() => setShowApiKey(!showApiKey)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gm-text-secondary hover:text-gm-text"
              >
                <Eye className="h-4 w-4" />
              </button>
            </div>
            {geminiApiKey && (
              <div className="flex items-center gap-2 mt-1">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={testApiKey}
                  disabled={apiKeyStatus === 'testing'}
                  className="h-8 px-3 text-xs gap-1.5 rounded-lg"
                >
                  {apiKeyStatus === 'testing' ? (
                    <><Loader2 className="h-3 w-3 animate-spin" />{lang === "zh" ? "\u6d4b\u8bd5\u4e2d..." : "Testing..."}</>
                  ) : (
                    <>{lang === "zh" ? "\u6d4b\u8bd5\u8fde\u63a5" : "Test Connection"}</>
                  )}
                </Button>
                {apiKeyStatus === 'success' && (
                  <span className="text-[11px] text-green-600 flex items-center gap-1">
                    <CheckCircle2 className="h-3 w-3" />
                    {lang === "zh" ? "API Key \u6709\u6548\uff0c\u8fde\u63a5\u6210\u529f" : "Valid \u2014 connection successful"}
                  </span>
                )}
                {apiKeyStatus === 'error' && (
                  <span className="text-[11px] text-red-500 flex items-center gap-1">
                    <X className="h-3 w-3" />
                    {apiKeyError}
                  </span>
                )}
              </div>
            )}
          </div>

          {/* AI Model */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-gm-text-primary">{t.aiModel}</label>
            <p className="text-xs text-gm-text-secondary">{t.aiModelDesc}</p>
            <select
              className="w-full p-3 border border-gm-border-strong rounded-lg focus:outline-none focus:ring-2 focus:ring-gm-blue bg-gm-bg text-gm-text text-sm"
              value={settings.aiModel}
              onChange={(e) => setSettings({ ...settings, aiModel: e.target.value })}
            >
              <option value="gemini-2.5-flash">{lang === "zh" ? "Gemini 2.5 Flash (\u63a8\u8350)" : "Gemini 2.5 Flash (Recommended)"}</option>
              <option value="gemini-2.5-flash-lite">{lang === "zh" ? "Gemini 2.5 Flash-Lite (\u6700\u5feb)" : "Gemini 2.5 Flash-Lite (Fastest)"}</option>
              <option value="gemini-2.5-pro">{lang === "zh" ? "Gemini 2.5 Pro (\u9ad8\u7ea7)" : "Gemini 2.5 Pro (Advanced)"}</option>
            </select>
          </div>

          {/* Theme */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-gm-text-primary">{t.theme}</label>
            <p className="text-xs text-gm-text-secondary">{t.themeDesc}</p>
            <div className="flex gap-2">
              {(["light", "dark", "system"] as const).map((opt) => (
                <button
                  key={opt}
                  onClick={() => setSettings({ ...settings, theme: opt })}
                  className={cn(
                    "flex-1 py-2.5 px-3 rounded-lg border text-sm font-medium transition-colors",
                    settings.theme === opt
                      ? "border-gm-blue bg-gm-blue-bg text-gm-blue"
                      : "border-gm-border-strong text-gm-text hover:bg-gm-bg-dim"
                  )}
                >
                  {opt === "light" ? t.themeLight : opt === "dark" ? t.themeDark : t.themeSystem}
                </button>
              ))}
            </div>
          </div>

          {/* Email Signature */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-gm-text-primary">{t.emailSignature}</label>
            <p className="text-xs text-gm-text-secondary">{t.emailSignatureDesc}</p>
            <textarea
              className="w-full h-24 p-3 border border-gm-border-strong rounded-lg focus:outline-none focus:ring-2 focus:ring-gm-blue resize-none text-sm bg-gm-bg text-gm-text"
              placeholder={lang === "zh" ? "\u5728\u6b64\u8f93\u5165\u60a8\u7684\u7b7e\u540d..." : "Enter your signature here..."}
              value={settings.signature}
              onChange={(e) => setSettings({ ...settings, signature: e.target.value })}
            />
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gm-border bg-gm-bg-dim flex justify-end gap-3 sticky bottom-0">
          <Button variant="outline" onClick={onClose} className="px-4">{lang === "zh" ? "\u53d6\u6d88" : "Cancel"}</Button>
          <Button onClick={onSave} className="bg-[#1a73e8] hover:bg-[#1557b0] text-white px-6">{t.saveSettings}</Button>
        </div>
      </motion.div>
    </div>
  );
}

function ComposePanel(props: any) {
  const { activeTab, composeTo, setComposeTo, composeCc, setComposeCc, composeBcc, setComposeBcc, composeSubject, setComposeSubject, composeBody, setComposeBody, composeStart, setComposeStart, composeEnd, setComposeEnd, showCcBcc, setShowCcBcc, showDraftInput, draftPrompt, setDraftPrompt, isDrafting, onDraft, onShowDraft, onHideDraft, sendDisabled, sending, onSend, onClose, lang, t, accounts, sendFromAccount, setSendFromAccount, composeAttachments, setComposeAttachments } = props;
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    const current = composeAttachments || [];
    const combined = [...current, ...files];
    const totalSize = combined.reduce((sum: number, f: File) => sum + f.size, 0);
    if (totalSize > 25 * 1024 * 1024) {
      toast.error(t.totalSizeLimit);
      return;
    }
    setComposeAttachments(combined);
    e.target.value = "";
  };

  const removeAttachment = (index: number) => {
    setComposeAttachments((prev: File[]) => prev.filter((_: File, i: number) => i !== index));
  };

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-4">
      <div className="flex justify-between items-center border-b border-gm-border pb-3">
        <h1 className="text-lg font-normal text-gm-text-primary">
          {activeTab === "mail" ? t.compose : t.newEvent}
        </h1>
        <Button variant="ghost" size="icon" onClick={onClose}><X className="h-5 w-5" /></Button>
      </div>
      <div className="space-y-3">
        {/* Account selector — show when multiple accounts exist */}
        {accounts && accounts.length > 1 && (
          <div className="flex items-center gap-2 py-1">
            <span className="text-xs text-gm-text-secondary flex-shrink-0">{t.sendFrom}:</span>
            <select
              value={sendFromAccount}
              onChange={(e) => setSendFromAccount(e.target.value)}
              className="flex-1 text-sm bg-transparent border-b border-gm-border focus:outline-none focus:border-gm-blue text-gm-text p-1 cursor-pointer"
            >
              {accounts.map((a: any) => (
                <option key={a.email} value={a.email}>
                  {a.name} ({a.email})
                </option>
              ))}
            </select>
            <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: accounts.find((a: any) => a.email === sendFromAccount)?.color || "#1a73e8" }} />
          </div>
        )}

        {activeTab === "mail" && (
          <>
            <input
              type="email"
              placeholder="To"
              className="w-full p-3 border-b border-gm-border focus:outline-none focus:border-gm-blue text-gm-text bg-transparent text-sm"
              value={composeTo}
              onChange={(e) => setComposeTo(e.target.value)}
            />
            {!showCcBcc ? (
              <button onClick={() => setShowCcBcc(true)} className="text-xs text-gm-blue hover:underline">
                {t.addCcBcc}
              </button>
            ) : (
              <>
                <input
                  type="text"
                  placeholder="CC"
                  className="w-full p-3 border-b border-gm-border focus:outline-none focus:border-gm-blue text-gm-text bg-transparent text-sm"
                  value={composeCc}
                  onChange={(e) => setComposeCc(e.target.value)}
                />
                <input
                  type="text"
                  placeholder="BCC"
                  className="w-full p-3 border-b border-gm-border focus:outline-none focus:border-gm-blue text-gm-text bg-transparent text-sm"
                  value={composeBcc}
                  onChange={(e) => setComposeBcc(e.target.value)}
                />
              </>
            )}
          </>
        )}
        {activeTab === "calendar" && (
          <div className="flex gap-4">
            <div className="flex-1">
              <label className="block text-xs text-gm-text-secondary mb-1">{t.startTime}</label>
              <input type="datetime-local" className="w-full p-2 border border-gm-border-strong rounded-lg text-sm" value={composeStart} onChange={(e) => setComposeStart(e.target.value)} />
            </div>
            <div className="flex-1">
              <label className="block text-xs text-gm-text-secondary mb-1">{t.endTime}</label>
              <input type="datetime-local" className="w-full p-2 border border-gm-border-strong rounded-lg text-sm" value={composeEnd} onChange={(e) => setComposeEnd(e.target.value)} />
            </div>
          </div>
        )}
        <input
          type="text"
          placeholder={activeTab === "mail" ? "Subject" : "Title"}
          className="w-full p-3 border-b border-gm-border focus:outline-none focus:border-gm-blue text-gm-text bg-transparent text-sm"
          value={composeSubject}
          onChange={(e) => setComposeSubject(e.target.value)}
        />
        <div className="relative">
          <textarea
            className="w-full h-52 p-3 border border-gm-border-strong rounded-lg focus:outline-none focus:ring-2 focus:ring-gm-blue resize-none text-sm"
            placeholder={activeTab === "calendar" ? "Description" : "Body"}
            value={composeBody}
            onChange={(e) => setComposeBody(e.target.value)}
          />
          <DraftOverlay show={showDraftInput} prompt={draftPrompt} setPrompt={setDraftPrompt} drafting={isDrafting} onDraft={onDraft} onHide={onHideDraft} onShow={onShowDraft} lang={lang} />
        </div>
        {/* Compose Attachments */}
        {activeTab === "mail" && (
          <>
            <input type="file" multiple ref={fileInputRef} className="hidden" onChange={handleFileSelect} />
            {(composeAttachments || []).length > 0 && (
              <div className="space-y-1 border border-gm-border rounded-lg p-2">
                {(composeAttachments || []).map((file: File, idx: number) => (
                  <div key={idx} className="flex items-center gap-2 text-xs text-gm-text px-2 py-1 bg-gm-bg-dim rounded">
                    <Paperclip className="h-3 w-3 text-gm-text-secondary flex-shrink-0" />
                    <span className="truncate flex-1">{file.name}</span>
                    <span className="text-gm-text-secondary flex-shrink-0">{formatFileSize(file.size)}</span>
                    <button onClick={() => removeAttachment(idx)} className="text-gm-text-secondary hover:text-red-500 flex-shrink-0" title={t.removeAttachment}>
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
        <div className="flex items-center gap-2 pt-1">
          {activeTab === "mail" && (
            <Button variant="ghost" size="icon" onClick={() => fileInputRef.current?.click()} className="h-9 w-9 text-gm-text-secondary" title={t.addAttachment}>
              <Paperclip className="h-4 w-4" />
            </Button>
          )}
          <div className="flex-1" />
          <Button variant="outline" onClick={onClose} disabled={sending} className="text-sm">{t.cancel}</Button>
          <Button onClick={onSend} disabled={sendDisabled} className="bg-[#1a73e8] hover:bg-[#1557b0] text-white px-6 text-sm">
            {sending ? <RefreshCw className="h-4 w-4 animate-spin mr-2" /> : null}
            {t.send}
          </Button>
        </div>
      </div>
    </div>
  );
}

function DetailPanel(props: any) {
  const { activeTab, item, aiInsights, processing, onProcessAI, isReplying, setIsReplying, replyContent, setReplyContent, sendingReply, onSendReply, onMailAction, onCalendarDelete, onCalendarEdit, editingEvent, onCalendarUpdate, onCancelEventEdit, showDraftInput, draftPrompt, setDraftPrompt, isDrafting, onDraft, onShowDraft, onHideDraft, getHeader, lang, t, isDemo, replyAttachments, setReplyAttachments, attachmentAnalysis, onAnalyzeAttachment, onOpenLightbox, handleMailAction: handleMailActionProp, handleSendFn, setIsComposingNew: setIsComposingNewProp, setComposeTo: setComposeToProp, setComposeSubject: setComposeSubjectProp, setComposeBody: setComposeBodyProp } = props;

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex justify-between items-start gap-2">
        <div className="flex-1 min-w-0">
          <h1 className="text-xl font-normal text-gm-text-primary">
            {activeTab === "mail"
              ? getHeader(item, "Subject")
              : item?.summary}
          </h1>
          {/* Account indicator for multi-account */}
          {item?.accountEmail && item.accountEmail !== "primary" && (
            <div className="flex items-center gap-1.5 mt-1">
              <div className="w-2 h-2 rounded-full" style={{ backgroundColor: item.accountColor || "#1a73e8" }} />
              <span className="text-[11px] text-gm-text-secondary">{item.accountEmail}</span>
            </div>
          )}
        </div>
        <div className="flex gap-1 flex-shrink-0">
          {activeTab === "mail" && !isDemo && (
            <>
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => onMailAction("archive", item.id)} title={t.archive}><Archive className="h-4 w-4 text-gm-text-secondary" /></Button>
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => onMailAction("trash", item.id)} title={t.trash}><Trash2 className="h-4 w-4 text-gm-text-secondary" /></Button>
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => onMailAction(item?.labelIds?.includes("UNREAD") ? "markRead" : "markUnread", item.id)} title={item?.labelIds?.includes("UNREAD") ? t.markRead : t.markUnread}>
                {item?.labelIds?.includes("UNREAD") ? <MailOpen className="h-4 w-4 text-gm-text-secondary" /> : <MailIcon className="h-4 w-4 text-gm-text-secondary" />}
              </Button>
            </>
          )}
          {activeTab === "calendar" && !isDemo && (
            <>
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => onCalendarEdit(item)} title="Edit"><Pencil className="h-4 w-4 text-gm-text-secondary" /></Button>
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => onCalendarDelete(item.id)} title={t.trash}><Trash2 className="h-4 w-4 text-gm-text-secondary" /></Button>
            </>
          )}
        </div>
      </div>

      {/* AI Insights — button-triggered */}
      {processing ? (
        <Card className="border-gm-blue-border-faint bg-gm-blue-bg-faint shadow-none rounded-2xl">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2 text-gm-blue">
              <Sparkles className="h-4 w-4 animate-pulse" />
              {t.aiAssistant}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-2/3" />
          </CardContent>
        </Card>
      ) : aiInsights ? (
        <Card className="border-gm-blue-border-faint bg-gm-blue-bg-faint shadow-none rounded-2xl">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2 text-gm-blue">
              <Sparkles className="h-4 w-4" />
              {t.aiAssistant}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider opacity-40">{t.summary}</span>
              <p className="text-sm text-gm-text leading-relaxed mt-1">{aiInsights.summary}</p>
            </div>
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider opacity-40">{t.action}</span>
              <p className="text-sm text-gm-blue mt-1">{aiInsights.action}</p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Button
          variant="outline"
          onClick={() => onProcessAI(item)}
          className="w-full justify-center gap-2 rounded-2xl border-gm-blue-border-faint text-gm-blue hover:bg-gm-blue-bg py-5"
        >
          <Sparkles className="h-4 w-4" />
          {t.aiAnalyze}
        </Button>
      )}

      {/* Content */}
      <div className="text-sm text-gm-text leading-relaxed">
        {activeTab === "mail" && (
          <MailContent
            item={item}
            isReplying={isReplying}
            setIsReplying={setIsReplying}
            replyContent={replyContent}
            setReplyContent={setReplyContent}
            sendingReply={sendingReply}
            onSendReply={onSendReply}
            showDraftInput={showDraftInput}
            draftPrompt={draftPrompt}
            setDraftPrompt={setDraftPrompt}
            isDrafting={isDrafting}
            onDraft={onDraft}
            onShowDraft={onShowDraft}
            onHideDraft={onHideDraft}
            getHeader={getHeader}
            lang={lang}
            t={t}
            isDemo={isDemo}
            replyAttachments={replyAttachments}
            setReplyAttachments={setReplyAttachments}
            attachmentAnalysis={attachmentAnalysis}
            onAnalyzeAttachment={onAnalyzeAttachment}
            onOpenLightbox={onOpenLightbox}
          />
        )}
        {activeTab === "calendar" && (
          editingEvent?.id === item?.id ? (
            <CalendarEditor event={editingEvent} onSave={onCalendarUpdate} onCancel={onCancelEventEdit} lang={lang} t={t} isDemo={isDemo} />
          ) : (
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-gm-text-secondary text-xs">
                <Clock className="h-4 w-4" />
                {item?.start?.dateTime
                  ? new Date(item.start.dateTime).toLocaleString()
                  : item?.start?.date}
                {item?.end?.dateTime && ` — ${new Date(item.end.dateTime).toLocaleTimeString()}`}
              </div>
              {item?.location && (
                <p className="text-xs text-gm-text-secondary">📍 {item.location}</p>
              )}
              <div className="whitespace-pre-wrap pt-2">
                {item?.description || props.t?.noDescription || "No description"}
              </div>
            </div>
          )
        )}
      </div>
    </div>
  );
}

function MailContent(props: any) {
  const { item, isReplying, setIsReplying, replyContent, setReplyContent, sendingReply, onSendReply, showDraftInput, draftPrompt, setDraftPrompt, isDrafting, onDraft, onShowDraft, onHideDraft, getHeader, lang, t, replyAttachments, setReplyAttachments, attachmentAnalysis, onAnalyzeAttachment, onOpenLightbox } = props;

  const { isDemo: demoMode } = props;
  const body = decodeEmailBody(item?.payload);
  const replyFileInputRef = useRef<HTMLInputElement>(null);
  const [analyzeDropdown, setAnalyzeDropdown] = useState<string | null>(null);

  const handleReplyFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    const current = replyAttachments || [];
    const combined = [...current, ...files];
    const totalSize = combined.reduce((sum: number, f: File) => sum + f.size, 0);
    if (totalSize > 25 * 1024 * 1024) {
      toast.error(t.totalSizeLimit);
      return;
    }
    setReplyAttachments(combined);
    e.target.value = "";
  };

  const removeReplyAttachment = (index: number) => {
    setReplyAttachments((prev: File[]) => prev.filter((_: File, i: number) => i !== index));
  };

  const isAnalyzableType = (mimeType: string) => {
    return mimeType.startsWith("image/") || mimeType.includes("pdf") || mimeType.includes("document") || mimeType.includes("text") || mimeType.includes("spreadsheet") || mimeType.includes("presentation");
  };

  const analysisOptions = [
    { key: "summary", icon: "\uD83D\uDCC4", label: t?.documentSummary || "Summary" },
    { key: "contract", icon: "\uD83D\uDCCB", label: t?.contractReview || "Contract Review" },
    { key: "invoice", icon: "\uD83E\uDDFE", label: t?.invoiceExtract || "Invoice Extract" },
    { key: "general", icon: "\uD83D\uDD0D", label: t?.generalAnalysis || "General Analysis" },
  ];

  return (
    <div className="space-y-4">
      {/* Sender info */}
      <div className="flex items-center gap-3 pb-2 border-b border-gm-border">
        <Avatar className="h-10 w-10">
          <AvatarFallback className="bg-gm-blue-bg text-gm-blue text-sm">
            {(getHeader(item, "From") || "?")[0].toUpperCase()}
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0">
          <p className="text-sm font-medium truncate">{getHeader(item, "From")}</p>
          <p className="text-xs text-gm-text-secondary">{formatDate(getHeader(item, "Date"), true)}</p>
        </div>
      </div>

      {/* Body */}
      {body.html ? (
        <iframe
          srcDoc={sanitizeHtml(body.html)}
          title="Email Content"
          className="w-full min-h-[250px] border border-gm-border rounded-lg bg-gm-bg"
          sandbox=""
          onLoad={(e) => {
            const iframe = e.target as HTMLIFrameElement;
            try {
              if (iframe.contentWindow?.document.body) {
                iframe.style.height = Math.max(250, iframe.contentWindow.document.body.scrollHeight + 40) + "px";
              }
            } catch (_) {}
          }}
        />
      ) : (
        <div className="whitespace-pre-wrap">{body.text || item?.snippet || ""}</div>
      )}

      {/* Attachments — enhanced with inline preview + AI analysis */}
      {(() => {
        const attachments = getAttachments(item?.payload);
        if (attachments.length === 0) return null;
        return (
          <div className="mt-4 border border-gm-border rounded-xl overflow-hidden">
            <div className="px-3 py-2 bg-gm-bg-dim border-b border-gm-border flex items-center gap-2">
              <Paperclip className="h-3.5 w-3.5 text-gm-text-secondary" />
              <span className="text-xs font-medium text-gm-text-secondary">
                {attachments.length} {t?.attachments || "attachment(s)"}
              </span>
            </div>
            <div className="divide-y divide-gm-border">
              {attachments.map((att, i) => {
                const hasDownload = att.attachmentId && item?.id;
                const isImage = att.mimeType.startsWith("image/");
                const isPdf = att.mimeType.includes("pdf");
                const analysisKey = `${item.id}-${att.attachmentId}`;
                const analysis = attachmentAnalysis?.[analysisKey];
                const isDropdownOpen = analyzeDropdown === analysisKey;

                const handleDownload = async () => {
                  if (demoMode || !hasDownload) {
                    toast.info(t?.demoDownload || "Demo: connect Google to download");
                    return;
                  }
                  try {
                    const acctEmail = item.accountEmail;
                    const token = acctEmail ? authService.getValidToken(acctEmail) : authService.getFirstValidToken();
                    if (!token) { toast.error('No valid token available'); return; }
                    const blob = await gmail.downloadAttachment(token, item.id, att.attachmentId!, att.mimeType);
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = att.filename;
                    document.body.appendChild(a);
                    a.click();
                    document.body.removeChild(a);
                    URL.revokeObjectURL(url);
                  } catch (e: any) {
                    toast.error(`Download failed: ${e.message}`);
                  }
                };

                const handlePreview = async (type: "image" | "pdf") => {
                  if (demoMode || !hasDownload) {
                    toast.info(t?.demoDownload || "Demo: connect Google to preview");
                    return;
                  }
                  try {
                    const acctEmail = item.accountEmail;
                    const token = acctEmail ? authService.getValidToken(acctEmail) : authService.getFirstValidToken();
                    if (!token) { toast.error('No valid token available'); return; }
                    const attData = await gmail.getAttachment(token, item.id, att.attachmentId!);
                    const blob = base64ToBlob(attData.data, att.mimeType);
                    const url = URL.createObjectURL(blob);
                    onOpenLightbox?.({ src: url, type });
                  } catch (e: any) {
                    toast.error(`Preview failed: ${e.message}`);
                  }
                };

                return (
                  <div key={i}>
                    <div className="px-3 py-2.5 flex items-center gap-3 hover:bg-gm-bg-dim transition-colors group">
                      <AttachmentIcon mimeType={att.mimeType} />
                      <span className="text-sm text-gm-text truncate flex-1">{att.filename}</span>
                      {att.size > 0 && <span className="text-[11px] text-gm-text-secondary flex-shrink-0">{formatFileSize(att.size)}</span>}

                      {/* AI Analyze button (Feature 14) */}
                      {isAnalyzableType(att.mimeType) && att.attachmentId && (
                        <div className="relative flex-shrink-0">
                          <button
                            onClick={() => setAnalyzeDropdown(isDropdownOpen ? null : analysisKey)}
                            disabled={analysis?.loading}
                            className={cn(
                              "p-1.5 rounded-lg transition-colors",
                              analysis?.loading
                                ? "text-gm-blue"
                                : "text-gm-text-secondary hover:text-gm-blue hover:bg-gm-bg-container opacity-0 group-hover:opacity-100"
                            )}
                            title={t?.analyzeAttachment || "Analyze"}
                          >
                            {analysis?.loading ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                          </button>
                          {isDropdownOpen && (
                            <div className="absolute right-0 top-full mt-1 z-20 bg-gm-bg border border-gm-border rounded-xl shadow-lg py-1 min-w-[180px]">
                              {analysisOptions.map(opt => (
                                <button
                                  key={opt.key}
                                  onClick={() => {
                                    setAnalyzeDropdown(null);
                                    onAnalyzeAttachment?.(item.id, att.attachmentId, att.filename, att.mimeType, opt.key);
                                  }}
                                  className="w-full text-left px-3 py-2 text-sm text-gm-text hover:bg-gm-bg-dim flex items-center gap-2"
                                >
                                  <span>{opt.icon}</span>
                                  <span>{opt.label}</span>
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      )}

                      {/* Preview button for PDF (Feature 10) */}
                      {isPdf && hasDownload && (
                        <button
                          onClick={() => handlePreview("pdf")}
                          className="flex-shrink-0 p-1.5 rounded-lg hover:bg-gm-bg-container text-gm-text-secondary hover:text-gm-blue transition-colors opacity-0 group-hover:opacity-100"
                          title={t?.preview || "Preview"}
                        >
                          <Eye className="h-4 w-4" />
                        </button>
                      )}

                      {hasDownload ? (
                        <button
                          onClick={handleDownload}
                          className="flex-shrink-0 p-1.5 rounded-lg hover:bg-gm-bg-container text-gm-text-secondary hover:text-gm-blue transition-colors opacity-0 group-hover:opacity-100"
                          title="Download"
                        >
                          <Download className="h-4 w-4" />
                        </button>
                      ) : null}
                    </div>

                    {/* Inline image thumbnail (Feature 10) */}
                    {isImage && hasDownload && (
                      <div className="px-3 pb-2">
                        {demoMode ? (
                          <div className="w-full max-h-[200px] bg-gm-bg-dim rounded-lg flex items-center justify-center text-gm-text-secondary text-xs py-8 border border-gm-border">
                            <Image className="h-5 w-5 mr-2 opacity-50" />
                            {t?.imagePreview || "Image Preview"}
                          </div>
                        ) : (
                          <button
                            onClick={() => handlePreview("image")}
                            className="text-xs text-gm-blue hover:underline flex items-center gap-1 py-1"
                          >
                            <ZoomIn className="h-3 w-3" />
                            {t?.preview || "Preview Image"}
                          </button>
                        )}
                      </div>
                    )}

                    {/* AI Analysis result panel (Feature 14) */}
                    {analysis?.result && (
                      <div className="px-3 pb-3">
                        <div className="border border-gm-blue-border-faint bg-gm-blue-bg-faint rounded-lg p-3">
                          <div className="flex items-center gap-2 mb-2">
                            <Sparkles className="h-3.5 w-3.5 text-gm-blue" />
                            <span className="text-xs font-medium text-gm-blue">{t?.analysisComplete || "Analysis Complete"}</span>
                          </div>
                          {analysis.result.type === "json" ? (
                            <div className="space-y-1.5">
                              {Object.entries(analysis.result.content).map(([key, value]) => (
                                <div key={key} className="flex gap-2 text-xs">
                                  <span className="font-medium text-gm-text-secondary capitalize min-w-[80px]">{key}:</span>
                                  <span className="text-gm-text">
                                    {Array.isArray(value) ? (value as string[]).join(", ") : String(value)}
                                  </span>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <div className="text-sm">
                              <RichMarkdown text={analysis.result.content || ""} />
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })()}

      {/* Reply */}
      {isReplying ? (
        <div className="mt-6 space-y-3 border border-gm-border rounded-xl p-4 bg-gm-bg-dim">
          <div className="relative">
            <textarea
              className="w-full h-28 p-3 border border-gm-border-strong rounded-lg focus:outline-none focus:ring-2 focus:ring-gm-blue text-sm resize-none"
              placeholder={t?.reply ? `${t.reply}...` : "Write your reply..."}
              value={replyContent}
              onChange={(e) => setReplyContent(e.target.value)}
            />
            <DraftOverlay show={showDraftInput} prompt={draftPrompt} setPrompt={setDraftPrompt} drafting={isDrafting} onDraft={onDraft} onHide={onHideDraft} onShow={onShowDraft} lang={lang} />
          </div>
          {/* Reply Attachments */}
          <input type="file" multiple ref={replyFileInputRef} className="hidden" onChange={handleReplyFileSelect} />
          {(replyAttachments || []).length > 0 && (
            <div className="space-y-1 border border-gm-border rounded-lg p-2">
              {(replyAttachments || []).map((file: File, idx: number) => (
                <div key={idx} className="flex items-center gap-2 text-xs text-gm-text px-2 py-1 bg-gm-bg rounded">
                  <Paperclip className="h-3 w-3 text-gm-text-secondary flex-shrink-0" />
                  <span className="truncate flex-1">{file.name}</span>
                  <span className="text-gm-text-secondary flex-shrink-0">{formatFileSize(file.size)}</span>
                  <button onClick={() => removeReplyAttachment(idx)} className="text-gm-text-secondary hover:text-red-500 flex-shrink-0" title={t?.removeAttachment}>
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </div>
          )}
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" onClick={() => replyFileInputRef.current?.click()} className="h-8 w-8 text-gm-text-secondary" title={t?.addAttachment || "Add attachment"}>
              <Paperclip className="h-3.5 w-3.5" />
            </Button>
            <div className="flex-1" />
            <Button variant="outline" size="sm" onClick={() => setIsReplying(false)} disabled={sendingReply}>{t?.cancel || "Cancel"}</Button>
            <Button size="sm" onClick={onSendReply} disabled={sendingReply || !replyContent.trim()} className="bg-[#1a73e8] hover:bg-[#1557b0] text-white">
              {sendingReply ? <RefreshCw className="h-3 w-3 animate-spin mr-1" /> : null}
              {t?.send || "Send"}
            </Button>
          </div>
        </div>
      ) : (
        <div className="mt-6 flex gap-2">
          <Button onClick={() => setIsReplying(true)} variant="outline" className="gap-2 rounded-full border-gm-border-strong text-sm">
            <MessageSquare className="h-4 w-4" />
            {t?.reply || "Reply"}
          </Button>
          {item?.id && !demoMode && (
            <a
              href={`https://mail.google.com/mail/u/0/#inbox/${item.threadId || item.id}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              <Button variant="outline" className="gap-2 rounded-full border-gm-border-strong text-sm">
                <ExternalLink className="h-4 w-4" />
                {t?.viewInGmail || "View in Gmail"}
              </Button>
            </a>
          )}
        </div>
      )}
    </div>
  );
}

function CalendarEditor({ event, onSave, onCancel, lang, t, isDemo }: { event: CalendarEvent; onSave: (e: CalendarEvent) => void; onCancel: () => void; lang: string; t: any; isDemo: boolean }) {
  const [summary, setSummary] = useState(event.summary);
  const toLocalDatetime = (dt?: string) => {
    if (!dt) return "";
    const d = new Date(dt);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}T${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  };
  const [start, setStart] = useState(toLocalDatetime(event.start?.dateTime));
  const [end, setEnd] = useState(toLocalDatetime(event.end?.dateTime));
  const [description, setDescription] = useState(event.description || "");

  return (
    <div className="space-y-3 border border-gm-border rounded-xl p-4 bg-gm-bg-dim">
      <div className="space-y-1">
        <label className="text-[10px] font-bold uppercase tracking-wider text-gm-text-secondary">Title</label>
        <input
          className="w-full p-2 border border-gm-border-strong rounded-lg text-sm font-medium bg-gm-bg text-gm-text"
          value={summary}
          onChange={(e) => setSummary(e.target.value)}
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <label className="text-[10px] font-bold uppercase tracking-wider text-gm-text-secondary">{t.startTime}</label>
          <input
            type="datetime-local"
            className="w-full p-2 border border-gm-border-strong rounded-lg text-sm bg-gm-bg text-gm-text"
            value={start}
            onChange={(e) => setStart(e.target.value)}
          />
        </div>
        <div className="space-y-1">
          <label className="text-[10px] font-bold uppercase tracking-wider text-gm-text-secondary">{t.endTime}</label>
          <input
            type="datetime-local"
            className="w-full p-2 border border-gm-border-strong rounded-lg text-sm bg-gm-bg text-gm-text"
            value={end}
            onChange={(e) => setEnd(e.target.value)}
          />
        </div>
      </div>
      <div className="space-y-1">
        <label className="text-[10px] font-bold uppercase tracking-wider text-gm-text-secondary">Description</label>
        <textarea
          className="w-full h-28 p-2 border border-gm-border-strong rounded-lg text-sm resize-none bg-gm-bg text-gm-text"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="..."
        />
      </div>
      <div className="flex justify-end gap-2">
        <Button variant="outline" size="sm" onClick={onCancel} className="border-gm-border-strong">{t.cancel}</Button>
        <Button
          size="sm"
          onClick={() => onSave({
            ...event,
            summary,
            description,
            start: { dateTime: new Date(start).toISOString() },
            end: { dateTime: new Date(end).toISOString() },
          })}
          disabled={!summary.trim() || !start || !end || isDemo}
          className="bg-[#1a73e8] hover:bg-[#1557b0] text-white"
        >
{t.save}
        </Button>
      </div>
    </div>
  );
}

function DraftOverlay({ show, prompt, setPrompt, drafting, onDraft, onHide, onShow, lang }: any) {
  if (show) {
    return (
      <div className="absolute bottom-3 left-3 right-3 flex gap-2 bg-gm-bg p-2 rounded-lg shadow-lg border border-gm-border">
        <input
          type="text"
          className="flex-1 text-sm outline-none px-2"
          placeholder={lang === "zh" ? "告诉 AI 你想写什么..." : "Tell AI what to write..."}
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && onDraft()}
          autoFocus
        />
        <Button size="sm" onClick={onDraft} disabled={drafting} className="bg-[#1a73e8] text-white h-8">
          {drafting ? <RefreshCw className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
        </Button>
        <Button size="sm" variant="ghost" onClick={onHide} className="h-8"><X className="h-3 w-3" /></Button>
      </div>
    );
  }
  return (
    <div className="absolute bottom-3 left-3">
      <Button variant="outline" size="sm" className="rounded-full gap-1 border-gm-border-strong text-gm-blue hover:bg-gm-blue-bg bg-gm-bg text-xs" onClick={onShow}>
        <Sparkles className="h-3 w-3" />
        {lang === "zh" ? "AI 帮我写" : "Draft with AI"}
      </Button>
    </div>
  );
}

function AIChatPanel({ messages, input, setInput, streaming, onSend, chatEndRef, lang, t, isMobile, onClearChat, data, onDraftReply, onArchiveEmail }: {
  messages: ChatMessage[];
  input: string;
  setInput: (v: string) => void;
  streaming: boolean;
  onSend: (msg?: string) => void;
  chatEndRef: React.RefObject<HTMLDivElement | null>;
  lang: string;
  t: any;
  isMobile: boolean;
  onClearChat: () => void;
  data: { mail: any[]; calendar: any[] };
  onDraftReply?: (subject: string) => void;
  onArchiveEmail?: (messageId: string) => void;
}) {
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Dynamic chips based on actual data
  const unreadCount = data.mail.filter((m: any) => m.labelIds?.includes("UNREAD")).length;
  const eventCount = data.calendar.length;
  const hour = new Date().getHours();

  const chips = [
    {
      icon: "☀️",
      label: hour < 12 ? (lang === "zh" ? "早间简报" : "Morning Brief") : hour < 18 ? (lang === "zh" ? "下午概览" : "Afternoon Check") : (lang === "zh" ? "今日总结" : "End of Day"),
      query: lang === "zh" ? "帮我整理今天需要关注的邮件和日程，给出优先级建议。" : "Summarize my emails and calendar for today with priority suggestions.",
    },
    {
      icon: "📧",
      label: unreadCount > 0 ? (lang === "zh" ? `${unreadCount} 封未读` : `${unreadCount} Unread`) : (lang === "zh" ? "邮件总结" : "Email Summary"),
      query: lang === "zh" ? "总结所有未读邮件的要点，按紧急程度排序。" : "Summarize all unread emails, sorted by urgency.",
    },
    {
      icon: "📅",
      label: eventCount > 0 ? (lang === "zh" ? `${eventCount} 个日程` : `${eventCount} Events`) : (lang === "zh" ? "日程安排" : "Schedule"),
      query: lang === "zh" ? "查看今天和本周的日程安排，检查是否有冲突。" : "Show my schedule for today and this week, check for conflicts.",
    },
    {
      icon: "✍️",
      label: lang === "zh" ? "草拟邮件" : "Draft Email",
      query: lang === "zh" ? "帮我草拟邮件。" : "Help me draft an email.",
    },
  ];

  // Follow-up suggestions after AI response
  const followUpChips = [
    { label: lang === "zh" ? "更详细" : "More detail", query: lang === "zh" ? "请更详细地解释一下。" : "Can you elaborate on that?" },
    { label: lang === "zh" ? "草拟回复" : "Draft reply", query: lang === "zh" ? "帮我草拟一封回复邮件。" : "Help me draft a reply." },
    { label: lang === "zh" ? "其他建议" : "Other suggestions", query: lang === "zh" ? "还有什么其他建议吗？" : "Any other suggestions?" },
  ];

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  return (
    <div className="flex-1 flex flex-col min-w-0">
      {/* Chat messages */}
      <div className="flex-1 overflow-y-auto overscroll-contain">
        <div className="max-w-3xl mx-auto px-4 py-6 space-y-1">
          {messages.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 space-y-8">
              <div className="w-20 h-20 rounded-full bg-gm-blue-bg-faint flex items-center justify-center">
                <Bot className="h-9 w-9 text-gm-blue opacity-70" />
              </div>
              <div className="text-center space-y-2">
                <h2 className="text-lg font-medium text-gm-text-primary">{t.aiChat}</h2>
                <p className="text-sm text-gm-text-secondary max-w-sm mx-auto">{t.aiChatWelcome}</p>
              </div>
              {/* Dynamic chip grid */}
              <div className={cn("grid gap-2 w-full max-w-md", isMobile ? "grid-cols-1 px-4" : "grid-cols-2")}>
                {chips.map((chip) => (
                  <button
                    key={chip.label}
                    onClick={() => onSend(chip.query)}
                    className="flex items-center gap-3 px-4 py-3 rounded-xl border border-gm-border-strong text-left hover:bg-gm-blue-bg hover:border-gm-blue transition-all group"
                  >
                    <span className="text-lg">{chip.icon}</span>
                    <span className="text-sm text-gm-text-primary group-hover:text-gm-blue font-medium">{chip.label}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((msg, msgIdx) => (
            <div key={msg.id}>
              <div className={cn("flex gap-3 py-3", msg.role === "user" ? "justify-end" : "justify-start")}>
                {msg.role === "assistant" && (
                  <div className="flex-shrink-0 w-8 h-8 rounded-full bg-gm-blue-bg-faint flex items-center justify-center mt-0.5">
                    <Bot className="h-4 w-4 text-gm-blue" />
                  </div>
                )}
                <div className="max-w-[85%] group/msg relative">
                  <div className={cn(
                    "rounded-2xl px-4 py-3 text-sm leading-relaxed",
                    msg.role === "user"
                      ? "bg-gm-blue text-white rounded-br-md"
                      : "bg-gm-bg-container text-gm-text rounded-bl-md"
                  )}>
                    {msg.role === "assistant" ? (
                      <RichMarkdown text={msg.text || (streaming && msg.text === "" ? t.aiThinking : "")} />
                    ) : (
                      <span>{msg.text}</span>
                    )}
                    {streaming && msg.role === "assistant" && msg.text && msg === messages[messages.length - 1] && (
                      <span className="inline-block w-1.5 h-4 bg-gm-blue ml-0.5 animate-pulse rounded-sm" />
                    )}
                  </div>
                  {/* Message actions — copy + timestamp */}
                  {msg.role === "assistant" && msg.text && !streaming && (
                    <div className="flex items-center gap-2 mt-1 opacity-0 group-hover/msg:opacity-100 transition-opacity">
                      <button
                        onClick={() => handleCopy(msg.text, msg.id)}
                        className="text-[11px] text-gm-text-secondary hover:text-gm-blue flex items-center gap-1"
                      >
                        {copiedId === msg.id ? (
                          <><CheckCircle2 className="h-3 w-3" /> {lang === "zh" ? "已复制" : "Copied"}</>
                        ) : (
                          <>{lang === "zh" ? "复制" : "Copy"}</>
                        )}
                      </button>
                      <span className="text-[10px] text-gm-text-secondary opacity-50">
                        {msg.timestamp instanceof Date ? msg.timestamp.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : ""}
                      </span>
                    </div>
                  )}
                  {/* Feature 15: Quick action chips based on AI response keywords */}
                  {msg.role === "assistant" && msg.text && !streaming && (() => {
                    const txt = msg.text.toLowerCase();
                    const hasReply = /reply|回复|草拟|draft/.test(txt);
                    const hasArchive = /archive|归档/.test(txt);
                    if (!hasReply && !hasArchive) return null;
                    return (
                      <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                        <span className="text-[10px] text-gm-text-secondary font-medium">{t?.quickActions || "Quick Actions"}:</span>
                        {hasReply && (
                          <button
                            onClick={() => onDraftReply?.("")}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full border border-gm-blue-border-faint bg-gm-blue-bg text-gm-blue text-[11px] font-medium hover:bg-gm-blue hover:text-white transition-colors"
                          >
                            <MessageSquare className="h-3 w-3" />
                            {t?.draftReply || "Draft Reply"}
                          </button>
                        )}
                        {hasArchive && data.mail.length > 0 && (
                          <button
                            onClick={() => {
                              const firstUnread = data.mail.find((m: any) => m.labelIds?.includes("UNREAD"));
                              if (firstUnread) onArchiveEmail?.(firstUnread.id);
                            }}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full border border-gm-border text-gm-text-secondary text-[11px] font-medium hover:bg-gm-bg-dim transition-colors"
                          >
                            <Archive className="h-3 w-3" />
                            {t?.archive || "Archive"}
                          </button>
                        )}
                      </div>
                    );
                  })()}
                </div>
                {msg.role === "user" && (
                  <div className="flex-shrink-0 w-8 h-8 rounded-full bg-gm-bg-container border border-gm-border flex items-center justify-center mt-0.5">
                    <User className="h-4 w-4 text-gm-text-secondary" />
                  </div>
                )}
              </div>
            </div>
          ))}
          <div ref={chatEndRef} />
        </div>
      </div>

      {/* Follow-up chips after AI response */}
      {messages.length > 0 && !streaming && (
        <div className="max-w-3xl mx-auto w-full px-4 pb-2">
          <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
            {(messages[messages.length - 1]?.role === "assistant" ? followUpChips : chips).map((chip) => (
              <button
                key={chip.label}
                onClick={() => onSend(chip.query)}
                className="flex-shrink-0 px-3 py-1.5 rounded-full border border-gm-border text-xs text-gm-blue hover:bg-gm-blue-bg transition-colors whitespace-nowrap"
              >
                {"icon" in chip && <span className="mr-1">{(chip as any).icon}</span>}
                {chip.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Input bar */}
      <div className="border-t border-gm-border bg-gm-bg px-4 py-3">
        <div className="max-w-3xl mx-auto flex gap-2 items-end">
          <textarea
            className="flex-1 resize-none rounded-2xl border border-gm-border-strong bg-gm-bg-container px-4 py-3 text-sm text-gm-text outline-none focus:ring-2 focus:ring-gm-blue min-h-[44px] max-h-[120px]"
            rows={1}
            placeholder={t.aiChatPlaceholder}
            value={input}
            onChange={(e) => {
              setInput(e.target.value);
              e.target.style.height = "auto";
              e.target.style.height = Math.min(e.target.scrollHeight, 120) + "px";
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                onSend();
              }
            }}
            disabled={streaming}
          />
          <Button
            onClick={() => onSend()}
            disabled={!input.trim() || streaming}
            className="h-11 w-11 rounded-full bg-gm-blue hover:bg-[#1557b0] text-white flex-shrink-0 p-0"
          >
            {streaming ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </Button>
        </div>
      </div>
    </div>
  );
}

// Rich markdown renderer — supports ## headers, **bold**, tables, code blocks, bullets, ---
function RichMarkdown({ text }: { text: string }) {
  if (!text) return null;

  const lines = text.split("\n");
  const elements: React.ReactNode[] = [];
  let i = 0;

  const renderInline = (str: string, keyPrefix: string = "") => {
    // Bold + inline code
    return str.split(/(\*\*.*?\*\*|`[^`]+`)/g).map((part, j) => {
      if (part.startsWith("**") && part.endsWith("**")) {
        return <strong key={`${keyPrefix}-${j}`} className="font-semibold">{part.slice(2, -2)}</strong>;
      }
      if (part.startsWith("`") && part.endsWith("`")) {
        return <code key={`${keyPrefix}-${j}`} className="bg-gm-bg-dim px-1.5 py-0.5 rounded text-xs font-mono">{part.slice(1, -1)}</code>;
      }
      return <span key={`${keyPrefix}-${j}`}>{part}</span>;
    });
  };

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    // Table detection
    if (trimmed.startsWith("|") && trimmed.endsWith("|")) {
      const tableRows: string[][] = [];
      let hasHeader = false;
      while (i < lines.length && lines[i].trim().startsWith("|")) {
        const row = lines[i].trim();
        if (row.match(/^\|[\s\-:|]+\|$/)) { hasHeader = true; i++; continue; } // separator row
        const cells = row.split("|").filter((_, ci) => ci > 0 && ci < row.split("|").length - 1).map(c => c.trim());
        tableRows.push(cells);
        i++;
      }
      elements.push(
        <div key={`t-${i}`} className="overflow-x-auto my-2">
          <table className="text-xs border-collapse w-full">
            {hasHeader && tableRows.length > 0 && (
              <thead>
                <tr className="border-b border-gm-border">
                  {tableRows[0].map((cell, ci) => (
                    <th key={ci} className="px-3 py-1.5 text-left font-semibold text-gm-text-secondary">{renderInline(cell)}</th>
                  ))}
                </tr>
              </thead>
            )}
            <tbody>
              {tableRows.slice(hasHeader ? 1 : 0).map((row, ri) => (
                <tr key={ri} className="border-b border-gm-border last:border-b-0">
                  {row.map((cell, ci) => (
                    <td key={ci} className="px-3 py-1.5">{renderInline(cell)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
      continue;
    }

    // Code block
    if (trimmed.startsWith("```")) {
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith("```")) {
        codeLines.push(lines[i]);
        i++;
      }
      i++; // skip closing ```
      elements.push(
        <pre key={`code-${i}`} className="bg-gm-bg-dim rounded-lg p-3 my-2 overflow-x-auto text-xs font-mono text-gm-text leading-relaxed">
          {codeLines.join("\n")}
        </pre>
      );
      continue;
    }

    // H2 header
    if (trimmed.startsWith("## ")) {
      elements.push(<h3 key={i} className="text-base font-semibold text-gm-text-primary mt-3 mb-1 flex items-center gap-2">{renderInline(trimmed.slice(3))}</h3>);
      i++; continue;
    }
    // H3 header
    if (trimmed.startsWith("### ")) {
      elements.push(<h4 key={i} className="text-sm font-semibold text-gm-text-primary mt-2 mb-0.5">{renderInline(trimmed.slice(4))}</h4>);
      i++; continue;
    }
    // Horizontal rule
    if (trimmed === "---" || trimmed === "***") {
      elements.push(<hr key={i} className="border-gm-border my-2" />);
      i++; continue;
    }
    // Bullet point
    if (trimmed.startsWith("- ") || trimmed.match(/^\d+\.\s/)) {
      const indent = trimmed.startsWith("- ") ? "pl-3" : "pl-3";
      const content = trimmed.startsWith("- ") ? trimmed.slice(2) : trimmed.replace(/^\d+\.\s/, "");
      const bullet = trimmed.startsWith("- ") ? "•" : trimmed.match(/^\d+/)?.[0] + ".";
      elements.push(
        <div key={i} className={cn("flex gap-2", indent)}>
          <span className="text-gm-text-secondary flex-shrink-0 w-4 text-right">{bullet}</span>
          <span>{renderInline(content)}</span>
        </div>
      );
      i++; continue;
    }
    // Empty line
    if (trimmed === "") { elements.push(<div key={i} className="h-1.5" />); i++; continue; }
    // Normal paragraph
    elements.push(<div key={i}>{renderInline(trimmed)}</div>);
    i++;
  }

  return <div className="space-y-0.5">{elements}</div>;
}

function ConfirmDialog({ message, onConfirm, onCancel, t }: { message: string; onConfirm: () => void; onCancel: () => void; t: any }) {
  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={onCancel}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.15 }}
    >
      <motion.div
        className="bg-gm-bg rounded-2xl shadow-xl p-6 max-w-sm w-full mx-4 space-y-4"
        onClick={(e) => e.stopPropagation()}
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.95, opacity: 0 }}
        transition={{ type: "spring", stiffness: 400, damping: 30 }}
      >
        <p className="text-gm-text-primary text-sm">{message}</p>
        <div className="flex justify-end gap-2">
          <Button variant="outline" size="sm" onClick={onCancel} className="border-gm-border-strong">{t.cancel}</Button>
          <Button size="sm" onClick={onConfirm} className="bg-red-600 hover:bg-red-700 text-white">{t.confirm}</Button>
        </div>
      </motion.div>
    </motion.div>
  );
}

// Feature 10: Attachment Lightbox
function AttachmentLightbox({ src, type, onClose, t }: { src: string; type: "image" | "pdf"; onClose: () => void; t: any }) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  return (
    <motion.div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/80"
      onClick={onClose}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.15 }}
    >
      <button
        onClick={onClose}
        className="absolute top-4 right-4 z-10 p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors"
        title={t?.closePreview || "Close"}
      >
        <X className="h-6 w-6" />
      </button>
      <div className="max-w-[90vw] max-h-[90vh] flex items-center justify-center" onClick={(e) => e.stopPropagation()}>
        {type === "image" ? (
          <img src={src} alt="Preview" className="max-w-full max-h-[90vh] rounded-lg shadow-2xl" />
        ) : (
          <iframe src={src} title="PDF Preview" className="w-[80vw] h-[85vh] rounded-lg bg-white shadow-2xl" />
        )}
      </div>
    </motion.div>
  );
}

// ── Utilities ────────────────────────────────────────────────

function useIsMobile() {
  const [mobile, setMobile] = useState(window.innerWidth < 768);
  useEffect(() => {
    const handler = () => setMobile(window.innerWidth < 768);
    window.addEventListener("resize", handler);
    return () => window.removeEventListener("resize", handler);
  }, []);
  return mobile;
}

function formatDate(dateStr?: string, full = false): string {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  if (full) return d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
  const now = new Date();
  if (d.toDateString() === now.toDateString()) {
    return d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  }
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function getAttachments(payload: any): { filename: string; mimeType: string; size: number; attachmentId?: string }[] {
  if (!payload?.parts) return [];
  const attachments: { filename: string; mimeType: string; size: number; attachmentId?: string }[] = [];
  const walk = (parts: any[]) => {
    for (const part of parts) {
      if (part.filename && part.filename.length > 0) {
        attachments.push({
          filename: part.filename,
          mimeType: part.mimeType || "application/octet-stream",
          size: part.body?.size || 0,
          attachmentId: part.body?.attachmentId || undefined,
        });
      }
      if (part.parts) walk(part.parts);
    }
  };
  walk(payload.parts);
  return attachments;
}

function formatFileSize(bytes: number): string {
  if (bytes === 0) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function AttachmentIcon({ mimeType }: { mimeType: string }) {
  if (mimeType.startsWith("image/")) return <Image className="h-4 w-4 text-gm-text-secondary" />;
  if (mimeType.includes("pdf") || mimeType.includes("document") || mimeType.includes("text")) return <FileText className="h-4 w-4 text-gm-text-secondary" />;
  return <File className="h-4 w-4 text-gm-text-secondary" />;
}
