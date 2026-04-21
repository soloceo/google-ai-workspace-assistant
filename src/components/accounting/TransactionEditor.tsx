import { useState, useEffect, useCallback, useMemo } from "react";
import { X, Trash2, Loader2 } from "lucide-react";
import { translations, type Language } from "../../translations";
import type { Transaction, TxType, TxTaxMode, TxPayment, Deal } from "../../types";
import { computeTaxBreakdown } from "../../types";
import {
  TX_INCOME_CATEGORIES,
  TX_EXPENSE_CATEGORIES,
  TX_PAYMENT_METHODS,
  TX_TAX_MODES,
} from "../../services/transactions";

interface TxEditorProps {
  lang: Language;
  tx: Transaction | null;
  deals: Deal[];
  defaultTaxRate: number;
  onSave: (data: Partial<Transaction>) => Promise<void>;
  onDelete?: () => Promise<void>;
  onClose: () => void;
}

export default function TransactionEditor({
  lang, tx, deals, defaultTaxRate, onSave, onDelete, onClose,
}: TxEditorProps) {
  const t = translations[lang];
  const creating = !tx;

  const today = new Date().toISOString().slice(0, 10);
  const [type, setType] = useState<TxType>(tx?.type || "expense");
  const [date, setDate] = useState(tx?.date || today);
  const [amount, setAmount] = useState(tx?.amount?.toString() || "");
  const [taxMode, setTaxMode] = useState<TxTaxMode>(tx?.taxMode || "exclusive");
  const [taxRate, setTaxRate] = useState(tx?.taxRate?.toString() || String(defaultTaxRate));
  const [payment, setPayment] = useState<TxPayment>(tx?.payment || "credit");
  const [category, setCategory] = useState(tx?.category || "");
  const [description, setDescription] = useState(tx?.description || "");
  const [dealId, setDealId] = useState(tx?.dealId || "");
  const [saving, setSaving] = useState(false);

  const categories = type === "income" ? TX_INCOME_CATEGORIES : TX_EXPENSE_CATEGORIES;
  // Reset category to first of new type if the current one isn't valid
  useEffect(() => {
    if (!categories.find((c) => c.id === category)) {
      setCategory(categories[0].id);
    }
  }, [type, categories, category]);

  const amountNum = Number(amount) || 0;
  const rateNum = Number(taxRate) || 0;
  const breakdown = useMemo(
    () => computeTaxBreakdown({ amount: amountNum, taxMode, taxRate: rateNum }),
    [amountNum, taxMode, rateNum]
  );

  const handleSave = useCallback(async () => {
    if (!amount.trim()) return;
    setSaving(true);
    try {
      await onSave({
        id: tx?.id,
        type,
        date,
        amount: amountNum,
        taxMode,
        taxRate: rateNum,
        payment,
        category: category || (type === "income" ? "otherIncome" : "otherExpense"),
        description: description.trim() || undefined,
        dealId: dealId || undefined,
      });
    } finally {
      setSaving(false);
    }
  }, [tx, type, date, amountNum, taxMode, rateNum, payment, category, description, dealId, amount, onSave]);

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") handleSave();
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [handleSave, onClose]);

  const fmt = (n: number) =>
    new Intl.NumberFormat(lang === "zh" ? "zh-CN" : "en-CA", {
      style: "currency", currency: "CAD", minimumFractionDigits: 2,
    }).format(n);

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4 bg-black/30">
      <div className="relative w-full sm:max-w-md bg-[var(--bg)] sm:rounded-[4px] rounded-t-2xl flex flex-col max-h-[95vh] sm:max-h-[88vh] animate-fade-in">
        <div className="flex justify-center pt-2 pb-0 sm:hidden">
          <div className="w-8 h-1 rounded-full bg-[var(--border-medium)]" />
        </div>

        <div className="px-4 sm:px-5 pt-3 pb-2 sm:py-4 flex items-center justify-between border-b border-[var(--border-light)]">
          <h2 className="text-sm font-medium text-[var(--text-primary)]">
            {creating ? t.txNew : t.txEdit}
          </h2>
          <div className="flex items-center gap-1">
            {!creating && onDelete && (
              <button onClick={onDelete}
                className="size-9 sm:size-8 flex items-center justify-center text-[var(--text-tertiary)] hover:text-red-500 hover:bg-red-50 rounded-[4px] t-transition dark:hover:bg-red-900/20">
                <Trash2 className="size-4" />
              </button>
            )}
            <button onClick={onClose}
              className="size-9 sm:size-8 flex items-center justify-center text-[var(--text-tertiary)] hover:bg-[var(--bg-alt)] rounded-[4px]">
              <X className="size-5 sm:size-4" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-4 sm:px-5 py-3 space-y-3">
          {/* Type toggle */}
          <div className="flex gap-1 p-1 bg-[var(--bg-alt)] rounded-[4px]">
            {(["expense", "income"] as TxType[]).map((v) => (
              <button key={v} onClick={() => setType(v)}
                className={`flex-1 h-9 text-sm font-medium rounded-[4px] t-transition ${
                  type === v
                    ? v === "income"
                      ? "bg-emerald-500 text-white"
                      : "bg-[var(--bg)] text-[var(--text-primary)] shadow-sm"
                    : "text-[var(--text-tertiary)]"
                }`}>
                {v === "income" ? t.txTypeIncome : t.txTypeExpense}
              </button>
            ))}
          </div>

          {/* Amount (large) */}
          <div>
            <label className="text-[11px] text-[var(--text-tertiary)] mb-1 block">{t.txAmount}</label>
            <input
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.00"
              inputMode="decimal"
              autoFocus={creating}
              className="w-full h-14 px-3 text-2xl font-semibold tabular-nums bg-[var(--bg-alt)] border-none rounded-[4px] text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--blue)]"
            />
          </div>

          {/* Date + Payment */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[11px] text-[var(--text-tertiary)] mb-1 block">{t.txDate}</label>
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)}
                className="w-full h-10 px-3 text-sm bg-[var(--bg-alt)] border-none rounded-[4px] text-[var(--text-body)] focus:outline-none focus:ring-2 focus:ring-[var(--blue)]" />
            </div>
            <div>
              <label className="text-[11px] text-[var(--text-tertiary)] mb-1 block">{t.txPayment}</label>
              <select value={payment} onChange={(e) => setPayment(e.target.value as TxPayment)}
                className="w-full h-10 px-3 text-sm bg-[var(--bg-alt)] border-none rounded-[4px] text-[var(--text-body)] focus:outline-none focus:ring-2 focus:ring-[var(--blue)]">
                {TX_PAYMENT_METHODS.map((p) => (
                  <option key={p.id} value={p.id}>{(t as any)[p.labelKey]}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Category */}
          <div>
            <label className="text-[11px] text-[var(--text-tertiary)] mb-1 block">{t.txCategory}</label>
            <select value={category} onChange={(e) => setCategory(e.target.value)}
              className="w-full h-10 px-3 text-sm bg-[var(--bg-alt)] border-none rounded-[4px] text-[var(--text-body)] focus:outline-none focus:ring-2 focus:ring-[var(--blue)]">
              {categories.map((c) => (
                <option key={c.id} value={c.id}>{(t as any)[c.labelKey]}</option>
              ))}
            </select>
          </div>

          {/* Tax mode + rate */}
          <div className="grid grid-cols-3 gap-2">
            <div className="col-span-2">
              <label className="text-[11px] text-[var(--text-tertiary)] mb-1 block">{t.txTaxMode}</label>
              <select value={taxMode} onChange={(e) => setTaxMode(e.target.value as TxTaxMode)}
                className="w-full h-10 px-3 text-sm bg-[var(--bg-alt)] border-none rounded-[4px] text-[var(--text-body)] focus:outline-none focus:ring-2 focus:ring-[var(--blue)]">
                {TX_TAX_MODES.map((m) => (
                  <option key={m.id} value={m.id}>{(t as any)[m.labelKey]}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-[11px] text-[var(--text-tertiary)] mb-1 block">{t.txTaxRate}</label>
              <input
                value={taxMode === "exempt" ? "—" : taxRate}
                disabled={taxMode === "exempt"}
                onChange={(e) => setTaxRate(e.target.value)}
                inputMode="decimal"
                placeholder="13"
                className="w-full h-10 px-3 text-sm bg-[var(--bg-alt)] border-none rounded-[4px] text-[var(--text-body)] tabular-nums focus:outline-none focus:ring-2 focus:ring-[var(--blue)] disabled:opacity-50"
              />
            </div>
          </div>

          {/* Tax breakdown preview */}
          <div className="px-3 py-2 bg-[var(--bg-alt)] rounded-[4px] space-y-1">
            <div className="flex justify-between text-xs text-[var(--text-tertiary)]">
              <span>{t.txSubtotal}</span><span className="tabular-nums">{fmt(breakdown.subtotal)}</span>
            </div>
            <div className="flex justify-between text-xs text-[var(--text-tertiary)]">
              <span>{t.txTax} ({taxMode === "exempt" ? "—" : `${rateNum}%`})</span>
              <span className="tabular-nums">{fmt(breakdown.tax)}</span>
            </div>
            <div className="flex justify-between text-sm font-semibold text-[var(--text-primary)] pt-0.5 border-t border-[var(--border-light)]">
              <span>{t.txTotal}</span><span className="tabular-nums">{fmt(breakdown.total)}</span>
            </div>
          </div>

          {/* Description */}
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder={t.txDescription}
            rows={2}
            className="w-full px-3 py-2 text-sm bg-[var(--bg-alt)] border-none rounded-[4px] text-[var(--text-body)] placeholder:text-[var(--text-placeholder)] focus:outline-none focus:ring-2 focus:ring-[var(--blue)] resize-y"
          />

          {/* Link to deal (optional) */}
          {deals.length > 0 && (
            <div>
              <label className="text-[11px] text-[var(--text-tertiary)] mb-1 block">{t.txLinkDeal}</label>
              <select value={dealId} onChange={(e) => setDealId(e.target.value)}
                className="w-full h-10 px-3 text-sm bg-[var(--bg-alt)] border-none rounded-[4px] text-[var(--text-body)] focus:outline-none focus:ring-2 focus:ring-[var(--blue)]">
                <option value="">{t.txLinkDealNone}</option>
                {deals.map((d) => (
                  <option key={d.id} value={d.id}>{d.address || d.id}</option>
                ))}
              </select>
            </div>
          )}
        </div>

        <div className="flex gap-2 px-4 sm:px-5 py-3 sm:py-4 border-t border-[var(--border-light)] safe-area-pb-modal">
          <button onClick={handleSave} disabled={saving || !amount.trim()}
            className="flex-1 h-11 sm:h-10 text-sm font-medium text-white bg-[var(--blue)] hover:bg-[var(--blue-hover)] rounded-[4px] t-btn-transition disabled:opacity-50 flex items-center justify-center gap-2">
            {saving && <Loader2 className="size-4 animate-spin" />}
            {saving ? t.noteSaving : t.noteSave}
          </button>
          <button onClick={onClose}
            className="px-4 h-11 sm:h-10 text-sm text-[var(--text-tertiary)] hover:bg-[var(--bg-alt)] rounded-[4px] t-transition">
            {t.noteCancel}
          </button>
        </div>
      </div>
    </div>
  );
}
