# Kept

Book trusted professionals — barbers, stylists, trainers, photographers, music producers, tutors and every other kind of pro — and run your own appointments: calendar, team, clients, payments, reviews, messages and a public booking page.

- **Customers** search and book in 30 languages, pay online or in person, message the pro, reschedule or cancel within the business's rules, and leave verified reviews.
- **Professionals** get a premium public page (services menu, portfolio, featured social posts), a live calendar, team roles and permissions, client records, promo codes, insights and payouts through Stripe.
- **Ask Kept** turns plain requests ("a barber tomorrow after 5 under $40") into real results with bookable times.

## Stack

Next.js 16 (App Router, React 19) · PostgreSQL 16 + Drizzle · Tailwind CSS v4 · Stripe Connect · Resend (email) · S3-compatible storage · Server-Sent Events over Postgres `LISTEN/NOTIFY`.

## Run it locally

```bash
cp .env.example .env.local        # set DATABASE_URL and a 32+ char APP_SECRET
npm install
npm run db:migrate
npm run db:seed -- --demo         # categories + demo businesses (refuses to run in production)
npm run dev                       # http://localhost:3000
npm run dev:worker                # reminders, review requests, waitlist, cleanup
```

Demo accounts (password `kept-demo-2026`): `customer@kept.test`, `pro@kept.test` (owner of North Fade Studio), `admin@kept.test`.

## Checks

```bash
npm run typecheck && npm run lint
npm test                 # unit + integration (needs Postgres)
npm run i18n:check       # every language vs English: missing, unknown, broken placeholders, plural forms
npm run e2e              # browser flows against a running server (booking, editor, team, settings, assistant, a11y)
```

## Launch checklist

Everything optional degrades gracefully, but for a real launch set these in production:

| What | Variables | Notes |
|---|---|---|
| App | `APP_URL`, `APP_SECRET`, `DATABASE_URL` | `APP_URL` is the public https origin (emails, OAuth, CSRF checks). `APP_SECRET` 32+ random chars. |
| Payments | `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | Enable Stripe Connect (Express). Webhook endpoint: `POST {APP_URL}/api/webhooks/stripe`. Optional customer service fee: `PLATFORM_CUSTOMER_FEE_BPS` (shown before checkout). |
| Email | `RESEND_API_KEY`, `EMAIL_FROM` | Verify your sending domain (SPF/DKIM). Without a key emails are only logged. Emails go out in each recipient's language. |
| Storage | `STORAGE_DRIVER=s3`, `S3_BUCKET`, `S3_REGION`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_ENDPOINT` (R2/MinIO) | Keep the bucket private: files are always served through `/media` with access checks. `local` works only with a persistent disk on a single server. |
| Background jobs | run `npm run worker` as a second process, or call `POST /api/internal/cron` with `CRON_SECRET` every minute | Reminders, review requests, waitlist offers, expired holds. |
| Client IP | `TRUSTED_PROXY_HOPS` or `CLIENT_IP_HEADER` | Needed for correct rate limiting behind a proxy/CDN (Cloudflare: `CLIENT_IP_HEADER=cf-connecting-ip`). |
| Sign in with Google | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Redirect URI: `{APP_URL}/api/auth/google/callback`. |
| SMS (optional) | `TWILIO_*` | Appointment reminders by text. |
| Maps & geocoding | `GEOCODER_URL`, `NEXT_PUBLIC_MAP_TILE_URL` | Use a commercial tile/geocoding provider at scale (OSM's public servers have strict usage limits). |
| Assistant (optional) | `ANTHROPIC_API_KEY`, `ASSISTANT_MODEL` | Without a key, Ask Kept still understands searches and navigation locally. |

Deploy steps: `npm ci && npm run build`, run `npm run db:migrate` once per release, then `npm start` (plus the worker). Seed categories in production with `npm run db:seed` (no `--demo`). Realtime uses one Postgres `LISTEN` connection per app instance, so it works across several instances without extra infrastructure; make sure your proxy doesn't buffer `text/event-stream` responses on `/api/events`.

## Put it online

To let someone try it right now from your own computer: `./compartir-link.sh` (or `.command` / `.bat`) starts everything plus a free Cloudflare quick tunnel and prints a public `https://….trycloudflare.com` link. It lasts while the machine is on and changes on every run — good for testing, not for production.

The quickest path is one machine with Docker (a small VPS is enough):

```bash
cp .env.example .env            # set APP_URL (your https domain), APP_SECRET and any keys you have
docker compose up -d --build    # database + web + background worker; migrations run on start
docker compose exec web npm run db:seed          # categories (safe in production)
```

Put a reverse proxy with TLS in front (Caddy, nginx, Cloudflare) and set `TRUSTED_PROXY_HOPS=1`. Disable response buffering for `/api/events` (live updates). Then run `npm run launch:check` against the production `.env`: it lists exactly what still blocks taking payments. `GET /api/health` is there for uptime monitors.

To let people try everything, run `docker compose exec web npm run db:seed -- --demo` on a **staging** copy only (it refuses in production) and share the demo logins from the section above.

## Security model (short)

Prices, discounts, roles and ids from the browser are never trusted; every mutation checks ownership and permissions on the server. Cookie-authenticated writes require same-origin requests. Bookings are protected against double-booking by database exclusion constraints. Passwords use Argon2id; sessions are revocable; uploads are type-sniffed, size-capped and private by default. Realtime events carry ids only and are routed per viewer. Rate limits cover login, signup, password checks, promo codes and the assistant.

## Languages

30 interface languages with automatic detection (browser or the account's saved choice), right-to-left layouts for Arabic, Hebrew, Persian and Urdu, and dates, times, money and plurals formatted per language. Messages live in `src/i18n/messages/<locale>/<namespace>.json`; English is the source and fallback.
