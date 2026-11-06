# Jobscribe

A back-office SaaS for solo and small trades businesses (HVAC, plumbing, electrical) built around **voice-to-invoice**: a tech records a spoken job note on-site, and the app transcribes it, extracts structured billing details, and generates a ready-to-send invoice, with no typing required.

<!-- When your demo video is ready, add this line here: 📹 **[Watch the walkthrough video (with voiceover)](YOUR_VIDEO_LINK)** -->

## At a Glance

| | |
|---|---|
| **Stack** | TypeScript, Node.js, Express, React (Vite), Expo (React Native), PostgreSQL, Prisma |
| **Integrations** | OpenAI Whisper, Claude API, Stripe Connect, Twilio, Brevo, S3-compatible storage |
| **Testing** | Vitest and Supertest integration tests on a real Postgres database, a Playwright E2E suite for the dashboard, and Jest tests for mobile, all run in CI |
| **Deployment** | Render Blueprint (`render.yaml`) and a backend `Dockerfile` |

### How it works

```mermaid
flowchart LR
  A[Tech records job note<br/>Expo mobile app] --> B[Express API<br/>stores audio in S3]
  B --> C[Whisper<br/>transcript]
  C --> D[Claude<br/>structured JSON]
  D --> E[Draft invoice<br/>PostgreSQL via Prisma]
  E --> F[Tech reviews and sends]
  F --> G[Client pays<br/>Stripe Connect]
  G --> H[Webhook marks paid<br/>scheduler sends reminders]
```

## Repository layout

```
backend/     Node.js/Express + TypeScript API: orchestrates the voice → transcript → invoice pipeline
dashboard/   React + Vite owner web dashboard: scheduling, clients, invoices, reporting, team management
mobile/      Expo (React Native) tech-facing app: record a job note, review the AI invoice, send it
```

## Core pipeline

1. **Mobile app:** the tech records a voice note on a job (`mobile/src/screens/RecordScreen.tsx`), or starts an unscheduled walk-in job on the fly (`NewJobScreen.tsx`), and uploads the recording.
2. **Backend API:** receives the audio (`backend/src/routes/voice.routes.ts`), stores it in S3-compatible storage, and orchestrates the rest:
   - **Whisper** (`backend/src/services/transcription.service.ts`) transcribes the audio.
   - **Claude** (`backend/src/services/extraction.service.ts`) extracts structured billing fields (customer, labor, parts, cost) as JSON.
   - A draft invoice is built automatically (`backend/src/services/invoice.service.ts`).
3. **Mobile app:** the tech reviews and edits the AI-generated invoice (`InvoiceReviewScreen.tsx`) before it goes out.
4. **Client delivery:** Twilio (SMS, only to SMS-consented clients) and Brevo (email) send a branded, client-facing invoice page (`/pay/:token`, no login required) with a Stripe payment link, created directly on that business's own connected Stripe account (see **Stripe Connect** below) so the money goes to them, not the platform. Stripe webhooks mark invoices paid.
5. **Automated follow-up:** a background scheduler (`backend/src/services/scheduler.service.ts`) marks overdue invoices and sends payment reminders without anyone chasing clients by hand.
6. **Owner dashboard:** scheduling, client history, invoicing (with PDF export), team management, and reporting (revenue trends, job-type breakdown, busiest days), all backed by the same Postgres database.

## Database

PostgreSQL via Prisma (`backend/prisma/schema.prisma`): `Organization`, `User` (OWNER/TECH), `Client`, `Job`, `VoiceNote`, `Invoice`, `LineItem`, `Payment`, `InvoiceDelivery`, `Quote`, `QuoteLineItem`, `QuoteDelivery`, `JobDocumentation`. Migrations live in `backend/prisma/migrations/` and are committed. Don't hand-edit the schema without regenerating a migration (`npm run prisma:migrate`).

## Stripe Connect (multi-tenant payments)

This is a marketplace, not a single Stripe account taking everyone's money: each business gets its own **Stripe Express connected account**, so a client's payment settles directly to *that business's* bank account.

