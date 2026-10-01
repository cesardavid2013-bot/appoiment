"use client";

import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Field, FormError, Input } from "@/components/ui/field";
import { safeRelativePath } from "@/domain/safe-path";
import { useT } from "@/i18n/client";
import { rich } from "@/i18n/rich";
import type { TFunction } from "@/i18n/translate";
import { api, ApiError } from "@/lib/api";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Catches the common mistakes before a round-trip so the message reads in the
 * visitor's language. The server re-validates with the same rules. `t` is scoped to "auth".
 */
export function authFieldErrors(t: TFunction, mode: "login" | "signup" | "reset" | "forgot", v: { name?: string; email?: string; password?: string }) {
  const out: Record<string, string> = {};
  const newPassword = mode === "signup" || mode === "reset";
  if (mode === "signup" && !v.name?.trim()) out.name = t("validation.name");
  if (mode !== "reset" && !EMAIL_RE.test(v.email?.trim() ?? "")) out.email = t("validation.email");
  if (mode === "login" && !v.password) out.password = t("validation.passwordLogin");
  if (newPassword && !v.password) out.password = t("validation.passwordNew");
  else if (newPassword && (v.password?.length ?? 0) < 8) out.password = t("validation.passwordShort");
  return out;
}

function useNext() {
  const params = useSearchParams();
  const raw = params.get("next");
  return safeRelativePath(raw);
}

function GoogleButton({ next }: { next: string }) {
  const t = useT("auth");
  return (
    <a
      href={`/api/auth/google?next=${encodeURIComponent(next)}`}
      className="flex h-11 w-full items-center justify-center gap-2.5 rounded-md border border-line-strong bg-surface text-sm font-medium text-ink transition-colors hover:bg-surface-2"
    >
      <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden>
        <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
        <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
        <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
        <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
      </svg>
      {t("google.continue")}
    </a>
  );
}

function OrDivider() {
  const t = useT("auth");
  return (
    <div className="my-5 flex items-center gap-3 text-xs text-ink-3">
      <span className="h-px flex-1 bg-line" />
      {t("or")}
      <span className="h-px flex-1 bg-line" />
    </div>
  );
}

const inlineLink = "font-medium text-ink underline-offset-4 hover:underline";

export function LoginForm({ google }: { google: boolean }) {
  const t = useT("auth");
  const router = useRouter();
  const next = useNext();
  const params = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(params.get("error") === "google_failed" ? t("google.failed") : null);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const local = authFieldErrors(t, "login", { email, password });
    setFields(local);
    if (Object.keys(local).length) return;
    setLoading(true);
    try {
      await api("/api/auth/login", { body: { email, password } });
      router.replace(next);
      router.refresh();
    } catch (err) {
      const e2 = err as ApiError;
      setError(e2.message);
      setFields(e2.fields ?? {});
      setLoading(false);
    }
  }

  return (
    <div>
      <p className="eyebrow">{t("login.eyebrow")}</p>
      <h1 className="mt-3 font-display text-[40px] leading-[1.05] text-ink">{t("login.title")}</h1>
      <p className="mt-2 text-[15px] text-ink-3">{t("login.lede")}</p>
      <div className="mt-7">
        {google && (
          <>
            <GoogleButton next={next} />
            <OrDivider />
          </>
        )}
        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          <FormError message={error} />
          <Field label={t("fields.email")} error={fields.email}>
            {(p) => <Input {...p} type="email" autoComplete="email" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus />}
          </Field>
          <Field label={t("fields.password")} error={fields.password}>
            {(p) => <Input {...p} type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />}
          </Field>
          <div className="flex justify-end">
            <Link href="/forgot-password" className="text-sm font-medium text-ink-2 underline-offset-4 hover:text-ink hover:underline">
              {t("login.forgot")}
            </Link>
          </div>
          <Button type="submit" size="lg" className="w-full" loading={loading}>
            {t("login.submit")}
          </Button>
        </form>
        <p className="mt-6 text-center text-sm text-ink-3">
          {rich(t("login.newHere"), {
            link: (c) => (
              <Link href={`/signup${next !== "/" ? `?next=${encodeURIComponent(next)}` : ""}`} className={inlineLink}>
                {c}
              </Link>
            ),
          })}
        </p>
      </div>
    </div>
  );
}

function SignInInstead({ next, className }: { next: string; className: string }) {
  const t = useT("auth");
  return (
    <p className={className}>
      {rich(t("signup.haveAccount"), {
        link: (c) => (
          <Link href={`/login${next !== "/" ? `?next=${encodeURIComponent(next)}` : ""}`} className={inlineLink}>
            {c}
          </Link>
        ),
      })}
    </p>
  );
}

