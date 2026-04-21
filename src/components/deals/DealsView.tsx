import { useState, useEffect, useCallback, useMemo } from "react";
import { Plus, Search, Loader2, Briefcase } from "lucide-react";
import { toast } from "sonner";
import { translations, type Language } from "../../translations";
import type { Deal, DealType, DealStatus } from "../../types";
import * as dealsApi from "../../services/deals";
import { USE_AUTH_BACKEND } from "../../config";
import DealCard from "./DealCard";
import DealEditor from "./DealEditor";

const STATUS_FILTERS: { id: "all" | "active" | "archived"; labelKey: string }[] = [
  { id: "all",      labelKey: "dealFilterAll" },
  { id: "active",   labelKey: "dealFilterActive" },
  { id: "archived", labelKey: "dealFilterArchived" },
];

const TYPE_FILTERS: ("all" | DealType)[] = ["all", "sell", "buy", "rent", "other"];

interface DealsViewProps {
  lang: Language;
  /** Called after a deal hits its final stage so AppShell can prompt to
   *  record the commission income in the accounting tab (Phase 2). */
  onCommissionDue?: (deal: Deal) => void;
}

export default function DealsView({ lang, onCommissionDue }: DealsViewProps) {
  const t = translations[lang];
  const [deals, setDeals] = useState<Deal[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "archived">("active");
  const [typeFilter, setTypeFilter] = useState<"all" | DealType>("all");
  const [editing, setEditing] = useState<Deal | null>(null);
  const [creating, setCreating] = useState(false);

  const refresh = useCallback(async () => {
    if (!USE_AUTH_BACKEND) { setLoading(false); return; }
    try {
      const list = await dealsApi.listDeals();
      setDeals(list);
    } catch (e: any) {
      console.error(e);
      toast.error(lang === "zh" ? "加载交易失败" : "Failed to load deals");
    } finally {
      setLoading(false);
    }
  }, [lang]);

  useEffect(() => { refresh(); }, [refresh]);

  const filtered = useMemo(() => {
    let list = deals;
    if (statusFilter !== "all") list = list.filter(d => d.status === statusFilter);
    if (typeFilter !== "all") list = list.filter(d => d.type === typeFilter);
    if (query.trim()) list = dealsApi.searchDeals(list, query);
    return list;
  }, [deals, statusFilter, typeFilter, query]);

  const handleSave = useCallback(async (data: Partial<Deal> & { id?: string; type: DealType; address: string; status?: DealStatus }) => {
    try {
      // Detect if user just advanced to the final stage of a sell/buy/rent —
      // trigger the "record commission" handoff to the accounting tab.
      const stages = dealsApi.DEAL_STAGES[data.type];
      const isFinalStage = (data.stageIndex ?? 0) === stages.length - 1;
      const wasFinalStage = editing ? editing.stageIndex === stages.length - 1 : false;
      const justReachedFinal = isFinalStage && !wasFinalStage && data.type !== "other";

      let saved: Deal;
      if (data.id) {
        saved = await dealsApi.updateDeal(data.id, data);
        setDeals(prev => prev.map(d => d.id === saved.id ? saved : d));
      } else {
        saved = await dealsApi.createDeal(data as any);
        setDeals(prev => [saved, ...prev]);
      }
      setEditing(null);
      setCreating(false);

      if (justReachedFinal && onCommissionDue) {
        onCommissionDue(saved);
      }
    } catch (e: any) {
      toast.error(e.message || (lang === "zh" ? "保存失败" : "Save failed"));
    }
  }, [editing, onCommissionDue, lang]);

  const handleDelete = useCallback(async (id: string) => {
    const msg = lang === "zh" ? "确定删除这个交易吗？" : "Delete this deal?";
    if (!confirm(msg)) return;
    try {
      await dealsApi.deleteDeal(id);
      setDeals(prev => prev.filter(d => d.id !== id));
      setEditing(null);
    } catch (e: any) {
      toast.error(e.message || (lang === "zh" ? "删除失败" : "Delete failed"));
    }
  }, [lang]);

  if (!USE_AUTH_BACKEND) {
    return (
      <div className="h-full flex items-center justify-center px-6">
        <div className="text-center max-w-md">
          <div className="w-12 h-12 rounded-xl bg-amber-500/10 flex items-center justify-center mx-auto mb-4">
            <Briefcase className="size-6 text-amber-500" />
          </div>
          <p className="text-sm text-[var(--text-body)] leading-relaxed">
            {t.noteBackendRequired}
          </p>
        </div>
      </div>
    );
  }

  const showEditor = creating || editing;

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex-shrink-0 border-b border-[var(--border-light)] bg-[var(--bg)]">
        <div className="px-3 sm:px-4 py-2.5 sm:py-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-[var(--text-placeholder)]" />
            <input
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder={t.dealSearch}
              className="w-full h-10 pl-9 pr-3 text-sm bg-[var(--bg-alt)] border-none rounded-full sm:rounded-[4px] text-[var(--text-body)] placeholder:text-[var(--text-placeholder)] focus:outline-none focus:ring-2 focus:ring-[var(--blue)] t-transition"
            />
          </div>
        </div>

        {/* Status chips */}
        <div className="flex gap-1.5 px-3 sm:px-4 pb-1.5 overflow-x-auto no-scrollbar">
          {STATUS_FILTERS.map(f => (
            <button
              key={f.id}
              onClick={() => setStatusFilter(f.id)}
              className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-medium t-transition ${
                statusFilter === f.id
                  ? "bg-[var(--blue)] text-white"
                  : "bg-[var(--bg-alt)] text-[var(--text-tertiary)]"
              }`}
            >
              {(t as any)[f.labelKey]}
            </button>
          ))}
        </div>

        {/* Type chips */}
        <div className="flex gap-1.5 px-3 sm:px-4 pb-2 overflow-x-auto no-scrollbar">
          {TYPE_FILTERS.map(tp => {
            if (tp === "all") {
              return (
                <button
                  key="all"
                  onClick={() => setTypeFilter("all")}
                  className={`flex-shrink-0 px-2.5 py-1 rounded-full text-[11px] font-medium t-transition ${
                    typeFilter === "all" ? "bg-[var(--text-primary)] text-[var(--bg)]" : "bg-[var(--bg-alt)] text-[var(--text-quaternary)]"
                  }`}
                >
                  {t.dealFilterAllTypes}
                </button>
              );
            }
            const m = dealsApi.DEAL_TYPE_META[tp];
            return (
              <button
                key={tp}
                onClick={() => setTypeFilter(tp)}
                className={`flex-shrink-0 flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-medium t-transition ${
                  typeFilter === tp ? "bg-[var(--text-primary)] text-[var(--bg)]" : "bg-[var(--bg-alt)] text-[var(--text-quaternary)]"
                }`}
              >
                <span>{m.emoji}</span>
                <span>{(t as any)[m.labelKey]}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="h-full flex items-center justify-center">
            <Loader2 className="size-5 animate-spin text-[var(--text-tertiary)]" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="h-full flex items-center justify-center px-6">
            <div className="text-center max-w-sm">
              <div className="w-12 h-12 rounded-xl bg-[var(--blue-light)] flex items-center justify-center mx-auto mb-3">
                <Briefcase className="size-6 text-[var(--blue)]" />
              </div>
              <h3 className="text-[15px] font-semibold text-[var(--text-primary)] mb-1">
                {query ? t.dealNoResults : t.dealEmpty}
              </h3>
              {!query && (
                <p className="text-sm text-[var(--text-tertiary)]">{t.dealEmptyHint}</p>
              )}
            </div>
          </div>
        ) : (
          <div className="max-w-2xl mx-auto px-3 sm:px-4 py-3 sm:py-4 grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-3">
            {filtered.map(deal => (
              <DealCard key={deal.id} deal={deal} lang={lang} onClick={() => setEditing(deal)} />
            ))}
          </div>
        )}
      </div>

      {/* FAB */}
      {!showEditor && (
        <button
          onClick={() => setCreating(true)}
          className="absolute bottom-20 sm:bottom-6 right-4 sm:right-6 z-10 size-14 sm:size-12 rounded-full bg-[var(--blue)] hover:bg-[var(--blue-hover)] active:bg-[var(--blue-hover)] text-white shadow-lg flex items-center justify-center t-transition active:scale-95"
          aria-label={t.dealNew}
        >
          <Plus className="size-6 sm:size-5" />
        </button>
      )}

      {showEditor && (
        <DealEditor
          lang={lang}
          deal={editing}
          onSave={handleSave}
          onDelete={editing ? () => handleDelete(editing.id) : undefined}
          onClose={() => { setEditing(null); setCreating(false); }}
        />
      )}
    </div>
  );
}
