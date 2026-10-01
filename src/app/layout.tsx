import type { Metadata, Viewport } from "next";
import { Cormorant_Garamond, Instrument_Sans } from "next/font/google";
import { Providers } from "@/components/providers";
import "./globals.css";

const sans = Instrument_Sans({ variable: "--font-ui", subsets: ["latin"], display: "swap" });
const serif = Cormorant_Garamond({ variable: "--font-serif", subsets: ["latin", "latin-ext"], weight: ["400", "500", "600"], style: ["normal", "italic"], display: "swap" });

export const metadata: Metadata = {
  metadataBase: new URL(process.env.APP_URL ?? "http://localhost:3000"),
  title: { default: "Kept — Book trusted local professionals", template: "%s · Kept" },
  description: "Discover and book barbers, stylists, trainers, photographers, tutors and every kind of local professional — and run your own appointments with ease.",
  applicationName: "Kept",
  openGraph: { siteName: "Kept", type: "website" },
  appleWebApp: { capable: true, title: "Kept", statusBarStyle: "default" },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f6f2ea" },
    { media: "(prefers-color-scheme: dark)", color: "#0e0d0b" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${sans.variable} ${serif.variable} h-full`}>
      <body className="min-h-full">
        <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:rounded-md focus:bg-ink focus:px-4 focus:py-2 focus:text-bg">
          Skip to content
        </a>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
