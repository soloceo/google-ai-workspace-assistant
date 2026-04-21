import { useState, useEffect, useCallback, useMemo } from "react";
import { Plus, Search, Loader2, Receipt, Download, TrendingUp, TrendingDown } from "lucide-react";
import { toast } from "sonner";
import { translations, type Language } from "../../translations";
import type { Transaction, TxType, Deal } from "../../types";
import * as txApi from "../../services/transactions";
import * as dealsApi from "../../services/deals";
import { computeTaxBreakdown } from "../../types";
import { USE_AUTH_BACKEND } from "../../config";
import TransactionEditor from "./TransactionEditor";

interface TransactionsViewProps {
  lang: Language;
  defaultTaxRate: number;
  /** Deal prepared for a commission record (passed from DealsView final stage). */
  pendingCommissionDeal?: Deal | null;
  onCommissionRecorded?: () => void;
}

type TypeFilter = "all" | TxType;
type DateFilterPreset = "all" | "thisMonth" | "lastMonth" | "thisYear";

function monthRange(year: number, month0: number): { from: string; to: string } {
  const from = new Date(year, month0, 1);
  const to = new Date(year, month0 + 1, 0);
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  return { from: fmt(from), to: fmt(to) };
}

function yearRange(year: number) {
  return { from: `${year}-01-01`, to: `${year}-12-31` };
}

