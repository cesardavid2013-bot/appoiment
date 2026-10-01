import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { StaffReply, TicketStatusControl } from "@/components/admin/support-thread";
import { AdminHeader, Facts, fmtStamp, humanize, Panel, StatusBadge, When } from "@/components/admin/ui";
import { Avatar } from "@/components/ui/media";
import { cn } from "@/lib/cn";
import { requireAdminPage } from "@/server/admin-guard";
import { getTicketThread } from "@/server/services/admin-support";

export const metadata: Metadata = { title: "Support ticket" };

export default async function AdminTicketPage({ params }: PageProps<"/admin/support/[id]">) {
  await requireAdminPage("support");
  const { id } = await params;
  const t = await getTicketThread(id);
  if (!t) notFound();

  return (
    <>
      <AdminHeader
        back={{ href: "/admin/support", label: "Support inbox" }}
        title={t.ticket.subject}
        description={
          <span className="inline-flex flex-wrap items-center gap-2">
            <StatusBadge value={t.ticket.status} />
            <span>
              {humanize(t.ticket.category)} · opened <When at={t.ticket.createdAt} />
            </span>
          </span>
        }
        actions={<TicketStatusControl ticketId={t.ticket.id} status={t.ticket.status} />}
      />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="min-w-0 space-y-4">
          <Panel title="Conversation" description={`${t.messages.length} message${t.messages.length === 1 ? "" : "s"}`}>
            {t.messages.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-ink-3">No messages yet.</p>
            ) : (
              <ol className="space-y-4 p-4">
                {t.messages.map((m) => (
                  <li key={m.id} className={cn("flex gap-3", m.isStaff && "flex-row-reverse")}>
                    <Avatar name={m.authorName} size={32} />
                    <div className={cn("min-w-0 max-w-[85%] rounded-lg border px-3.5 py-2.5", m.isStaff ? "border-accent/20 bg-accent-soft" : "border-line bg-bg")}>
                      <div className="flex flex-wrap items-baseline gap-x-2 text-[12.5px]">
                        <span className="font-medium text-ink">{m.authorName}</span>
                        {m.isStaff && <span className="text-accent-text">Kept Support</span>}
                        <time dateTime={new Date(m.createdAt).toISOString()} className="text-ink-3" title={fmtStamp(m.createdAt)}>
                          {fmtStamp(m.createdAt)}
                        </time>
                      </div>
                      <p className="mt-1 whitespace-pre-line break-words text-sm leading-relaxed text-ink">{m.body}</p>
                      {m.attachments.length > 0 && (
                        <ul className="mt-2 flex flex-wrap gap-2" aria-label="Attachments">
                          {m.attachments.map((a, i) =>
                            a.url ? (
                              <li key={a.id}>
                                <a href={a.url} target="_blank" rel="noopener noreferrer" className="block size-16 overflow-hidden rounded-md border border-line bg-surface-2 text-[10px] text-ink-3">
                                  {a.thumb ? (
                                    // eslint-disable-next-line @next/next/no-img-element
                                    <img src={a.thumb} alt={`Attachment ${i + 1}`} className="size-16 object-cover" loading="lazy" />
                                  ) : (
                                    <span className="block px-2 py-1 text-[12px]">Attachment {i + 1}</span>
                                  )}
                                </a>
                              </li>
                            ) : (
                              <li key={a.id} className="rounded-md border border-dashed border-line-strong px-2 py-1 text-[12px] text-ink-3">
                                Attachment unavailable
                              </li>
                            ),
                          )}
                        </ul>
                      )}
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </Panel>
          <Panel title="Reply">
            <div className="p-4">
              <StaffReply ticketId={t.ticket.id} requesterName={t.requester.name} notifiable={t.requester.status === "active"} />
            </div>
          </Panel>
        </div>
        <Panel title="Requester" className="self-start">
          <Facts
            items={[
              [
                "Name",
                <Link key="n" href={`/admin/users/${t.requester.id}`} className="font-medium hover:underline">
                  {t.requester.name}
                </Link>,
              ],
              ["Email", t.requester.email],
              ["Account", <StatusBadge key="s" value={t.requester.status} />],
              ["Business", t.businessName],
              [
                "Appointment",
                t.appointmentReference && t.ticket.appointmentId ? (
                  <Link key="a" href={`/admin/appointments/${t.ticket.appointmentId}`} className="font-mono text-[13px] hover:underline">
                    {t.appointmentReference}
                  </Link>
                ) : null,
              ],
              ["Last activity", fmtStamp(t.ticket.lastActivityAt)],
            ]}
          />
        </Panel>
      </div>
    </>
  );
}
