import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { Plus, Search, Loader2, NotebookPen, KeyRound, Download, Upload, Database, Check } from "lucide-react";
import { toast } from "sonner";
import { translations, type Language } from "../../translations";
import type { Note, NoteCategory } from "../../types";
import { computeNoteTaxBreakdown } from "../../types";
import * as notesApi from "../../services/notes";
import { USE_AUTH_BACKEND } from "../../config";
import NoteEditor from "./NoteEditor";
import NoteCard from "./NoteCard";

const CATEGORIES: { id: NoteCategory | "all"; emoji: string; labelKey: string }[] = [
  { id: "all",        emoji: "📚", labelKey: "notes" },
  { id: "product",    emoji: "🛍", labelKey: "noteCatProduct" },
  { id: "idea",       emoji: "💡", labelKey: "noteCatIdea" },
  { id: "task",       emoji: "✅", labelKey: "noteCatTask" },
  { id: "accounting", emoji: "💰", labelKey: "noteCatAccounting" },
  { id: "other",      emoji: "📝", labelKey: "noteCatOther" },
];

interface NotesViewProps {
  lang: Language;
  geminiApiKey: string;
  onOpenSettings?: () => void;
}

export default function NotesView({ lang, geminiApiKey, onOpenSettings }: NotesViewProps) {
  const t = translations[lang];
  const [notes, setNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<NoteCategory | "all">("all");
  const [editing, setEditing] = useState<Note | null>(null);
  const [creating, setCreating] = useState(false);

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
      toast.error(lang === "zh" ? "加载笔记失败" : "Failed to load notes");
    } finally {
      setLoading(false);
    }
  }, [lang]);

  useEffect(() => { refresh(); }, [refresh]);

  const filtered = useMemo(() => {
    let list = notes;
    if (category !== "all") list = list.filter(n => n.category === category);
    if (query.trim()) list = notesApi.searchNotes(list, query);
    return list;
  }, [notes, category, query]);

  // Accounting summary — computed from the filtered list, restricted to
  // this month. Only shown when the user is on the accounting category.
  const accountingSummary = useMemo(() => {
    if (category !== "accounting") return null;
    const now = new Date();
    const ym = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    let income = 0, expense = 0;
    for (const n of filtered) {
      if (n.category !== "accounting" || typeof n.amount !== "number") continue;
      const dateForPeriod = n.txDate || new Date(n.updated_at).toISOString().slice(0, 10);
      if (!dateForPeriod.startsWith(ym)) continue;
      const { total } = computeNoteTaxBreakdown(n);
      if (n.txType === "income") income += total;
      else expense += total;
    }
    return { income, expense, net: income - expense };
  }, [category, filtered]);

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
  }, [t]);

  // Export / Import — the safety net for the "don't lose my notes" concern.
  // Export is instant (all data is already in memory); import is async and
  // re-uploads each note to the backend.
  const importInputRef = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);

  const handleExport = useCallback(() => {
    if (notes.length === 0) {
      toast.info(lang === "zh" ? "没有笔记可导出" : "Nothing to export yet");
      return;
    }
    notesApi.exportNotesToFile(notes);
    toast.success(lang === "zh" ? `已导出 ${notes.length} 条笔记` : `Exported ${notes.length} notes`);
  }, [notes, lang]);

  const handleImport = useCallback(async (file: File) => {
    setImporting(true);
    try {
      const count = await notesApi.importNotesFromFile(file);
      toast.success(lang === "zh" ? `已导入 ${count} 条笔记` : `Imported ${count} notes`);
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
      ? `将 ${totalNotes} 条笔记迁移到 ${target}？\n之后新建的笔记也会保存在这个邮箱下。`
      : `Move all ${totalNotes} notes to ${target}?\nFuture notes will also be stored under this account.`;
    if (!confirm(msg)) return;
    setMigrating(true);
    try {
      const res = await notesApi.migrateNotes(target);
      toast.success(lang === "zh" ? `已迁移 ${res.moved} 条笔记到 ${target}` : `Moved ${res.moved} notes to ${target}`);
      await refresh();
    } catch (e: any) {
      toast.error(e.message || (lang === "zh" ? "迁移失败" : "Migration failed"));
    } finally {
      setMigrating(false);
    }
  }, [primaryOwner, ownerCounts, lang, refresh]);

  // Backend not configured → friendly message
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

  const [ownerMenuOpen, setOwnerMenuOpen] = useState(false);

  return (
    <div className="h-full flex flex-col">
      {/* Header: search + category chips */}
      <div className="flex-shrink-0 border-b border-[var(--border-light)] bg-[var(--bg)]">
        <div className="px-3 sm:px-4 py-2.5 sm:py-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-[var(--text-placeholder)]" />
            <input
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder={t.noteSearch}
              className="w-full h-10 pl-9 pr-3 text-sm bg-[var(--bg-alt)] border-none rounded-full sm:rounded-[4px] text-[var(--text-body)] placeholder:text-[var(--text-placeholder)] focus:outline-none focus:ring-2 focus:ring-[var(--blue)] t-transition"
            />
          </div>
        </div>

        {/* Storage indicator — only shown when user has 2+ connected accounts */}
        {connectedEmails.length > 1 && primaryOwner && (
          <div className="px-3 sm:px-4 pb-1.5 relative">
            <button
              onClick={() => setOwnerMenuOpen(v => !v)}
              disabled={migrating}
              className="flex items-center gap-1.5 text-[11px] text-[var(--text-tertiary)] hover:text-[var(--text-primary)] t-transition"
            >
              <Database className="size-3" />
              <span>
                {lang === "zh" ? "存储在" : "Stored in"}
              </span>
              <span className="font-medium text-[var(--text-body)] truncate max-w-[200px]">
                {primaryOwner}
              </span>
              {migrating && <Loader2 className="size-3 animate-spin" />}
              <span className="text-[var(--text-quaternary)]">▾</span>
            </button>
            {ownerMenuOpen && (
              <>
                <div
                  className="fixed inset-0 z-10"
                  onClick={() => setOwnerMenuOpen(false)}
                />
                <div className="absolute left-3 sm:left-4 top-full mt-1 z-20 min-w-[260px] max-w-[90vw] bg-[var(--bg)] border border-[var(--border-light)] rounded-[4px] shadow-lg overflow-hidden">
                  <div className="px-3 py-2 border-b border-[var(--border-light)]">
                    <p className="text-[11px] text-[var(--text-tertiary)] leading-snug">
                      {lang === "zh"
                        ? "选择笔记存储在哪个 Google 账号下。切换会迁移所有笔记。"
                        : "Pick which Google account owns your notebook. Switching will move all notes."}
                    </p>
                  </div>
                  {connectedEmails.map(email => {
                    const count = ownerCounts[email] || 0;
                    const isCurrent = email === primaryOwner;
                    return (
                      <button
                        key={email}
                        onClick={() => { setOwnerMenuOpen(false); handleMigrate(email); }}
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
                          {count} {lang === "zh" ? "条" : count === 1 ? "note" : "notes"}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        )}
        <div className="flex items-center gap-1.5 px-3 sm:px-4 pb-2">
          <div className="flex gap-1.5 overflow-x-auto no-scrollbar flex-1 min-w-0">
            {CATEGORIES.map(cat => (
              <button
                key={cat.id}
                onClick={() => setCategory(cat.id)}
                className={`flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium t-transition ${
                  category === cat.id
                    ? "bg-[var(--blue)] text-white"
                    : "bg-[var(--bg-alt)] text-[var(--text-tertiary)] hover:bg-[var(--bg-active)]"
                }`}
              >
                <span>{cat.emoji}</span>
                <span>{(t as any)[cat.labelKey]}</span>
              </button>
            ))}
          </div>
          {/* Export / Import — compact icons, always visible */}
          <div className="flex-shrink-0 flex items-center gap-0.5 border-l border-[var(--border-light)] pl-1.5 ml-0.5">
            <button
              onClick={handleExport}
              title={lang === "zh" ? "导出笔记备份" : "Export backup"}
              className="size-8 flex items-center justify-center text-[var(--text-tertiary)] hover:text-[var(--text-primary)] active:bg-[var(--bg-alt)] hover:bg-[var(--bg-alt)] rounded-[4px] t-transition"
            >
              <Download className="size-4" />
            </button>
            <button
              onClick={() => importInputRef.current?.click()}
              disabled={importing}
              title={lang === "zh" ? "从备份导入" : "Import backup"}
              className="size-8 flex items-center justify-center text-[var(--text-tertiary)] hover:text-[var(--text-primary)] active:bg-[var(--bg-alt)] hover:bg-[var(--bg-alt)] rounded-[4px] t-transition disabled:opacity-50"
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
          </div>
        </div>
      </div>

      {/* Accounting summary — only when filtered to 'accounting' */}
      {accountingSummary && (
        <div className="flex-shrink-0 px-3 sm:px-4 pt-3 pb-2 border-b border-[var(--border-light)]">
          <div className="grid grid-cols-3 gap-2">
            {[
              { key: "income",  label: t.noteSummaryIncome,  value: accountingSummary.income,  bg: "bg-emerald-500/10",     text: "text-emerald-700 dark:text-emerald-400" },
              { key: "expense", label: t.noteSummaryExpense, value: accountingSummary.expense, bg: "bg-red-500/10",         text: "text-red-700 dark:text-red-400" },
              { key: "net",     label: t.noteSummaryNet,     value: accountingSummary.net,     bg: accountingSummary.net >= 0 ? "bg-[var(--blue-light)]" : "bg-amber-500/10", text: accountingSummary.net >= 0 ? "text-[var(--blue)]" : "text-amber-700 dark:text-amber-400" },
            ].map(card => (
              <div key={card.key} className={`p-2.5 rounded-[4px] ${card.bg}`}>
                <div className={`text-[10px] uppercase tracking-wide mb-0.5 ${card.text}`}>
                  {card.label}
                </div>
                <p className="text-sm font-semibold text-[var(--text-primary)] tabular-nums truncate">
                  {new Intl.NumberFormat(lang === "zh" ? "zh-CN" : "en-CA", { style: "currency", currency: "CAD", maximumFractionDigits: 0 }).format(card.value)}
                </p>
              </div>
            ))}
          </div>
          <p className="text-[10px] text-[var(--text-quaternary)] text-center mt-1.5">
            {t.noteSummaryPeriod}
          </p>
        </div>
      )}

      {/* List */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="h-full flex items-center justify-center">
            <Loader2 className="size-5 animate-spin text-[var(--text-tertiary)]" />
          </div>
        ) : filtered.length === 0 ? (
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
            {filtered.map(note => (
              <NoteCard key={note.id} note={note} lang={lang} onClick={() => setEditing(note)} />
            ))}
          </div>
        )}
      </div>

      {/* FAB */}
      {!showEditor && (
        <button
          onClick={() => setCreating(true)}
          className="absolute bottom-20 sm:bottom-6 right-4 sm:right-6 z-10 size-14 sm:size-12 rounded-full bg-[var(--blue)] hover:bg-[var(--blue-hover)] active:bg-[var(--blue-hover)] text-white shadow-lg flex items-center justify-center t-transition active:scale-95"
          aria-label={t.noteNew}
        >
          <Plus className="size-6 sm:size-5" />
        </button>
      )}

      {/* API Key hint for OCR */}
      {!geminiApiKey && !showEditor && notes.length === 0 && onOpenSettings && (
        <button
          onClick={onOpenSettings}
          className="absolute bottom-4 left-4 right-20 sm:right-auto sm:max-w-sm flex items-center gap-2 p-2.5 bg-amber-500/10 border border-amber-500/20 rounded-[4px] text-left hover:bg-amber-500/15 t-transition"
        >
          <KeyRound className="size-4 text-amber-500 flex-shrink-0" />
          <span className="text-xs text-[var(--text-body)] flex-1">
            {lang === "zh" ? "配置 Gemini Key 启用照片 OCR 搜索" : "Set Gemini API key to enable photo OCR search"}
          </span>
        </button>
      )}

      {/* Editor */}
      {showEditor && (
        <NoteEditor
          lang={lang}
          note={editing}
          geminiReady={!!geminiApiKey}
          onSave={handleSave}
          onDelete={editing ? () => handleDelete(editing.id) : undefined}
          onClose={() => { setEditing(null); setCreating(false); }}
        />
      )}
    </div>
  );
}
