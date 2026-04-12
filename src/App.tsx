/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect } from "react";
import WorkspaceAssistant from "./components/WorkspaceAssistant";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { ShieldCheck, Languages, Mail, Calendar, Zap } from "lucide-react";
import { Toaster } from "@/components/ui/sonner";
import { translations, Language } from "./translations";
import { loadGIS, login, isAnyAccountValid } from "./services/auth";
import { GOOGLE_CLIENT_ID } from "./config";

export default function App() {
  const [authenticated, setAuthenticated] = useState<boolean | null>(null);
  const [isDemo, setIsDemo] = useState(false);
  const [lang, setLang] = useState<Language>("zh");
  const [gisReady, setGisReady] = useState(false);

  const t = translations[lang];

  useEffect(() => {
    // Check if any stored account has a valid (non-expired) token
    const hasValid = isAnyAccountValid();
    setAuthenticated(hasValid);

    // Load Google Identity Services
    loadGIS()
      .then(() => setGisReady(true))
      .catch(() => setGisReady(false));
  }, []);

  const handleLogin = async () => {
    if (!GOOGLE_CLIENT_ID) {
      alert(lang === "zh"
        ? "请先配置 VITE_GOOGLE_CLIENT_ID 环境变量"
        : "Please configure VITE_GOOGLE_CLIENT_ID environment variable first");
      return;
    }
    if (!gisReady) {
      alert(lang === "zh" ? "Google 登录服务加载中，请稍后再试" : "Google Sign-In is loading, please try again");
      return;
    }
    try {
      await login(false);
      setAuthenticated(true);
    } catch (e: any) {
      console.error("Login failed:", e);
      if (e.message !== "User cancelled") {
        alert(lang === "zh" ? `登录失败: ${e.message}` : `Login failed: ${e.message}`);
      }
    }
  };

  if (authenticated === null) {
    return (
      <div className="h-screen flex items-center justify-center bg-gm-bg-dim">
        <div className="flex flex-col items-center gap-6">
          <div className="w-16 h-16 bg-[#1a73e8] rounded-2xl flex items-center justify-center text-white shadow-lg animate-bounce text-3xl font-bold select-none">
            G
          </div>
          <p className="font-sans text-sm font-medium text-gm-text-secondary">{t.loading}</p>
        </div>
      </div>
    );
  }

  if (!authenticated && !isDemo) {
    const features = [
      { icon: Mail, title: t.featureMail, desc: t.featureMailDesc, color: "#ea4335" },
      { icon: Calendar, title: t.featureCalendar, desc: t.featureCalendarDesc, color: "#4285f4" },
      { icon: Zap, title: t.featureAI, desc: t.featureAIDesc, color: "#34a853" },
    ];

    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gm-bg-dim p-4">
        <Toaster />
        <div className="absolute top-6 right-6">
          <Button variant="ghost" onClick={() => setLang((p) => (p === "en" ? "zh" : "en"))} className="gap-2 text-gm-text-secondary">
            <Languages className="h-4 w-4" />
            {lang === "en" ? "中文" : "English"}
          </Button>
        </div>

        <div className="w-full max-w-md space-y-8">
          <Card className="border-gm-border-strong shadow-sm bg-gm-bg rounded-2xl overflow-hidden">
            <CardHeader className="text-center pt-10 pb-6">
              <div className="mx-auto bg-[#1a73e8] w-16 h-16 rounded-2xl flex items-center justify-center mb-6 shadow-md text-white text-3xl font-bold select-none">
                G
              </div>
              <CardTitle className="text-2xl font-normal text-gm-text-primary">{t.appName}</CardTitle>
              <CardDescription className="text-gm-text-secondary mt-2">{t.appDescription}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 pb-10 px-8">
              <Button
                onClick={handleLogin}
                className="w-full bg-[#1a73e8] hover:bg-[#1557b0] text-white font-medium py-6 rounded-lg text-base shadow-sm"
              >
                {t.signIn}
              </Button>
              <Button
                variant="outline"
                onClick={() => setIsDemo(true)}
                className="w-full border-gm-border-strong hover:bg-gm-bg-dim text-gm-text font-medium py-6 rounded-lg text-base"
              >
                {t.tryDemo}
              </Button>
              <div className="flex items-center justify-center gap-2 text-[11px] text-gm-text-secondary pt-4">
                <ShieldCheck className="h-3.5 w-3.5" />
                {t.secureConnection}
              </div>
            </CardContent>
          </Card>

          {/* Feature highlights */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {features.map(({ icon: Icon, title, desc, color }) => (
              <div key={title} className="bg-gm-bg rounded-xl border border-gm-border p-4 space-y-2">
                <div className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ backgroundColor: color + "15" }}>
                  <Icon className="h-4.5 w-4.5" style={{ color }} />
                </div>
                <p className="text-sm font-medium text-gm-text-primary">{title}</p>
                <p className="text-[11px] text-gm-text-secondary leading-snug">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      <Toaster />
      <WorkspaceAssistant
        isDemo={isDemo}
        lang={lang}
        onLangChange={setLang}
        onLogout={() => setAuthenticated(false)}
      />
    </>
  );
}
