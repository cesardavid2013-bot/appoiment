"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";
import type { Locale } from "./locales";
import { makeT, type Messages, type TFunction } from "./translate";

type Ctx = { locale: Locale; intl: string; dir: "ltr" | "rtl"; messages: Messages };
const I18nContext = createContext<Ctx>({ locale: "en", intl: "en-US", dir: "ltr", messages: {} });

export function I18nProvider({ value, children }: { value: Ctx; children: ReactNode }) {
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useLocale() {
  const { locale, intl, dir } = useContext(I18nContext);
  return { locale, intl, dir };
}

/** Client-side translator: `const t = useT("booking"); t("confirm")`. */
export function useT(namespace?: string): TFunction {
  const { messages, intl } = useContext(I18nContext);
  return useMemo(() => makeT(messages, intl, namespace), [messages, intl, namespace]);
}
