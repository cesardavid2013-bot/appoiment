import type { Metadata } from "next";
import { I18nProvider } from "@/i18n/client";
import { getClientMessages, getI18n } from "@/i18n/server";
import { requireViewerPage } from "@/server/viewer";

export const metadata: Metadata = { title: { default: "Business", template: "%s · Kept Business" }, robots: { index: false } };

export default async function ProRootLayout({ children }: LayoutProps<"/pro">) {
  await requireViewerPage("/pro");
  // The console's own messages are only loaded here, not on every public page.
  const [{ messages: _all, ...i18n }, messages] = await Promise.all([getI18n(), getClientMessages("console")]);
  return <I18nProvider value={{ ...i18n, messages }}>{children}</I18nProvider>;
}
