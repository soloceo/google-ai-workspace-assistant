import { MapPin } from "lucide-react";
import { translations, type Language } from "../../translations";
import type { Deal } from "../../types";
import { DEAL_STAGES, DEAL_TYPE_META, progressForStage } from "../../services/deals";

interface DealCardProps {
  deal: Deal;
  lang: Language;
  onClick: () => void;
}

function daysUntil(dateStr: string | undefined): number | null {
  if (!dateStr) return null;
  const d = new Date(dateStr + "T00:00:00");
  if (Number.isNaN(d.getTime())) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diff = d.getTime() - today.getTime();
  return Math.round(diff / 86400000);
}

function fmtMoney(n: number | undefined, lang: Language): string {
  if (n === undefined || n === null) return "—";
  const locale = lang === "zh" ? "zh-CN" : "en-CA";
  return new Intl.NumberFormat(locale, { style: "currency", currency: "CAD", maximumFractionDigits: 0 }).format(n);
}

export default function DealCard({ deal, lang, onClick }: DealCardProps) {
  const t = translations[lang];
  const typeMeta = DEAL_TYPE_META[deal.type];
  const stages = DEAL_STAGES[deal.type];
  const stage = stages[deal.stageIndex] || stages[0];
  const progress = progressForStage(deal.type, deal.stageIndex);
  const days = daysUntil(deal.targetCloseDate);
  const isArchived = deal.status === "archived";

  return (
    <button
      onClick={onClick}
      className={`group flex flex-col text-left bg-[var(--bg-alt)] hover:bg-[var(--bg-active)] active:bg-[var(--bg-active)] rounded-[4px] t-transition active:scale-[0.98] p-3 sm:p-3.5 ${
        isArchived ? "opacity-60" : ""
      }`}
    >
      <div className="flex items-start justify-between gap-2 mb-1.5">
        <div className="flex items-center gap-1.5 flex-1 min-w-0">
          <span className="text-base flex-shrink-0">{typeMeta.emoji}</span>
          <h3 className="text-sm font-semibold text-[var(--text-primary)] truncate">
            {deal.address || (lang === "zh" ? "(未填地址)" : "(no address)")}
          </h3>
        </div>
        <span className={`flex-shrink-0 text-[10px] px-1.5 py-0.5 rounded font-medium ${
          isArchived ? "bg-[var(--bg-hover)] text-[var(--text-quaternary)]" : "bg-[var(--blue-light)] text-[var(--blue)]"
        }`}>
          {(t as any)[typeMeta.labelKey]}
        </span>
      </div>

      {deal.contactName && (
        <p className="text-[12px] text-[var(--text-tertiary)] truncate mb-2 flex items-center gap-1">
          <MapPin className="size-3 flex-shrink-0" />
          {deal.contactName}
        </p>
      )}

      <div className="flex items-center gap-1.5 text-[12px] mb-1.5">
        <span className="flex-shrink-0">{stage.emoji}</span>
        <span className="text-[var(--text-body)] font-medium truncate">
          {(t as any)[stage.key] || stage.key}
        </span>
      </div>

      <div className="h-1.5 bg-[var(--bg-hover)] rounded-full overflow-hidden mb-1.5">
        <div
          className="h-full bg-[var(--blue)] t-transition"
          style={{ width: `${progress}%` }}
        />
      </div>

      <div className="flex items-center justify-between text-[11px] text-[var(--text-quaternary)]">
        <span>{progress}%</span>
        {days !== null && !isArchived && (
          <span className={days < 0 ? "text-red-500" : days <= 7 ? "text-amber-500" : ""}>
            {days < 0
              ? (lang === "zh" ? `逾期 ${-days} 天` : `${-days}d overdue`)
              : days === 0
              ? (lang === "zh" ? "今日到期" : "due today")
              : (lang === "zh" ? `还剩 ${days} 天` : `${days}d left`)}
          </span>
        )}
        {deal.commission !== undefined && (
          <span className="text-emerald-600 font-medium">
            {fmtMoney(deal.commission, lang)}
          </span>
        )}
      </div>
    </button>
  );
}
