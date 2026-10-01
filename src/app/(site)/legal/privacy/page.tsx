import type { Metadata } from "next";
import { LegalDoc, legalMetadata } from "@/components/legal/doc";

// The text lives in src/i18n/messages/<lang>/legal.json under privacy.sections.
export async function generateMetadata(): Promise<Metadata> {
  return legalMetadata("privacy");
}

export default function PrivacyPolicyPage() {
  return <LegalDoc doc="privacy" updated="2026-10-01" />;
}
