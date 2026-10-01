import type { Metadata } from "next";
import { ProCalendar } from "@/components/pro/calendar";
import { addDaysIso, isoWeekday, localMinuteToInstant, todayIn } from "@/domain/time";
import { getT } from "@/i18n/server";
import { calendarRange, servicesForCalendar } from "@/server/services/pro";
import { proPage } from "@/server/pro-page";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT("pro");
  return { title: t("nav.calendar") };
}

const VIEWS = ["day", "week", "month", "agenda"] as const;

export default async function CalendarPage({ searchParams }: PageProps<"/pro/calendar">) {
  const { m } = await proPage();
  const sp = await searchParams;
  const tz = m.timezone;
  const view = (VIEWS as readonly string[]).includes(String(sp.view)) ? (sp.view as (typeof VIEWS)[number]) : "day";
  const date = typeof sp.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(sp.date) ? sp.date : todayIn(tz);
  const from = view === "week" ? addDaysIso(date, -(isoWeekday(date) - 1)) : view === "month" ? addDaysIso(`${date.slice(0, 7)}-01`, -(isoWeekday(`${date.slice(0, 7)}-01`) - 1)) : date;
  const to = addDaysIso(from, view === "day" ? 1 : view === "week" ? 7 : view === "agenda" ? 14 : 42);
  const [initial, services] = await Promise.all([
    calendarRange(m, new Date(localMinuteToInstant(from, 0, tz)!), new Date(localMinuteToInstant(to, 0, tz)!)),
    servicesForCalendar(m.businessId),
  ]);
  return (
    <ProCalendar
      initial={initial}
      initialDate={date}
      initialView={view}
      timezone={tz}
      currency={m.currency}
      selfMemberId={m.memberId}
      canAll={m.permissions.has("appointments.view_all") || m.permissions.has("appointments.manage_all")}
      canManage={m.permissions.has("appointments.manage_all") || m.permissions.has("appointments.manage_own")}
      canBlock={m.permissions.has("schedule.manage_own") || m.permissions.has("schedule.manage_all")}
      services={services.filter((s) => s.status === "active")}
    />
  );
}
