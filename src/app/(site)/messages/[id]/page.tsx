import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CustomerThreadShell } from "@/components/messages/customer-thread-shell";
import { ThreadView } from "@/components/messages/thread-view";
import { toClient, type ThreadMessage } from "@/components/messages/types";
import { AppError } from "@/domain/errors";
import { getT } from "@/i18n/server";
import { requestNow } from "@/server/clock";
import { appointmentRef, getThread } from "@/server/services/messaging";
import { requireViewerPage } from "@/server/viewer";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT("messages");
  return { title: t("thread.metaTitle"), robots: { index: false } };
}

const UUID = /^[0-9a-f-]{36}$/i;

export default async function CustomerThreadPage({ params, searchParams }: PageProps<"/messages/[id]">) {
  const { id } = await params;
  const sp = await searchParams;
  const viewer = await requireViewerPage(`/messages/${id}`);
  if (!UUID.test(id)) notFound();
  let thread;
  try {
    thread = await getThread({ conversationId: id, viewer, as: "customer" });
  } catch (err) {
    if (err instanceof AppError && err.code === "not_found") notFound();
    throw err;
  }
  const t = await getT("messages");
  const attach = typeof sp.appointment === "string" && UUID.test(sp.appointment) ? await appointmentRef(thread.businessId, viewer.id, sp.appointment) : null;

  return (
    <CustomerThreadShell business={{ name: thread.businessName, slug: thread.businessSlug, logo: thread.businessLogo }}>
      <ThreadView
        side="customer"
        viewerId={viewer.id}
        conversationId={thread.id}
        endpoint="/api/messages"
        threadHref="/messages"
        appointmentHref="/bookings/"
        initialMessages={toClient<ThreadMessage[]>(thread.messages)}
        initialHasMore={thread.hasMore}
        initialOtherLastReadAt={thread.otherLastReadAt?.toISOString() ?? null}
        fallbackZone={viewer.timezone ?? thread.businessTimezone}
        serverNow={requestNow()}
        attach={attach}
        placeholder={t("thread.placeholder", { business: thread.businessName })}
      />
    </CustomerThreadShell>
  );
}