/** First step of sign-up: are you booking, or offering services? Each path is tailored after. */
function AccountTypeChooser({ onChoose }: { onChoose: (t: "client" | "pro") => void }) {
  const t = useT("auth");
  const next = useNext();
  const options = [
    { key: "client" as const, points: ["free", "reschedule", "message"] },
    { key: "pro" as const, points: ["free", "setup", "team"] },
  ];
  return (
    <div>
      <p className="eyebrow">{t("chooser.eyebrow")}</p>
      <h1 className="mt-3 font-display text-[40px] leading-[1.05] text-ink">{t("chooser.title")}</h1>
      <p className="mt-2 text-[15px] text-ink-3">{t("chooser.lede")}</p>
      <div className="mt-8 grid gap-3" role="radiogroup" aria-label={t("chooser.label")}>
        {options.map((o) => (
          <button
            key={o.key}
            type="button"
            role="radio"
            aria-checked={false}
            onClick={() => onChoose(o.key)}
            className="group relative rounded-xl border border-line bg-surface p-5 text-start transition-[border-color,box-shadow,transform] hover:-translate-y-0.5 hover:border-ink hover:shadow-md focus-visible:border-ink"
          >
            <p className="pe-8 text-[10px] font-semibold uppercase tracking-[0.18em] text-gold-text">{t(`chooser.${o.key}.eyebrow`)}</p>
            <p className="mt-2 pe-8 font-display text-[28px] leading-none text-ink">{t(`chooser.${o.key}.title`)}</p>
            <p className="mt-2.5 text-[14px] leading-relaxed text-ink-2">{t(`chooser.${o.key}.body`)}</p>
            <ul className="mt-3.5 flex flex-wrap gap-x-4 gap-y-1 text-[12.5px] text-ink-3">
              {o.points.map((pt) => (
                <li key={pt} className="inline-flex items-center gap-1.5">
                  <span className="size-1 rounded-full bg-gold" aria-hidden />
                  {t(`chooser.${o.key}.points.${pt}`)}
                </li>
              ))}
            </ul>
            <ArrowRight
              className="absolute end-5 top-5 size-4 text-ink-3 transition-transform group-hover:translate-x-0.5 group-hover:text-ink rtl:-scale-x-100 rtl:group-hover:-translate-x-0.5"
              aria-hidden
            />
          </button>
        ))}
      </div>
      <SignInInstead next={next} className="mt-8 text-center text-sm text-ink-3" />
    </div>
  );
}

export function SignupForm({ google, intent }: { google: boolean; intent?: string }) {
  const t = useT("auth");
  const router = useRouter();
  const next = useNext();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  // Someone mid-booking (a ?next= destination) is clearly a client; otherwise ask.
  const [type, setType] = useState<"client" | "pro" | null>(intent === "pro" ? "pro" : intent === "client" || next !== "/" ? "client" : null);
  const pro = type === "pro";
  if (!type) return <AccountTypeChooser onChoose={setType} />;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const local = authFieldErrors(t, "signup", { name, email, password });
    setFields(local);
    if (Object.keys(local).length) return;
    setLoading(true);
    try {
      await api("/api/auth/signup", { body: { name, email, password, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone } });
      router.replace(pro ? "/pro/onboarding" : next);
      router.refresh();
    } catch (err) {
      const e2 = err as ApiError;
      setError(e2.fields && Object.keys(e2.fields).length ? null : e2.message);
      setFields(e2.fields ?? {});
      setLoading(false);
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        <p className="eyebrow">{pro ? t("signup.eyebrowPro") : t("signup.eyebrowClient")}</p>
        {intent !== "pro" && next === "/" && (
          <button type="button" onClick={() => setType(null)} aria-label={t("signup.changeLabel")} className="-my-2 py-2 text-[13px] font-medium text-ink-3 hover:text-ink">
            {t("signup.change")}
          </button>
        )}
      </div>
      <h1 className="mt-3 font-display text-[40px] leading-[1.05] text-ink">{pro ? t("signup.titlePro") : t("signup.titleClient")}</h1>
      <p className="mt-2 text-[15px] text-ink-3">{pro ? t("signup.ledePro") : t("signup.ledeClient")}</p>
      <div className="mt-7">
        {google && (
          <>
            <GoogleButton next={pro ? "/pro/onboarding" : next} />
            <OrDivider />
          </>
        )}
        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          <FormError message={error} />
          <Field label={pro ? t("fields.yourName") : t("fields.fullName")} hint={pro ? t("signup.nameHintPro") : undefined} error={fields.name}>
            {(p) => <Input {...p} autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} required autoFocus />}
          </Field>
          <Field label={t("fields.email")} error={fields.email}>
            {(p) => <Input {...p} type="email" autoComplete="email" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} required />}
          </Field>
          <Field label={t("fields.password")} hint={t("fields.passwordHint")} error={fields.password}>
            {(p) => <Input {...p} type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} />}
          </Field>
          <Button type="submit" size="lg" className="w-full" loading={loading}>
            {pro ? t("signup.submitPro") : t("signup.submitClient")}
          </Button>
          <p className="text-center text-xs leading-relaxed text-ink-3">
            {rich(t("signup.agree"), {
              terms: (c) => (
                <Link href="/legal/terms" className="underline underline-offset-2">
                  {c}
                </Link>
              ),
              privacy: (c) => (
                <Link href="/legal/privacy" className="underline underline-offset-2">
                  {c}
                </Link>
              ),
            })}
          </p>
        </form>
        <SignInInstead next={next} className="mt-6 text-center text-sm text-ink-3" />
      </div>
    </div>
  );
}

