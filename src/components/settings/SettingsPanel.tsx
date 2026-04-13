import { useState } from "react";
import { X, Plus, Trash2, Sun, Moon, Monitor } from "lucide-react";
import { translations, type Language } from "../../translations";
import type { AccountSummary } from "../../types";

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
}

export default function SettingsPanel({
  lang, settings, geminiApiKey, accounts, isDemo,
  onSave, onSaveApiKey, onAddAccount, onRemoveAccount, onClose,
}: SettingsPanelProps) {
  const t = translations[lang];

  const [aiModel, setAiModel] = useState(settings.aiModel);
  const [signature, setSignature] = useState(settings.signature);
  const [theme, setTheme] = useState(settings.theme);
  const [apiKey, setApiKey] = useState(geminiApiKey);

  const handleSave = () => {
    onSave({ aiModel, signature, theme });
    if (apiKey !== geminiApiKey) onSaveApiKey(apiKey);
    onClose();
  };

  const themes: { value: string; icon: typeof Sun; label: string }[] = [
    { value: "light", icon: Sun, label: t.themeLight },
    { value: "dark", icon: Moon, label: t.themeDark },
    { value: "system", icon: Monitor, label: t.themeSystem },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />

      <div className="relative w-full max-w-md bg-[var(--bg)] rounded-[4px] flex flex-col max-h-[80vh] animate-fade-in">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border-light)]">
          <h2 className="text-[17px] font-medium text-[var(--text-primary)]">{t.settingsTitle}</h2>
          <button onClick={onClose} className="size-7 flex items-center justify-center text-[var(--text-tertiary)] hover:bg-[var(--bg-alt)] rounded-[4px] t-transition">
            <X className="size-4" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-6">
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
              <option value="gemini-2.0-pro">{t.geminiPro}</option>
            </select>
          </section>

          {/* Gemini API Key */}
          <section>
            <h3 className="text-sm font-medium text-[var(--text-primary)] mb-1">{t.geminiApiKey}</h3>
            <p className="text-xs text-[var(--text-tertiary)] mb-3">{t.geminiApiKeyDesc}</p>
            <input
              type="password"
              value={apiKey}
              onChange={e => setApiKey(e.target.value)}
              placeholder="AI..."
              className="w-full h-10 px-3 text-sm bg-[var(--bg-alt)] border-none rounded-[4px] text-[var(--text-body)] placeholder:text-[var(--text-placeholder)] focus:outline-none focus:ring-2 focus:ring-[var(--blue)]"
            />
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
                      className="size-7 flex items-center justify-center text-[var(--text-placeholder)] hover:text-[var(--danger)] hover:bg-red-50 rounded-[4px] t-transition dark:hover:bg-red-900/20"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  )}
                </div>
              ))}
              <button
                onClick={onAddAccount}
                className="w-full flex items-center justify-center gap-2 h-10 text-sm text-[var(--text-tertiary)] bg-[var(--bg-alt)] hover:bg-[var(--bg-hover)] rounded-[4px] t-transition"
              >
                <Plus className="size-4" />
                {t.addAccount}
              </button>
            </div>
          </section>
        </div>

        {/* Footer */}
        <div className="flex gap-2 px-5 py-4 border-t border-[var(--border-light)]">
          <button
            onClick={handleSave}
            className="flex-1 h-10 text-sm font-medium text-white bg-[var(--blue)] hover:bg-[var(--blue-hover)] rounded-[4px] t-btn-transition"
          >
            {t.saveSettings}
          </button>
          <button
            onClick={onClose}
            className="px-4 h-10 text-sm text-[var(--text-tertiary)] hover:bg-[var(--bg-alt)] rounded-[4px] t-transition"
          >
            {t.cancel}
          </button>
        </div>
      </div>
    </div>
  );
}
