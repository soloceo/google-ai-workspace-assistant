import { useState, useEffect, useCallback } from "react";
import { Toaster } from "sonner";
import { RefreshCw, X } from "lucide-react";
import { translations, type Language } from "./translations";
import { loadGIS, login, isAnyAccountValid } from "./services/auth";
import { GOOGLE_CLIENT_ID } from "./config";
import LoginScreen from "./components/LoginScreen";
import AppShell from "./components/AppShell";

const CURRENT_HASH = typeof __BUILD_HASH__ !== "undefined" ? __BUILD_HASH__ : "";

function useUpdateCheck() {
  const [updateAvailable, setUpdateAvailable] = useState(false);

  const checkForUpdate = useCallback(async () => {
    if (!CURRENT_HASH) return;
    try {
      const res = await fetch(`./version.json?_=${Date.now()}`, { cache: "no-store" });
      if (!res.ok) return;
      const data = await res.json();
      if (data.hash && data.hash !== CURRENT_HASH) setUpdateAvailable(true);
    } catch {}
  }, []);

  useEffect(() => {
    const t1 = setTimeout(checkForUpdate, 30_000);
    const t2 = setInterval(checkForUpdate, 7 * 24 * 60 * 60 * 1000);
    return () => { clearTimeout(t1); clearInterval(t2); };
  }, [checkForUpdate]);

  return updateAvailable;
}

export default function App() {
  const [authenticated, setAuthenticated] = useState<boolean | null>(null);
  const [isDemo, setIsDemo] = useState(false);
  const [lang, setLang] = useState<Language>("zh");
  const [gisReady, setGisReady] = useState(false);
  const updateAvailable = useUpdateCheck();

  useEffect(() => {
    setAuthenticated(isAnyAccountValid());
    loadGIS().then(() => setGisReady(true)).catch(() => setGisReady(false));
  }, []);

  const handleLogin = async () => {
    if (!GOOGLE_CLIENT_ID) {
      alert(lang === "zh" ? "请先配置 VITE_GOOGLE_CLIENT_ID 环境变量" : "Please configure VITE_GOOGLE_CLIENT_ID first");
      return;
    }
    if (!gisReady) {
      alert(lang === "zh" ? "Google 登录服务加载中" : "Google Sign-In is loading");
      return;
    }
    try {
      await login(false);
      setAuthenticated(true);
    } catch (e: any) {
      if (e.message !== "User cancelled") {
        alert(lang === "zh" ? `登录失败: ${e.message}` : `Login failed: ${e.message}`);
      }
    }
  };

  // Loading
  if (authenticated === null) {
    return (
      <div className="h-screen flex items-center justify-center bg-[var(--bg)]">
        <div className="flex flex-col items-center gap-4">
          <div className="w-10 h-10 bg-[var(--blue)] rounded-[4px] flex items-center justify-center">
            <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
          </div>
          <p className="text-sm text-[var(--text-tertiary)]">{translations[lang].loading}</p>
        </div>
      </div>
    );
  }

  // Login
  if (!authenticated && !isDemo) {
    return (
      <>
        <Toaster />
        {updateAvailable && <UpdateBanner lang={lang} />}
        <LoginScreen
          lang={lang}
          onLangChange={setLang}
          onLogin={handleLogin}
          onDemo={() => setIsDemo(true)}
        />
      </>
    );
  }

  // App
  return (
    <>
      <Toaster />
      {updateAvailable && <UpdateBanner lang={lang} />}
      <AppShell
        isDemo={isDemo}
        lang={lang}
        onLangChange={setLang}
        onLogout={() => { setAuthenticated(false); setIsDemo(false); }}
      />
    </>
  );
}

function UpdateBanner({ lang }: { lang: Language }) {
  const [dismissed, setDismissed] = useState(false);
  if (dismissed) return null;

  return (
    <div className="fixed top-0 left-0 right-0 z-[900] bg-[var(--blue)] text-white px-4 py-2 flex items-center justify-center gap-3 text-sm">
      <RefreshCw className="size-3.5 flex-shrink-0" />
      <span>{lang === "zh" ? "新版本可用" : "New version available"}</span>
      <button
        onClick={() => window.location.reload()}
        className="px-3 py-0.5 bg-white text-[var(--blue)] rounded-[4px] text-xs font-medium hover:bg-white/90 t-transition"
      >
        {lang === "zh" ? "更新" : "Update"}
      </button>
      <button onClick={() => setDismissed(true)} className="ml-1 p-1 rounded-[4px] hover:bg-white/20 t-transition">
        <X className="size-3" />
      </button>
    </div>
  );
}