export default function TransactionsView({
  lang, defaultTaxRate, pendingCommissionDeal, onCommissionRecorded,
}: TransactionsViewProps) {
  const t = translations[lang];
  const [txs, setTxs] = useState<Transaction[]>([]);
  const [deals, setDeals] = useState<Deal[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const [dateFilter, setDateFilter] = useState<DateFilterPreset>("thisMonth");
  const [editing, setEditing] = useState<Transaction | null>(null);
  const [creating, setCreating] = useState<Partial<Transaction> | true | false>(false);

  const refresh = useCallback(async () => {
    if (!USE_AUTH_BACKEND) { setLoading(false); return; }
    try {
      const [txList, dealList] = await Promise.all([
        txApi.listTransactions(),
        dealsApi.listDeals().catch(() => []),
      ]);
      setTxs(txList);
      setDeals(dealList);
    } catch (e: any) {
      console.error(e);
      toast.error(lang === "zh" ? "加载失败" : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [lang]);

  useEffect(() => { refresh(); }, [refresh]);

  // Auto-open the editor with a prefilled commission income when the Deals
  // tab hands off a completed deal.
  useEffect(() => {
    if (!pendingCommissionDeal) return;
    setCreating({
      type: "income",
      category: "commission",
      amount: pendingCommissionDeal.commission,
      description: pendingCommissionDeal.address,
      dealId: pendingCommissionDeal.id,
      date: new Date().toISOString().slice(0, 10),
      taxMode: "exclusive",
      taxRate: defaultTaxRate,
    });
  }, [pendingCommissionDeal, defaultTaxRate]);

  const dateRange = useMemo(() => {
    const now = new Date();
    switch (dateFilter) {
      case "thisMonth":  return monthRange(now.getFullYear(), now.getMonth());
      case "lastMonth":  return monthRange(now.getFullYear(), now.getMonth() - 1);
      case "thisYear":   return yearRange(now.getFullYear());
      default:           return { from: undefined as string | undefined, to: undefined as string | undefined };
    }
  }, [dateFilter]);

  const filtered = useMemo(() => {
    let list = txApi.filterByRange(txs, dateRange.from, dateRange.to);
    if (typeFilter !== "all") list = list.filter((t) => t.type === typeFilter);
    if (query.trim()) {
      const q = query.toLowerCase();
      list = list.filter((t) =>
        (t.description || "").toLowerCase().includes(q) ||
        t.category.toLowerCase().includes(q) ||
        String(t.amount).includes(q) ||
        (t.dealId && deals.find((d) => d.id === t.dealId)?.address.toLowerCase().includes(q))
      );
    }
    return list;
  }, [txs, dateRange, typeFilter, query, deals]);

  const summary = useMemo(() => txApi.summarize(filtered), [filtered]);

  const handleSave = useCallback(async (data: Partial<Transaction>) => {
    try {
      if (data.id) {
        const saved = await txApi.updateTransaction(data.id, data);
        setTxs((prev) => prev.map((t) => (t.id === saved.id ? saved : t)));
      } else {
        const saved = await txApi.createTransaction(data);
        setTxs((prev) => [saved, ...prev]);
      }
      setEditing(null);
      setCreating(false);
      onCommissionRecorded?.();
    } catch (e: any) {
      toast.error(e.message || (lang === "zh" ? "保存失败" : "Save failed"));
    }
  }, [lang, onCommissionRecorded]);

  const handleDelete = useCallback(async (id: string) => {
    if (!confirm(t.txDeleteConfirm)) return;
    try {
      await txApi.deleteTransaction(id);
      setTxs((prev) => prev.filter((t) => t.id !== id));
      setEditing(null);
    } catch (e: any) {
      toast.error(e.message || (lang === "zh" ? "删除失败" : "Delete failed"));
    }
  }, [t]);

  const handleExport = useCallback(() => {
    if (filtered.length === 0) {
      toast.info(lang === "zh" ? "当前筛选下没有数据" : "Nothing to export in current filter");
      return;
    }
    txApi.exportTransactionsCSV(filtered);
    toast.success(lang === "zh" ? `已导出 ${filtered.length} 条` : `Exported ${filtered.length} entries`);
  }, [filtered, lang]);

  if (!USE_AUTH_BACKEND) {
    return (
      <div className="h-full flex items-center justify-center px-6">
        <div className="text-center max-w-md">
          <div className="w-12 h-12 rounded-xl bg-amber-500/10 flex items-center justify-center mx-auto mb-4">
            <Receipt className="size-6 text-amber-500" />
          </div>
          <p className="text-sm text-[var(--text-body)] leading-relaxed">{t.noteBackendRequired}</p>
        </div>
      </div>
    );
  }

  const fmtMoney = (n: number) =>
    new Intl.NumberFormat(lang === "zh" ? "zh-CN" : "en-CA", {
      style: "currency", currency: "CAD", minimumFractionDigits: 2,
    }).format(n);

  const showEditor = creating !== false || editing;
  const editorInitialTx: Transaction | null = editing
    || (typeof creating === "object" ? creating as Transaction : null);

  return (
    <div className="h-full flex flex-col">
      {/* Summary + Header */}
      <div className="flex-shrink-0 border-b border-[var(--border-light)] bg-[var(--bg)]">
        {/* Summary strip */}
        <div className="px-3 sm:px-4 pt-3 pb-2">
          <div className="grid grid-cols-3 gap-2 mb-3">
            <div className="p-2.5 bg-emerald-500/10 rounded-[4px]">
              <div className="flex items-center gap-1 text-[10px] text-emerald-700 dark:text-emerald-400 uppercase tracking-wide mb-0.5">
                <TrendingUp className="size-3" />
                <span>{t.txSummaryIncome}</span>
              </div>
              <p className="text-sm font-semibold text-[var(--text-primary)] tabular-nums truncate">
                {fmtMoney(summary.incomeTotal)}
              </p>
            </div>
            <div className="p-2.5 bg-red-500/10 rounded-[4px]">
              <div className="flex items-center gap-1 text-[10px] text-red-700 dark:text-red-400 uppercase tracking-wide mb-0.5">
                <TrendingDown className="size-3" />
                <span>{t.txSummaryExpense}</span>
              </div>
              <p className="text-sm font-semibold text-[var(--text-primary)] tabular-nums truncate">
                {fmtMoney(summary.expenseTotal)}
              </p>
            </div>
            <div className={`p-2.5 rounded-[4px] ${summary.net >= 0 ? "bg-[var(--blue-light)]" : "bg-amber-500/10"}`}>
              <div className={`text-[10px] uppercase tracking-wide mb-0.5 ${summary.net >= 0 ? "text-[var(--blue)]" : "text-amber-700 dark:text-amber-400"}`}>
                {t.txSummaryNet}
              </div>
              <p className="text-sm font-semibold text-[var(--text-primary)] tabular-nums truncate">
                {fmtMoney(summary.net)}
              </p>
            </div>
          </div>

          {/* Search + Export */}
          <div className="flex items-center gap-1.5">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-[var(--text-placeholder)]" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t.txSearch}
                className="w-full h-10 pl-9 pr-3 text-sm bg-[var(--bg-alt)] border-none rounded-full sm:rounded-[4px] text-[var(--text-body)] placeholder:text-[var(--text-placeholder)] focus:outline-none focus:ring-2 focus:ring-[var(--blue)] t-transition"
              />
            </div>
            <button
              onClick={handleExport}
              title={t.txExport}
              className="size-10 flex items-center justify-center text-[var(--text-tertiary)] hover:text-[var(--text-primary)] bg-[var(--bg-alt)] hover:bg-[var(--bg-active)] rounded-[4px] t-transition"
            >
              <Download className="size-4" />
            </button>
          </div>
        </div>

        {/* Filter chips */}
        <div className="flex gap-1.5 px-3 sm:px-4 pb-2 overflow-x-auto no-scrollbar">
          {(["all", "income", "expense"] as TypeFilter[]).map((f) => (
            <button
              key={f}
              onClick={() => setTypeFilter(f)}
              className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-medium t-transition ${
                typeFilter === f ? "bg-[var(--blue)] text-white" : "bg-[var(--bg-alt)] text-[var(--text-tertiary)]"
              }`}
            >
              {f === "all" ? t.txTypeAll : f === "income" ? t.txTypeIncome : t.txTypeExpense}
            </button>
          ))}
          <div className="w-px flex-shrink-0 bg-[var(--border-light)] mx-1" />
          {(["thisMonth", "lastMonth", "thisYear", "all"] as DateFilterPreset[]).map((f) => (
            <button
              key={f}
              onClick={() => setDateFilter(f)}
              className={`flex-shrink-0 px-2.5 py-1 rounded-full text-[11px] font-medium t-transition ${
                dateFilter === f ? "bg-[var(--text-primary)] text-[var(--bg)]" : "bg-[var(--bg-alt)] text-[var(--text-quaternary)]"
              }`}
            >
              {f === "thisMonth" ? t.txFilterThisMonth
                : f === "lastMonth" ? t.txFilterLastMonth
                : f === "thisYear" ? t.txFilterThisYear
                : t.txFilterAll}
            </button>
          ))}
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
                <Receipt className="size-6 text-[var(--blue)]" />
              </div>
              <h3 className="text-[15px] font-semibold text-[var(--text-primary)] mb-1">
                {query ? t.txNoResults : t.txEmpty}
              </h3>
              {!query && (
                <p className="text-sm text-[var(--text-tertiary)]">{t.txEmptyHint}</p>
              )}
            </div>
          </div>
        ) : (
          <div className="max-w-2xl mx-auto px-3 sm:px-4 py-3 sm:py-4">
            <ul className="divide-y divide-[var(--border-light)] bg-[var(--bg-alt)] rounded-[4px] overflow-hidden">
              {filtered.map((tx) => {
                const breakdown = computeTaxBreakdown(tx);
                const catLabel = (t as any)[
                  (tx.type === "income" ? txApi.TX_INCOME_CATEGORIES : txApi.TX_EXPENSE_CATEGORIES)
                    .find((c) => c.id === tx.category)?.labelKey || ""
                ] || tx.category;
                const deal = tx.dealId ? deals.find((d) => d.id === tx.dealId) : null;
                return (
                  <li key={tx.id}>
                    <button onClick={() => setEditing(tx)}
                      className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-[var(--bg-active)] active:bg-[var(--bg-active)] t-transition text-left">
                      <div className={`flex-shrink-0 size-1 h-9 rounded-full ${
                        tx.type === "income" ? "bg-emerald-500" : "bg-red-400"
                      }`} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-[13px] font-medium text-[var(--text-primary)] truncate">
                            {tx.description || catLabel}
                          </span>
                        </div>
                        <div className="text-[11px] text-[var(--text-tertiary)] truncate">
                          {tx.date} · {catLabel}
                          {deal && ` · ${deal.address}`}
                        </div>
                      </div>
                      <div className="flex-shrink-0 text-right">
                        <p className={`text-sm font-semibold tabular-nums ${
                          tx.type === "income" ? "text-emerald-600" : "text-red-500"
                        }`}>
                          {tx.type === "income" ? "+" : "−"}{fmtMoney(breakdown.total)}
                        </p>
                        {tx.taxMode !== "exempt" && breakdown.tax > 0 && (
                          <p className="text-[10px] text-[var(--text-quaternary)] tabular-nums">
                            incl. {fmtMoney(breakdown.tax)} tax
                          </p>
                        )}
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </div>

      {/* FAB */}
      {!showEditor && (
        <button
          onClick={() => setCreating(true)}
          className="absolute bottom-20 sm:bottom-6 right-4 sm:right-6 z-10 size-14 sm:size-12 rounded-full bg-[var(--blue)] hover:bg-[var(--blue-hover)] text-white shadow-lg flex items-center justify-center t-transition active:scale-95"
          aria-label={t.txNew}
        >
          <Plus className="size-6 sm:size-5" />
        </button>
      )}

      {showEditor && (
        <TransactionEditor
          lang={lang}
          tx={editorInitialTx}
          deals={deals}
          defaultTaxRate={defaultTaxRate}
          onSave={handleSave}
          onDelete={editing ? () => handleDelete(editing.id) : undefined}
          onClose={() => { setEditing(null); setCreating(false); }}
        />
      )}
    </div>
  );
}
