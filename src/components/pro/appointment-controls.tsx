"use client";

import { Check, CircleSlash, MoreHorizontal, Play, UserCheck, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/dialog";
import { Field, Textarea } from "@/components/ui/field";
import { Menu, MenuContent, MenuItem, MenuTrigger } from "@/components/ui/menu";
import { api, ApiError } from "@/lib/api";
import { useNow } from "@/lib/use-now";

type Action = "approve" | "check_in" | "start" | "complete" | "no_show" | "undo_no_show";

export type ControlAppointment = { id: string; status: string; startsAt: string; version: number };

/**
 * The one obvious next step for an appointment, plus secondary actions in a
 * menu. Uses optimistic version checks so two staff can't clobber each other.
 */
export function AppointmentControls({ a, size = "sm", onChanged, inverse }: { a: ControlAppointment; size?: "sm" | "md"; onChanged?: () => void; inverse?: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [decline, setDecline] = useState(false);
  const [reason, setReason] = useState("");
  const now = useNow();
  const started = new Date(a.startsAt).getTime() <= now;

  async function act(action: Action) {
    setBusy(action);
    try {
      await api(`/api/pro/appointments/${a.id}/action`, { body: { action, version: a.version } });
      toast.success(
        { approve: "Request approved", check_in: "Checked in", start: "Started", complete: "Marked complete", no_show: "Marked as no-show", undo_no_show: "Marked complete" }[action],
      );
      onChanged?.();
      router.refresh();
    } catch (err) {
      toast.error((err as ApiError).message);
      router.refresh();
    } finally {
      setBusy(null);
    }
  }

  async function cancel() {
    setBusy("cancel");
    try {
      const res = await api<{ refundCents: number }>(`/api/pro/appointments/${a.id}/cancel`, { body: { reason: reason.trim() || null, decline } });
      toast.success(decline ? "Request declined" : "Appointment cancelled", { description: res.refundCents ? "The customer's payment is being refunded in full." : "The customer has been notified." });
      setCancelOpen(false);
      onChanged?.();
      router.refresh();
    } catch (err) {
      toast.error((err as ApiError).message);
    } finally {
      setBusy(null);
    }
  }

  const primary: { action: Action; label: string; icon: React.ReactNode } | null =
    a.status === "requested"
      ? { action: "approve", label: "Approve", icon: <Check className="size-4" /> }
      : a.status === "confirmed"
        ? started
          ? { action: "complete", label: "Complete", icon: <Check className="size-4" /> }
          : { action: "check_in", label: "Check in", icon: <UserCheck className="size-4" /> }
        : a.status === "checked_in"
          ? { action: "start", label: "Start", icon: <Play className="size-4" /> }
          : a.status === "in_progress"
            ? { action: "complete", label: "Complete", icon: <Check className="size-4" /> }
            : null;

  const canCancel = ["requested", "confirmed", "checked_in", "pending_payment"].includes(a.status);

  return (
    <div className="flex items-center gap-1.5">
      {a.status === "requested" && (
        <Button
          size={size}
          variant="secondary"
          onClick={() => {
            setDecline(true);
            setCancelOpen(true);
          }}
          disabled={Boolean(busy)}
        >
          Decline
        </Button>
      )}
      {primary && (
        <Button size={size} variant={primary.action === "approve" ? "accent" : "primary"} className={inverse ? "bg-bg text-ink hover:bg-bg/90" : undefined} onClick={() => act(primary.action)} loading={busy === primary.action} disabled={Boolean(busy)} icon={primary.icon}>
          {primary.label}
        </Button>
      )}
      {(a.status === "no_show" || canCancel) && (
        <Menu>
          <MenuTrigger className={inverse ? "flex size-8 items-center justify-center rounded-md text-bg/70 hover:bg-bg/10 hover:text-bg" : "flex size-8 items-center justify-center rounded-md text-ink-3 hover:bg-surface-2 hover:text-ink"} aria-label="More actions">
            <MoreHorizontal className="size-4" />
          </MenuTrigger>
          <MenuContent>
            {a.status === "confirmed" && !started && <MenuItem icon={<Play />} onSelect={() => act("start")}>Start now</MenuItem>}
            {a.status === "confirmed" && started && <MenuItem icon={<CircleSlash />} onSelect={() => act("no_show")}>Mark as no-show</MenuItem>}
            {a.status === "no_show" && <MenuItem icon={<Check />} onSelect={() => act("undo_no_show")}>They showed up — mark complete</MenuItem>}
            {canCancel && a.status !== "requested" && (
              <MenuItem
                danger
                icon={<X />}
                onSelect={() => {
                  setDecline(false);
                  setCancelOpen(true);
                }}
              >
                Cancel appointment
              </MenuItem>
            )}
          </MenuContent>
        </Menu>
      )}
      <ConfirmDialog
        open={cancelOpen}
        onOpenChange={setCancelOpen}
        title={decline ? "Decline this request?" : "Cancel this appointment?"}
        description="The customer is notified right away. Anything they paid online is refunded in full."
        confirmLabel={decline ? "Decline request" : "Cancel appointment"}
        onConfirm={cancel}
        loading={busy === "cancel"}
      >
        <Field label="Message to the customer" optional>
          {(p) => <Textarea {...p} rows={3} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} placeholder={decline ? "Sorry, I'm fully booked that day — could you try Thursday?" : "Something came up — please rebook any time."} />}
        </Field>
      </ConfirmDialog>
    </div>
  );
}
