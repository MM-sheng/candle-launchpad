"use client";
import { createContext, useContext, useEffect, useState } from "react";

type LanguageContextValue = { zh: boolean; toggle: () => void };
const LanguageContext = createContext<LanguageContextValue>({ zh: false, toggle: () => {} });

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [zh, setZh] = useState(false);
  useEffect(() => {
    const saved = localStorage.getItem("wickbid:language");
    setZh(saved ? saved === "zh" : navigator.language.toLowerCase().startsWith("zh"));
  }, []);
  useEffect(() => { document.documentElement.lang = zh ? "zh-CN" : "en"; }, [zh]);
  const toggle = () => setZh((value) => {
    const next = !value;
    localStorage.setItem("wickbid:language", next ? "zh" : "en");
    return next;
  });
  return <LanguageContext.Provider value={{ zh, toggle }}>{children}</LanguageContext.Provider>;
}

export function useLanguage() { return useContext(LanguageContext); }

export function LanguageToggle() {
  const { zh, toggle } = useLanguage();
  return <button className="language-toggle" onClick={toggle} aria-label={zh ? "Switch to English" : "切换到中文"}>{zh ? "EN" : "中文"}</button>;
}
