import { MessageCircle, Search } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ListTime } from "@/components/messages/list-time";
import { ButtonLink } from "@/components/ui/button";
import { Avatar } from "@/components/ui/media";
import { EmptyState, PageHeader } from "@/components/ui/misc";
import { cn } from "@/lib/cn";
import { requestNow } from "@/server/clock";
import { listCustomerConversations } from "@/server/services/messaging";
import { requireViewerPage } from "@/server/viewer";

export const metadata: Metadata = { title: "Messages", robots: { index: false } };

export default async function MessagesPage({ searchParams }: PageProps<"/messages">) {
  const sp = await searchParams;
  // Older links (/messages?business=…) open a conversation with that business.
  if (typeof sp.business === "string" && /^[0-9a-f-]{36}$/i.test(sp.business)) {
    const appt = typeof sp.appointment === "string" && /^[0-9a-f-]{36}$/i.test(sp.appointment) ? `&appointment=${sp.appointment}` : "";
    redirect(`/messages/new?business=${sp.business}${appt}`);
  }
  const viewer = await requireViewerPage("/messages");
  const rows = await listCustomerConversations(viewer);
  const tz = viewer.timezone ?? "UTC";
  const now = requestNow();
  const unread = rows.filter((r) => r.unread).length;

  return (
    <div className="mx-auto max-w-3xl px-4 pb-16 pt-8 sm:px-6 sm:pt-10">
      <PageHeader title="Messages" description={rows.length ? (unread ? `${unread} unread ${unread === 1 ? "conversation" : "conversations"}.` : "You're all caught up.") : undefined} />
      {rows.length === 0 ? (
        <EmptyState
          className="mt-8 rounded-xl border border-line"
          icon={<MessageCircle />}
          title="No messages yet"
          description="Questions about a service, a price or a time? Open a professional's page and tap “Ask a question”. Their replies land here."
          action={
            <ButtonLink href="/explore" icon={<Search className="size-4" />}>
              Find a professional
            </ButtonLink>
          }
        />
      ) : (
        <ul className="mt-6 divide-y divide-line border-y border-line" aria-label="Conversations">
          {rows.map((c) => (
            <li key={c.id}>
              <Link href={`/messages/${c.id}`} className="-mx-2 flex items-center gap-3.5 rounded-lg px-2 py-3.5 transition-colors hover:bg-surface-2 sm:-mx-3 sm:px-3">
                <Avatar name={c.businessName} media={c.logo} size={48} />
                <span className="min-w-0 flex-1">
                  <span className="flex items-baseline justify-between gap-3">
                    <span className={cn("truncate text-[15px] text-ink", c.unread ? "font-semibold" : "font-medium")}>{c.businessName}</span>
                    <ListTime iso={c.lastMessageAt.toISOString()} fallbackZone={tz} serverNow={now} className={cn("shrink-0 text-[12px] tabular", c.unread ? "font-semibold text-ink" : "text-ink-3")} />
                  </span>
                  <span className="mt-0.5 flex items-center gap-2">
                    <span className={cn("line-clamp-1 min-w-0 flex-1 text-sm", c.unread ? "text-ink" : "text-ink-3")}>
                      {c.lastSender === "customer" && <span className="text-ink-3">You: </span>}
                      {c.preview}
                    </span>
                    {c.unread && (
                      <span className="size-2.5 shrink-0 rounded-full bg-accent">
                        <span className="sr-only">Unread</span>
                      </span>
                    )}
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
