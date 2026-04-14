import {
  CheckSquare, Calendar as CalendarIcon, Mail, ChevronRight,
  Clock, FileText, Sparkles, Loader2,
} from "lucide-react";
import { translations, type Language } from "../../translations";
import type { Task, TaskList } from "../../services/tasks";
import type { AppTab } from "../AppShell";

// Extracted outside component to prevent unmount/remount on every render
function SectionHeader({ icon: Icon, title, count, tab, onNavigate, viewAllLabel }: {
  icon: typeof Mail; title: string; count: number; tab: AppTab;
  onNavigate: (tab: AppTab) => void; viewAllLabel: string;
}) {
  return (
    <div className="flex items-center justify-between mb-3">
      <div className="flex items-center gap-2">
        <Icon className="size-4 text-[var(--blue)]" />
        <h3 className="text-[15px] sm:text-sm font-semibold text-[var(--text-primary)]">{title}</h3>
        <span className="text-[13px] sm:text-xs text-[var(--text-quaternary)]">({count})</span>
      </div>
      <button
        onClick={() => onNavigate(tab)}
        className="flex items-center gap-0.5 text-[13px] sm:text-xs text-[var(--blue)] hover:underline t-transition"
      >
        {viewAllLabel}
        <ChevronRight className="size-3" />
      </button>
    </div>
  );
}

interface DashboardViewProps {
  emails: any[];
  calendarEvents: any[];
  taskItems: Task[];
  taskLists: (TaskList & { accountEmail: string; accountColor: string })[];
  loading: boolean;
  lang: Language;
  onNavigate: (tab: AppTab) => void;
}

function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function getTimeOfDay(lang: Language): string {
  const t = translations[lang];
  const h = new Date().getHours();
  if (h < 12) return t.dashboardMorning;
  if (h < 18) return t.dashboardAfternoon;
  return t.dashboardEvening;
}

function getHeader(email: any, name: string): string {
  const lowerName = name.toLowerCase();
  const header = email.payload?.headers?.find((h: any) => h.name?.toLowerCase() === lowerName);
  return header?.value || "";
}

