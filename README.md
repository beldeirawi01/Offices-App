# Jobscribe

A back-office SaaS for solo and small trades businesses (HVAC, plumbing, electrical) built around **voice-to-invoice**: a tech records a spoken job note on-site, and the app transcribes it, extracts structured billing details, and generates a ready-to-send invoice — no typing required.

## Repository layout

```
backend/     Node.js/Express + TypeScript API — orchestrates the voice → transcript → invoice pipeline
dashboard/   React + Vite owner web dashboard — scheduling, clients, invoices, reporting, team management
mobile/      Expo (React Native) tech-facing app — record a job note, review the AI invoice, send it
```

## Core pipeline

1. **Mobile app** — tech records a voice note on a job (`mobile/src/screens/RecordScreen.tsx`), or starts an unscheduled walk-in job on the fly (`NewJobScreen.tsx`), and uploads the recording.
2. **Backend API** — receives the audio (`backend/src/routes/voice.routes.ts`), stores it in S3-compatible storage, and orchestrates the rest:
   - **Whisper** (`backend/src/services/transcription.service.ts`) transcribes the audio.
   - **Claude** (`backend/src/services/extraction.service.ts`) extracts structured billing fields (customer, labor, parts, cost) as JSON.
   - A draft invoice is built automatically (`backend/src/services/invoice.service.ts`).
3. **Mobile app** — tech reviews/edits the AI-generated invoice (`InvoiceReviewScreen.tsx`) before it goes out.
4. **Client delivery** — Twilio (SMS, only to SMS-consented clients) + Brevo (email) send a branded, client-facing invoice page (`/pay/:token`, no login required) with a Stripe payment link, created directly on that business's own connected Stripe account (see **Stripe Connect** below) so the money goes to them, not the platform. Stripe webhooks mark invoices paid.
5. **Automated follow-up** — a background scheduler (`backend/src/services/scheduler.service.ts`) marks overdue invoices and sends payment reminders without anyone chasing clients by hand.
6. **Owner dashboard** — scheduling, client history, invoicing (with PDF export), team management, and reporting (revenue trends, job-type breakdown, busiest days) — all backed by the same Postgres database.

## Database

PostgreSQL via Prisma (`backend/prisma/schema.prisma`): `Organization`, `User` (OWNER/TECH), `Client`, `Job`, `VoiceNote`, `Invoice`, `LineItem`, `Payment`, `InvoiceDelivery`, `Quote`, `QuoteLineItem`, `QuoteDelivery`, `JobDocumentation`. Migrations live in `backend/prisma/migrations/` and are committed — don't hand-edit the schema without regenerating a migration (`npm run prisma:migrate`).

## Stripe Connect (multi-tenant payments)

This is a marketplace, not a single Stripe account taking everyone's money: each business gets its own **Stripe Express connected account**, so a client's payment settles directly to *that business's* bank account.

- **Onboarding** (Settings page, `POST /api/organizations/me/stripe/onboard`) creates the connected account on first use and redirects the owner through Stripe's own hosted forms (bank details, business info, tax ID) — none of that is built here. They land back on `/settings?stripe=return`, which calls `POST /api/organizations/me/stripe/refresh-status` to pull the account's real `charges_enabled`/`payouts_enabled` state rather than assuming it finished.
- **Payment links** (`createPaymentLinkForInvoice` in `backend/src/services/payment.service.ts`) are created as *direct charges* — passed with `{ stripeAccount: business.stripeAccountId }` — so the connected account is the merchant of record, not the platform. `application_fee_amount` is supported if you want a platform cut later.
- **Sending is blocked** (`POST /api/invoices/:id/send`) until `stripeAccountId` is set and `stripeChargesEnabled` is true — the dashboard also shows a warning banner and disables the button before the user even tries.
- **Webhooks need two endpoints, not one.** Stripe issues a separate signing secret for a webhook endpoint scoped to "Connected accounts" vs. one scoped to "Your account," even if both point at the same URL. In the Stripe Dashboard, under Webhooks, add:
  - one endpoint at `/api/payments/webhook` listening on **your account** (this already existed) → `STRIPE_WEBHOOK_SECRET`
  - a **second** endpoint at `/api/payments/connect-webhook` listening on **connected accounts** → `STRIPE_CONNECT_WEBHOOK_SECRET`

  Testing locally with the Stripe CLI needs a second `stripe listen` process pointed at the connect route: `stripe listen --forward-to localhost:4000/api/payments/connect-webhook --events checkout.session.completed,payment_intent.succeeded` (it'll print its own `whsec_...` — that's your `STRIPE_CONNECT_WEBHOOK_SECRET`, different from the one for the platform-account listener).
