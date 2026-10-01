/**
 * Is this configuration ready to take real money? Pure: takes the environment
 * as a plain object so it can be tested and run from a script or an endpoint.
 */
export type Severity = "blocker" | "warning" | "ok";
export type Check = { id: string; severity: Severity; title: string; detail: string };

type E = Record<string, string | undefined>;
const has = (v: string | undefined) => Boolean(v && v.trim());
const ok = (id: string, title: string, detail = ""): Check => ({ id, severity: "ok", title, detail });
const bad = (id: string, title: string, detail: string): Check => ({ id, severity: "blocker", title, detail });
const warn = (id: string, title: string, detail: string): Check => ({ id, severity: "warning", title, detail });

export function launchChecks(e: E): Check[] {
  const out: Check[] = [];
  const url = (() => {
    try {
      return new URL(e.APP_URL ?? "");
    } catch {
      return null;
    }
  })();

  if (e.NODE_ENV !== "production") out.push(warn("env", "Not running in production mode", "Set NODE_ENV=production and run `npm run build && npm start`."));
  else out.push(ok("env", "Production mode"));

  if (!url || url.protocol !== "https:" || /^(localhost|127\.|0\.0\.0\.0)/.test(url.hostname)) out.push(bad("app-url", "APP_URL is not a public https address", "Emails, OAuth, Stripe redirects and CSRF checks all depend on it. Use your real domain, e.g. https://kept.example.com."));
  else out.push(ok("app-url", `Public address ${url.origin}`));

  const secret = e.APP_SECRET ?? "";
  if (secret.length < 32 || /change-me|example|secret-secret/i.test(secret)) out.push(bad("secret", "APP_SECRET is missing, short or still the example value", "Generate one: `openssl rand -base64 48`."));
  else out.push(ok("secret", "APP_SECRET set"));

  // Payments
  const sk = e.STRIPE_SECRET_KEY ?? "";
  const pk = e.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? "";
  const wh = e.STRIPE_WEBHOOK_SECRET ?? "";
  if (!has(sk) || !has(pk)) out.push(bad("stripe-keys", "Stripe keys are missing", "Without them customers can only pay in person. Set STRIPE_SECRET_KEY and NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY."));
  else {
    const live = sk.startsWith("sk_live_") || sk.startsWith("rk_live_");
    if (!live) out.push(warn("stripe-live", "Stripe is in test mode", "Test keys never move real money. Switch to live keys when you are ready to charge."));
    else if (!pk.startsWith("pk_live_")) out.push(bad("stripe-mismatch", "Secret key is live but the publishable key is not", "Both keys must come from the same mode, or checkout will fail."));
    else out.push(ok("stripe-live", "Stripe live keys"));
  }
  if (has(sk) && !wh.startsWith("whsec_")) out.push(bad("stripe-webhook", "Stripe webhook secret is missing", `Create an endpoint at ${url?.origin ?? "APP_URL"}/api/webhooks/stripe for payment_intent.* and account.updated, then set STRIPE_WEBHOOK_SECRET. Without it paid bookings never confirm.`));
  else if (has(sk)) out.push(ok("stripe-webhook", "Stripe webhook secret set"));

  // Email
  if (!has(e.RESEND_API_KEY)) out.push(bad("email", "No email provider", "Confirmations, reminders and password resets would only be logged. Set RESEND_API_KEY and verify your domain."));
  else if (/example\.(com|org)/i.test(e.EMAIL_FROM ?? "example.com")) out.push(bad("email-from", "EMAIL_FROM still uses the example domain", 'Use an address on your verified domain, e.g. "Kept <hello@yourdomain.com>".'));
  else out.push(ok("email", "Email provider and sender set"));

  // Files
  if (e.STORAGE_DRIVER === "s3") out.push(ok("storage", "S3-compatible storage"));
  else out.push(warn("storage", "Photos are stored on local disk", "Fine for one server with a persistent volume. Use STORAGE_DRIVER=s3 (S3, R2, MinIO) for anything that can restart or scale."));

  // Background jobs
  if (has(e.CRON_SECRET)) out.push(ok("jobs", "Jobs can run from an external scheduler (CRON_SECRET)"));
  else out.push(warn("jobs", "No CRON_SECRET", "Reminders, review requests and expiring holds need `npm run worker` running, or a scheduler calling POST /api/internal/cron every minute."));

  // Rate limiting depends on the real client IP.
  if (!has(e.CLIENT_IP_HEADER) && !has(e.TRUSTED_PROXY_HOPS)) out.push(warn("client-ip", "Client IP source not configured", "Set CLIENT_IP_HEADER (e.g. cf-connecting-ip) or TRUSTED_PROXY_HOPS so rate limits see real visitors."));
  else out.push(ok("client-ip", "Client IP source configured"));

  if (!has(e.GOOGLE_CLIENT_ID)) out.push(warn("google", "Sign in with Google is off", "Optional. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET to show the button."));
  return out;
}

export function launchVerdict(checks: Check[]) {
  const blockers = checks.filter((c) => c.severity === "blocker").length;
  const warnings = checks.filter((c) => c.severity === "warning").length;
  return { blockers, warnings, ready: blockers === 0 };
}
