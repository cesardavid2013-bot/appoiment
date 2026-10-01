"use client";

import { useState, type FormEvent } from "react";
import { authFieldErrors } from "@/components/auth/auth-forms";
import { Button } from "@/components/ui/button";
import { Segmented } from "@/components/ui/controls";
import { Field, FormError, Input } from "@/components/ui/field";
import { useT } from "@/i18n/client";
import { api, ApiError } from "@/lib/api";

/**
 * Sign up or sign in without leaving the booking — the customer's choices
 * stay on screen and they continue right where they were.
 */
export function InlineAuth({ google, onDone }: { google: boolean; onDone: () => void }) {
  const t = useT("auth");
  const [mode, setMode] = useState<"signup" | "login">("signup");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const local = authFieldErrors(t, mode, { name, email, password });
    setFields(local);
    if (Object.keys(local).length) return;
    setLoading(true);
    try {
      if (mode === "signup") await api("/api/auth/signup", { body: { name, email, password, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone } });
      else await api("/api/auth/login", { body: { email, password } });
      onDone();
    } catch (err) {
      const e2 = err as ApiError;
      setFields(e2.fields ?? {});
      setError(e2.fields && Object.keys(e2.fields).length ? null : e2.message);
      setLoading(false);
    }
  }

  return (
    <section id="auth" className="scroll-mt-24 rounded-xl border border-line bg-surface p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-[17px] font-semibold text-ink">{mode === "signup" ? t("inline.titleSignup") : t("inline.titleLogin")}</h2>
          <p className="text-[13px] text-ink-3">{t("inline.lede")}</p>
        </div>
        <Segmented
          label={t("inline.modeLabel")}
          size="sm"
          value={mode}
          onChange={(v) => {
            setMode(v);
            setError(null);
            setFields({});
          }}
          options={[
            { value: "signup", label: t("inline.modeSignup") },
            { value: "login", label: t("inline.modeLogin") },
          ]}
        />
      </div>
      {google && (
        <a href={`/api/auth/google?next=${encodeURIComponent(window.location.pathname + window.location.search)}`} className="mb-4 flex h-11 w-full items-center justify-center gap-2 rounded-md border border-line-strong text-sm font-medium text-ink hover:bg-surface-2">
          {t("google.continue")}
        </a>
      )}
      <form onSubmit={submit} className="space-y-3.5" noValidate>
        <FormError message={error} />
        {mode === "signup" && <Field label={t("fields.fullName")} error={fields.name}>{(p) => <Input {...p} autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} />}</Field>}
        <Field label={t("fields.email")} error={fields.email}>{(p) => <Input {...p} type="email" autoComplete="email" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} />}</Field>
        <Field label={t("fields.password")} hint={mode === "signup" ? t("fields.passwordHint") : undefined} error={fields.password}>
          {(p) => <Input {...p} type="password" autoComplete={mode === "signup" ? "new-password" : "current-password"} value={password} onChange={(e) => setPassword(e.target.value)} />}
        </Field>
        <Button type="submit" size="lg" className="w-full" loading={loading}>
          {mode === "signup" ? t("inline.submitSignup") : t("inline.submitLogin")}
        </Button>
      </form>
    </section>
  );
}
