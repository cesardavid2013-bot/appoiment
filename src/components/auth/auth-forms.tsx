"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Field, FormError, Input } from "@/components/ui/field";
import { api, ApiError } from "@/lib/api";

function useNext() {
  const params = useSearchParams();
  const raw = params.get("next");
  return raw && raw.startsWith("/") && !raw.startsWith("//") ? raw : "/";
}

function GoogleButton({ next }: { next: string }) {
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
      Continue with Google
    </a>
  );
}

function OrDivider() {
  return (
    <div className="my-5 flex items-center gap-3 text-xs text-ink-3">
      <span className="h-px flex-1 bg-line" />
      or
      <span className="h-px flex-1 bg-line" />
    </div>
  );
}

export function LoginForm({ google }: { google: boolean }) {
  const router = useRouter();
  const next = useNext();
  const params = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(params.get("error") === "google_failed" ? "Google sign-in didn't complete. Please try again." : null);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setFields({});
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
      <h1 className="font-display text-[34px] leading-tight text-ink">Welcome back</h1>
      <p className="mt-1.5 text-[15px] text-ink-3">Sign in to manage your bookings and messages.</p>
      <div className="mt-7">
        {google && (
          <>
            <GoogleButton next={next} />
            <OrDivider />
          </>
        )}
        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          <FormError message={error} />
          <Field label="Email" error={fields.email}>
            {(p) => <Input {...p} type="email" autoComplete="email" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus />}
          </Field>
          <Field label="Password" error={fields.password}>
            {(p) => <Input {...p} type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />}
          </Field>
          <div className="flex justify-end">
            <Link href="/forgot-password" className="text-sm font-medium text-ink-2 underline-offset-4 hover:text-ink hover:underline">
              Forgot password?
            </Link>
          </div>
          <Button type="submit" size="lg" className="w-full" loading={loading}>
            Sign in
          </Button>
        </form>
        <p className="mt-6 text-center text-sm text-ink-3">
          New to Kept?{" "}
          <Link href={`/signup${next !== "/" ? `?next=${encodeURIComponent(next)}` : ""}`} className="font-medium text-ink underline-offset-4 hover:underline">
            Create an account
          </Link>
        </p>
      </div>
    </div>
  );
}

export function SignupForm({ google, intent }: { google: boolean; intent?: string }) {
  const router = useRouter();
  const next = useNext();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const pro = intent === "pro";

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setFields({});
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
      <h1 className="font-display text-[34px] leading-tight text-ink">{pro ? "Start taking bookings" : "Create your account"}</h1>
      <p className="mt-1.5 text-[15px] text-ink-3">{pro ? "Set up your profile in a few minutes. It's free to start." : "Book in seconds, manage everything in one place."}</p>
      <div className="mt-7">
        {google && (
          <>
            <GoogleButton next={pro ? "/pro/onboarding" : next} />
            <OrDivider />
          </>
        )}
        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          <FormError message={error} />
          <Field label="Full name" error={fields.name}>
            {(p) => <Input {...p} autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} required autoFocus />}
          </Field>
          <Field label="Email" error={fields.email}>
            {(p) => <Input {...p} type="email" autoComplete="email" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} required />}
          </Field>
          <Field label="Password" hint="At least 8 characters." error={fields.password}>
            {(p) => <Input {...p} type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} />}
          </Field>
          <Button type="submit" size="lg" className="w-full" loading={loading}>
            {pro ? "Continue" : "Create account"}
          </Button>
          <p className="text-center text-xs leading-relaxed text-ink-3">
            By continuing you agree to our{" "}
            <Link href="/legal/terms" className="underline underline-offset-2">
              Terms
            </Link>{" "}
            and{" "}
            <Link href="/legal/privacy" className="underline underline-offset-2">
              Privacy Policy
            </Link>
            .
          </p>
        </form>
        <p className="mt-6 text-center text-sm text-ink-3">
          Already have an account?{" "}
          <Link href={`/login${next !== "/" ? `?next=${encodeURIComponent(next)}` : ""}`} className="font-medium text-ink underline-offset-4 hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}

export function ForgotForm() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
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
      <div>
        <h1 className="font-display text-[34px] leading-tight text-ink">Check your inbox</h1>
        <p className="mt-2 text-[15px] leading-relaxed text-ink-3">If an account exists for {email}, you’ll get a link to reset your password in the next few minutes. The link expires in 1 hour.</p>
        <Link href="/login" className="mt-6 inline-block text-sm font-medium text-ink underline underline-offset-4">
          Back to sign in
        </Link>
      </div>
    );
  return (
    <div>
      <h1 className="font-display text-[34px] leading-tight text-ink">Reset your password</h1>
      <p className="mt-1.5 text-[15px] text-ink-3">Enter your email and we’ll send you a reset link.</p>
      <form onSubmit={onSubmit} className="mt-7 space-y-4" noValidate>
        <FormError message={error} />
        <Field label="Email">{(p) => <Input {...p} type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus />}</Field>
        <Button type="submit" size="lg" className="w-full" loading={loading}>
          Send reset link
        </Button>
      </form>
      <p className="mt-6 text-center text-sm">
        <Link href="/login" className="font-medium text-ink-2 hover:text-ink">
          Back to sign in
        </Link>
      </p>
    </div>
  );
}

export function ResetForm({ token }: { token: string }) {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
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
      <h1 className="font-display text-[34px] leading-tight text-ink">Choose a new password</h1>
      <p className="mt-1.5 text-[15px] text-ink-3">You’ll be signed out on other devices.</p>
      <form onSubmit={onSubmit} className="mt-7 space-y-4" noValidate>
        <FormError message={error} />
        <Field label="New password" hint="At least 8 characters.">
          {(p) => <Input {...p} type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} required autoFocus />}
        </Field>
        <Button type="submit" size="lg" className="w-full" loading={loading}>
          Save password
        </Button>
      </form>
    </div>
  );
}

export function VerifyEmail({ token }: { token: string | null }) {
  const [state, setState] = useState<"idle" | "loading" | "done" | "error">(token ? "idle" : "error");
  const [message, setMessage] = useState<string>("This link is missing its token.");
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
    <div>
      {state === "done" ? (
        <>
          <h1 className="font-display text-[34px] leading-tight text-ink">Email confirmed</h1>
          <p className="mt-2 text-[15px] text-ink-3">Thanks — you’re all set.</p>
          <Link href="/" className="mt-6 inline-block text-sm font-medium text-ink underline underline-offset-4">
            Continue to Kept
          </Link>
        </>
      ) : state === "error" ? (
        <>
          <h1 className="font-display text-[34px] leading-tight text-ink">We couldn’t confirm that</h1>
          <p className="mt-2 text-[15px] text-ink-3">{message}</p>
          <Link href="/account" className="mt-6 inline-block text-sm font-medium text-ink underline underline-offset-4">
            Go to your account
          </Link>
        </>
      ) : (
        <>
          <h1 className="font-display text-[34px] leading-tight text-ink">Confirm your email</h1>
          <p className="mt-2 text-[15px] text-ink-3">One tap and you’re done.</p>
          {/* An explicit click prevents email scanners from consuming the link. */}
          <Button size="lg" className="mt-6 w-full" onClick={verify} loading={state === "loading"}>
            Confirm email
          </Button>
        </>
      )}
    </div>
  );
}
