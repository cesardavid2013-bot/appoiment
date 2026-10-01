import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { LocalTime } from "@/components/support/local-time";
import { ResolveTicketButton, TicketReply } from "@/components/support/ticket-reply";
import { MediaImage } from "@/components/ui/media";
import { Badge } from "@/components/ui/misc";
import { rich } from "@/i18n/rich";
import { categoryKey } from "@/components/support/category";
import { TICKET_STATUS_TONE } from "@/domain/support";
import { getI18n, getT } from "@/i18n/server";
import { cn } from "@/lib/cn";
import { fmtDate, fmtTime } from "@/lib/format";
import { getMyTicket } from "@/server/services/support";
import { requireViewerPage } from "@/server/viewer";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT("support");
  return { title: t("ticket.metaTitle"), robots: { index: false } };
}

export default async function TicketPage({ params }: PageProps<"/support/[id]">) {
  const { id } = await params;
  const viewer = await requireViewerPage(`/support/${id}`);
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const data = await getMyTicket(viewer.id, id);
  if (!data) notFound();
  const { ticket, appointment: appt, messages } = data;
  const [t, { intl }] = await Promise.all([getT("support"), getI18n()]);
  const tz = viewer.timezone ?? "UTC";

  return (
    <div className="mx-auto max-w-2xl px-4 pt-6 sm:px-6 sm:pt-10">
      <Link href="/support" className="-ms-1 mb-4 inline-flex h-10 items-center gap-1 pe-2 text-sm font-medium text-ink-3 hover:text-ink">
        <ChevronLeft className="size-4 rtl:-scale-x-100" aria-hidden />
        {t("ticket.allRequests")}
      </Link>

      <header>
        <Badge tone={TICKET_STATUS_TONE[ticket.status]}>{t(`status.${ticket.status}`)}</Badge>
        <h1 className="mt-3 font-display text-[30px] leading-[1.12] tracking-[-0.01em] text-ink text-balance sm:text-[36px]">{ticket.subject}</h1>
        <p className="mt-2 text-sm text-ink-3">
          {rich(t("ticket.opened", { category: t(`categories.${categoryKey(ticket.category)}.label`) }), { date: () => <LocalTime iso={ticket.createdAt.toISOString()} fallbackZone={tz} format="date" /> })}
        </p>
      </header>

      {appt && (
        <Link
          href={appt.customerUserId === viewer.id ? `/bookings/${appt.id}` : "/pro"}
          className="mt-6 flex items-center gap-3.5 rounded-xl border border-line bg-surface px-4 py-3.5 transition-colors hover:border-line-strong"
        >
          <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-surface-2 text-ink-2">
            <CalendarDays className="size-[18px]" aria-hidden />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[15px] font-medium text-ink">
              {appt.serviceName} · {appt.businessName}
            </span>
            <span className="block truncate text-[13px] text-ink-3">
              {t("ticket.appointmentLine", { date: fmtDate(appt.startsAt, appt.timezone, undefined, intl), time: fmtTime(appt.startsAt, appt.timezone, intl), reference: appt.reference })}
            </span>
          </span>
          <ChevronRight className="size-4 shrink-0 text-ink-3 rtl:-scale-x-100" aria-hidden />
        </Link>
      )}

      <ol className="mt-8 space-y-4" aria-label={t("ticket.conversation")}>
        {messages.map((m) => (
          <li key={m.id} className={cn("rounded-xl border p-4 sm:p-5", m.isStaff ? "border-accent/20 bg-accent-soft/50" : "border-line bg-surface")}>
            <div className="flex items-center justify-between gap-3">
              <p className="flex items-center gap-2 text-sm font-semibold text-ink">
                {m.isStaff ? (
                  <>
                    <span className="flex size-6 items-center justify-center rounded-full bg-ink text-bg">
                      <span className="font-display text-[13px] leading-none">K</span>
                    </span>
                    {t("ticket.keptSupport")}
                  </>
                ) : (
                  m.authorName
                )}
              </p>
              <LocalTime iso={m.createdAt} fallbackZone={tz} className="shrink-0 text-[12px] text-ink-3 tabular" />
            </div>
            <p className="mt-2 whitespace-pre-wrap break-words text-[15px] leading-relaxed text-ink-2">{m.body}</p>
            {m.media.length > 0 && (
              <ul className="mt-3 flex flex-wrap gap-2">
                {m.media.map((img) => (
                  <li key={img.id}>
                    <a href={img.sources.at(-1)?.url} target="_blank" rel="noreferrer" className="block size-24 overflow-hidden rounded-lg border border-line" aria-label={t("ticket.openImage")}>
                      <MediaImage media={img} alt={t("ticket.attachedImage")} sizes="96px" className="size-full" />
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ol>

      <div className="mt-8 space-y-4">
        {ticket.status === "closed" ? (
          <div className="rounded-xl border border-line bg-surface-2 px-4 py-4 text-sm leading-relaxed text-ink-2">
            {rich(t("ticket.closed"), {
              link: (text) => (
                <Link href="/support/new" className="font-medium text-ink underline underline-offset-4">
                  {text}
                </Link>
              ),
            })}
          </div>
        ) : (
          <>
            <TicketReply ticketId={ticket.id} status={ticket.status} />
            {(ticket.status === "open" || ticket.status === "awaiting_customer") && (
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-[13px] text-ink-3">{ticket.status === "open" ? t("ticket.willReply") : t("ticket.sorted")}</p>
                <ResolveTicketButton ticketId={ticket.id} />
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