- **Your own Stripe account needs Connect turned on** (Stripe Dashboard → Connect → get started) before any of this works, even in test mode.

## Subscription billing (flat $29/month)

This is billing *your* business's users to use Jobscribe itself — a completely separate Stripe flow from Stripe Connect above (which is about *their* clients paying *them*). Flat-rate, single tier, no per-seat pricing.

- **Trial**: every new organization starts with `subscriptionStatus: TRIALING` and a `trialEndsAt` 14 days out (set in `POST /api/auth/register`), so signup is self-serve with no payment info required up front.
- **Gating** (`backend/src/middleware/subscription.ts`, `requireActiveSubscription`) blocks the core app (clients, jobs, invoices, quotes, reports, voice notes, job documentation) with `402 Payment Required` once the trial ends and there's no active/past-due subscription. `PAST_DUE` is still let through — Stripe retries a failed card for days before a subscription actually lapses. Settings, auth, and team management are never gated, so an owner can always log in and pay. An org with no `trialEndsAt` at all (anything created before this feature shipped) is grandfathered in rather than retroactively locked out.
- **You have to create the $29/month Price yourself** — this app deliberately does not fabricate a price or auto-provision Stripe objects for something that's a real business decision. In the Stripe Dashboard (or CLI): Products → add a product → add a recurring price, $29.00/month. Put that Price's id in `STRIPE_SUBSCRIPTION_PRICE_ID`.
- **Checkout** (`POST /api/organizations/me/subscription/checkout`) creates a platform-side Stripe Customer on first use and starts a Stripe Checkout session in subscription mode.
- **Billing Portal** (`GET /api/organizations/me/subscription/portal`) lets the owner update their card, view invoices, or cancel — hosted by Stripe. You need to configure the Customer Portal once in the Stripe Dashboard (Settings → Billing → Customer portal) before this link will work.
- **Webhooks** reuse the existing platform-account endpoint (`/api/payments/webhook`, `STRIPE_WEBHOOK_SECRET` from Stripe Connect above) — no new endpoint needed. Add these events to that same webhook in the Stripe Dashboard: `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`.

## Local setup

### 1. Backend

```bash
cd backend
cp .env.example .env   # fill in DATABASE_URL, OPENAI_API_KEY, ANTHROPIC_API_KEY, Twilio/Brevo/Stripe keys (see Stripe Connect below)
npm install
npm run prisma:migrate  # applies the committed migrations
npm run dev              # http://localhost:4000
```

The voice pipeline, SMS/email delivery, Stripe payment links, S3 storage, and Sentry each degrade gracefully (local disk fallback, or a clear thrown error) if their config isn't set, so you can run the rest of the app without every third-party integration configured. **Exception:** don't rely on the local-disk fallback for voice note storage in production — see the S3 section below.

### 2. Owner dashboard

```bash
cd dashboard
cp .env.example .env   # VITE_API_BASE_URL, VITE_APP_BASE_URL
npm install
npm run dev              # http://localhost:5173
```

Register the first account from the dashboard's "Create an organization" screen — that user becomes the org's OWNER. Invite techs from the **Team** page in the sidebar (owner-only).

### 3. Mobile app

```bash
cd mobile
npm install
npx expo start
```

