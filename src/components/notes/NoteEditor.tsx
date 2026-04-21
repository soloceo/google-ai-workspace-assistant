import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { X, Camera, Image as ImageIcon, Trash2, Loader2, Check } from "lucide-react";
import { toast } from "sonner";
import { translations, type Language } from "../../translations";
import type { Note, NoteCategory, NoteTxType, NoteTaxMode, NotePayment } from "../../types";
import { computeNoteTaxBreakdown } from "../../types";
import { resizeImage, extractTextFromPhoto } from "../../services/photo";

const CATEGORIES: { id: NoteCategory; emoji: string; labelKey: string }[] = [
  { id: "product",    emoji: "🛍", labelKey: "noteCatProduct" },
  { id: "idea",       emoji: "💡", labelKey: "noteCatIdea" },
  { id: "task",       emoji: "✅", labelKey: "noteCatTask" },
  { id: "accounting", emoji: "💰", labelKey: "noteCatAccounting" },
  { id: "other",      emoji: "📝", labelKey: "noteCatOther" },
];

const PAYMENTS: { id: NotePayment; labelKey: string }[] = [
  { id: "cash",   labelKey: "notePayCash" },
  { id: "credit", labelKey: "notePayCredit" },
  { id: "bank",   labelKey: "notePayBank" },
  { id: "cheque", labelKey: "notePayCheque" },
  { id: "other",  labelKey: "notePayOther" },
];

const TAX_MODES: { id: NoteTaxMode; labelKey: string }[] = [
  { id: "exclusive", labelKey: "noteTaxExclusive" },
  { id: "inclusive", labelKey: "noteTaxInclusive" },
  { id: "exempt",    labelKey: "noteTaxExempt" },
];

interface NoteEditorProps {
  lang: Language;
  note: Note | null;              // null = creating new
  geminiReady: boolean;           // whether OCR is available
  /** Default tax rate to prefill when user first picks 'accounting'. */
  defaultTaxRate?: number;
  /** If set, force the note into this category and hide the picker.
   *  Used by the Ledger mode in NotesView to create accounting entries
   *  without letting the user switch away. */
  lockedCategory?: NoteCategory;
  onSave: (data: {
    id?: string;
    title: string;
    text: string;
    category: NoteCategory;
    photos: string[];
    photoTexts: string[];
    // Accounting fields (only sent when category === 'accounting')
    amount?: number;
    txType?: NoteTxType;
    taxMode?: NoteTaxMode;
    taxRate?: number;
    payment?: NotePayment;
    txDate?: string;
  }) => Promise<void>;
  onDelete?: () => Promise<void>;
  onClose: () => void;
}

