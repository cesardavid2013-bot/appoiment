import { InboxList, type InboxRow } from "@/components/messages/inbox-list";
import { toClient } from "@/components/messages/types";
import { requestNow } from "@/server/clock";
import { listBusinessConversations } from "@/server/services/messaging";
import { proPage } from "@/server/pro-page";

/** Two panes on desktop (list + thread); list → thread on phones. */
export default async function InboxLayout({ children }: LayoutProps<"/pro/messages">) {
  const { viewer, m } = await proPage("messages.manage");
  const rows = await listBusinessConversations(m);
  return (
    <div className="lg:grid lg:h-dvh lg:grid-cols-[320px_minmax(0,1fr)] xl:grid-cols-[340px_minmax(0,1fr)]">
      <InboxList initial={toClient<InboxRow[]>(rows)} fallbackZone={viewer.timezone ?? m.timezone} serverNow={requestNow()} />
      <div className="min-w-0 lg:h-dvh">{children}</div>
    </div>
  );
}
