import { useState, useEffect, useRef, useCallback } from "react";
import { X, Camera, Image as ImageIcon, Trash2, Loader2, Check } from "lucide-react";
import { toast } from "sonner";
import { translations, type Language } from "../../translations";
import type { Note, NoteCategory } from "../../types";
import { resizeImage, extractTextFromPhoto } from "../../services/photo";

const CATEGORIES: { id: NoteCategory; emoji: string; labelKey: string }[] = [
  { id: "product", emoji: "🛍", labelKey: "noteCatProduct" },
  { id: "idea",    emoji: "💡", labelKey: "noteCatIdea" },
  { id: "task",    emoji: "✅", labelKey: "noteCatTask" },
  { id: "other",   emoji: "📝", labelKey: "noteCatOther" },
];

interface NoteEditorProps {
  lang: Language;
  note: Note | null;              // null = creating new
  geminiReady: boolean;           // whether OCR is available
  onSave: (data: {
    id?: string;
    title: string;
    text: string;
    category: NoteCategory;
    photos: string[];
    photoTexts: string[];
  }) => Promise<void>;
  onDelete?: () => Promise<void>;
  onClose: () => void;
}

export default function NoteEditor({ lang, note, geminiReady, onSave, onDelete, onClose }: NoteEditorProps) {
  const t = translations[lang];
  const [title, setTitle] = useState(note?.title || "");
  const [text, setText] = useState(note?.text || "");
  const [category, setCategory] = useState<NoteCategory>(note?.category || "other");
  const [photos, setPhotos] = useState<string[]>(note?.photos || []);
  const [photoTexts, setPhotoTexts] = useState<string[]>(note?.photoTexts || []);
  const [saving, setSaving] = useState(false);
  const [ocrIndex, setOcrIndex] = useState<number | null>(null);

  const cameraInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);

  const handleSave = useCallback(async () => {
    if (!title.trim() && !text.trim() && photos.length === 0) return;
    setSaving(true);
    try {
      await onSave({
        id: note?.id,
        title: title.trim(),
        text,
        category,
        photos,
        photoTexts,
      });
    } finally {
      setSaving(false);
    }
  }, [title, text, category, photos, photoTexts, note, onSave]);

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
          {/* Category chips */}
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

          {/* Title */}
          <input
            value={title}
            onChange={e => setTitle(e.target.value)}
            placeholder={t.noteTitle}
            className="w-full h-11 sm:h-10 px-3 text-[15px] sm:text-sm font-medium bg-[var(--bg-alt)] border-none rounded-[4px] text-[var(--text-primary)] placeholder:text-[var(--text-placeholder)] focus:outline-none focus:ring-2 focus:ring-[var(--blue)]"
            maxLength={500}
          />

          {/* Content */}
          <textarea
            value={text}
            onChange={e => setText(e.target.value)}
            placeholder={t.noteContent}
            rows={6}
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
            disabled={saving || (!title.trim() && !text.trim() && photos.length === 0)}
            className="flex-1 h-11 sm:h-10 text-sm font-medium text-white bg-[var(--blue)] hover:bg-[var(--blue-hover)] rounded-[4px] t-btn-transition disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {saving ? <Loader2 className="size-4 animate-spin" /> : null}
            {saving ? t.noteSaving : t.noteSave}
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