export default function NoteEditor({ lang, note, geminiReady, defaultTaxRate = 13, lockedCategory, onSave, onDelete, onClose }: NoteEditorProps) {
  const t = translations[lang];
  const [title, setTitle] = useState(note?.title || "");
  const [text, setText] = useState(note?.text || "");
  // Locked category takes priority (e.g. Ledger mode forces 'accounting').
  // Otherwise existing notes keep their category; new notes default to 'other'.
  const [category, setCategory] = useState<NoteCategory>(
    lockedCategory || note?.category || "other"
  );
  const [photos, setPhotos] = useState<string[]>(note?.photos || []);
  const [photoTexts, setPhotoTexts] = useState<string[]>(note?.photoTexts || []);
  const [saving, setSaving] = useState(false);
  const [ocrIndex, setOcrIndex] = useState<number | null>(null);

  // Accounting-only state. Preserved across category toggles so the user
  // doesn't lose fields if they accidentally switch away and back.
  const todayISO = new Date().toISOString().slice(0, 10);
  const [amountStr, setAmountStr] = useState(note?.amount !== undefined ? String(note.amount) : "");
  const [txType, setTxType] = useState<NoteTxType>(note?.txType || "expense");
  const [taxMode, setTaxMode] = useState<NoteTaxMode>(note?.taxMode || "exclusive");
  const [taxRateStr, setTaxRateStr] = useState(
    note?.taxRate !== undefined ? String(note.taxRate) : String(defaultTaxRate)
  );
  const [payment, setPayment] = useState<NotePayment>(note?.payment || "credit");
  const [txDate, setTxDate] = useState(note?.txDate || todayISO);

  const isAccounting = category === "accounting";
  const amountNum = Number(amountStr) || 0;
  const rateNum = Number(taxRateStr) || 0;
  const breakdown = useMemo(
    () => computeNoteTaxBreakdown({ amount: amountNum, taxMode, taxRate: rateNum }),
    [amountNum, taxMode, rateNum]
  );
  const fmtMoney = (n: number) =>
    new Intl.NumberFormat(lang === "zh" ? "zh-CN" : "en-CA", {
      style: "currency", currency: "CAD", minimumFractionDigits: 2,
    }).format(n);

  const cameraInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);

  const handleSave = useCallback(async () => {
    // Accounting entries are valid with just an amount (no title/text needed);
    // regular notes need title/text/photo.
    const hasAccountingContent = isAccounting && amountStr.trim() !== "";
    if (!hasAccountingContent && !title.trim() && !text.trim() && photos.length === 0) return;

    setSaving(true);
    try {
      await onSave({
        id: note?.id,
        title: title.trim(),
        text,
        category,
        photos,
        photoTexts,
        // Include accounting fields only when category is 'accounting'.
        // When the user moves a note OUT of accounting, we send undefined
        // so the server clears the fields — avoids orphan amounts showing
        // in summaries. The Worker's sanitizeNote merges with existing, so
        // we must explicitly pass undefined (not omit) to clear.
        amount: isAccounting ? (amountStr.trim() === "" ? undefined : amountNum) : undefined,
        txType: isAccounting ? txType : undefined,
        taxMode: isAccounting ? taxMode : undefined,
        taxRate: isAccounting ? rateNum : undefined,
        payment: isAccounting ? payment : undefined,
        txDate: isAccounting ? txDate : undefined,
      });
    } finally {
      setSaving(false);
    }
  }, [title, text, category, photos, photoTexts, note, onSave, isAccounting, amountStr, amountNum, txType, taxMode, rateNum, payment, txDate]);

  // Cmd/Ctrl+Enter to save, Escape to close
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") handleSave();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [handleSave, onClose]);

  const handlePhotoFiles = useCallback(async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const newPhotos: string[] = [];
    const newTexts: string[] = [];

    // Resize all files first (fast)
    for (const file of Array.from(files)) {
      try {
        const resized = await resizeImage(file);
        newPhotos.push(resized.dataUrl);
        newTexts.push(""); // filled in by OCR below
      } catch (e) {
        console.error("Resize failed:", e);
        toast.error(lang === "zh" ? "图片处理失败" : "Image processing failed");
      }
    }

    if (newPhotos.length === 0) return;

    // Append immediately so user sees photos
    const insertOffset = photos.length;
    setPhotos(prev => [...prev, ...newPhotos]);
    setPhotoTexts(prev => [...prev, ...newTexts]);

    // Kick off OCR in background (one at a time to avoid rate limits)
    if (geminiReady) {
      for (let i = 0; i < newPhotos.length; i++) {
        const targetIdx = insertOffset + i;
        setOcrIndex(targetIdx);
        try {
          const extracted = await extractTextFromPhoto(newPhotos[i]);
          if (extracted) {
            setPhotoTexts(prev => {
              const next = [...prev];
              next[targetIdx] = extracted;
              return next;
            });
          }
        } catch {
          /* ignore */
        }
      }
      setOcrIndex(null);
    }
  }, [photos.length, geminiReady, lang]);

  const removePhoto = useCallback((idx: number) => {
    setPhotos(prev => prev.filter((_, i) => i !== idx));
    setPhotoTexts(prev => prev.filter((_, i) => i !== idx));
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4 bg-black/30">
      <div className="relative w-full sm:max-w-lg bg-[var(--bg)] sm:rounded-[4px] rounded-t-2xl flex flex-col max-h-[95vh] sm:max-h-[85vh] animate-fade-in">
        {/* Drag handle (mobile) */}
        <div className="flex justify-center pt-2 pb-0 sm:hidden">
          <div className="w-8 h-1 rounded-full bg-[var(--border-medium)]" />
        </div>

        {/* Header */}
        <div className="px-4 sm:px-5 pt-3 pb-2 sm:py-4 flex items-center justify-between border-b border-[var(--border-light)]">
          <h2 className="text-sm font-medium text-[var(--text-primary)]">
            {note ? (lang === "zh" ? "编辑笔记" : "Edit Note") : t.noteNew}
          </h2>
          <div className="flex items-center gap-1">
            {onDelete && (
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

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-4 sm:px-5 py-3 space-y-3">
          {/* Category chips — hidden when locked (Ledger mode) */}
          {!lockedCategory && (
            <div className="flex gap-1.5 overflow-x-auto no-scrollbar -mx-1 px-1">
              {CATEGORIES.map(cat => (
                <button
                  key={cat.id}
                  onClick={() => setCategory(cat.id)}
                  className={`flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium t-transition ${
                    category === cat.id
                      ? "bg-[var(--blue)] text-white"
                      : "bg-[var(--bg-alt)] text-[var(--text-tertiary)]"
                  }`}
                >
                  <span>{cat.emoji}</span>
                  <span>{(t as any)[cat.labelKey]}</span>
                </button>
              ))}
            </div>
          )}

          {/* Title */}
          <input
            value={title}
            onChange={e => setTitle(e.target.value)}
            placeholder={t.noteTitle}
            className="w-full h-11 sm:h-10 px-3 text-[15px] sm:text-sm font-medium bg-[var(--bg-alt)] border-none rounded-[4px] text-[var(--text-primary)] placeholder:text-[var(--text-placeholder)] focus:outline-none focus:ring-2 focus:ring-[var(--blue)]"
            maxLength={500}
          />

          {/* Accounting panel — only when category === 'accounting' */}
          {isAccounting && (
            <div className="space-y-2.5 p-3 bg-[var(--bg-alt)] rounded-[4px]">
              {/* Income / Expense toggle */}
              <div className="flex gap-1 p-1 bg-[var(--bg-hover)] rounded-[4px]">
                {(["expense", "income"] as NoteTxType[]).map(v => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => setTxType(v)}
                    className={`flex-1 h-8 text-xs font-medium rounded-[4px] t-transition ${
                      txType === v
                        ? v === "income"
                          ? "bg-emerald-500 text-white"
                          : "bg-[var(--bg)] text-[var(--text-primary)] shadow-sm"
                        : "text-[var(--text-tertiary)]"
                    }`}
                  >
                    {v === "income" ? t.noteTxTypeIncome : t.noteTxTypeExpense}
                  </button>
                ))}
              </div>

              {/* Amount + date */}
              <div className="grid grid-cols-[1fr_auto] gap-2">
                <div>
                  <label className="text-[11px] text-[var(--text-tertiary)] mb-0.5 block">{t.noteAmount}</label>
                  <input
                    value={amountStr}
                    onChange={e => setAmountStr(e.target.value)}
                    inputMode="decimal"
                    placeholder="0.00"
                    className="w-full h-11 px-3 text-lg font-semibold tabular-nums bg-[var(--bg)] border-none rounded-[4px] text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--blue)]"
                  />
                </div>
                <div>
                  <label className="text-[11px] text-[var(--text-tertiary)] mb-0.5 block">{t.noteTxDate}</label>
                  <input
                    type="date"
                    value={txDate}
                    onChange={e => setTxDate(e.target.value)}
                    className="h-11 px-2 text-sm bg-[var(--bg)] border-none rounded-[4px] text-[var(--text-body)] focus:outline-none focus:ring-2 focus:ring-[var(--blue)]"
                  />
                </div>
              </div>

              {/* Tax mode + rate */}
              <div className="grid grid-cols-[1fr_auto] gap-2">
                <div>
                  <label className="text-[11px] text-[var(--text-tertiary)] mb-0.5 block">{t.noteTaxMode}</label>
                  <select
                    value={taxMode}
                    onChange={e => setTaxMode(e.target.value as NoteTaxMode)}
                    className="w-full h-10 px-3 text-sm bg-[var(--bg)] border-none rounded-[4px] text-[var(--text-body)] focus:outline-none focus:ring-2 focus:ring-[var(--blue)]"
                  >
                    {TAX_MODES.map(m => (
                      <option key={m.id} value={m.id}>{(t as any)[m.labelKey]}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-[11px] text-[var(--text-tertiary)] mb-0.5 block">{t.noteTaxRate}</label>
                  <input
                    value={taxMode === "exempt" ? "—" : taxRateStr}
                    disabled={taxMode === "exempt"}
                    onChange={e => setTaxRateStr(e.target.value)}
                    inputMode="decimal"
                    placeholder="13"
                    className="w-20 h-10 px-2 text-sm tabular-nums bg-[var(--bg)] border-none rounded-[4px] text-[var(--text-body)] focus:outline-none focus:ring-2 focus:ring-[var(--blue)] disabled:opacity-50"
                  />
                </div>
              </div>

              {/* Payment */}
              <div>
                <label className="text-[11px] text-[var(--text-tertiary)] mb-0.5 block">{t.notePayment}</label>
                <select
                  value={payment}
                  onChange={e => setPayment(e.target.value as NotePayment)}
                  className="w-full h-10 px-3 text-sm bg-[var(--bg)] border-none rounded-[4px] text-[var(--text-body)] focus:outline-none focus:ring-2 focus:ring-[var(--blue)]"
                >
                  {PAYMENTS.map(p => (
                    <option key={p.id} value={p.id}>{(t as any)[p.labelKey]}</option>
                  ))}
                </select>
              </div>

              {/* Breakdown */}
              <div className="px-3 py-2 bg-[var(--bg)] rounded-[4px] space-y-0.5">
                <div className="flex justify-between text-[11px] text-[var(--text-tertiary)]">
                  <span>{t.noteSubtotal}</span>
                  <span className="tabular-nums">{fmtMoney(breakdown.subtotal)}</span>
                </div>
                <div className="flex justify-between text-[11px] text-[var(--text-tertiary)]">
                  <span>{t.noteTax} ({taxMode === "exempt" ? "—" : `${rateNum}%`})</span>
                  <span className="tabular-nums">{fmtMoney(breakdown.tax)}</span>
                </div>
                <div className="flex justify-between text-[13px] font-semibold text-[var(--text-primary)] pt-0.5 border-t border-[var(--border-light)]">
                  <span>{t.noteTotal}</span>
                  <span className="tabular-nums">{fmtMoney(breakdown.total)}</span>
                </div>
              </div>
            </div>
          )}

          {/* Content */}
          <textarea
            value={text}
            onChange={e => setText(e.target.value)}
            placeholder={t.noteContent}
            rows={isAccounting ? 3 : 6}
            className="w-full px-3 py-2.5 text-sm bg-[var(--bg-alt)] border-none rounded-[4px] text-[var(--text-body)] placeholder:text-[var(--text-placeholder)] focus:outline-none focus:ring-2 focus:ring-[var(--blue)] resize-y"
          />

          {/* Photo grid */}
          {photos.length > 0 && (
            <div className="grid grid-cols-3 gap-1.5">
              {photos.map((src, idx) => (
                <div key={idx} className="relative aspect-square rounded-[4px] overflow-hidden bg-[var(--bg-hover)] group">
                  <img src={src} alt="" className="w-full h-full object-cover" />
                  {ocrIndex === idx && (
                    <div className="absolute inset-0 bg-black/40 flex flex-col items-center justify-center text-white text-[10px]">
                      <Loader2 className="size-4 animate-spin mb-1" />
                      {t.noteOcrRunning}
                    </div>
                  )}
                  {ocrIndex !== idx && photoTexts[idx] && (
                    <div className="absolute bottom-0 left-0 right-0 flex items-center gap-1 px-1.5 py-1 bg-black/50 text-white text-[10px]">
                      <Check className="size-3 flex-shrink-0" />
                      <span className="truncate">{t.noteOcrDone}</span>
                    </div>
                  )}
                  <button
                    onClick={() => removePhoto(idx)}
                    className="absolute top-1 right-1 size-6 flex items-center justify-center bg-black/60 text-white rounded-full opacity-0 group-hover:opacity-100 focus:opacity-100 t-transition"
                    aria-label={t.noteDelete}
                  >
                    <X className="size-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Photo buttons */}
          <div className="flex gap-2">
            <button
              onClick={() => cameraInputRef.current?.click()}
              className="flex-1 flex items-center justify-center gap-2 h-11 sm:h-10 px-3 text-sm font-medium text-[var(--text-body)] bg-[var(--bg-alt)] hover:bg-[var(--bg-active)] active:bg-[var(--bg-active)] rounded-[4px] t-transition"
            >
              <Camera className="size-4" />
              {t.noteTakePhoto}
            </button>
            <button
              onClick={() => galleryInputRef.current?.click()}
              className="flex-1 flex items-center justify-center gap-2 h-11 sm:h-10 px-3 text-sm font-medium text-[var(--text-body)] bg-[var(--bg-alt)] hover:bg-[var(--bg-active)] active:bg-[var(--bg-active)] rounded-[4px] t-transition"
            >
              <ImageIcon className="size-4" />
              {t.noteUploadPhoto}
            </button>
          </div>

          <input
            ref={cameraInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            onChange={e => { handlePhotoFiles(e.target.files); e.target.value = ""; }}
            className="hidden"
          />
          <input
            ref={galleryInputRef}
            type="file"
            accept="image/*"
            multiple
            onChange={e => { handlePhotoFiles(e.target.files); e.target.value = ""; }}
            className="hidden"
          />
        </div>

        {/* Footer */}
        <div className="flex gap-2 px-4 sm:px-5 py-3 sm:py-4 border-t border-[var(--border-light)] safe-area-pb-modal">
          <button
            onClick={handleSave}
            disabled={
              saving || ocrIndex !== null ||
              (isAccounting
                ? amountStr.trim() === "" || !(Number(amountStr) > 0)
                : !title.trim() && !text.trim() && photos.length === 0)
            }
            className="flex-1 h-11 sm:h-10 text-sm font-medium text-white bg-[var(--blue)] hover:bg-[var(--blue-hover)] rounded-[4px] t-btn-transition disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {(saving || ocrIndex !== null) ? <Loader2 className="size-4 animate-spin" /> : null}
            {ocrIndex !== null ? t.noteOcrRunning : saving ? t.noteSaving : t.noteSave}
          </button>
          <button
            onClick={onClose}
            className="px-4 h-11 sm:h-10 text-sm text-[var(--text-tertiary)] hover:bg-[var(--bg-alt)] active:bg-[var(--bg-alt)] rounded-[4px] t-transition"
          >
            {t.noteCancel}
          </button>
        </div>
      </div>
    </div>
  );
}
