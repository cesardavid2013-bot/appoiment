import type { Metadata } from "next";
import { AccountShell } from "@/components/account/account-shell";
import { ProfileForm } from "@/components/account/profile-form";
import { features } from "@/server/env";
import { getAccount } from "@/server/services/account";
import { requireViewerPage } from "@/server/viewer";

export const metadata: Metadata = { title: "Profile", robots: { index: false } };

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
  const a = await getAccount(viewer.id);
  return (
    <AccountShell title="Profile" description="How you appear to the professionals you book with.">
      <ProfileForm initial={{ name: a.name, email: a.email, phone: a.phone, timezone: a.timezone, avatar: a.avatar }} zones={timeZoneOptions(a.timezone)} smsEnabled={features.sms} />
    </AccountShell>
  );
}