Update `apiBaseUrl` in `mobile/app.json` to point at your backend (use your machine's LAN IP, not `localhost`, when testing on a physical device).

## Running the test suite

The backend has a real integration test suite (Vitest + Supertest) that runs against an actual Postgres database — not mocks — covering auth, cross-tenant isolation, invoice send/void guards, and the voice-extraction invoice logic.

```bash
cd backend
createdb offices_app_test   # or: psql -c "CREATE DATABASE offices_app_test;"
cp .env.example .env.test   # then point DATABASE_URL at offices_app_test — see .env.test for the shape
DATABASE_URL=<test db url> npx prisma migrate deploy
npm test
```

CI (`.github/workflows/backend-tests.yml`) runs this automatically against a fresh Postgres service container on every push/PR that touches `backend/`.

## What's implemented vs. what still needs your action before launch

**Done in code:**
- Stripe Connect onboarding — each business connects its own bank account and gets paid directly, not through a shared platform account (see **Stripe Connect** above)
- Multi-tenant isolation checks on jobs/clients (an org can't reference another org's data)
- Rate limiting (auth, voice uploads, public endpoints) and a locked-down CORS allowlist for production
- Pagination and search on clients/jobs/invoices lists
- Overdue invoice detection + automated payment reminders (background cron)
- S3-compatible voice note storage (falls back to local disk only in dev)
- Invoice PDF export + a public, no-login client-facing invoice/payment page
- SMS consent tracking — texts are only sent to clients who've explicitly consented
- Team management UI (invite **and remove** techs from the dashboard, no more raw API calls)
- Manual invoice creation (a one-off charge or materials bill doesn't require a voice note) and manual "mark as paid" for cash/check payments collected outside Stripe
- Configurable per-organization sales tax rate (Settings page)
- Change password + forgot/reset password (emailed link) — full account recovery, not just initial login
- Job detail page tying together a job's info, assigned tech, voice notes/transcript, and invoice in one view
- Edit/cancel flows for clients, jobs, and invoices in the dashboard
- "Start an unscheduled job" flow in the mobile app for walk-ins
- Error tracking wiring in all three apps (Sentry, optional via `SENTRY_DSN` on the backend, `VITE_SENTRY_DSN` on the dashboard, and the `sentryDsn` field under `expo.extra` in `mobile/app.json`) — a no-op everywhere it's left blank
- A real backend test suite + CI
- Voice-first quotes — an on-arrival estimate that the client accepts/declines, and auto-converts to an invoice when the job is marked complete (`backend/src/services/quote.service.ts`)
- Multi-note job timeline — a job can collect several voice notes (an arrival quote, then one or more completion notes); every completion note's line items fold into the one draft invoice instead of only the first note winning (`invoice.service.ts#mergeExtractionIntoInvoice`), and the mobile job detail screen shows the full timeline
- Automatic follow-up: a configurable-delay review request after an invoice is paid, and a rebooking reminder once a job's set recurrence interval (e.g. every 6 months for an HVAC tune-up) has passed — both are org-wide toggles in Settings with a per-client opt-out
- Voice-and-photo job documentation — a photo + optional voice note pair captured at arrival/mid-job/completion, geotagged when location permission is granted, kept as standalone liability/warranty evidence separate from the invoice-facing job notes, with an owner-only toggle to feature a photo on the client invoice
- Flat $29/month subscription billing — no per-seat pricing or tiers; a 14-day self-serve trial, then a single Stripe Checkout flow and hosted Billing Portal, with the whole app gated behind `402 Payment Required` once the trial or subscription lapses (see **Subscription billing** above)

**Needs your action, not more code:**
- **Accounts/credentials**: production OpenAI, Anthropic, Twilio, Brevo, Stripe (with **Connect enabled**, plus the second Connect-scoped webhook endpoint, plus a real $29/month Price for subscription billing — see **Stripe Connect** and **Subscription billing** above), and an S3-compatible bucket (AWS S3, Cloudflare R2, Backblaze B2) — this repo only has the integration code, not the accounts.
- **Legal review**: `dashboard/src/pages/Legal.tsx` has Terms of Service and Privacy Policy *drafts* — a lawyer needs to review and finalize these (jurisdiction, actual data practices, liability language) before they're relied upon.
- **Twilio compliance**: complete A2P 10DLC/toll-free registration before sending SMS at volume; the app already gates SMS on a `smsConsent` flag per client, but the registration itself is done in your Twilio console.
- **Deployment**: `render.yaml` (Render Blueprint) and `backend/Dockerfile` are ready to deploy from — you still need to connect your own Render/Railway account, and fill in the `sync: false` env vars in the dashboard after first deploy.
- **App store submission**: `mobile/` needs an Apple Developer account and Google Play Console account, plus an EAS Build + submission run — code is ready, publishing is a manual process only you can complete.
- **Backups**: `backend/scripts/backup-db.sh` / `restore-db.sh` and `backend/docs/BACKUP_RESTORE.md` cover the mechanism (and a restore has been tested end to end), but *scheduling* it is a hosting decision — set up automated Postgres backups on whatever host you choose (most managed Postgres offerings include this — verify it's actually turned on).

## Hosting

`render.yaml` at the repo root is a ready-to-use [Render Blueprint](https://render.com/docs/blueprint-spec) provisioning the backend (Docker), a managed Postgres instance, and the dashboard as a static site with SPA routing. For Railway, use `backend/Dockerfile` for the API service, add a Postgres plugin, and deploy `dashboard/` as a static site with `npm run build` / publish `dist/`. The Expo mobile app ships via EAS Build once you're ready for internal testing or app store submission.