function extractSenderName(from: string): string {
  const match = from.match(/^([^<]+)/);
  return match ? match[1].trim().replace(/"/g, "") : from;
}

export default function DashboardView({
  emails, calendarEvents, taskItems, taskLists, loading, lang, onNavigate,
}: DashboardViewProps) {
  const t = translations[lang];
  const now = new Date();
  const locale = lang === "zh" ? "zh-CN" : "en-US";

  // ── Computed data ──
  const pendingTasks = taskItems
    .filter(t => t.status === "needsAction")
    .sort((a, b) => {
      if (!a.due && !b.due) return 0;
      if (!a.due) return 1;
      if (!b.due) return -1;
      return new Date(a.due).getTime() - new Date(b.due).getTime();
    });

  const todayEvents = calendarEvents
    .filter(e => {
      const start = new Date(e.start?.dateTime || e.start?.date || 0);
      return isSameDay(start, now);
    })
    .sort((a: any, b: any) => {
      const tA = new Date(a.start?.dateTime || a.start?.date || 0).getTime();
      const tB = new Date(b.start?.dateTime || b.start?.date || 0).getTime();
      return tA - tB;
    });

  const unreadEmails = emails.filter(e => e.labelIds?.includes("UNREAD"));

  const greeting = t.dashboardGreeting.replace("{timeOfDay}", getTimeOfDay(lang));
  const dateStr = now.toLocaleDateString(locale, {
    weekday: "long", year: "numeric", month: "long", day: "numeric",
  });


  // ── Task due label ──
  const getDueLabel = (due: string | undefined) => {
    if (!due) return { text: t.dashboardNoDueDate, color: "text-[var(--text-quaternary)]" };
    const dueDate = new Date(due);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const dueDateNorm = new Date(dueDate);
    dueDateNorm.setHours(0, 0, 0, 0);

    if (dueDateNorm < today) return { text: t.dashboardOverdue, color: "text-red-500" };
    if (dueDateNorm.getTime() === today.getTime()) return { text: t.dashboardDueToday, color: "text-amber-500" };
    return {
      text: dueDate.toLocaleDateString(locale, { month: "short", day: "numeric" }),
      color: "text-[var(--text-tertiary)]",
    };
  };

  if (loading) {
    return (
      <div className="h-full overflow-y-auto">
        <div className="max-w-2xl mx-auto px-4 sm:px-4 py-5 sm:py-6 space-y-6 sm:space-y-8">
          <div className="space-y-1">
            <div className="h-6 w-48 bg-[var(--bg-alt)] rounded animate-pulse" />
            <div className="h-4 w-64 bg-[var(--bg-alt)] rounded animate-pulse" />
          </div>
          <div className="h-14 bg-[var(--bg-alt)] rounded-[4px] animate-pulse" />
          <div className="grid grid-cols-3 gap-2.5 sm:gap-3">
            {[1, 2, 3].map(i => <div key={i} className="h-20 bg-[var(--bg-alt)] rounded-[4px] animate-pulse" />)}
          </div>
          {[1, 2, 3].map(i => <div key={i} className="h-32 bg-[var(--bg-alt)] rounded-[4px] animate-pulse" />)}
        </div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-2xl mx-auto px-4 sm:px-4 py-5 sm:py-6 space-y-6 sm:space-y-8">
        {/* ── Greeting ── */}
        <div className="space-y-1">
          <h1 className="text-lg sm:text-xl font-semibold text-[var(--text-primary)]">{greeting}</h1>
          <p className="text-sm sm:text-sm text-[var(--text-tertiary)]">{dateStr}</p>
        </div>

        {/* ── AI Tip Card ── */}
        <button
          onClick={() => onNavigate("ai")}
          className="w-full flex items-center gap-2.5 sm:gap-3 p-2.5 sm:p-3 bg-[var(--blue-light)] rounded-[4px] text-left hover:bg-[var(--blue)]/15 active:bg-[var(--blue)]/15 t-transition group"
        >
          <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-lg bg-[var(--blue)]/15 flex items-center justify-center flex-shrink-0">
            <Sparkles className="size-4 sm:size-4.5 text-[var(--blue)]" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm text-[var(--text-body)] leading-snug line-clamp-2">{t.dashboardAiTip}</p>
          </div>
          <span className="text-xs font-medium text-[var(--blue)] flex-shrink-0 group-hover:underline whitespace-nowrap">
            {t.dashboardAiTipAction} →
          </span>
        </button>

        {/* ── Stats Cards ── */}
        <div className="grid grid-cols-3 gap-2.5 sm:gap-3">
          <button
            onClick={() => onNavigate("tasks")}
            className="p-3 sm:p-3 bg-[var(--bg-alt)] rounded-[4px] text-left hover:bg-[var(--bg-active)] active:bg-[var(--bg-active)] t-transition active:scale-[0.97]"
          >
            <div className="flex items-center gap-1 mb-1.5">
              <CheckSquare className="size-3 sm:size-3.5 text-[var(--blue)]" />
              <span className="text-[11px] sm:text-[11px] text-[var(--text-tertiary)] font-medium leading-tight truncate">{t.dashboardPendingTasks}</span>
            </div>
            <p className="text-xl sm:text-2xl font-semibold text-[var(--text-primary)] tabular-nums">{pendingTasks.length}</p>
          </button>
          <button
            onClick={() => onNavigate("calendar")}
            className="p-3 sm:p-3 bg-[var(--bg-alt)] rounded-[4px] text-left hover:bg-[var(--bg-active)] active:bg-[var(--bg-active)] t-transition active:scale-[0.97]"
          >
            <div className="flex items-center gap-1 mb-1.5">
              <CalendarIcon className="size-3 sm:size-3.5 text-[var(--blue)]" />
              <span className="text-[11px] sm:text-[11px] text-[var(--text-tertiary)] font-medium leading-tight truncate">{t.dashboardTodayEvents}</span>
            </div>
            <p className="text-xl sm:text-2xl font-semibold text-[var(--text-primary)] tabular-nums">{todayEvents.length}</p>
          </button>
          <button
            onClick={() => onNavigate("mail")}
            className="p-3 sm:p-3 bg-[var(--bg-alt)] rounded-[4px] text-left hover:bg-[var(--bg-active)] active:bg-[var(--bg-active)] t-transition active:scale-[0.97]"
          >
            <div className="flex items-center gap-1 mb-1.5">
              <Mail className="size-3 sm:size-3.5 text-[var(--blue)]" />
              <span className="text-[11px] sm:text-[11px] text-[var(--text-tertiary)] font-medium leading-tight truncate">{t.dashboardUnreadEmails}</span>
            </div>
            <p className="text-xl sm:text-2xl font-semibold text-[var(--text-primary)] tabular-nums">{unreadEmails.length}</p>
          </button>
        </div>

        {/* ── Tasks Section ── */}
        <section className="pt-2 border-t border-[var(--border-light)]">
          <SectionHeader icon={CheckSquare} title={t.dashboardPendingTasks} count={pendingTasks.length} tab="tasks" onNavigate={onNavigate} viewAllLabel={t.dashboardViewAll} />
          {pendingTasks.length === 0 ? (
            <div className="py-4 text-center">
              <p className="text-sm text-[var(--text-quaternary)]">{t.noTasks}</p>
              <p className="text-xs text-[var(--text-quaternary)] mt-1">{t.emptyTasksHint}</p>
            </div>
          ) : (
            <div className="space-y-1">
              {pendingTasks.slice(0, 6).map(task => {
                const due = getDueLabel(task.due);
                return (
                  <div key={task.id} className="flex items-center gap-2 sm:gap-3 py-2 sm:py-2 px-2 sm:px-3 rounded-[4px] hover:bg-[var(--bg-alt)] active:bg-[var(--bg-alt)] t-transition">
                    <div className="w-4 h-4 rounded-full border-2 border-[var(--border)] flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-[var(--text-primary)] truncate">{task.title}</p>
                    </div>
                    {task.notes && <FileText className="size-3 text-[var(--text-quaternary)] flex-shrink-0" />}
                    <span className={`text-xs flex-shrink-0 ${due.color}`}>{due.text}</span>
                  </div>
                );
              })}
              {pendingTasks.length > 6 && (
                <button
                  onClick={() => onNavigate("tasks")}
                  className="w-full py-2 text-[13px] sm:text-xs text-[var(--blue)] hover:underline t-transition"
                >
                  +{pendingTasks.length - 6} {t.dashboardViewAll.toLowerCase()}
                </button>
              )}
            </div>
          )}
        </section>

        {/* ── Calendar Section ── */}
        <section className="pt-2 border-t border-[var(--border-light)]">
          <SectionHeader icon={CalendarIcon} title={t.dashboardTodayEvents} count={todayEvents.length} tab="calendar" onNavigate={onNavigate} viewAllLabel={t.dashboardViewAll} />
          {todayEvents.length === 0 ? (
            <div className="py-4 text-center">
              <p className="text-sm text-[var(--text-quaternary)]">{t.noItemsFound}</p>
              <p className="text-xs text-[var(--text-quaternary)] mt-1">{t.emptyCalendarHint}</p>
            </div>
          ) : (
            <div className="space-y-1">
              {todayEvents.map((event: any) => {
                const start = new Date(event.start?.dateTime || event.start?.date || 0);
                const end = event.end ? new Date(event.end?.dateTime || event.end?.date || 0) : null;
                const timeStr = start.toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" });
                const endStr = end ? end.toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" }) : "";
                return (
                  <div key={event.id} className="flex items-start gap-2.5 sm:gap-3 py-2.5 px-2 sm:px-3 rounded-[4px] hover:bg-[var(--bg-alt)] active:bg-[var(--bg-alt)] t-transition">
                    <div className="w-1 h-8 rounded-full bg-[var(--blue)] flex-shrink-0 mt-0.5" />
                    <div className="flex-1 min-w-0">
                      <p className="text-[15px] sm:text-sm font-medium text-[var(--text-primary)] truncate">{event.summary}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-[13px] sm:text-xs text-[var(--text-tertiary)]">
                          <Clock className="size-3 inline mr-0.5 -mt-px" />
                          {timeStr}{endStr ? ` – ${endStr}` : ""}
                        </span>
                        {event.location && (
                          <span className="text-[13px] sm:text-xs text-[var(--text-quaternary)] truncate">{event.location}</span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* ── Email Section ── */}
        <section className="pt-2 border-t border-[var(--border-light)]">
          <SectionHeader icon={Mail} title={t.dashboardUnreadEmails} count={unreadEmails.length} tab="mail" onNavigate={onNavigate} viewAllLabel={t.dashboardViewAll} />
          {unreadEmails.length === 0 ? (
            <div className="py-4 text-center">
              <p className="text-sm text-[var(--text-quaternary)]">{t.emptyMailHint}</p>
            </div>
          ) : (
            <div className="space-y-1">
              {unreadEmails.slice(0, 5).map((email: any) => {
                const from = extractSenderName(getHeader(email, "From"));
                const subject = getHeader(email, "Subject");
                return (
                  <button
                    key={email.id}
                    onClick={() => onNavigate("mail")}
                    className="w-full flex items-start gap-2.5 sm:gap-3 py-2.5 px-2 sm:px-3 rounded-[4px] hover:bg-[var(--bg-alt)] active:bg-[var(--bg-alt)] t-transition text-left"
                  >
                    <div className="w-2 h-2 rounded-full bg-[var(--blue)] flex-shrink-0 mt-1.5" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-medium text-[var(--text-primary)] truncate">{from}</p>
                        <span className="text-xs text-[var(--text-quaternary)] flex-shrink-0">
                          {new Date(Number(email.internalDate)).toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" })}
                        </span>
                      </div>
                      <p className="text-[13px] sm:text-xs text-[var(--text-body)] truncate mt-0.5">{subject}</p>
                    </div>
                  </button>
                );
              })}
              {unreadEmails.length > 5 && (
                <button
                  onClick={() => onNavigate("mail")}
                  className="w-full py-2 text-[13px] sm:text-xs text-[var(--blue)] hover:underline t-transition"
                >
                  +{unreadEmails.length - 5} {t.dashboardViewAll.toLowerCase()}
                </button>
              )}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
