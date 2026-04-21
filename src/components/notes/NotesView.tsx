import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { Plus, Search, Loader2, NotebookPen, KeyRound, Download, Upload, Database, Check, Receipt, FileSpreadsheet } from "lucide-react";
import { toast } from "sonner";
import { translations, type Language } from "../../translations";
import type { Note, NoteCategory } from "../../types";
import { computeNoteTaxBreakdown } from "../../types";
import * as notesApi from "../../services/notes";
import { USE_AUTH_BACKEND } from "../../config";
import NoteEditor from "./NoteEditor";
import NoteCard from "./NoteCard";

type Mode = "notes" | "ledger";
type LedgerRange = "thisMonth" | "lastMonth" | "thisYear" | "all";

interface NotesViewProps {
  lang: Language;
  geminiApiKey: string;
  /** Default mode when entering the tab — set by Dashboard widgets. */
  initialMode?: Mode;
  onOpenSettings?: () => void;
}

// Format a Date as YYYY-MM-DD in the user's LOCAL timezone. Using
// toISOString() would shift dates across midnight for users west of UTC
// (a 10pm Apr 30 entry becomes "2026-05-01" in UTC).
function localDate(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function monthRange(year: number, month0: number) {
  return { from: localDate(new Date(year, month0, 1)), to: localDate(new Date(year, month0 + 1, 0)) };
}

function yearRange(year: number) {
  return { from: `${year}-01-01`, to: `${year}-12-31` };
}

/** Date an accounting note belongs to — txDate if set, else the local day of updated_at. */
function ledgerDateOf(n: Note): string {
  return n.txDate || localDate(new Date(n.updated_at));
}

export default function NotesView({ lang, geminiApiKey, initialMode = "notes", onOpenSettings }: NotesViewProps) {
  const t = translations[lang];
  const [mode, setMode] = useState<Mode>(initialMode);
  useEffect(() => { setMode(initialMode); }, [initialMode]);

  const [notes, setNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<Note | null>(null);
  const [creating, setCreating] = useState(false);
  const [ledgerRange, setLedgerRange] = useState<LedgerRange>("thisMonth");

  const [ownerCounts, setOwnerCounts] = useState<Record<string, number>>({});
  const [connectedEmails, setConnectedEmails] = useState<string[]>([]);
  const [primaryOwner, setPrimaryOwner] = useState<string | null>(null);
  const [migrating, setMigrating] = useState(false);

  const refresh = useCallback(async () => {
    if (!USE_AUTH_BACKEND) { setLoading(false); return; }
    try {
      const result = await notesApi.listNotes();
      setNotes(result.notes);
      setOwnerCounts(result.ownerCounts);
      setConnectedEmails(result.connectedEmails);
      setPrimaryOwner(result.primaryOwner);
    } catch (e: any) {
      console.error(e);
      toast.error(lang === "zh" ? "加载失败" : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [lang]);

  useEffect(() => { refresh(); }, [refresh]);

  // Reset search and close any open editor when switching modes — the
  // searches mean different things (notes vs. ledger).
  useEffect(() => { setQuery(""); setEditing(null); setCreating(false); }, [mode]);

  // ── Notes mode filtered list ──
  const notesItems = useMemo(() => {
    const base = notes.filter(n => n.category !== "accounting");
    return query.trim() ? notesApi.searchNotes(base, query) : base;
  }, [notes, query]);

  // ── Ledger mode filtered list ──
  const dateRange = useMemo(() => {
    const now = new Date();
    switch (ledgerRange) {
      case "thisMonth":  return monthRange(now.getFullYear(), now.getMonth());
      case "lastMonth":  return monthRange(now.getFullYear(), now.getMonth() - 1);
      case "thisYear":   return yearRange(now.getFullYear());
      default:           return { from: undefined as string | undefined, to: undefined as string | undefined };
    }
  }, [ledgerRange]);

  const ledgerItems = useMemo(() => {
    let list = notes.filter(n => n.category === "accounting");
    if (dateRange.from) list = list.filter(n => ledgerDateOf(n) >= dateRange.from!);
    if (dateRange.to)   list = list.filter(n => ledgerDateOf(n) <= dateRange.to!);
    if (query.trim()) list = notesApi.searchNotes(list, query);
    // Newest first by transaction date
    return list.slice().sort((a, b) => ledgerDateOf(b).localeCompare(ledgerDateOf(a)));
  }, [notes, dateRange, query]);

  const ledgerSummary = useMemo(() => {
    let income = 0, expense = 0;
    for (const n of ledgerItems) {
      if (typeof n.amount !== "number") continue;
      const { total } = computeNoteTaxBreakdown(n);
      if (n.txType === "income") income += total;
      else expense += total;
    }
    return { income, expense, net: income - expense };
  }, [ledgerItems]);

  // ── Save / delete ──
  const handleSave = useCallback(async (data: {
    id?: string;
    title: string;
    text: string;
    category: NoteCategory;
    photos: string[];
    photoTexts: string[];
    amount?: number;
    txType?: Note["txType"];
    taxMode?: Note["taxMode"];
    taxRate?: number;
    payment?: Note["payment"];
    txDate?: string;
  }) => {
    try {
      if (data.id) {
        const updated = await notesApi.updateNote(data.id, data);
        setNotes(prev => prev.map(n => n.id === updated.id ? updated : n));
      } else {
        const created = await notesApi.createNote(data);
        setNotes(prev => [created, ...prev]);
      }
      setEditing(null);
      setCreating(false);
    } catch (e: any) {
      toast.error(e.message || (lang === "zh" ? "保存失败" : "Save failed"));
    }
  }, [lang]);

  const handleDelete = useCallback(async (id: string) => {
    if (!confirm(t.noteDeleteConfirm)) return;
    try {
      await notesApi.deleteNote(id);
      setNotes(prev => prev.filter(n => n.id !== id));
      setEditing(null);
    } catch (e: any) {
      toast.error(e.message || (lang === "zh" ? "删除失败" : "Delete failed"));
    }
  }, [t, lang]);

  // ── Export / Import (full backup, both modes) ──
  const importInputRef = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);

  const handleExportAll = useCallback(() => {
    if (notes.length === 0) {
      toast.info(lang === "zh" ? "没有数据可导出" : "Nothing to export");
      return;
    }
    notesApi.exportNotesToFile(notes);
    toast.success(lang === "zh" ? `已导出 ${notes.length} 条` : `Exported ${notes.length} entries`);
  }, [notes, lang]);

  const handleImport = useCallback(async (file: File) => {
    setImporting(true);
    try {
      const count = await notesApi.importNotesFromFile(file);
      toast.success(lang === "zh" ? `已导入 ${count} 条` : `Imported ${count} entries`);
      await refresh();
    } catch (e: any) {
      toast.error(e.message || (lang === "zh" ? "导入失败" : "Import failed"));
    } finally {
      setImporting(false);
    }
  }, [lang, refresh]);

  const handleMigrate = useCallback(async (target: string) => {
    if (target === primaryOwner) return;
    const totalNotes = Object.values(ownerCounts).reduce((a, b) => a + b, 0);
    const msg = lang === "zh"
      ? `将 ${totalNotes} 条记录迁移到 ${target}？\n之后新建的记录也会保存在这个邮箱下。`
      : `Move all ${totalNotes} entries to ${target}?\nFuture entries will also be saved under this account.`;
    if (!confirm(msg)) return;
    setMigrating(true);
    try {
      const res = await notesApi.migrateNotes(target);
      toast.success(lang === "zh" ? `已迁移 ${res.moved} 条到 ${target}` : `Moved ${res.moved} to ${target}`);
      await refresh();
    } catch (e: any) {
      toast.error(e.message || (lang === "zh" ? "迁移失败" : "Migration failed"));
    } finally {
      setMigrating(false);
    }
  }, [primaryOwner, ownerCounts, lang, refresh]);

  // ── CSV export for ledger (current filter) ──
  const handleExportLedgerCsv = useCallback(() => {
    if (ledgerItems.length === 0) {
      toast.info(lang === "zh" ? "当前筛选下没有账目" : "Nothing in current filter");
      return;
    }
    const rows: string[][] = [[
      "Date", "Type", "Amount (entered)", "Tax mode", "Tax rate %",
      "Subtotal", "Tax", "Total", "Payment", "Title", "Description",
    ]];
    for (const n of ledgerItems) {
      const b = computeNoteTaxBreakdown(n);
      rows.push([
        ledgerDateOf(n),
        n.txType || "",
        String(n.amount ?? ""),
        n.taxMode || "",
        String(n.taxRate ?? ""),
        b.subtotal.toFixed(2),
        b.tax.toFixed(2),
        b.total.toFixed(2),
        n.payment || "",
        n.title || "",
        n.text || "",
      ]);
    }
    const csv = rows.map(r => r.map(c => {
      const needs = /[",\n]/.test(c);
      return needs ? `"${c.replace(/"/g, '""')}"` : c;
    }).join(",")).join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `ledger-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success(lang === "zh" ? `已导出 ${ledgerItems.length} 条账目` : `Exported ${ledgerItems.length} entries`);
  }, [ledgerItems, lang]);

  // ── Backend not configured → friendly message ──
  if (!USE_AUTH_BACKEND) {
    return (
      <div className="h-full flex items-center justify-center px-6">
        <div className="text-center max-w-md">
          <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-xl bg-amber-500/10 flex items-center justify-center mx-auto mb-4">
            <NotebookPen className="size-6 sm:size-7 text-amber-500" />
          </div>
          <p className="text-sm text-[var(--text-body)] leading-relaxed">{t.noteBackendRequired}</p>
        </div>
      </div>
    );
  }

  const showEditor = creating || editing;
  const fmtMoneyShort = (n: number) => new Intl.NumberFormat(
    lang === "zh" ? "zh-CN" : "en-CA",
    { style: "currency", currency: "CAD", maximumFractionDigits: 0 }
  ).format(n);
  const fmtMoney = (n: number) => new Intl.NumberFormat(
    lang === "zh" ? "zh-CN" : "en-CA",
    { style: "currency", currency: "CAD", minimumFractionDigits: 2 }
  ).format(n);

  return (
    <div className="h-full flex flex-col">
      {/* Top: big mode switcher */}
      <div className="flex-shrink-0 border-b border-[var(--border-light)] bg-[var(--bg)]">
        <div className="flex gap-1 p-1 m-3 bg-[var(--bg-alt)] rounded-[4px]">
          {([
            { id: "notes" as Mode,  icon: NotebookPen, label: t.notesTabNotes },
            { id: "ledger" as Mode, icon: Receipt,     label: t.notesTabLedger },
          ]).map(opt => {
            const Icon = opt.icon;
            const active = mode === opt.id;
            return (
              <button
                key={opt.id}
                onClick={() => setMode(opt.id)}
                className={`flex-1 flex items-center justify-center gap-2 h-10 text-sm font-medium rounded-[4px] t-transition ${
                  active ? "bg-[var(--bg)] text-[var(--text-primary)] shadow-sm" : "text-[var(--text-tertiary)]"
                }`}
              >
                <Icon className="size-4" />
                {opt.label}
              </button>
            );
          })}
        </div>

        {/* Search + utility actions (both modes) */}
        <div className="px-3 sm:px-4 pb-2">
          <div className="flex items-center gap-1.5">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-[var(--text-placeholder)]" />
              <input
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder={mode === "ledger" ? t.ledgerSearch : t.noteSearch}
                className="w-full h-10 pl-9 pr-3 text-sm bg-[var(--bg-alt)] border-none rounded-full sm:rounded-[4px] text-[var(--text-body)] placeholder:text-[var(--text-placeholder)] focus:outline-none focus:ring-2 focus:ring-[var(--blue)] t-transition"
              />
            </div>
            {mode === "ledger" ? (
              <button
                onClick={handleExportLedgerCsv}
                title={t.ledgerExportCsv}
                className="flex items-center gap-1.5 h-10 px-3 text-[13px] text-[var(--text-body)] bg-[var(--bg-alt)] hover:bg-[var(--bg-active)] rounded-[4px] t-transition"
              >
                <FileSpreadsheet className="size-4" />
                CSV
              </button>
            ) : (
              <>
                <button
                  onClick={handleExportAll}
                  title={lang === "zh" ? "导出全部备份" : "Export full backup"}
                  className="size-10 flex items-center justify-center text-[var(--text-tertiary)] hover:text-[var(--text-primary)] bg-[var(--bg-alt)] hover:bg-[var(--bg-active)] rounded-[4px] t-transition"
                >
                  <Download className="size-4" />
                </button>
                <button
                  onClick={() => importInputRef.current?.click()}
                  disabled={importing}
                  title={lang === "zh" ? "从备份导入" : "Import backup"}
                  className="size-10 flex items-center justify-center text-[var(--text-tertiary)] hover:text-[var(--text-primary)] bg-[var(--bg-alt)] hover:bg-[var(--bg-active)] rounded-[4px] t-transition disabled:opacity-50"
                >
                  {importing ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}
                </button>
                <input
                  ref={importInputRef}
                  type="file"
                  accept="application/json,.json"
                  onChange={e => { const f = e.target.files?.[0]; if (f) handleImport(f); e.target.value = ""; }}
                  className="hidden"
                />
              </>
            )}
          </div>
        </div>

        {/* Storage switcher — relevant to both modes */}
        {connectedEmails.length > 1 && primaryOwner && (
          <StorageSwitcher
            lang={lang}
            primaryOwner={primaryOwner}
            connectedEmails={connectedEmails}
            ownerCounts={ownerCounts}
            migrating={migrating}
            onSelect={handleMigrate}
          />
        )}

        {/* Ledger: date-range chips */}
        {mode === "ledger" && (
          <div className="flex gap-1.5 px-3 sm:px-4 pb-2 overflow-x-auto no-scrollbar">
            {([
              { id: "thisMonth" as LedgerRange, label: t.ledgerFilterThisMonth },
              { id: "lastMonth" as LedgerRange, label: t.ledgerFilterLastMonth },
              { id: "thisYear"  as LedgerRange, label: t.ledgerFilterThisYear },
              { id: "all"       as LedgerRange, label: t.ledgerFilterAll },
            ]).map(f => (
              <button
                key={f.id}
                onClick={() => setLedgerRange(f.id)}
                className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-medium t-transition ${
                  ledgerRange === f.id
                    ? "bg-[var(--blue)] text-white"
                    : "bg-[var(--bg-alt)] text-[var(--text-tertiary)]"
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Ledger summary cards */}
      {mode === "ledger" && !loading && (
        <div className="flex-shrink-0 px-3 sm:px-4 pt-3 pb-2 border-b border-[var(--border-light)]">
          <div className="grid grid-cols-3 gap-2">
            <div className="p-2.5 bg-emerald-500/10 rounded-[4px]">
              <div className="text-[10px] uppercase tracking-wide mb-0.5 text-emerald-700 dark:text-emerald-400">{t.noteSummaryIncome}</div>
              <p className="text-sm font-semibold text-[var(--text-primary)] tabular-nums truncate">{fmtMoneyShort(ledgerSummary.income)}</p>
            </div>
            <div className="p-2.5 bg-red-500/10 rounded-[4px]">
              <div className="text-[10px] uppercase tracking-wide mb-0.5 text-red-700 dark:text-red-400">{t.noteSummaryExpense}</div>
              <p className="text-sm font-semibold text-[var(--text-primary)] tabular-nums truncate">{fmtMoneyShort(ledgerSummary.expense)}</p>
            </div>
            <div className={`p-2.5 rounded-[4px] ${ledgerSummary.net >= 0 ? "bg-[var(--blue-light)]" : "bg-amber-500/10"}`}>
              <div className={`text-[10px] uppercase tracking-wide mb-0.5 ${ledgerSummary.net >= 0 ? "text-[var(--blue)]" : "text-amber-700 dark:text-amber-400"}`}>{t.noteSummaryNet}</div>
              <p className="text-sm font-semibold text-[var(--text-primary)] tabular-nums truncate">{fmtMoneyShort(ledgerSummary.net)}</p>
            </div>
          </div>
        </div>
      )}

      {/* Body */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="h-full flex items-center justify-center">
            <Loader2 className="size-5 animate-spin text-[var(--text-tertiary)]" />
          </div>
        ) : mode === "notes" ? (
          notesItems.length === 0 ? (
            <div className="h-full flex items-center justify-center px-6">
              <div className="text-center max-w-sm">
                <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-xl bg-[var(--blue-light)] flex items-center justify-center mx-auto mb-3">
                  <NotebookPen className="size-6 sm:size-7 text-[var(--blue)]" />
                </div>
                <h3 className="text-[15px] sm:text-base font-semibold text-[var(--text-primary)] mb-1">
                  {query ? t.noteNoResults : t.noteEmpty}
                </h3>
                {!query && (
                  <p className="text-sm text-[var(--text-tertiary)] leading-relaxed">{t.noteEmptyHint}</p>
                )}
              </div>
            </div>
          ) : (
            <div className="max-w-2xl mx-auto px-3 sm:px-4 py-3 sm:py-4 grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-3">
              {notesItems.map(note => (
                <NoteCard key={note.id} note={note} lang={lang} onClick={() => setEditing(note)} />
              ))}
            </div>
          )
        ) : (
          // Ledger mode — flat list with colored amounts
          ledgerItems.length === 0 ? (
            <div className="h-full flex items-center justify-center px-6">
              <div className="text-center max-w-sm">
                <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-xl bg-[var(--blue-light)] flex items-center justify-center mx-auto mb-3">
                  <Receipt className="size-6 sm:size-7 text-[var(--blue)]" />
                </div>
                <h3 className="text-[15px] sm:text-base font-semibold text-[var(--text-primary)] mb-1">
                  {query ? t.noteNoResults : t.ledgerEmpty}
                </h3>
                {!query && (
                  <p className="text-sm text-[var(--text-tertiary)] leading-relaxed">{t.ledgerEmptyHint}</p>
                )}
              </div>
            </div>
          ) : (
            <div className="max-w-2xl mx-auto px-3 sm:px-4 py-3 sm:py-4">
              <ul className="divide-y divide-[var(--border-light)] bg-[var(--bg-alt)] rounded-[4px] overflow-hidden">
                {ledgerItems.map(n => {
                  const breakdown = computeNoteTaxBreakdown(n);
                  const hasPhoto = (n.photos?.length || 0) > 0;
                  return (
                    <li key={n.id}>
                      <button
                        onClick={() => setEditing(n)}
                        className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-[var(--bg-active)] active:bg-[var(--bg-active)] t-transition text-left"
                      >
                        <div className={`flex-shrink-0 size-1 h-10 rounded-full ${
                          n.txType === "income" ? "bg-emerald-500" : "bg-red-400"
                        }`} />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="text-[13px] font-medium text-[var(--text-primary)] truncate">
                              {n.title || (n.text.slice(0, 40) || (lang === "zh" ? "(未命名)" : "(untitled)"))}
                            </span>
                            {hasPhoto && <span className="text-[10px] text-[var(--text-quaternary)]">📷</span>}
                          </div>
                          <div className="text-[11px] text-[var(--text-tertiary)] truncate">
                            {ledgerDateOf(n)}
                            {n.payment && ` · ${(t as any)[`notePay${n.payment[0].toUpperCase()}${n.payment.slice(1)}`] || n.payment}`}
                          </div>
                        </div>
                        <div className="flex-shrink-0 text-right">
                          <p className={`text-sm font-semibold tabular-nums ${
                            n.txType === "income" ? "text-emerald-600" : "text-red-500"
                          }`}>
                            {n.txType === "income" ? "+" : "−"}{fmtMoney(breakdown.total)}
                          </p>
                          {n.taxMode && n.taxMode !== "exempt" && breakdown.tax > 0 && (
                            <p className="text-[10px] text-[var(--text-quaternary)] tabular-nums">
                              incl. {fmtMoney(breakdown.tax)}
                            </p>
                          )}
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          )
        )}
      </div>

      {/* FAB */}
      {!showEditor && (
        <button
          onClick={() => setCreating(true)}
          className="absolute bottom-20 sm:bottom-6 right-4 sm:right-6 z-10 size-14 sm:size-12 rounded-full bg-[var(--blue)] hover:bg-[var(--blue-hover)] text-white shadow-lg flex items-center justify-center t-transition active:scale-95"
          aria-label={mode === "ledger" ? t.ledgerNew : t.noteNew}
        >
          <Plus className="size-6 sm:size-5" />
        </button>
      )}

      {/* Gemini key hint — only in Notes mode, since Ledger's use of OCR
          is a separate story (receipt auto-fill isn't built yet). */}
      {mode === "notes" && !geminiApiKey && !showEditor && notes.length === 0 && onOpenSettings && (
        <button
          onClick={onOpenSettings}
          className="absolute bottom-4 left-4 right-20 sm:right-auto sm:max-w-sm flex items-center gap-2 p-2.5 bg-amber-500/10 border border-amber-500/20 rounded-[4px] text-left hover:bg-amber-500/15 t-transition"
        >
          <KeyRound className="size-4 text-amber-500 flex-shrink-0" />
          <span className="text-xs text-[var(--text-body)] flex-1">
            {lang === "zh" ? "配置 Gemini Key 启用照片 OCR" : "Set Gemini API key to enable photo OCR"}
          </span>
        </button>
      )}

      {/* Editor */}
      {showEditor && (
        <NoteEditor
          lang={lang}
          note={editing}
          geminiReady={!!geminiApiKey}
          // When creating from ledger mode, lock the note to accounting category
          // so the editor opens straight into amount-first layout.
          lockedCategory={creating && mode === "ledger" ? "accounting" : undefined}
          onSave={handleSave}
          onDelete={editing ? () => handleDelete(editing.id) : undefined}
          onClose={() => { setEditing(null); setCreating(false); }}
        />
      )}
    </div>
  );
}

// ── Small sub-component: storage switcher (unchanged from before) ──
interface StorageSwitcherProps {
  lang: Language;
  primaryOwner: string;
  connectedEmails: string[];
  ownerCounts: Record<string, number>;
  migrating: boolean;
  onSelect: (email: string) => void;
}
function StorageSwitcher({ lang, primaryOwner, connectedEmails, ownerCounts, migrating, onSelect }: StorageSwitcherProps) {
  const [open, setOpen] = useState(false);
  return (
    <div className="px-3 sm:px-4 pb-1.5 relative">
      <button
        onClick={() => setOpen(v => !v)}
        disabled={migrating}
        className="flex items-center gap-1.5 text-[11px] text-[var(--text-tertiary)] hover:text-[var(--text-primary)] t-transition"
      >
        <Database className="size-3" />
        <span>{lang === "zh" ? "存储在" : "Stored in"}</span>
        <span className="font-medium text-[var(--text-body)] truncate max-w-[200px]">{primaryOwner}</span>
        {migrating && <Loader2 className="size-3 animate-spin" />}
        <span className="text-[var(--text-quaternary)]">▾</span>
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute left-3 sm:left-4 top-full mt-1 z-20 min-w-[260px] max-w-[90vw] bg-[var(--bg)] border border-[var(--border-light)] rounded-[4px] shadow-lg overflow-hidden">
            <div className="px-3 py-2 border-b border-[var(--border-light)]">
              <p className="text-[11px] text-[var(--text-tertiary)] leading-snug">
                {lang === "zh"
                  ? "选择记录存储在哪个 Google 账号下。切换会迁移所有记录。"
                  : "Pick which Google account owns these records. Switching will move everything."}
              </p>
            </div>
            {connectedEmails.map(email => {
              const count = ownerCounts[email] || 0;
              const isCurrent = email === primaryOwner;
              return (
                <button
                  key={email}
                  onClick={() => { setOpen(false); onSelect(email); }}
                  disabled={isCurrent || migrating}
                  className="w-full flex items-center gap-2 px-3 py-2.5 text-left text-sm hover:bg-[var(--bg-alt)] active:bg-[var(--bg-alt)] t-transition disabled:opacity-100 disabled:cursor-default"
                >
                  <div className="size-4 flex-shrink-0 flex items-center justify-center">
                    {isCurrent && <Check className="size-4 text-[var(--blue)]" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[var(--text-body)] truncate text-[13px]">{email}</p>
                  </div>
                  <span className="flex-shrink-0 text-[11px] text-[var(--text-quaternary)]">
                    {count} {lang === "zh" ? "条" : count === 1 ? "entry" : "entries"}
                  </span>
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
