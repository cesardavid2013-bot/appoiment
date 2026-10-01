"use client";

import { CheckCircle2, MonitorSmartphone } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/dialog";
import { Field, FormError, Input } from "@/components/ui/field";
import { Badge } from "@/components/ui/misc";
import { api, ApiError } from "@/lib/api";
import { ResendVerificationButton } from "./account-actions";
import { SettingsCard } from "./account-shell";

export function PasswordForm({ hasPassword }: { hasPassword: boolean }) {
  const router = useRouter();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setFields({});
    if (next.length < 8) return setFields({ newPassword: "Use at least 8 characters." });
    if (next !== confirm) return setFields({ confirm: "These passwords don't match." });
    setSaving(true);
    try {
      await api("/api/me/password", { body: { currentPassword: current, newPassword: next } });
      toast.success(hasPassword ? "Password changed" : "Password set", { description: "Any other devices have been signed out." });
      setCurrent("");
      setNext("");
      setConfirm("");
      router.refresh();
    } catch (err) {
      const e2 = err as ApiError;
      setFields(e2.fields ?? {});
      setError(e2.fields ? null : e2.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={onSubmit} noValidate>
      <SettingsCard
        id="pw-h"
        title={hasPassword ? "Password" : "Set a password"}
        description={hasPassword ? "Changing your password signs you out on every other device." : "You sign in with Google. Add a password to also sign in with your email."}
        footer={
          <Button type="submit" loading={saving} disabled={!next || !confirm || (hasPassword && !current)} className="h-11 sm:h-10">
            {hasPassword ? "Change password" : "Set password"}
          </Button>
        }
      >
        <div className="space-y-5">
          <FormError message={error} />
          {hasPassword && (
            <Field label="Current password" error={fields.currentPassword}>
              {(p) => <Input {...p} type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} required />}
            </Field>
          )}
          <Field label="New password" hint="At least 8 characters. Avoid common words and your email." error={fields.newPassword}>
            {(p) => <Input {...p} type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} required minLength={8} maxLength={128} />}
          </Field>
          <Field label="Confirm new password" error={fields.confirm}>
            {(p) => <Input {...p} type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required />}
          </Field>
        </div>
      </SettingsCard>
    </form>
  );
}

export function EmailStatus({ email, verified }: { email: string | null; verified: boolean }) {
  return (
    <SettingsCard id="email-h" title="Email" description="We use your email to sign you in and to send booking confirmations.">
      {email ? (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p className="truncate text-[15px] font-medium text-ink">{email}</p>
            <div className="mt-1.5">
              {verified ? (
                <Badge tone="positive">
                  <CheckCircle2 className="size-3.5" aria-hidden /> Confirmed
                </Badge>
              ) : (
                <Badge tone="attention">Not confirmed yet</Badge>
              )}
            </div>
          </div>
          {!verified && <ResendVerificationButton email={email} />}
        </div>
      ) : (
        <p className="text-sm text-ink-3">There&apos;s no email on this account.</p>
      )}
    </SettingsCard>
  );
}

export function DevicesCard({ others }: { others: number }) {
  const router = useRouter();
  const [count, setCount] = useState(others);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  async function signOutOthers() {
    setLoading(true);
    try {
      const res = await api<{ signedOut: number }>("/api/me/sessions", { method: "DELETE" });
      setCount(0);
      setOpen(false);
      toast.success(res.signedOut === 1 ? "Signed out of 1 other device" : `Signed out of ${res.signedOut} other devices`);
      router.refresh();
    } catch (err) {
      toast.error((err as ApiError).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <SettingsCard id="devices-h" title="Devices" description="If you signed in on a shared or lost device, sign it out here. This device stays signed in.">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="flex items-center gap-2.5 text-[15px] text-ink">
          <MonitorSmartphone className="size-5 shrink-0 text-ink-3" aria-hidden />
          {count === 0 ? "Only this device is signed in" : count === 1 ? "Signed in on 1 other device" : `Signed in on ${count} other devices`}
        </p>
        <Button variant="secondary" className="h-11 sm:h-10" onClick={() => setOpen(true)} disabled={count === 0}>
          Sign out of other devices
        </Button>
      </div>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title="Sign out of other devices?"
        description="Anyone using your account on another phone, tablet or computer will need to sign in again."
        confirmLabel="Sign them out"
        onConfirm={signOutOthers}
        loading={loading}
        tone="primary"
      />
    </SettingsCard>
  );
}
