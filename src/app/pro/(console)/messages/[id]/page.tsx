import { UserRound } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ClientPanel } from "@/components/messages/client-panel";
import { ProThreadFrame } from "@/components/messages/pro-thread-frame";
import { ThreadView } from "@/components/messages/thread-view";
import { toClient, type ThreadMessage } from "@/components/messages/types";
import { AppError } from "@/domain/errors";
import { fmtDate } from "@/lib/format";
import { requestNow } from "@/server/clock";
import { appointmentRef, getThread, threadContext } from "@/server/services/messaging";
import { proPage } from "@/server/pro-page";

export const metadata: Metadata = { title: "Inbox" };

const UUID = /^[0-9a-f-]{36}$/i;

export default async function ProThreadPage({ params, searchParams }: PageProps<"/pro/messages/[id]">) {
  const { id } = await params;
  const sp = await searchParams;
  const { viewer, m } = await proPage("messages.manage");
  if (!UUID.test(id)) notFound();
  let thread, ctx;
  try {
    [thread, ctx] = await Promise.all([getThread({ conversationId: id, viewer, membership: m, as: "business" }), threadContext(m, id)]);
  } catch (err) {
    if (err instanceof AppError && err.code === "not_found") notFound();
    throw err;
  }
  const attach = typeof sp.appointment === "string" && UUID.test(sp.appointment) ? await appointmentRef(m.businessId, thread.customerUserId, sp.appointment) : null;
  const c = ctx.client;
  const subtitle = c
    ? [c.completedCount === 0 ? "New client" : `${c.completedCount} ${c.completedCount === 1 ? "visit" : "visits"}`, ctx.upcoming[0] ? `next ${fmtDate(ctx.upcoming[0].startsAt, ctx.upcoming[0].timezone, { month: "short", day: "numeric" })}` : null].filter(Boolean).join(" · ")
    : "Hasn't booked yet";

  return (
    <ProThreadFrame
      name={thread.customerName}
      avatar={thread.customerAvatar}
      subtitle={subtitle}
      actions={
        c && ctx.canSeeClient ? (
          <Link href={`/pro/clients/${c.id}`} className="inline-flex h-10 items-center gap-1.5 rounded-md px-2.5 text-sm font-medium text-ink-2 hover:bg-surface-2 hover:text-ink xl:hidden">
            <UserRound className="size-4" aria-hidden />
            <span className="hidden sm:inline">Client profile</span>
            <span className="sr-only sm:hidden">Client profile</span>
          </Link>
        ) : null
      }
      aside={<ClientPanel ctx={ctx} timezone={m.timezone} />}
    >
      <ThreadView
        side="business"
        viewerId={viewer.id}
        conversationId={thread.id}
        endpoint="/api/pro/messages"
        threadHref="/pro/messages"
        appointmentHref="/pro/appointments/"
        initialMessages={toClient<ThreadMessage[]>(thread.messages)}
        initialHasMore={thread.hasMore}
        initialOtherLastReadAt={thread.otherLastReadAt?.toISOString() ?? null}
        uploadBusinessId={m.businessId}
        fallbackZone={viewer.timezone ?? m.timezone}
        serverNow={requestNow()}
        attach={attach}
        placeholder={`Reply to ${thread.customerName.split(" ")[0]}`}
      />
    </ProThreadFrame>
  );
}
