import type { Metadata } from "next";
import { AccountShell } from "@/components/account/account-shell";
import { ProfileForm } from "@/components/account/profile-form";
import { SettingsCard } from "@/components/account/settings-card";
import { LanguagePicker } from "@/components/shell/language-picker";
import { getT } from "@/i18n/server";
import { features } from "@/server/env";
import { getAccount } from "@/server/services/account";
import { requireViewerPage } from "@/server/viewer";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT("account");
  return { title: t("sections.profile.label"), robots: { index: false } };
}

function offsetLabel(zone: string, at: Date) {
  const part = new Intl.DateTimeFormat("en-US", { timeZone: zone, timeZoneName: "shortOffset" }).formatToParts(at).find((p) => p.type === "timeZoneName");
  return part?.value ?? "";
}

/** Every IANA zone the runtime knows, labelled "America / New York (GMT-4)". */
function timeZoneOptions(current: string | null) {
  const now = new Date();
  const zones = new Set(Intl.supportedValuesOf("timeZone"));
  zones.add("UTC");
  if (current) zones.add(current);
  return [...zones].sort().map((z) => ({ value: z, label: `${z.replace(/_/g, " ").replace(/\//g, " / ")} (${offsetLabel(z, now)})` }));
}

export default async function ProfilePage() {
  const viewer = await requireViewerPage("/account/profile");
  const [a, t] = await Promise.all([getAccount(viewer.id), getT("account")]);
  return (
    <AccountShell title={t("sections.profile.label")} description={t("profile.description")}>
      <ProfileForm initial={{ name: a.name, email: a.email, phone: a.phone, timezone: a.timezone, avatar: a.avatar }} zones={timeZoneOptions(a.timezone)} smsEnabled={features.sms} />
      <div className="mt-6">
        <SettingsCard id="language-h" title={t("profile.language.title")} description={t("profile.language.description")}>
          <LanguagePicker className="w-full sm:w-auto sm:min-w-64" />
        </SettingsCard>
      </div>
    </AccountShell>
  );
}
