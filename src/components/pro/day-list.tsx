import { MessageSquareText } from "lucide-react";
import Link from "next/link";
import { STATUS_TONE, type AppointmentStatus } from "@/domain/appointment-state";
import { getI18n, getT } from "@/i18n/server";
import { cn } from "@/lib/cn";
import { fmtTime } from "@/lib/format";
import { AppointmentControls } from "./appointment-controls";

export type DayItem = {
  id: string;
  status: AppointmentStatus;
  startsAt: string;
  endsAt: string;
  serviceName: string;
  options: { name: string }[] | null;
  customerName: string;
  isNewCustomer: boolean;
  hasNote: boolean;
  memberId: string | null;
  version: number;
};

const BAR: Record<string, string> = {
  positive: "bg-accent",
  attention: "bg-warn",
  info: "bg-info",
  negative: "bg-danger",
  neutral: "bg-line-strong",
};

/** A day's appointments as a scannable timeline. Status is conveyed by text and colour. */
export async function DayList({ items, timezone, memberNames, canManage, now }: { items: DayItem[]; timezone: string; memberNames?: Map<string, string>; canManage: boolean; now: number }) {
  const [t, tRoot, { intl }] = await Promise.all([getT("pro"), getT(), getI18n()]);
  return (
    <ol className="divide-y divide-line">
      {items.map((a) => {
        const past = new Date(a.endsAt).getTime() < now;
        const tone = STATUS_TONE[a.status];
        return (
          <li key={a.id} className={cn("group relative flex items-center gap-4 py-3.5", past && a.status === "completed" && "opacity-60")}>
            <div className="w-[76px] shrink-0 text-end leading-tight">
              <div className="text-[15px] font-semibold text-ink tabular">{fmtTime(a.startsAt, timezone, intl)}</div>
              <div className="text-[12px] text-ink-3 tabular">{fmtTime(a.endsAt, timezone, intl)}</div>
            </div>
            <span className={cn("w-[3px] self-stretch rounded-full", BAR[tone])} aria-hidden />
            <Link href={`/pro/appointments/${a.id}`} className="min-w-0 flex-1 after:absolute after:inset-0 after:content-['']">
              <div className="flex items-center gap-2">
                <span className="truncate text-[15px] font-semibold text-ink">{a.customerName}</span>
                {a.isNewCustomer && (
                  <span className="inline-flex shrink-0 items-center gap-0.5 text-[11px] font-medium uppercase tracking-wide text-accent-text">
                    <span className="size-1.5 rounded-full bg-current" aria-hidden /> {t("dayList.new")}
                  </span>
                )}
                {a.hasNote && <MessageSquareText className="size-3.5 shrink-0 text-ink-3" aria-label={t("dayList.hasNote")} />}
              </div>
              <div className="truncate text-[13px] text-ink-3">
                {a.serviceName}
                {a.options && a.options.length > 0 ? ` · ${a.options.map((o) => o.name).join(", ")}` : ""}
                {memberNames && a.memberId ? ` · ${memberNames.get(a.memberId) ?? ""}` : ""}
              </div>
            </Link>
            <span className="hidden shrink-0 text-[12px] font-medium text-ink-3 sm:inline">{a.status === "confirmed" ? "" : tRoot(`common.appointmentStatus.${a.status}`)}</span>
            {canManage && (
              <div className="relative z-10 hidden shrink-0 md:block">
                <AppointmentControls a={a} />
              </div>
            )}
          </li>
        );
      })}
    </ol>
  );
}
