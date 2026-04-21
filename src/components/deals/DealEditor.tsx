import { useState, useEffect, useCallback } from "react";
import { X, Trash2, Loader2, ChevronLeft, ChevronRight, Archive, RotateCcw } from "lucide-react";
import { translations, type Language } from "../../translations";
import type { Deal, DealType, DealStatus } from "../../types";
import { DEAL_STAGES, DEAL_TYPE_META, progressForStage } from "../../services/deals";

type DealInput = Partial<Deal> & { type: DealType; address: string };

interface DealEditorProps {
  lang: Language;
  deal: Deal | null;
  onSave: (data: DealInput & { id?: string; status?: DealStatus }) => Promise<void>;
  onDelete?: () => Promise<void>;
  onClose: () => void;
  /** Called when the final stage of a "sell"/"buy"/"rent" is reached, so the
   *  parent can offer to record the commission in the accounting tab. */
  onFinalStage?: (deal: Deal) => void;
}

const DEAL_TYPES: DealType[] = ["sell", "buy", "rent", "other"];

export default function DealEditor({ lang, deal, onSave, onDelete, onClose }: DealEditorProps) {
  const t = translations[lang];
  const creating = !deal;
  const [type, setType] = useState<DealType>(deal?.type || "sell");
  const [status, setStatus] = useState<DealStatus>(deal?.status || "active");
  const [stageIndex, setStageIndex] = useState(deal?.stageIndex ?? 0);
  const [address, setAddress] = useState(deal?.address || "");
  const [contactName, setContactName] = useState(deal?.contactName || "");
  const [contactEmail, setContactEmail] = useState(deal?.contactEmail || "");
  const [contactPhone, setContactPhone] = useState(deal?.contactPhone || "");
  const [listingPrice, setListingPrice] = useState(deal?.listingPrice?.toString() || "");
  const [offerPrice, setOfferPrice] = useState(deal?.offerPrice?.toString() || "");
  const [finalPrice, setFinalPrice] = useState(deal?.finalPrice?.toString() || "");
  const [commission, setCommission] = useState(deal?.commission?.toString() || "");
  const [targetCloseDate, setTargetCloseDate] = useState(deal?.targetCloseDate || "");
  const [notes, setNotes] = useState(deal?.notes || "");
  const [saving, setSaving] = useState(false);

  const stages = DEAL_STAGES[type];
  // Keep stageIndex valid when type changes (shorter stage list)
  useEffect(() => {
    if (stageIndex > stages.length - 1) setStageIndex(stages.length - 1);
  }, [type, stages.length, stageIndex]);

  const numOrUndef = (s: string): number | undefined => {
    const t = s.trim();
    if (!t) return undefined;
    const n = Number(t);
    return Number.isFinite(n) ? n : undefined;
  };

  const handleSave = useCallback(async () => {
    if (!address.trim()) return;
    setSaving(true);
    try {
      await onSave({
        id: deal?.id,
        type,
        status,
        stageIndex,
        address: address.trim(),
        contactName: contactName.trim() || undefined,
        contactEmail: contactEmail.trim() || undefined,
        contactPhone: contactPhone.trim() || undefined,
        listingPrice: numOrUndef(listingPrice),
        offerPrice: numOrUndef(offerPrice),
        finalPrice: numOrUndef(finalPrice),
        commission: numOrUndef(commission),
        targetCloseDate: targetCloseDate || undefined,
        notes: notes || undefined,
      });
    } finally {
      setSaving(false);
    }
  }, [deal, type, status, stageIndex, address, contactName, contactEmail, contactPhone, listingPrice, offerPrice, finalPrice, commission, targetCloseDate, notes, onSave]);

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") handleSave();
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [handleSave, onClose]);

  const progress = progressForStage(type, stageIndex);
  const typeMeta = DEAL_TYPE_META[type];

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4 bg-black/30">
      <div className="relative w-full sm:max-w-lg bg-[var(--bg)] sm:rounded-[4px] rounded-t-2xl flex flex-col max-h-[95vh] sm:max-h-[88vh] animate-fade-in">
        {/* Drag handle */}
        <div className="flex justify-center pt-2 pb-0 sm:hidden">
          <div className="w-8 h-1 rounded-full bg-[var(--border-medium)]" />
        </div>

        {/* Header */}
        <div className="px-4 sm:px-5 pt-3 pb-2 sm:py-4 flex items-center justify-between border-b border-[var(--border-light)]">
          <h2 className="text-sm font-medium text-[var(--text-primary)]">
            {creating ? t.dealNew : t.dealEdit}
          </h2>
          <div className="flex items-center gap-1">
            {!creating && onDelete && (
              <button
                onClick={onDelete}
                className="size-9 sm:size-8 flex items-center justify-center text-[var(--text-tertiary)] hover:text-red-500 active:bg-red-50 hover:bg-red-50 rounded-[4px] t-transition dark:hover:bg-red-900/20"
                title={t.noteDelete}
              >
                <Trash2 className="size-4" />
              </button>
            )}
            <button
              onClick={onClose}
              className="size-9 sm:size-8 flex items-center justify-center text-[var(--text-tertiary)] active:bg-[var(--bg-alt)] hover:bg-[var(--bg-alt)] rounded-[4px]"
            >
              <X className="size-5 sm:size-4" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-4 sm:px-5 py-3 space-y-3">
          {/* Type picker */}
          <div className="flex gap-1.5 overflow-x-auto no-scrollbar -mx-1 px-1">
            {DEAL_TYPES.map(tp => {
              const m = DEAL_TYPE_META[tp];
              return (
                <button
                  key={tp}
                  onClick={() => setType(tp)}
                  className={`flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium t-transition ${
                    type === tp ? "bg-[var(--blue)] text-white" : "bg-[var(--bg-alt)] text-[var(--text-tertiary)]"
                  }`}
                >
                  <span>{m.emoji}</span>
                  <span>{(t as any)[m.labelKey]}</span>
                </button>
              );
            })}
          </div>

          {/* Address (required) */}
          <input
            value={address}
            onChange={e => setAddress(e.target.value)}
            placeholder={t.dealAddress + " *"}
            autoFocus={creating}
            className="w-full h-11 sm:h-10 px-3 text-[15px] sm:text-sm font-medium bg-[var(--bg-alt)] border-none rounded-[4px] text-[var(--text-primary)] placeholder:text-[var(--text-placeholder)] focus:outline-none focus:ring-2 focus:ring-[var(--blue)]"
            maxLength={500}
          />

          {/* Stage progress panel */}
          <div className="p-3 bg-[var(--bg-alt)] rounded-[4px] space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[11px] uppercase tracking-wide text-[var(--text-quaternary)] font-semibold">
                {t.dealStage}
              </span>
              <span className="text-[11px] text-[var(--text-tertiary)] tabular-nums">
                {stageIndex + 1} / {stages.length} · {progress}%
              </span>
            </div>
            <div className="h-2 bg-[var(--bg-hover)] rounded-full overflow-hidden">
              <div className="h-full bg-[var(--blue)] t-transition" style={{ width: `${progress}%` }} />
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setStageIndex(Math.max(0, stageIndex - 1))}
                disabled={stageIndex === 0}
                className="size-8 flex items-center justify-center rounded-[4px] text-[var(--text-tertiary)] hover:bg-[var(--bg-active)] disabled:opacity-40"
              >
                <ChevronLeft className="size-4" />
              </button>
              <div className="flex-1 text-center text-sm">
                <span className="mr-1">{stages[stageIndex].emoji}</span>
                <span className="font-medium text-[var(--text-primary)]">
                  {(t as any)[stages[stageIndex].key] || stages[stageIndex].key}
                </span>
              </div>
              <button
                onClick={() => setStageIndex(Math.min(stages.length - 1, stageIndex + 1))}
                disabled={stageIndex === stages.length - 1}
                className="size-8 flex items-center justify-center rounded-[4px] text-[var(--text-tertiary)] hover:bg-[var(--bg-active)] disabled:opacity-40"
              >
                <ChevronRight className="size-4" />
              </button>
            </div>
          </div>

          {/* Contact */}
          <div className="grid grid-cols-2 gap-2">
            <input
              value={contactName}
              onChange={e => setContactName(e.target.value)}
              placeholder={t.dealContactName}
              className="h-10 px-3 text-sm bg-[var(--bg-alt)] border-none rounded-[4px] text-[var(--text-body)] placeholder:text-[var(--text-placeholder)] focus:outline-none focus:ring-2 focus:ring-[var(--blue)]"
            />
            <input
              value={contactPhone}
              onChange={e => setContactPhone(e.target.value)}
              placeholder={t.dealContactPhone}
              inputMode="tel"
              className="h-10 px-3 text-sm bg-[var(--bg-alt)] border-none rounded-[4px] text-[var(--text-body)] placeholder:text-[var(--text-placeholder)] focus:outline-none focus:ring-2 focus:ring-[var(--blue)]"
            />
          </div>
          <input
            value={contactEmail}
            onChange={e => setContactEmail(e.target.value)}
            placeholder={t.dealContactEmail}
            type="email"
            className="w-full h-10 px-3 text-sm bg-[var(--bg-alt)] border-none rounded-[4px] text-[var(--text-body)] placeholder:text-[var(--text-placeholder)] focus:outline-none focus:ring-2 focus:ring-[var(--blue)]"
          />

          {/* Prices */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[11px] text-[var(--text-tertiary)] mb-1 block">{t.dealListingPrice}</label>
              <input
                value={listingPrice}
                onChange={e => setListingPrice(e.target.value)}
                placeholder="0"
                inputMode="decimal"
                className="w-full h-10 px-3 text-sm bg-[var(--bg-alt)] border-none rounded-[4px] text-[var(--text-body)] tabular-nums focus:outline-none focus:ring-2 focus:ring-[var(--blue)]"
              />
            </div>
            <div>
              <label className="text-[11px] text-[var(--text-tertiary)] mb-1 block">{t.dealOfferPrice}</label>
              <input
                value={offerPrice}
                onChange={e => setOfferPrice(e.target.value)}
                placeholder="0"
                inputMode="decimal"
                className="w-full h-10 px-3 text-sm bg-[var(--bg-alt)] border-none rounded-[4px] text-[var(--text-body)] tabular-nums focus:outline-none focus:ring-2 focus:ring-[var(--blue)]"
              />
            </div>
            <div>
              <label className="text-[11px] text-[var(--text-tertiary)] mb-1 block">{t.dealFinalPrice}</label>
              <input
                value={finalPrice}
                onChange={e => setFinalPrice(e.target.value)}
                placeholder="0"
                inputMode="decimal"
                className="w-full h-10 px-3 text-sm bg-[var(--bg-alt)] border-none rounded-[4px] text-[var(--text-body)] tabular-nums focus:outline-none focus:ring-2 focus:ring-[var(--blue)]"
              />
            </div>
            <div>
              <label className="text-[11px] text-[var(--text-tertiary)] mb-1 block">{t.dealCommission}</label>
              <input
                value={commission}
                onChange={e => setCommission(e.target.value)}
                placeholder="0"
                inputMode="decimal"
                className="w-full h-10 px-3 text-sm bg-[var(--bg-alt)] border-none rounded-[4px] text-[var(--text-body)] tabular-nums focus:outline-none focus:ring-2 focus:ring-[var(--blue)]"
              />
            </div>
          </div>

          {/* Target close date */}
          <div>
            <label className="text-[11px] text-[var(--text-tertiary)] mb-1 block">{t.dealTargetClose}</label>
            <input
              type="date"
              value={targetCloseDate}
              onChange={e => setTargetCloseDate(e.target.value)}
              className="w-full h-10 px-3 text-sm bg-[var(--bg-alt)] border-none rounded-[4px] text-[var(--text-body)] focus:outline-none focus:ring-2 focus:ring-[var(--blue)]"
            />
          </div>

          {/* Notes */}
          <textarea
            value={notes}
            onChange={e => setNotes(e.target.value)}
            placeholder={t.dealNotes}
            rows={3}
            className="w-full px-3 py-2.5 text-sm bg-[var(--bg-alt)] border-none rounded-[4px] text-[var(--text-body)] placeholder:text-[var(--text-placeholder)] focus:outline-none focus:ring-2 focus:ring-[var(--blue)] resize-y"
          />

          {/* Archive toggle */}
          {!creating && (
            <button
              onClick={() => setStatus(status === "archived" ? "active" : "archived")}
              className={`w-full flex items-center justify-center gap-2 h-10 text-sm rounded-[4px] t-transition ${
                status === "archived"
                  ? "bg-[var(--blue-light)] text-[var(--blue)]"
                  : "bg-[var(--bg-alt)] text-[var(--text-tertiary)] hover:bg-[var(--bg-active)]"
              }`}
            >
              {status === "archived" ? <RotateCcw className="size-4" /> : <Archive className="size-4" />}
              {status === "archived" ? t.dealUnarchive : t.dealArchive}
            </button>
          )}
        </div>

        {/* Footer */}
        <div className="flex gap-2 px-4 sm:px-5 py-3 sm:py-4 border-t border-[var(--border-light)] safe-area-pb-modal">
          <button
            onClick={handleSave}
            disabled={saving || !address.trim()}
            className="flex-1 h-11 sm:h-10 text-sm font-medium text-white bg-[var(--blue)] hover:bg-[var(--blue-hover)] rounded-[4px] t-btn-transition disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {saving && <Loader2 className="size-4 animate-spin" />}
            {saving ? t.noteSaving : t.noteSave}
          </button>
          <button
            onClick={onClose}
            className="px-4 h-11 sm:h-10 text-sm text-[var(--text-tertiary)] hover:bg-[var(--bg-alt)] rounded-[4px] t-transition"
          >
            {t.noteCancel}
          </button>
        </div>
      </div>
    </div>
  );
}