export function ForgotForm() {
  const t = useT("auth");
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<string | undefined>();
  const [loading, setLoading] = useState(false);
  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const local = authFieldErrors(t, "forgot", { email });
    setFieldError(local.email);
    if (local.email) return;
    setLoading(true);
    try {
      await api("/api/auth/forgot-password", { body: { email } });
      setSent(true);
    } catch (err) {
      setError((err as ApiError).message);
    } finally {
      setLoading(false);
    }
  }
  if (sent)
    return (
      <div aria-live="polite">
        <h1 className="font-display text-[40px] leading-[1.05] text-ink">{t("forgot.sentTitle")}</h1>
        <p className="mt-2 text-[15px] leading-relaxed text-ink-3">{t("forgot.sentBody", { email })}</p>
        <Link href="/login" className="mt-6 inline-block text-sm font-medium text-ink underline underline-offset-4">
          {t("forgot.back")}
        </Link>
      </div>
    );
  return (
    <div>
      <h1 className="font-display text-[40px] leading-[1.05] text-ink">{t("forgot.title")}</h1>
      <p className="mt-1.5 text-[15px] text-ink-3">{t("forgot.lede")}</p>
      <form onSubmit={onSubmit} className="mt-7 space-y-4" noValidate>
        <FormError message={error} />
        <Field label={t("fields.email")} error={fieldError}>
          {(p) => <Input {...p} type="email" autoComplete="email" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus />}
        </Field>
        <Button type="submit" size="lg" className="w-full" loading={loading}>
          {t("forgot.submit")}
        </Button>
      </form>
      <p className="mt-6 text-center text-sm">
        <Link href="/login" className="font-medium text-ink-2 hover:text-ink">
          {t("forgot.back")}
        </Link>
      </p>
    </div>
  );
}

export function ResetForm({ token }: { token: string }) {
  const t = useT("auth");
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<string | undefined>();
  const [loading, setLoading] = useState(false);
  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const local = authFieldErrors(t, "reset", { password });
    setFieldError(local.password);
    if (local.password) return;
    setLoading(true);
    try {
      await api("/api/auth/reset-password", { body: { token, password } });
      router.replace("/");
      router.refresh();
    } catch (err) {
      setError((err as ApiError).message);
      setLoading(false);
    }
  }
  return (
    <div>
      <h1 className="font-display text-[40px] leading-[1.05] text-ink">{t("reset.title")}</h1>
      <p className="mt-1.5 text-[15px] text-ink-3">{t("reset.lede")}</p>
      <form onSubmit={onSubmit} className="mt-7 space-y-4" noValidate>
        <FormError message={error} />
        <Field label={t("fields.newPassword")} hint={t("fields.passwordHint")} error={fieldError}>
          {(p) => <Input {...p} type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} required autoFocus />}
        </Field>
        <Button type="submit" size="lg" className="w-full" loading={loading}>
          {t("reset.submit")}
        </Button>
      </form>
    </div>
  );
}

export function VerifyEmail({ token }: { token: string | null }) {
  const t = useT("auth");
  const [state, setState] = useState<"idle" | "loading" | "done" | "error">(token ? "idle" : "error");
  const [message, setMessage] = useState<string | null>(null);
  async function verify() {
    if (!token) return;
    setState("loading");
    try {
      await api("/api/auth/verify-email", { body: { token } });
      setState("done");
    } catch (err) {
      setMessage((err as ApiError).message);
      setState("error");
    }
  }
  return (
    <div aria-live="polite">
      {state === "done" ? (
        <>
          <h1 className="font-display text-[40px] leading-[1.05] text-ink">{t("verify.doneTitle")}</h1>
          <p className="mt-2 text-[15px] text-ink-3">{t("verify.doneBody")}</p>
          <Link href="/" className="mt-6 inline-block text-sm font-medium text-ink underline underline-offset-4">
            {t("verify.continue")}
          </Link>
        </>
      ) : state === "error" ? (
        <>
          <h1 className="font-display text-[40px] leading-[1.05] text-ink">{t("verify.errorTitle")}</h1>
          <p className="mt-2 text-[15px] text-ink-3">{message ?? t("verify.missingToken")}</p>
          <Link href="/account" className="mt-6 inline-block text-sm font-medium text-ink underline underline-offset-4">
            {t("verify.account")}
          </Link>
        </>
      ) : (
        <>
          <h1 className="font-display text-[40px] leading-[1.05] text-ink">{t("verify.title")}</h1>
          <p className="mt-2 text-[15px] text-ink-3">{t("verify.lede")}</p>
          {/* An explicit click prevents email scanners from consuming the link. */}
          <Button size="lg" className="mt-6 w-full" onClick={verify} loading={state === "loading"}>
            {t("verify.submit")}
          </Button>
        </>
      )}
    </div>
  );
}
