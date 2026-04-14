import { useState } from "react";
import { X, Plus, Trash2, Sun, Moon, Monitor, ExternalLink, Loader2, CheckCircle2, XCircle, Languages, LogOut } from "lucide-react";
import { toast } from "sonner";
import { translations, type Language } from "../../translations";
import type { AccountSummary } from "../../types";
import { GoogleGenAI } from "@google/genai";

interface SettingsPanelProps {
  lang: Language;
  settings: { aiModel: string; signature: string; theme: string };
  geminiApiKey: string;
  accounts: AccountSummary[];
  isDemo: boolean;
  onSave: (settings: { aiModel: string; signature: string; theme: string }) => void;
  onSaveApiKey: (key: string) => void;
  onAddAccount: () => void;
  onRemoveAccount: (email: string) => void;
  onClose: () => void;
  onLangChange?: (l: Language) => void;
  onLogout?: () => void;
}

export default function SettingsPanel({
  lang, settings, geminiApiKey, accounts, isDemo,
  onSave, onSaveApiKey, onAddAccount, onRemoveAccount, onClose,
  onLangChange, onLogout,
}: SettingsPanelProps) {
  const t = translations[lang];

  const [aiModel, setAiModel] = useState(settings.aiModel);
  const [signature, setSignature] = useState(settings.signature);
  const [theme, setTheme] = useState(settings.theme);
  const [apiKey, setApiKey] = useState(geminiApiKey);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<"success" | "failed" | null>(null);

  const hasUnsavedChanges = aiModel !== settings.aiModel || signature !== settings.signature || theme !== settings.theme || apiKey !== geminiApiKey;

  const handleSave = () => {
    onSave({ aiModel, signature, theme });
    if (apiKey !== geminiApiKey) onSaveApiKey(apiKey);
    onClose();
  };

  const handleClose = () => {
    if (hasUnsavedChanges) {
      if (!confirm(lang === "en" ? "You have unsaved changes. Discard?" : "有未保存的更改，确定放弃吗？")) return;
    }
    onClose();
  };

  const themes: { value: string; icon: typeof Sun; label: string }[] = [
    { value: "light", icon: Sun, label: t.themeLight },
    { value: "dark", icon: Moon, label: t.themeDark },
    { value: "system", icon: Monitor, label: t.themeSystem },
  ];

  const handleTestConnection = async () => {
    if (!apiKey.trim()) { toast.error(t.noApiKey); return; }
    setTesting(true);
    setTestResult(null);
    try {
      const client = new GoogleGenAI({ apiKey: apiKey.trim() });
      await client.models.generateContent({
        model: aiModel || "gemini-2.5-flash",
        contents: "Reply with OK",
      });
      setTestResult("success");
      toast.success(t.connectionSuccess);
    } catch {
      setTestResult("failed");
      toast.error(t.connectionFailed);
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={handleClose} />

      <div className="relative w-full sm:max-w-md bg-[var(--bg)] sm:rounded-[4px] rounded-t-2xl flex flex-col max-h-[92vh] sm:max-h-[80vh] animate-fade-in">
        {/* Drag handle (mobile) */}
        <div className="flex justify-center pt-2 pb-0 sm:hidden">
          <div className="w-8 h-1 rounded-full bg-[var(--border-medium)]" />
        </div>
        {/* Header */}
        <div className="flex items-center justify-between px-4 sm:px-5 py-3 sm:py-4 border-b border-[var(--border-light)]">
          <h2 className="text-base sm:text-[17px] font-medium text-[var(--text-primary)]">{t.settingsTitle}</h2>
          <button onClick={handleClose} className="size-9 sm:size-7 flex items-center justify-center text-[var(--text-tertiary)] active:bg-[var(--bg-alt)] hover:bg-[var(--bg-alt)] rounded-[4px] t-transition">
            <X className="size-5 sm:size-4" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-4 sm:px-5 py-4 space-y-6">
          {/* Theme */}
          <section>
            <h3 className="text-sm font-medium text-[var(--text-primary)] mb-1">{t.theme}</h3>
            <p className="text-xs text-[var(--text-tertiary)] mb-3">{t.themeDesc}</p>
            <div className="flex gap-2">
              {themes.map(({ value, icon: Icon, label }) => (
                <button
                  key={value}
                  onClick={() => setTheme(value)}
                  className={`flex-1 flex items-center justify-center gap-2 h-10 text-sm rounded-[4px] t-transition ${
                    theme === value
                      ? "bg-[var(--blue-light)] text-[var(--blue)] font-medium"
                      : "bg-[var(--bg-alt)] text-[var(--text-tertiary)] hover:bg-[var(--bg-hover)]"
                  }`}
                >
                  <Icon className="size-4" />
                  {label}
                </button>
              ))}
            </div>
          </section>

          {/* AI Model */}
          <section>
            <h3 className="text-sm font-medium text-[var(--text-primary)] mb-1">{t.aiModel}</h3>
            <p className="text-xs text-[var(--text-tertiary)] mb-3">{t.aiModelDesc}</p>
            <select
              value={aiModel}
              onChange={e => setAiModel(e.target.value)}
              className="w-full h-10 px-3 text-sm bg-[var(--bg-alt)] border-none rounded-[4px] text-[var(--text-body)] focus:outline-none focus:ring-2 focus:ring-[var(--blue)]"
            >
              <option value="gemini-2.5-flash">{t.geminiFlash}</option>
              <option value="gemini-2.5-pro">{t.geminiPro}</option>
              <option value="gemini-2.5-flash-lite">{t.geminiFlashLite}</option>
            </select>
          </section>

          {/* Gemini API Key */}
          <section>
            <div className="flex items-center justify-between mb-1">
              <h3 className="text-sm font-medium text-[var(--text-primary)]">{t.geminiApiKey}</h3>
              <a
                href="https://aistudio.google.com/app/apikey"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 text-xs font-medium text-[var(--blue)] hover:text-[var(--blue-hover)] t-transition"
              >
                {t.getApiKey}
                <ExternalLink className="size-3" />
              </a>
            </div>
            <p className="text-xs text-[var(--text-tertiary)] mb-3">{t.geminiApiKeyDesc}</p>
            <div className="flex gap-2">
              <input
                type="password"
                value={apiKey}
                onChange={e => { setApiKey(e.target.value); setTestResult(null); }}
                placeholder="AI..."
                className="flex-1 h-10 px-3 text-sm bg-[var(--bg-alt)] border-none rounded-[4px] text-[var(--text-body)] placeholder:text-[var(--text-placeholder)] focus:outline-none focus:ring-2 focus:ring-[var(--blue)]"
              />
              <button
                onClick={handleTestConnection}
                disabled={testing || !apiKey.trim()}
                className={`flex items-center gap-1.5 px-3 h-10 text-sm font-medium rounded-[4px] t-btn-transition disabled:opacity-40 flex-shrink-0 ${
                  testResult === "success"
                    ? "bg-emerald-500/10 text-emerald-600"
                    : testResult === "failed"
                    ? "bg-red-500/10 text-red-600"
                    : "bg-[var(--bg-alt)] text-[var(--text-body)] hover:bg-[var(--bg-hover)]"
                }`}
              >
                {testing ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : testResult === "success" ? (
                  <CheckCircle2 className="size-3.5" />
                ) : testResult === "failed" ? (
                  <XCircle className="size-3.5" />
                ) : null}
                {testing ? t.testingConnection : t.testConnection}
              </button>
            </div>
          </section>

          {/* Email Signature */}
          <section>
            <h3 className="text-sm font-medium text-[var(--text-primary)] mb-1">{t.emailSignature}</h3>
            <p className="text-xs text-[var(--text-tertiary)] mb-3">{t.emailSignatureDesc}</p>
            <textarea
              value={signature}
              onChange={e => setSignature(e.target.value)}
              rows={3}
              className="w-full px-3 py-2 text-sm bg-[var(--bg-alt)] border-none rounded-[4px] text-[var(--text-body)] placeholder:text-[var(--text-placeholder)] focus:outline-none focus:ring-2 focus:ring-[var(--blue)] resize-none"
            />
          </section>

          {/* Accounts */}
          <section>
            <h3 className="text-sm font-medium text-[var(--text-primary)] mb-1">{t.accounts}</h3>
            <p className="text-xs text-[var(--text-tertiary)] mb-3">{t.manageAccounts}</p>
            <div className="space-y-2">
              {accounts.map(account => (
                <div key={account.email} className="flex items-center gap-3 p-3 bg-[var(--bg-alt)] rounded-[4px]">
                  <div className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-medium flex-shrink-0"
                    style={{ backgroundColor: account.color }}>
                    {account.name.charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-[var(--text-primary)] truncate">{account.name}</p>
                    <p className="text-xs text-[var(--text-tertiary)] truncate">{account.email}</p>
                  </div>
                  {accounts.length > 1 && (
                    <button
                      onClick={() => onRemoveAccount(account.email)}
                      className="size-9 sm:size-7 flex items-center justify-center text-[var(--text-placeholder)] hover:text-[var(--danger)] active:bg-red-50 hover:bg-red-50 rounded-[4px] t-transition dark:hover:bg-red-900/20 dark:active:bg-red-900/20"
                    >
                      <Trash2 className="size-4 sm:size-3.5" />
                    </button>
                  )}
                </div>
              ))}
              <button
                onClick={onAddAccount}
                className="w-full flex items-center justify-center gap-2 h-11 sm:h-10 text-sm text-[var(--text-tertiary)] bg-[var(--bg-alt)] hover:bg-[var(--bg-hover)] active:bg-[var(--bg-hover)] rounded-[4px] t-transition"
              >
                <Plus className="size-4" />
                {t.addAccount}
              </button>
            </div>
          </section>

          {/* Language & Logout (mobile-accessible) */}
          {(onLangChange || onLogout) && (
            <section className="space-y-2">
              {onLangChange && (
                <button
                  onClick={() => onLangChange(lang === "en" ? "zh" : "en")}
                  className="w-full flex items-center gap-3 h-11 sm:h-10 px-3 text-sm text-[var(--text-body)] bg-[var(--bg-alt)] hover:bg-[var(--bg-hover)] active:bg-[var(--bg-hover)] rounded-[4px] t-transition"
                >
                  <Languages className="size-4 text-[var(--text-tertiary)]" />
                  {lang === "en" ? "切换到中文" : "Switch to English"}
                </button>
              )}
              {onLogout && (
                <button
                  onClick={onLogout}
                  className="w-full flex items-center gap-3 h-11 sm:h-10 px-3 text-sm text-red-500 bg-[var(--bg-alt)] hover:bg-red-50 active:bg-red-50 dark:hover:bg-red-900/10 dark:active:bg-red-900/10 rounded-[4px] t-transition"
                >
                  <LogOut className="size-4" />
                  {t.logout}
                </button>
              )}
            </section>
          )}
        </div>

        {/* Footer */}
        <div className="flex gap-2 px-4 sm:px-5 py-3 sm:py-4 border-t border-[var(--border-light)] safe-area-pb">
          <button
            onClick={handleSave}
            className="flex-1 h-11 sm:h-10 text-sm font-medium text-white bg-[var(--blue)] hover:bg-[var(--blue-hover)] rounded-[4px] t-btn-transition"
          >
            {t.saveSettings}
          </button>
          <button
            onClick={handleClose}
            className="px-4 h-11 sm:h-10 text-sm text-[var(--text-tertiary)] hover:bg-[var(--bg-alt)] active:bg-[var(--bg-alt)] rounded-[4px] t-transition"
          >
            {t.cancel}
          </button>
        </div>
      </div>
    </div>
  );
}
