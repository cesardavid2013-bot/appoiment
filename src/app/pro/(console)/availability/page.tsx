import type { Metadata } from "next";
import { AvailabilityManager } from "@/components/pro/availability-manager";
import { todayIn } from "@/domain/time";
import { requestNow } from "@/server/clock";
import { proPage } from "@/server/pro-page";
import { listTeam } from "@/server/services/pro";
import { getWeeklyHours, listOverrides, listUpcomingBlocks } from "@/server/services/schedule";

export const metadata: Metadata = { title: "Hours & time off" };

export default async function AvailabilityPage({ searchParams }: PageProps<"/pro/availability">) {
  const { m } = await proPage(["schedule.manage_own", "schedule.manage_all"]);
  const canAll = m.permissions.has("schedule.manage_all");
  const team = (await listTeam(m.businessId)).filter((t) => t.isBookable || t.id === m.memberId);
  const visible = canAll ? team : team.filter((t) => t.id === m.memberId);
  const { member } = await searchParams;
  const selected = visible.find((t) => t.id === member) ?? visible.find((t) => t.id === m.memberId) ?? visible[0];
  const now = new Date(requestNow());
  const today = todayIn(m.timezone, now);

  const [weekly, overrides, blocks] = selected
    ? await Promise.all([getWeeklyHours(m.businessId, selected.id, null), listOverrides(m.businessId, today, [selected.id]), listUpcomingBlocks(m.businessId, [selected.id], now)])
    : [[], [], []];

  return (
    <div className="mx-auto max-w-4xl px-4 pb-32 pt-8 sm:px-6 lg:px-10 lg:pt-10">
      <AvailabilityManager
        key={selected?.id ?? "none"}
        timezone={m.timezone}
        today={today}
        canAll={canAll}
        selfMemberId={m.memberId}
        team={visible.map((t) => ({ id: t.id, name: t.name }))}
        selected={selected ? { id: selected.id, name: selected.name } : null}
        weekly={weekly.map((d) => ({ weekday: d.weekday, windows: d.windows.map((w) => ({ start: w.start, end: w.end })), locationId: d.windows[0]?.locationId ?? null }))}
        overrides={overrides.map((o) => ({ id: o.id, date: o.date, intervals: o.intervals, note: o.note, memberId: o.memberId }))}
        blocks={blocks.map((b) => ({ ...b, startsAt: b.startsAt.toISOString(), endsAt: b.endsAt.toISOString() }))}
      />
    </div>
  );
}
