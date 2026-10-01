import { MessageCircle } from "lucide-react";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { conversationForClient } from "@/server/services/messaging";
import { proPage } from "@/server/pro-page";

export const metadata: Metadata = { title: "Inbox" };

export default async function InboxPage({ searchParams }: PageProps<"/pro/messages">) {
  const { m } = await proPage("messages.manage");
  const sp = await searchParams;
  // "Message" buttons elsewhere link here with ?customer=<client id>.
  if (typeof sp.customer === "string" && /^[0-9a-f-]{36}$/i.test(sp.customer)) {
    const found = await conversationForClient(m, sp.customer).catch(() => null);
    if (found?.conversationId) redirect(`/pro/messages/${found.conversationId}`);
    if (found) redirect(`/pro/messages/new?customer=${sp.customer}`);
  }
  // Phones show only the list (from the layout); desktop shows this beside it.
  return (
    <div className="hidden h-full flex-col items-center justify-center px-8 text-center lg:flex">
      <MessageCircle className="size-6 text-ink-3" aria-hidden />
      <p className="mt-3 text-[15px] font-semibold text-ink">Pick a conversation</p>
      <p className="mt-1 max-w-xs text-sm leading-relaxed text-ink-3">Messages from clients appear on the left. Their bookings and history show up next to the thread.</p>
    </div>
  );
}
