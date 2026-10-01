import type { Metadata, Viewport } from "next";
import { Cormorant_Garamond, Instrument_Sans } from "next/font/google";
import { Providers } from "@/components/providers";
import { I18nProvider } from "@/i18n/client";
import { getClientMessages, getI18n, getT } from "@/i18n/server";
import "./globals.css";

const sans = Instrument_Sans({
  variable: "--font-ui",
  subsets: ["latin"],
  display: "swap",
});
const serif = Cormorant_Garamond({
  variable: "--font-serif",
  subsets: ["latin", "latin-ext"],
  weight: ["400", "500", "600"],
  style: ["normal", "italic"],
  display: "swap",
});

export async function generateMetadata(): Promise<Metadata> {
  const [t, { intl }] = await Promise.all([getT("common"), getI18n()]);
  return {
    metadataBase: new URL(process.env.APP_URL ?? "http://localhost:3000"),
    title: { default: t("meta.title"), template: "%s · Kept" },
    description: t("meta.description"),
    applicationName: "Kept",
    openGraph: {
      siteName: "Kept",
      type: "website",
      locale: intl.replace("-", "_"),
    },
    appleWebApp: { capable: true, title: "Kept", statusBarStyle: "default" },
    formatDetection: { telephone: false },
  };
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f6f2ea" },
    { media: "(prefers-color-scheme: dark)", color: "#0e0d0b" },
  ],
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const [{ messages: _all, ...i18n }, clientMessages, t] = await Promise.all([
    getI18n(),
    getClientMessages("site"),
    getT("common"),
  ]);
  return (
    <html
      lang={i18n.intl}
      dir={i18n.dir}
      className={`${sans.variable} ${serif.variable} h-full`}
    >
      <body className="min-h-full">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:start-4 focus:top-4 focus:z-[100] focus:rounded-md focus:bg-ink focus:px-4 focus:py-2 focus:text-bg"
        >
          {t("skipToContent")}
        </a>
        <I18nProvider value={{ ...i18n, messages: clientMessages }}>
          <Providers>{children}</Providers>
        </I18nProvider>
      </body>
    </html>
  );
}