- **Onboarding** (Settings page, `POST /api/organizations/me/stripe/onboard`) creates the connected account on first use and redirects the owner through Stripe's own hosted forms (bank details, business info, tax ID), none of which is built here. They land back on `/settings?stripe=return`, which calls `POST /api/organizations/me/stripe/refresh-status` to pull the account's real `charges_enabled`/`payouts_enabled` state rather than assuming it finished.
- **Payment links** (`createPaymentLinkForInvoice` in `backend/src/services/payment.service.ts`) are created as *direct charges*, passed with `{ stripeAccount: business.stripeAccountId }`, so the connected account is the merchant of record, not the platform. `application_fee_amount` is supported if you want a platform cut later.
- **Sending is blocked** (`POST /api/invoices/:id/send`) until `stripeAccountId` is set and `stripeChargesEnabled` is true. The dashboard also shows a warning banner and disables the button before the user even tries.
- **Webhooks need two endpoints, not one.** Stripe issues a separate signing secret for a webhook endpoint scoped to "Connected accounts" vs. one scoped to "Your account," even if both point at the same URL. In the Stripe Dashboard, under Webhooks, add:
  - one endpoint at `/api/payments/webhook` listening on **your account** (this already existed) → `STRIPE_WEBHOOK_SECRET`
  - a **second** endpoint at `/api/payments/connect-webhook` listening on **connected accounts** → `STRIPE_CONNECT_WEBHOOK_SECRET`

  Testing locally with the Stripe CLI needs a second `stripe listen` process pointed at the connect route: `stripe listen --forward-to localhost:4000/api/payments/connect-webhook --events checkout.session.completed,payment_intent.succeeded` (it will print its own `whsec_...`, which is your `STRIPE_CONNECT_WEBHOOK_SECRET`, different from the one for the platform-account listener).
- **Your own Stripe account needs Connect turned on** (Stripe Dashboard → Connect → get started) before any of this works, even in test mode.

## Subscription billing (flat $29/month)

This is billing *your* business's users to use Jobscribe itself, a completely separate Stripe flow from Stripe Connect above (which is about *their* clients paying *them*). Flat-rate, single tier, no per-seat pricing.

- **Trial:** every new organization starts with `subscriptionStatus: TRIALING` and a `trialEndsAt` 14 days out (set in `POST /api/auth/register`), so signup is self-serve with no payment info required up front.
- **Gating** (`backend/src/middleware/subscription.ts`, `requireActiveSubscription`) blocks the core app (clients, jobs, invoices, quotes, reports, voice notes, job documentation) with `402 Payment Required` once the trial ends and there's no active/past-due subscription. `PAST_DUE` is still let through, since Stripe retries a failed card for days before a subscription actually lapses. Settings, auth, and team management are never gated, so an owner can always log in and pay. An org with no `trialEndsAt` at all (anything created before this feature shipped) is grandfathered in rather than retroactively locked out.
- **You have to create the $29/month Price yourself.** This app deliberately does not fabricate a price or auto-provision Stripe objects for something that's a real business decision. In the Stripe Dashboard (or CLI): Products → add a product → add a recurring price, $29.00/month. Put that Price's id in `STRIPE_SUBSCRIPTION_PRICE_ID`.
- **Checkout** (`POST /api/organizations/me/subscription/checkout`) creates a platform-side Stripe Customer on first use and starts a Stripe Checkout session in subscription mode.
- **Billing Portal** (`GET /api/organizations/me/subscription/portal`) lets the owner update their card, view invoices, or cancel, hosted by Stripe. You need to configure the Customer Portal once in the Stripe Dashboard (Settings → Billing → Customer portal) before this link will work.
- **Webhooks** reuse the existing platform-account endpoint (`/api/payments/webhook`, `STRIPE_WEBHOOK_SECRET` from Stripe Connect above), so no new endpoint is needed. Add these events to that same webhook in the Stripe Dashboard: `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`.

## Local setup

### 1. Backend

```bash
cd backend
cp .env.example .env   # fill in DATABASE_URL, OPENAI_API_KEY, ANTHROPIC_API_KEY, Twilio/Brevo/Stripe keys (see Stripe Connect above)
npm install
npm run prisma:migrate  # applies the committed migrations
npm run dev              # http://localhost:4000
```

The voice pipeline, SMS/email delivery, Stripe payment links, S3 storage, and Sentry each degrade gracefully (local disk fallback, or a clear thrown error) if their config isn't set, so you can run the rest of the app without every third-party integration configured. **Exception:** don't rely on the local-disk fallback for voice note storage in production.

### 2. Owner dashboard

```bash
cd dashboard
cp .env.example .env   # VITE_API_BASE_URL, VITE_APP_BASE_URL
npm install
npm run dev              # http://localhost:5173
```

Register the first account from the dashboard's "Create an organization" screen. That user becomes the org's OWNER. Invite techs from the **Team** page in the sidebar (owner-only).

### 3. Mobile app

```bash
cd mobile
npm install
npx expo start
```

