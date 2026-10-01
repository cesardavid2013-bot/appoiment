import type { Metadata } from "next";
import { LegalDoc, legalMetadata } from "@/components/legal/doc";

// The text lives in src/i18n/messages/<lang>/legal.json under terms.sections.
export async function generateMetadata(): Promise<Metadata> {
  return legalMetadata("terms");
}

export default function TermsPage() {
  return <LegalDoc doc="terms" updated="2026-10-01" />;
}
