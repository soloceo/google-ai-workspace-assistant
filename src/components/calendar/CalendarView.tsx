import { useState, useCallback, useEffect } from "react";
import {
  ChevronLeft, ChevronRight, Clock, MapPin, Trash2,
  Pencil, X, Loader2, Plus
} from "lucide-react";
import { toast } from "sonner";
import { translations, type Language } from "../../translations";
import type { AccountSummary } from "../../types";

function formatTime(dateStr: string, lang: Language): string {
  try {
    return new Date(dateStr).toLocaleTimeString(lang === "zh" ? "zh-CN" : "en-US", { hour: "2-digit", minute: "2-digit" });
  } catch { return ""; }
}

function formatDateFull(dateStr: string, lang: Language): string {
  try {
    return new Date(dateStr).toLocaleDateString(lang === "zh" ? "zh-CN" : "en-US", {
      weekday: "short", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit"
    });
  } catch { return dateStr; }
}

function isSameDay(d1: Date, d2: Date): boolean {
  return d1.getFullYear() === d2.getFullYear() && d1.getMonth() === d2.getMonth() && d1.getDate() === d2.getDate();
}

/** Format a Date to local datetime-local string (YYYY-MM-DDThh:mm) */
function toLocalDatetimeString(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

interface CalendarViewProps {
  events: any[];
  loading: boolean;
  isDemo: boolean;
  lang: Language;
  accounts: AccountSummary[];
  sendFromAccount: string;
  onCreateEvent: (event: { summary: string; description?: string; location?: string; start: string; end: string }, accountEmail?: string) => Promise<void>;
  onUpdateEvent: (id: string, event: { summary?: string; description?: string; location?: string; start?: string; end?: string }) => Promise<void>;
  onDeleteEvent: (id: string) => Promise<void>;
  onRegisterCreate?: (fn: () => void) => void;
}

export default function CalendarView({
  events, loading, isDemo, lang, accounts, sendFromAccount,
  onCreateEvent, onUpdateEvent, onDeleteEvent, onRegisterCreate,
}: CalendarViewProps) {
  const t = translations[lang];

  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [editingEvent, setEditingEvent] = useState<any>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);

  // Create event form
  const [newSummary, setNewSummary] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [newLocation, setNewLocation] = useState("");
  const [newStart, setNewStart] = useState("");
  const [newEnd, setNewEnd] = useState("");
  const [newAccount, setNewAccount] = useState(sendFromAccount);
  const [saving, setSaving] = useState(false);

  const openCreateModal = useCallback(() => {
    const d = selectedDate;
    setNewStart(toLocalDatetimeString(new Date(d.getFullYear(), d.getMonth(), d.getDate(), 9, 0)));
    setNewEnd(toLocalDatetimeString(new Date(d.getFullYear(), d.getMonth(), d.getDate(), 10, 0)));
    setNewAccount(sendFromAccount);
    setShowCreateModal(true);
  }, [selectedDate, sendFromAccount]);

  useEffect(() => {
    onRegisterCreate?.(openCreateModal);
  }, [onRegisterCreate, openCreateModal]);

  // Calendar grid data
  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const startOffset = firstDay.getDay();

  const days: (number | null)[] = [];
  for (let i = 0; i < startOffset; i++) days.push(null);
  for (let d = 1; d <= lastDay.getDate(); d++) days.push(d);

  const monthName = currentDate.toLocaleDateString(lang === "zh" ? "zh-CN" : "en-US", { year: "numeric", month: "long" });
  const weekDays = lang === "zh" ? ["日", "一", "二", "三", "四", "五", "六"] : ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  const prevMonth = () => setCurrentDate(new Date(year, month - 1, 1));
  const nextMonth = () => setCurrentDate(new Date(year, month + 1, 1));

  // Events for selected date
  const selectedEvents = events.filter(ev => {
    const evDate = new Date(ev.start?.dateTime || ev.start?.date || 0);
    return isSameDay(evDate, selectedDate);
  });

  // Events for a given day in grid
  const eventsForDay = (day: number) => events.filter(ev => {
    const evDate = new Date(ev.start?.dateTime || ev.start?.date || 0);
    return evDate.getFullYear() === year && evDate.getMonth() === month && evDate.getDate() === day;
  });

  const handleCreate = useCallback(async () => {
    if (!newSummary.trim()) return;
    setSaving(true);
    try {
      await onCreateEvent({
        summary: newSummary,
        description: newDescription || undefined,
        location: newLocation || undefined,
        start: newStart || new Date().toISOString(),
        end: newEnd || new Date(Date.now() + 3600000).toISOString(),
      }, newAccount || undefined);
      setShowCreateModal(false);
      setNewSummary(""); setNewDescription(""); setNewLocation(""); setNewStart(""); setNewEnd("");
    } catch (e: any) {
      toast.error(t.actionFailed);
    } finally {
      setSaving(false);
    }
  }, [newSummary, newDescription, newLocation, newStart, newEnd, newAccount, onCreateEvent, t]);

  const handleUpdate = useCallback(async () => {
    if (!editingEvent) return;
    setSaving(true);
    try {
      await onUpdateEvent(editingEvent.id, {
        summary: editingEvent.summary,
        description: editingEvent.description,
        location: editingEvent.location,
      });
      setEditingEvent(null);
    } catch {
      toast.error(t.actionFailed);
    } finally {
      setSaving(false);
    }
  }, [editingEvent, onUpdateEvent, t]);

  const today = new Date();

  return (
    <div className="h-full flex flex-col lg:flex-row">
      {/* ── Calendar Grid ── */}
      <div className="lg:w-[380px] flex-shrink-0 border-r border-[var(--border-light)] flex flex-col">
        {/* Month nav */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border-light)]">
          <button onClick={prevMonth} className="size-8 flex items-center justify-center text-[var(--text-tertiary)] hover:bg-[var(--bg-alt)] rounded-[4px] t-transition">
            <ChevronLeft className="size-4" />
          </button>
          <span className="text-sm font-medium text-[var(--text-primary)]">{monthName}</span>
          <button onClick={nextMonth} className="size-8 flex items-center justify-center text-[var(--text-tertiary)] hover:bg-[var(--bg-alt)] rounded-[4px] t-transition">
            <ChevronRight className="size-4" />
          </button>
        </div>

        {/* Weekday headers */}
        <div className="grid grid-cols-7 px-2 py-2">
          {weekDays.map(d => (
            <div key={d} className="text-center text-xs font-medium text-[var(--text-placeholder)] py-1">{d}</div>
          ))}
        </div>

        {/* Day cells */}
        <div className="grid grid-cols-7 px-2 pb-3 flex-1">
          {days.map((day, i) => {
            if (day === null) return <div key={i} />;
            const dateObj = new Date(year, month, day);
            const isToday = isSameDay(dateObj, today);
            const isSelected = isSameDay(dateObj, selectedDate);
            const dayEvents = eventsForDay(day);

            return (
              <button
                key={i}
                onClick={() => setSelectedDate(dateObj)}
                className={`relative flex flex-col items-center py-1.5 rounded-[4px] t-transition ${
                  isSelected
                    ? "bg-[var(--blue)] text-white"
                    : isToday
                    ? "bg-[var(--blue-light)] text-[var(--blue)]"
                    : "text-[var(--text-body)] hover:bg-[var(--bg-alt)]"
                }`}
              >
                <span className="text-sm">{day}</span>
                {dayEvents.length > 0 && (
                  <div className="flex gap-0.5 mt-0.5">
                    {dayEvents.slice(0, 3).map((ev, j) => (
                      <div
                        key={j}
                        className="w-1 h-1 rounded-full"
                        style={{ backgroundColor: isSelected ? "rgba(255,255,255,0.8)" : (ev.accountColor || "var(--blue)") }}
                      />
                    ))}
                  </div>
                )}
              </button>
            );
          })}
        </div>

        {/* Create button for mobile */}
        <div className="p-3 border-t border-[var(--border-light)] lg:hidden">
          <button
            onClick={openCreateModal}
            className="w-full flex items-center justify-center gap-2 h-10 text-sm font-medium text-white bg-[var(--blue)] hover:bg-[var(--blue-hover)] rounded-[4px] t-btn-transition"
          >
            <Plus className="size-4" />
            {t.newEvent}
          </button>
        </div>
      </div>

      {/* ── Events Panel ── */}
      <div className="flex-1 overflow-y-auto">
        <div className="px-5 py-4">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-medium text-[var(--text-primary)]">
              {selectedDate.toLocaleDateString(lang === "zh" ? "zh-CN" : "en-US", { weekday: "long", month: "long", day: "numeric" })}
            </h2>
            <button
              onClick={() => {
                const d = selectedDate;
                setNewStart(toLocalDatetimeString(new Date(d.getFullYear(), d.getMonth(), d.getDate(), 9, 0)));
                setNewEnd(toLocalDatetimeString(new Date(d.getFullYear(), d.getMonth(), d.getDate(), 10, 0)));
                setNewAccount(sendFromAccount);
                setShowCreateModal(true);
              }}
              className="hidden lg:flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-white bg-[var(--blue)] hover:bg-[var(--blue-hover)] rounded-[4px] t-btn-transition"
            >
              <Plus className="size-4" />
              {t.newEvent}
            </button>
          </div>

          {loading ? (
            <div className="space-y-3">
              {[1, 2, 3].map(i => (
                <div key={i} className="animate-pulse h-16 bg-[var(--bg-alt)] rounded-[4px]" />
              ))}
            </div>
          ) : selectedEvents.length === 0 ? (
            <div className="text-center py-12 text-[var(--text-placeholder)]">
              <Clock className="size-8 mx-auto mb-2 opacity-30" />
              <p className="text-sm">{t.noItemsFound}</p>
            </div>
          ) : (
            <div className="space-y-2">
              {selectedEvents.map(event => (
                <div key={event.id} className="p-4 bg-[var(--bg-alt)] rounded-[4px] group">
                  <div className="flex items-start gap-3">
                    {event.accountColor && (
                      <div className="w-1 h-full min-h-[40px] rounded-full flex-shrink-0" style={{ backgroundColor: event.accountColor }} />
                    )}
                    <div className="flex-1">
                      {editingEvent?.id === event.id ? (
                        // Edit mode
                        <div className="space-y-2">
                          <input
                            type="text"
                            value={editingEvent.summary}
                            onChange={e => setEditingEvent({ ...editingEvent, summary: e.target.value })}
                            className="w-full h-8 px-2 text-sm bg-[var(--bg)] border border-[var(--border-light)] rounded-[4px] text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--blue)]"
                          />
                          <textarea
                            value={editingEvent.description || ""}
                            onChange={e => setEditingEvent({ ...editingEvent, description: e.target.value })}
                            placeholder={t.description}
                            rows={2}
                            className="w-full px-2 py-1 text-sm bg-[var(--bg)] border border-[var(--border-light)] rounded-[4px] text-[var(--text-body)] placeholder:text-[var(--text-placeholder)] focus:outline-none focus:ring-2 focus:ring-[var(--blue)] resize-none"
                          />
                          <div className="flex gap-2">
                            <button onClick={handleUpdate} disabled={saving}
                              className="px-3 py-1.5 text-sm font-medium text-white bg-[var(--blue)] hover:bg-[var(--blue-hover)] rounded-[4px] t-btn-transition disabled:opacity-50">
                              {saving ? <Loader2 className="size-4 animate-spin" /> : t.save}
                            </button>
                            <button onClick={() => setEditingEvent(null)}
                              className="px-3 py-1.5 text-sm text-[var(--text-tertiary)] hover:bg-[var(--bg-hover)] rounded-[4px] t-transition">
                              {t.cancel}
                            </button>
                          </div>
                        </div>
                      ) : (
                        // View mode
                        <>
                          <div className="flex items-center gap-2">
                            <h3 className="text-sm font-medium text-[var(--text-primary)]">{event.summary}</h3>
                            {accounts.length > 1 && event.accountEmail && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--bg)] text-[var(--text-quaternary)] flex-shrink-0">
                                {event.accountEmail}
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-3 mt-1">
                            <span className="flex items-center gap-1 text-xs text-[var(--text-tertiary)]">
                              <Clock className="size-3" />
                              {formatTime(event.start?.dateTime || event.start?.date, lang)}
                              {event.end?.dateTime && ` - ${formatTime(event.end.dateTime, lang)}`}
                            </span>
                            {event.location && (
                              <span className="flex items-center gap-1 text-xs text-[var(--text-tertiary)]">
                                <MapPin className="size-3" />
                                {event.location}
                              </span>
                            )}
                          </div>
                          {event.description && (
                            <p className="mt-2 text-xs text-[var(--text-tertiary)]">{event.description}</p>
                          )}
                          {/* Actions */}
                          <div className="flex gap-1 mt-2 opacity-0 group-hover:opacity-100 t-transition">
                            <button onClick={() => setEditingEvent({ ...event })}
                              className="size-7 flex items-center justify-center text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] rounded-[4px] t-transition">
                              <Pencil className="size-3" />
                            </button>
                            <button onClick={() => onDeleteEvent(event.id)}
                              className="size-7 flex items-center justify-center text-[var(--text-tertiary)] hover:text-[var(--danger)] hover:bg-red-50 rounded-[4px] t-transition dark:hover:bg-red-900/20">
                              <Trash2 className="size-3" />
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Create Event Modal ── */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/30" onClick={() => setShowCreateModal(false)} />
          <div className="relative w-full max-w-md bg-[var(--bg)] rounded-[4px] p-5 space-y-3 animate-fade-in">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-medium text-[var(--text-primary)]">{t.newEvent}</h2>
              <button onClick={() => setShowCreateModal(false)} className="size-7 flex items-center justify-center text-[var(--text-tertiary)] hover:bg-[var(--bg-alt)] rounded-[4px]">
                <X className="size-4" />
              </button>
            </div>
            <input type="text" value={newSummary} onChange={e => setNewSummary(e.target.value)} placeholder={t.title}
              className="w-full h-9 px-3 text-sm bg-[var(--bg-alt)] border-none rounded-[4px] text-[var(--text-body)] placeholder:text-[var(--text-placeholder)] focus:outline-none focus:ring-2 focus:ring-[var(--blue)]" autoFocus />
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs text-[var(--text-tertiary)] mb-1 block">{t.startTime}</label>
                <input type="datetime-local" value={newStart} onChange={e => setNewStart(e.target.value)}
                  className="w-full h-9 px-2 text-sm bg-[var(--bg-alt)] border-none rounded-[4px] text-[var(--text-body)] focus:outline-none focus:ring-2 focus:ring-[var(--blue)]" />
              </div>
              <div>
                <label className="text-xs text-[var(--text-tertiary)] mb-1 block">{t.endTime}</label>
                <input type="datetime-local" value={newEnd} onChange={e => setNewEnd(e.target.value)}
                  className="w-full h-9 px-2 text-sm bg-[var(--bg-alt)] border-none rounded-[4px] text-[var(--text-body)] focus:outline-none focus:ring-2 focus:ring-[var(--blue)]" />
              </div>
            </div>
            <input type="text" value={newLocation} onChange={e => setNewLocation(e.target.value)} placeholder="Location"
              className="w-full h-9 px-3 text-sm bg-[var(--bg-alt)] border-none rounded-[4px] text-[var(--text-body)] placeholder:text-[var(--text-placeholder)] focus:outline-none focus:ring-2 focus:ring-[var(--blue)]" />
            <textarea value={newDescription} onChange={e => setNewDescription(e.target.value)} placeholder={t.description} rows={3}
              className="w-full px-3 py-2 text-sm bg-[var(--bg-alt)] border-none rounded-[4px] text-[var(--text-body)] placeholder:text-[var(--text-placeholder)] focus:outline-none focus:ring-2 focus:ring-[var(--blue)] resize-none" />
            {accounts.length > 1 && (
              <div>
                <label className="text-xs text-[var(--text-tertiary)] mb-1 block">{t.account}</label>
                <select
                  value={newAccount}
                  onChange={e => setNewAccount(e.target.value)}
                  className="w-full h-9 px-3 text-sm bg-[var(--bg-alt)] border-none rounded-[4px] text-[var(--text-body)] focus:outline-none focus:ring-2 focus:ring-[var(--blue)]"
                >
                  {accounts.map(a => (
                    <option key={a.email} value={a.email}>{a.name} ({a.email})</option>
                  ))}
                </select>
              </div>
            )}
            <div className="flex gap-2 pt-1">
              <button onClick={handleCreate} disabled={saving || !newSummary.trim()}
                className="flex-1 h-10 text-sm font-medium text-white bg-[var(--blue)] hover:bg-[var(--blue-hover)] rounded-[4px] t-btn-transition disabled:opacity-50">
                {saving ? <Loader2 className="size-4 animate-spin mx-auto" /> : t.save}
              </button>
              <button onClick={() => setShowCreateModal(false)}
                className="px-4 h-10 text-sm text-[var(--text-tertiary)] hover:bg-[var(--bg-alt)] rounded-[4px] t-transition">
                {t.cancel}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
