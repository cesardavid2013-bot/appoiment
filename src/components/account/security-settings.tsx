"use client";

import { CheckCircle2, MonitorSmartphone } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/dialog";
import { Field, FormError, Input } from "@/components/ui/field";
import { Badge } from "@/components/ui/misc";
import { useT } from "@/i18n/client";
import { api, ApiError } from "@/lib/api";
import { ResendVerificationButton } from "./account-actions";
import { SettingsCard } from "./settings-card";

export function PasswordForm({ hasPassword }: { hasPassword: boolean }) {
  const router = useRouter();
  const t = useT("account");
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
    if (next.length < 8) return setFields({ newPassword: t("security.password.tooShort") });
    if (next !== confirm) return setFields({ confirm: t("security.password.mismatch") });
    setSaving(true);
    try {
      await api("/api/me/password", { body: { currentPassword: current, newPassword: next } });
      toast.success(hasPassword ? t("security.password.changed") : t("security.password.set"), { description: t("security.password.othersSignedOut") });
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
        title={hasPassword ? t("security.password.title") : t("security.password.setTitle")}
        description={hasPassword ? t("security.password.description") : t("security.password.setDescription")}
        footer={
          <Button type="submit" loading={saving} disabled={!next || !confirm || (hasPassword && !current)} className="h-11 sm:h-10">
            {hasPassword ? t("security.password.change") : t("security.password.setButton")}
          </Button>
        }
      >
        <div className="space-y-5">
          <FormError message={error} />
          {hasPassword && (
            <Field label={t("security.password.current")} error={fields.currentPassword}>
              {(p) => <Input {...p} type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} required />}
            </Field>
          )}
          <Field label={t("security.password.new")} hint={t("security.password.newHint")} error={fields.newPassword}>
            {(p) => <Input {...p} type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} required minLength={8} maxLength={128} />}
          </Field>
          <Field label={t("security.password.confirm")} error={fields.confirm}>
            {(p) => <Input {...p} type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required />}
          </Field>
        </div>
      </SettingsCard>
    </form>
  );
}

export function EmailStatus({ email, verified }: { email: string | null; verified: boolean }) {
  const t = useT("account");
  return (
    <SettingsCard id="email-h" title={t("security.email.title")} description={t("security.email.description")}>
      {email ? (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p className="truncate text-[15px] font-medium text-ink">{email}</p>
            <div className="mt-1.5">
              {verified ? (
                <Badge tone="positive">
                  <CheckCircle2 className="size-3.5" aria-hidden /> {t("security.email.confirmed")}
                </Badge>
              ) : (
                <Badge tone="attention">{t("security.email.notConfirmed")}</Badge>
              )}
            </div>
          </div>
          {!verified && <ResendVerificationButton email={email} />}
        </div>
      ) : (
        <p className="text-sm text-ink-3">{t("security.email.none")}</p>
      )}
    </SettingsCard>
  );
}

export function DevicesCard({ others }: { others: number }) {
  const router = useRouter();
  const t = useT("account");
  const [count, setCount] = useState(others);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  async function signOutOthers() {
    setLoading(true);
    try {
      const res = await api<{ signedOut: number }>("/api/me/sessions", { method: "DELETE" });
      setCount(0);
      setOpen(false);
      toast.success(t("security.devices.signedOutToast", { count: res.signedOut }));
      router.refresh();
    } catch (err) {
      toast.error((err as ApiError).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <SettingsCard id="devices-h" title={t("security.devices.title")} description={t("security.devices.description")}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="flex items-center gap-2.5 text-[15px] text-ink">
          <MonitorSmartphone className="size-5 shrink-0 text-ink-3" aria-hidden />
          {t("security.devices.status", { count })}
        </p>
        <Button variant="secondary" className="h-11 sm:h-10" onClick={() => setOpen(true)} disabled={count === 0}>
          {t("security.devices.signOutOthers")}
        </Button>
      </div>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title={t("security.devices.confirmTitle")}
        description={t("security.devices.confirmBody")}
        confirmLabel={t("security.devices.confirm")}
        onConfirm={signOutOthers}
        loading={loading}
        tone="primary"
      />
    </SettingsCard>
  );
}
