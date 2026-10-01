"use client";

import { Send } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { FormError, Select, Textarea } from "@/components/ui/field";
import { api, ApiError } from "@/lib/api";

type Status = "open" | "awaiting_customer" | "resolved" | "closed";

const STATUS_OPTIONS: { value: Status; label: string }[] = [
  { value: "open", label: "Open" },
  { value: "awaiting_customer", label: "Awaiting customer" },
  { value: "resolved", label: "Resolved" },
  { value: "closed", label: "Closed" },
];

export function StaffReply({ ticketId, requesterName, notifiable }: { ticketId: string; requesterName: string; notifiable: boolean }) {
  const router = useRouter();
  const [body, setBody] = useState("");
  const [status, setStatus] = useState<Status>("awaiting_customer");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (!body.trim()) {
      setError("Write a reply first.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api(`/api/admin/support/${ticketId}/reply`, { body: { body: body.trim(), status } });
      setBody("");
      toast.success(`Reply sent to ${requesterName}`);
      router.refresh();
    } catch (err) {
      setError((err as ApiError).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={send} className="space-y-3" aria-label="Reply to ticket">
      <FormError message={error} />
      <label htmlFor="staff-reply" className="sr-only">
        Reply
      </label>
      <Textarea
        id="staff-reply"
        rows={5}
        maxLength={5000}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder={`Reply to ${requesterName}…`}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            e.currentTarget.form?.requestSubmit();
          }
        }}
      />
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <label className="flex items-center gap-2 text-[13px] text-ink-3">
          <span className="shrink-0">Then set status to</span>
          <Select value={status} onChange={(e) => setStatus(e.target.value as Status)} className="h-9 md:h-9">
            {STATUS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </Select>
        </label>
        <Button type="submit" loading={busy} icon={<Send className="size-4" />}>
          Send reply
        </Button>
      </div>
      <p className="text-[12px] text-ink-3">
        {notifiable ? "The requester is notified in the app and by email." : "This account isn't active, so the requester won't be notified."} Ctrl/⌘ + Enter to send.
      </p>
    </form>
  );
}

export function TicketStatusControl({ ticketId, status }: { ticketId: string; status: Status }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function change(next: Status) {
    if (next === status) return;
    setBusy(true);
    try {
      await api(`/api/admin/support/${ticketId}/status`, { body: { status: next } });
      toast.success("Ticket status updated");
      router.refresh();
    } catch (err) {
      toast.error((err as ApiError).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <label className="flex items-center gap-2 text-[13px] text-ink-3">
      <span>Status</span>
      <Select value={status} disabled={busy} onChange={(e) => change(e.target.value as Status)} className="h-9 md:h-9" aria-busy={busy || undefined}>
        {STATUS_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </Select>
    </label>
  );
}
