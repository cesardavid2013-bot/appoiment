"use client";

import { Download, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { Button, buttonClass } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, FormError, Input } from "@/components/ui/field";
import { DELETE_CONFIRMATION } from "@/domain/account";
import { useT } from "@/i18n/client";
import { api, ApiError } from "@/lib/api";
import { rich } from "@/i18n/rich";
import { SettingsCard } from "./settings-card";

export function ExportCard() {
  const t = useT("account");
  return (
    <SettingsCard
      id="export-h"
      title={t("privacy.export.title")}
      description={t("privacy.export.description")}
    >
      <a href="/api/me/export" download className={buttonClass("secondary", "md", "h-11 sm:h-10")}>
        <Download className="size-4" aria-hidden />
        {t("privacy.export.button")}
      </a>
      <p className="mt-3 text-[13px] text-ink-3">{t("privacy.export.hint")}</p>
    </SettingsCard>
  );
}

export function DeleteAccountCard({ blockingBusinesses, upcomingCount, hasPassword }: { blockingBusinesses: { id: string; name: string }[]; upcomingCount: number; hasPassword: boolean }) {
  const router = useRouter();
  const t = useT("account");
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const blocked = blockingBusinesses.length > 0;
  const ready = typed.trim() === DELETE_CONFIRMATION && (!hasPassword || password.length > 0);

  async function onConfirm(e: FormEvent) {
    e.preventDefault();
    if (!ready) return;
    setLoading(true);
    setError(null);
    try {
      await api("/api/me/account", { method: "DELETE", body: { confirm: typed.trim(), password } });
      toast.success(t("privacy.delete.deletedToast"), { description: t("privacy.delete.deletedBody") });
      router.replace("/");
      router.refresh();
    } catch (err) {
      setError((err as ApiError).message);
      setLoading(false);
    }
  }

  return (
    <section aria-labelledby="delete-h" className="rounded-xl border border-danger/25 bg-surface">
      <div className="p-5 sm:p-6">
        <h2 id="delete-h" className="text-base font-semibold text-ink">
          {t("privacy.delete.title")}
        </h2>
        <p className="mt-1 text-sm leading-relaxed text-ink-3">{t("privacy.delete.intro")}</p>
        <ul className="mt-4 space-y-2 text-sm leading-relaxed text-ink-2">
          <li className="flex gap-2.5">
            <span className="mt-2 size-1.5 shrink-0 rounded-full bg-ink-3" aria-hidden />
            {t("privacy.delete.erased")}
          </li>
          <li className="flex gap-2.5">
            <span className="mt-2 size-1.5 shrink-0 rounded-full bg-ink-3" aria-hidden />
            {upcomingCount > 0 ? t("privacy.delete.upcoming", { count: upcomingCount }) : t("privacy.delete.upcomingNone")}
          </li>
          <li className="flex gap-2.5">
            <span className="mt-2 size-1.5 shrink-0 rounded-full bg-ink-3" aria-hidden />
            {t("privacy.delete.records")}
          </li>
          <li className="flex gap-2.5">
            <span className="mt-2 size-1.5 shrink-0 rounded-full bg-ink-3" aria-hidden />
            {t("privacy.delete.permanent")}
          </li>
        </ul>

        {blocked && (
          <div className="mt-5 flex gap-3 rounded-md border border-warn/25 bg-warn-soft px-3.5 py-3 text-sm leading-relaxed text-warn" role="note">
            <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
            <p>
              {rich(t("privacy.delete.blocked", { businesses: blockingBusinesses.map((b) => b.name).join(", ") }), {
                link: (text) => (
                  <Link href="/pro" className="font-medium underline underline-offset-4">
                    {text}
                  </Link>
                ),
              })}
            </p>
          </div>
        )}
      </div>
      <div className="flex flex-col gap-2 border-t border-line px-5 py-3.5 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <p className="text-[13px] text-ink-3">{t("privacy.delete.copyFirst")}</p>
        <Button
          variant="danger"
          className="h-11 sm:h-10"
          disabled={blocked}
          onClick={() => {
            setTyped("");
            setError(null);
            setOpen(true);
          }}
        >
          {t("privacy.delete.open")}
        </Button>
      </div>

      <Dialog
        open={open}
        onOpenChange={setOpen}
        title={t("privacy.delete.confirmTitle")}
        description={t("privacy.delete.confirmBody")}
        size="sm"
        locked={loading}
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)} disabled={loading}>
              {t("privacy.delete.keep")}
            </Button>
            <button
              type="submit"
              form="delete-form"
              disabled={!ready || loading}
              className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-danger px-4 text-sm font-medium text-bg hover:bg-danger/90 disabled:opacity-50"
            >
              {loading && <span className="size-4 animate-spin rounded-full border-2 border-current border-e-transparent" aria-hidden />}
              {t("privacy.delete.confirm")}
            </button>
          </>
        }
      >
        <form id="delete-form" onSubmit={onConfirm} className="space-y-4 pt-1">
          <FormError message={error} />
          {upcomingCount > 0 && (
            <p className="rounded-md bg-surface-2 px-3.5 py-3 text-sm text-ink-2">
              {t("privacy.delete.willCancel", { count: upcomingCount })}
            </p>
          )}
          {hasPassword && (
            <Field label={t("privacy.delete.password")}>
              {(p) => <Input {...p} type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />}
            </Field>
          )}
          <Field label={<>{rich(t("privacy.delete.typeToConfirm", { word: DELETE_CONFIRMATION }), { word: (w) => <span className="font-mono font-semibold" dir="ltr">{w}</span> })}</>}>
            {(p) => <Input {...p} value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" autoCapitalize="characters" spellCheck={false} />}
          </Field>
        </form>
      </Dialog>
    </section>
  );
}
