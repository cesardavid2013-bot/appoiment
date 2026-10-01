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
import { api, ApiError } from "@/lib/api";
import { SettingsCard } from "./account-shell";

export function ExportCard() {
  return (
    <SettingsCard
      id="export-h"
      title="Download your data"
      description="Get a copy of your profile, saved addresses, appointments, reviews, messages, saved professionals and support requests as a JSON file."
    >
      <a href="/api/me/export" download className={buttonClass("secondary", "md", "h-11 sm:h-10")}>
        <Download className="size-4" aria-hidden />
        Download my data
      </a>
      <p className="mt-3 text-[13px] text-ink-3">Prepared instantly. Keep the file somewhere safe — it contains personal information.</p>
    </SettingsCard>
  );
}

export function DeleteAccountCard({ blockingBusinesses, upcomingCount, hasPassword }: { blockingBusinesses: { id: string; name: string }[]; upcomingCount: number; hasPassword: boolean }) {
  const router = useRouter();
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
      toast.success("Your account has been deleted", { description: "Thanks for using Kept." });
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
          Delete your account
        </h2>
        <p className="mt-1 text-sm leading-relaxed text-ink-3">This permanently closes your Kept account. Here&apos;s what happens:</p>
        <ul className="mt-4 space-y-2 text-sm leading-relaxed text-ink-2">
          <li className="flex gap-2.5">
            <span className="mt-2 size-1.5 shrink-0 rounded-full bg-ink-3" aria-hidden />
            Your name, email, phone, photo, saved addresses and saved professionals are erased, and you&apos;re signed out everywhere.
          </li>
          <li className="flex gap-2.5">
            <span className="mt-2 size-1.5 shrink-0 rounded-full bg-ink-3" aria-hidden />
            {upcomingCount > 0
              ? `Your ${upcomingCount === 1 ? "upcoming appointment is" : `${upcomingCount} upcoming appointments are`} cancelled under each business's cancellation policy, including any refund it allows.`
              : "Any upcoming appointments are cancelled under each business's cancellation policy."}
          </li>
          <li className="flex gap-2.5">
            <span className="mt-2 size-1.5 shrink-0 rounded-full bg-ink-3" aria-hidden />
            Records businesses and tax rules depend on — past appointments, payments and reviews — are kept, but shown as from &ldquo;Deleted user&rdquo;.
          </li>
          <li className="flex gap-2.5">
            <span className="mt-2 size-1.5 shrink-0 rounded-full bg-ink-3" aria-hidden />
            This can&apos;t be undone. You can sign up again later with the same email, starting fresh.
          </li>
        </ul>

        {blocked && (
          <div className="mt-5 flex gap-3 rounded-md border border-warn/25 bg-warn-soft px-3.5 py-3 text-sm leading-relaxed text-warn" role="note">
            <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
            <p>
              You own {blockingBusinesses.map((b) => b.name).join(", ")}. Close the business or transfer it to someone else from your{" "}
              <Link href="/pro" className="font-medium underline underline-offset-4">
                business settings
              </Link>{" "}
              before deleting your account, so its clients aren&apos;t left without answers.
            </p>
          </div>
        )}
      </div>
      <div className="flex flex-col gap-2 border-t border-line px-5 py-3.5 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <p className="text-[13px] text-ink-3">
          Prefer a copy first? Download your data above.
        </p>
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
          Delete account…
        </Button>
      </div>

      <Dialog
        open={open}
        onOpenChange={setOpen}
        title="Delete your account?"
        description="This can't be undone."
        size="sm"
        locked={loading}
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)} disabled={loading}>
              Keep my account
            </Button>
            <button
              type="submit"
              form="delete-form"
              disabled={!ready || loading}
              className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-danger px-4 text-sm font-medium text-bg hover:bg-danger/90 disabled:opacity-50"
            >
              {loading && <span className="size-4 animate-spin rounded-full border-2 border-current border-r-transparent" aria-hidden />}
              Delete my account
            </button>
          </>
        }
      >
        <form id="delete-form" onSubmit={onConfirm} className="space-y-4 pt-1">
          <FormError message={error} />
          {upcomingCount > 0 && (
            <p className="rounded-md bg-surface-2 px-3.5 py-3 text-sm text-ink-2">
              {upcomingCount === 1 ? "1 upcoming appointment" : `${upcomingCount} upcoming appointments`} will be cancelled.
            </p>
          )}
          {hasPassword && (
            <Field label="Your password">
              {(p) => <Input {...p} type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />}
            </Field>
          )}
          <Field label={<>Type <span className="font-mono font-semibold">{DELETE_CONFIRMATION}</span> to confirm</>}>
            {(p) => <Input {...p} value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" autoCapitalize="characters" spellCheck={false} />}
          </Field>
        </form>
      </Dialog>
    </section>
  );
}
