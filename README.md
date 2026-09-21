# Offices App

A back-office SaaS for solo and small trades businesses (HVAC, plumbing, electrical) built around **voice-to-invoice**: a tech records a spoken job note on-site, and the app transcribes it, extracts structured billing details, and generates a ready-to-send invoice — no typing required.

## Repository layout

```
backend/     Node.js/Express + TypeScript API — orchestrates the voice → transcript → invoice pipeline
dashboard/   React + Vite owner web dashboard — scheduling, clients, invoices, reporting
mobile/      Expo (React Native) tech-facing app — record a job note, review the AI invoice, send it
```

## Core pipeline

1. **Mobile app** — tech records a voice note on a job (`mobile/src/screens/RecordScreen.tsx`) and uploads it.
2. **Backend API** — receives the audio (`backend/src/routes/voice.routes.ts`), orchestrates the rest:
   - **Whisper** (`backend/src/services/transcription.service.ts`) transcribes the audio.
   - **Claude** (`backend/src/services/extraction.service.ts`) extracts structured billing fields (customer, labor, parts, cost) as JSON.
   - A draft invoice is built automatically (`backend/src/services/invoice.service.ts`).
3. **Mobile app** — tech reviews/edits the AI-generated invoice (`InvoiceReviewScreen.tsx`) before it goes out.
4. **Client delivery** — Twilio (SMS) + SendGrid (email) send the invoice with a Stripe payment link (`backend/src/services/notification.service.ts`, `payment.service.ts`). Stripe webhooks mark invoices paid.
5. **Owner dashboard** — pulls from the same Postgres database for scheduling, payment tracking, client history, and reporting (revenue trends, job-type breakdown, busiest days).

## Database

PostgreSQL via Prisma (`backend/prisma/schema.prisma`): `Organization`, `User` (OWNER/TECH), `Client`, `Job`, `VoiceNote`, `Invoice`, `LineItem`, `Payment`, `InvoiceDelivery`.

## Local setup

### 1. Backend

```bash
cd backend
cp .env.example .env   # fill in DATABASE_URL, OPENAI_API_KEY, ANTHROPIC_API_KEY, Twilio/SendGrid/Stripe keys
npm install
npm run prisma:migrate  # creates tables
npm run dev              # http://localhost:4000
```

The voice pipeline, SMS/email delivery, and Stripe payment links each degrade gracefully (throw a clear error) if their API key isn't set, so you can run the rest of the app without every third-party integration configured.

### 2. Owner dashboard

```bash
cd dashboard
cp .env.example .env   # VITE_API_BASE_URL, defaults to http://localhost:4000/api
npm install
npm run dev              # http://localhost:5173
```

Register the first account from the dashboard's "Create an organization" screen — that user becomes the org's OWNER.

### 3. Mobile app

```bash
cd mobile
npm install
npx expo start
```

Update `apiBaseUrl` in `mobile/app.json` to point at your backend (use your machine's LAN IP, not `localhost`, when testing on a physical device). Invite tech accounts from the owner dashboard (`Users` API) so they can log in and record jobs.

## Hosting

Designed to deploy on Railway or Render for the MVP: one service for `backend` (with a managed Postgres addon), one static/site deploy for `dashboard`, and the Expo app shipped via EAS Build or Expo Go during validation.
