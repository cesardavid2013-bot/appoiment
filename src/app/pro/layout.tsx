import type { Metadata } from "next";
import { requireViewerPage } from "@/server/viewer";

export const metadata: Metadata = { title: { default: "Business", template: "%s · Kept Business" }, robots: { index: false } };

export default async function ProRootLayout({ children }: LayoutProps<"/pro">) {
  await requireViewerPage("/pro");
  return children;
}