Update `apiBaseUrl` in `mobile/app.json` to point at your backend (use your machine's LAN IP, not `localhost`, when testing on a physical device).

## Testing and CI

The project has three automated test suites, and all of them run in GitHub Actions.

| Suite | Tools | What it covers |
|---|---|---|
| **Backend integration** | Vitest, Supertest, a real Postgres database (no mocks) | Auth, cross-tenant isolation, invoice send/void guards, and the voice-extraction invoice logic |
| **Dashboard end-to-end** | Playwright, a real backend, an isolated `offices_app_e2e` database | The core value chain through the real UI: register a business, add a client, schedule a job, create and pay an invoice |
| **Mobile** | Jest, React Native Testing Library | The login handoff between `LoginScreen` and `AuthContext` that every other screen depends on |

### Backend

```bash
cd backend
createdb offices_app_test   # or: psql -c "CREATE DATABASE offices_app_test;"
cp .env.example .env.test   # then point DATABASE_URL at offices_app_test (see .env.test for the shape)
DATABASE_URL=<test db url> npx prisma migrate deploy
npm test
```

CI (`.github/workflows/backend-tests.yml`) runs this automatically against a fresh Postgres service container on every push and pull request that touches `backend/`.

### Dashboard end-to-end

The dashboard suite (`dashboard/e2e/`) uses a dedicated `offices_app_e2e` database, never dev or test data.

```bash
createdb offices_app_e2e
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/offices_app_e2e" npx prisma migrate deploy --schema backend/prisma/schema.prisma
cd dashboard
npm run test:e2e
```

### Mobile

This is a Jest and React Native Testing Library suite (`mobile/__tests__/`), not a device or simulator E2E run, since no emulator is assumed to be available.

```bash
cd mobile
npm test
```

The dashboard and mobile suites run in CI (`dashboard-ci.yml`, `mobile-ci.yml`) on every push and pull request that touches their respective app.

## Features

**Payments and billing**
- Stripe Connect onboarding: each business connects its own bank account and gets paid directly, not through a shared platform account (see **Stripe Connect** above)
- Flat $29/month subscription billing with no per-seat pricing or tiers: a 14-day self-serve trial, then a single Stripe Checkout flow and hosted Billing Portal, with the whole app gated behind `402 Payment Required` once the trial or subscription lapses (see **Subscription billing** above)
- Manual invoice creation (a one-off charge or materials bill doesn't require a voice note) and manual "mark as paid" for cash and check payments collected outside Stripe
- Configurable per-organization sales tax rate (Settings page)
- Sequential, per-business invoice and quote numbers (`INV-000001`, `QTE-000001`, ...) instead of a timestamp and random string, via an atomic per-organization counter (`Organization.invoiceSequence`/`quoteSequence`), see `invoice.service.ts` and `quote.service.ts`
- Money stored as Postgres `Decimal(12,2)`, never `Float`. Invoice, quote, line-item and payment amounts are computed with exact base-10 arithmetic (`backend/src/utils/money.ts`), so a run of small charges can't silently drift off by fractions of a cent. Amounts serialize back to a plain JSON number for the dashboard and mobile exactly as before (`Prisma.Decimal.prototype.toJSON` patched once in `backend/src/db/prisma.ts`), so this needed no frontend changes

**Voice and field workflow**
- Voice-first quotes: an on-arrival estimate that the client accepts or declines, and auto-converts to an invoice when the job is marked complete (`backend/src/services/quote.service.ts`)
- Multi-note job timeline: a job can collect several voice notes (an arrival quote, then one or more completion notes). Every completion note's line items fold into the one draft invoice instead of only the first note winning (`invoice.service.ts#mergeExtractionIntoInvoice`), and the mobile job detail screen shows the full timeline
- Voice-and-photo job documentation: a photo and optional voice note pair captured at arrival, mid-job and completion, geotagged when location permission is granted, kept as standalone liability and warranty evidence separate from the invoice-facing job notes, with an owner-only toggle to feature a photo on the client invoice
- "Start an unscheduled job" flow in the mobile app for walk-ins
- Voice note audio is deleted after the pipeline successfully drafts a quote or invoice from it (the transcript is kept as the durable record; nothing in the app ever plays the audio back). Job-documentation audio is deliberately kept, because it's liability and warranty evidence, not pipeline input (see the `audioDeleted` field comment on `VoiceNote` in `schema.prisma`)

**Automation**
- Overdue invoice detection and automated payment reminders (background cron)
- Automatic follow-up: a configurable-delay review request after an invoice is paid, and a rebooking reminder once a job's set recurrence interval (for example every 6 months for an HVAC tune-up) has passed. Both are org-wide toggles in Settings with a per-client opt-out

**Dashboard and team**
- Pagination and search on clients, jobs and invoices lists
- Invoice PDF export and a public, no-login client-facing invoice and payment page
- Team management UI (invite **and remove** techs from the dashboard, no more raw API calls)
- Job detail page tying together a job's info, assigned tech, voice notes and transcript, and invoice in one view
- Edit and cancel flows for clients, jobs, and invoices in the dashboard

**Security, privacy and reliability**
- Multi-tenant isolation checks on jobs and clients (an org can't reference another org's data)
- Rate limiting (auth, voice uploads, public endpoints) and a locked-down CORS allowlist for production
- Per-organization monthly cap on voice-note and documentation-with-audio uploads (`MAX_VOICE_UPLOADS_PER_ORG_PER_MONTH`, defaults to 1000), which bounds worst-case Whisper and Claude spend from one heavy or runaway org without touching a photo-only documentation entry, which costs nothing to transcribe
- Upload magic-byte checking (`backend/src/utils/fileSignature.ts`): the declared multipart Content-Type is client-controlled and easy to spoof, so voice and photo uploads are also checked against their actual file signature on disk before being accepted
- SMS consent tracking: texts are only sent to clients who've explicitly consented
- Change password and forgot/reset password (emailed link), so account recovery works and not just initial login
- A GDPR-style data export and delete path: Settings → "Your data" lets an owner download a full JSON export of their business's data, or permanently delete the account and everything under it (password-confirmed, cancels the Stripe subscription, deletes stored files). See `GET /api/organizations/me/export` and `POST /api/organizations/me/delete`
- S3-compatible voice note storage (falls back to local disk only in dev)
- Error tracking wired into all three apps (Sentry, optional via `SENTRY_DSN` on the backend, `VITE_SENTRY_DSN` on the dashboard, and the `sentryDsn` field under `expo.extra` in `mobile/app.json`), a no-op everywhere it's left blank

## Before production launch

These need accounts, review or a hosting decision rather than more code:

- **Accounts and credentials:** production OpenAI, Anthropic, Twilio, Brevo, Stripe (with **Connect enabled**, plus the second Connect-scoped webhook endpoint, plus a real $29/month Price for subscription billing, see **Stripe Connect** and **Subscription billing** above), and an S3-compatible bucket (AWS S3, Cloudflare R2, Backblaze B2). This repo only has the integration code, not the accounts.
- **Legal review:** `dashboard/src/pages/Legal.tsx` has Terms of Service and Privacy Policy *drafts*. A lawyer needs to review and finalize these (jurisdiction, actual data practices, liability language) before they're relied upon.
- **Twilio compliance:** complete A2P 10DLC or toll-free registration before sending SMS at volume. The app already gates SMS on a `smsConsent` flag per client, but the registration itself is done in your Twilio console. Also point the number's "A message comes in" webhook at `<API_PUBLIC_URL>/api/webhooks/twilio/sms` (set `API_PUBLIC_URL` to this backend's own public URL). A client replying STOP or START is verified and flips their `smsConsent` here, not just at the carrier level, so the dashboard reflects reality instead of still showing them as opted in.
- **Deployment:** `render.yaml` (Render Blueprint) and `backend/Dockerfile` are ready to deploy from. You still need to connect your own Render or Railway account and fill in the `sync: false` env vars in the dashboard after first deploy.
- **App store submission:** `mobile/` needs an Apple Developer account and a Google Play Console account, plus an EAS Build and submission run. The code is ready, publishing is a manual process.
- **Backups:** `backend/scripts/backup-db.sh` and `restore-db.sh` and `backend/docs/BACKUP_RESTORE.md` cover the mechanism (and a restore has been tested end to end), but *scheduling* it is a hosting decision. Set up automated Postgres backups on whatever host you choose (most managed Postgres offerings include this, so verify it's actually turned on).

## Roadmap

Planned next, based on what comparable trades-software products already offer:

- Dispatch, calendar, route optimization and a pricebook
- QuickBooks sync
- E-signatures and change orders
- Bilingual support (English and Spanish)
- On-device transcription, so voice notes work fully offline (today the offline queue uploads once there's signal)
- In-person payments, online booking and an AI receptionist

## Hosting

`render.yaml` at the repo root is a ready-to-use [Render Blueprint](https://render.com/docs/blueprint-spec) provisioning the backend (Docker), a managed Postgres instance, and the dashboard as a static site with SPA routing. For Railway, use `backend/Dockerfile` for the API service, add a Postgres plugin, and deploy `dashboard/` as a static site with `npm run build` and publish `dist/`. The Expo mobile app ships via EAS Build once you're ready for internal testing or app store submission.
