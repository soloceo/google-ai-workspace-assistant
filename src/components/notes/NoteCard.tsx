import { translations, type Language } from "../../translations";
import type { Note } from "../../types";

// NoteCard renders plain notes only. Ledger entries are rendered by a
// dedicated list in NotesView, so 'accounting' intentionally has no
// entry here — if one ever leaks through, it falls back to "📝".
const CATEGORY_EMOJI: Record<string, string> = {
  product: "🛍",
  idea: "💡",
  task: "✅",
  other: "📝",
};

function formatRelative(ts: number, lang: Language): string {
  const diff = Date.now() - ts;
  const min = Math.floor(diff / 60000);
  const hr = Math.floor(diff / 3600000);
  const day = Math.floor(diff / 86400000);
  if (lang === "zh") {
    if (min < 1) return "刚刚";
    if (min < 60) return `${min} 分钟前`;
    if (hr < 24) return `${hr} 小时前`;
    if (day < 7) return `${day} 天前`;
    return new Date(ts).toLocaleDateString("zh-CN", { month: "short", day: "numeric" });
  }
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  if (hr < 24) return `${hr}h ago`;
  if (day < 7) return `${day}d ago`;
  return new Date(ts).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

interface NoteCardProps {
  note: Note;
  lang: Language;
  onClick: () => void;
}

export default function NoteCard({ note, lang, onClick }: NoteCardProps) {
  const t = translations[lang];
  const emoji = CATEGORY_EMOJI[note.category] || "📝";
  const preview = note.text.slice(0, 160).trim();
  const firstPhoto = note.photos?.[0];
  const extraPhotos = Math.max(0, (note.photos?.length || 0) - 1);

  return (
    <button
      onClick={onClick}
      className="group flex flex-col text-left bg-[var(--bg-alt)] hover:bg-[var(--bg-active)] active:bg-[var(--bg-active)] rounded-[4px] overflow-hidden t-transition active:scale-[0.98]"
    >
      {firstPhoto && (
        <div className="relative aspect-[4/3] w-full bg-[var(--bg-hover)] overflow-hidden">
          <img src={firstPhoto} alt="" className="w-full h-full object-cover" loading="lazy" />
          {extraPhotos > 0 && (
            <div className="absolute bottom-1.5 right-1.5 px-1.5 py-0.5 rounded-full bg-black/60 text-white text-[10px] font-medium backdrop-blur-sm">
              +{extraPhotos}
            </div>
          )}
        </div>
      )}
      <div className="flex-1 p-3 space-y-1.5">
        <div className="flex items-start gap-1.5">
          <span className="text-sm flex-shrink-0 leading-5">{emoji}</span>
          {note.title && (
            <h3 className="text-sm font-semibold text-[var(--text-primary)] line-clamp-2 leading-5 flex-1">
              {note.title}
            </h3>
          )}
        </div>

        {preview && (
          <p className="text-[13px] text-[var(--text-tertiary)] line-clamp-3 leading-snug whitespace-pre-wrap">
            {preview}
          </p>
        )}
        <p className="text-[11px] text-[var(--text-quaternary)]">
          {t.noteUpdatedAt.replace("{time}", formatRelative(note.updated_at, lang))}
        </p>
      </div>
    </button>
  );
}
