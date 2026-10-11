# INTOP — Internship + Job Opportunity

A dark-first career discovery and application management platform for students and graduates. Built with Next.js App Router, TypeScript, PostgreSQL, Drizzle ORM, and signed HTTP-only cookie sessions.

## Run locally

1. Set `DATABASE_URL` in `.env` to a PostgreSQL connection string.
2. Set `AUTH_SECRET` to a long random string in production (at least 32 random bytes). In local development only, the app falls back to `DATABASE_URL` as the signing secret.
3. Install dependencies with `npm install`.
4. Apply the schema with `npx drizzle-kit push`.
5. Run `npm run dev`.

For Vercel, set `DATABASE_URL` and `AUTH_SECRET` in project environment variables and apply the schema to your production database before deployment. The database should use a connection-pooling URL suitable for serverless workloads. For optional Google sign-in, also set `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, and `APP_URL=https://YOUR_DOMAIN`; configure the Google OAuth authorized redirect URI as `https://YOUR_DOMAIN/api/auth/google/callback`. The app displays a clear email-sign-in fallback when Google is not configured.

## Data and accounts

The first opportunities request seeds 14 **demo opportunities** into an empty database. These listings are illustrative examples, not guaranteed active openings. The official application link is presented for verification. User accounts are created through the registration flow. To enable the admin dashboard, update an authorized account's `role` to `admin` directly in the database; public registration never grants admin access.

## API

The application uses `/api/platform?resource=...` as its modular API entrypoint, with resources: `register`, `login`, `logout`, `me`, `profile`, `opportunities`, `saved`, `applications`, `notifications`, `assistant`, `resume`, and `admin`. REST-friendly rewrites also expose `/api/auth/register`, `/api/auth/login`, `/api/opportunities`, `/api/opportunities/:id`, `/api/saved`, `/api/saved/:id`, `/api/applications`, `/api/applications/:id`, and `/api/profile`. Privileged writes are checked server-side.

## AI and resume analysis

`INTOP guidance engine` provides deterministic, profile-aware career suggestions and opportunity matches. It is deliberately provider-independent; replace the assistant handler with a server-side model adapter when a provider key becomes available. Resume Studio extracts text from PDF/DOCX files server-side, applies a transparent heuristic checklist, and does **not** persist the uploaded document. Google OAuth works when provider credentials are configured. Password recovery requires an email delivery service and is not represented as a live integration.
