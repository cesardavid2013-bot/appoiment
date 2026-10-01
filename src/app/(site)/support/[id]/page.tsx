import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { LocalTime } from "@/components/support/local-time";
import { ResolveTicketButton, TicketReply } from "@/components/support/ticket-reply";
import { MediaImage } from "@/components/ui/media";
import { Badge } from "@/components/ui/misc";
import { categoryLabel, TICKET_STATUS_LABELS, TICKET_STATUS_TONE } from "@/domain/support";
import { cn } from "@/lib/cn";
import { fmtDate, fmtTime } from "@/lib/format";
import { getMyTicket } from "@/server/services/support";
import { requireViewerPage } from "@/server/viewer";

export const metadata: Metadata = { title: "Support request", robots: { index: false } };

export default async function TicketPage({ params }: PageProps<"/support/[id]">) {
  const { id } = await params;
  const viewer = await requireViewerPage(`/support/${id}`);
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const data = await getMyTicket(viewer.id, id);
  if (!data) notFound();
  const { ticket: t, appointment: appt, messages } = data;
  const tz = viewer.timezone ?? "UTC";

  return (
    <div className="mx-auto max-w-2xl px-4 pt-6 sm:px-6 sm:pt-10">
      <Link href="/support" className="-ms-1 mb-4 inline-flex h-10 items-center gap-1 pe-2 text-sm font-medium text-ink-3 hover:text-ink">
        <ChevronLeft className="size-4" aria-hidden />
        All requests
      </Link>

      <header>
        <Badge tone={TICKET_STATUS_TONE[t.status]}>{TICKET_STATUS_LABELS[t.status]}</Badge>
        <h1 className="mt-3 font-display text-[30px] leading-[1.12] tracking-[-0.01em] text-ink text-balance sm:text-[36px]">{t.subject}</h1>
        <p className="mt-2 text-sm text-ink-3">
          {categoryLabel(t.category)} · Opened <LocalTime iso={t.createdAt.toISOString()} fallbackZone={tz} format="date" />
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
              {fmtDate(appt.startsAt, appt.timezone)} at {fmtTime(appt.startsAt, appt.timezone)} · Ref {appt.reference}
            </span>
          </span>
          <ChevronRight className="size-4 shrink-0 text-ink-3" aria-hidden />
        </Link>
      )}

      <ol className="mt-8 space-y-4" aria-label="Conversation">
        {messages.map((m) => (
          <li key={m.id} className={cn("rounded-xl border p-4 sm:p-5", m.isStaff ? "border-accent/20 bg-accent-soft/50" : "border-line bg-surface")}>
            <div className="flex items-center justify-between gap-3">
              <p className="flex items-center gap-2 text-sm font-semibold text-ink">
                {m.isStaff ? (
                  <>
                    <span className="flex size-6 items-center justify-center rounded-full bg-ink text-bg">
                      <span className="font-display text-[13px] leading-none">K</span>
                    </span>
                    Kept Support
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
                    <a href={img.sources.at(-1)?.url} target="_blank" rel="noreferrer" className="block size-24 overflow-hidden rounded-lg border border-line" aria-label="Open attached image">
                      <MediaImage media={img} alt="Attached image" sizes="96px" className="size-full" />
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ol>

      <div className="mt-8 space-y-4">
        {t.status === "closed" ? (
          <div className="rounded-xl border border-line bg-surface-2 px-4 py-4 text-sm leading-relaxed text-ink-2">
            This request is closed.{" "}
            <Link href="/support/new" className="font-medium text-ink underline underline-offset-4">
              Open a new request
            </Link>{" "}
            if you still need help.
          </div>
        ) : (
          <>
            <TicketReply ticketId={t.id} status={t.status} />
            {(t.status === "open" || t.status === "awaiting_customer") && (
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-[13px] text-ink-3">{t.status === "open" ? "We'll reply here and let you know when we do." : "Sorted? Let us know."}</p>
                <ResolveTicketButton ticketId={t.id} />
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
