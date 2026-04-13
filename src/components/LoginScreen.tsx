import { useState } from "react";
import { Mail, Calendar, CheckSquare, Sparkles, Languages, ShieldCheck } from "lucide-react";
import { translations, type Language } from "../translations";

interface LoginScreenProps {
  lang: Language;
  onLangChange: (l: Language) => void;
  onLogin: () => Promise<void>;
  onDemo: () => void;
}

export default function LoginScreen({ lang, onLangChange, onLogin, onDemo }: LoginScreenProps) {
  const [loading, setLoading] = useState(false);
  const t = translations[lang];

  const handleLogin = async () => {
    setLoading(true);
    try {
      await onLogin();
    } finally {
      setLoading(false);
    }
  };

  const features = [
    { icon: Mail, title: t.featureMail, desc: t.featureMailDesc },
    { icon: Calendar, title: t.featureCalendar, desc: t.featureCalendarDesc },
    { icon: CheckSquare, title: t.featureTasks, desc: t.featureTasksDesc },
    { icon: Sparkles, title: t.featureAI, desc: t.featureAIDesc },
  ];

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-[var(--bg)] p-6">
      {/* Language toggle */}
      <button
        onClick={() => onLangChange(lang === "en" ? "zh" : "en")}
        className="absolute top-6 right-6 flex items-center gap-2 px-3 py-2 text-sm text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-alt)] rounded-[4px] t-transition"
      >
        <Languages className="size-4" />
        {lang === "en" ? "中文" : "English"}
      </button>

      <div className="w-full max-w-sm space-y-10">
        {/* Logo + Title */}
        <div className="text-center space-y-4">
          <div className="mx-auto w-14 h-14 bg-[var(--blue)] rounded-[4px] flex items-center justify-center">
            <Sparkles className="size-7 text-white" />
          </div>
          <div>
            <h1 className="text-[28px] font-medium text-[var(--text-primary)] leading-tight">
              {t.appName}
            </h1>
            <p className="mt-2 text-sm text-[var(--text-tertiary)]">
              {t.appDescription}
            </p>
          </div>
        </div>

        {/* Actions */}
        <div className="space-y-3">
          <button
            onClick={handleLogin}
            disabled={loading}
            className="w-full h-11 bg-[var(--blue)] hover:bg-[var(--blue-hover)] text-white text-sm font-medium rounded-[4px] t-btn-transition disabled:opacity-50 flex items-center justify-center"
          >
            {loading ? (
              <span className="size-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              t.signIn
            )}
          </button>
          <button
            onClick={onDemo}
            className="w-full h-11 bg-[var(--bg)] border border-[var(--border-medium)] text-[var(--text-body)] text-sm font-medium rounded-[4px] hover:bg-[var(--bg-alt)] t-btn-transition"
          >
            {t.tryDemo}
          </button>
          <div className="flex items-center justify-center gap-1.5 pt-2 text-xs text-[var(--text-placeholder)]">
            <ShieldCheck className="size-3.5" />
            {t.secureConnection}
          </div>
        </div>

        {/* Features */}
        <div className="grid grid-cols-4 gap-2">
          {features.map(({ icon: Icon, title, desc }) => (
            <div key={title} className="text-center space-y-2 p-3">
              <div className="mx-auto w-10 h-10 rounded-[4px] bg-[var(--blue-light)] flex items-center justify-center">
                <Icon className="size-5 text-[var(--blue)]" />
              </div>
              <p className="text-xs font-medium text-[var(--text-primary)]">{title}</p>
              <p className="text-[11px] text-[var(--text-tertiary)] leading-snug">{desc}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
