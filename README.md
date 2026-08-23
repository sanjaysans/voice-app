# Voice

Multi-tenant, multi-vendor telephony voice agent SaaS platform.

This repo is still intentionally staged, but the primary frontend and backend now run as a real local product shell with authenticated access and seed-driven bootstrap.
The focus right now is:

- building and iterating the clickable product mock in `mock_design`
- wiring the production-track app in `frontend` and `backend`
- codifying team workflow in `docs` and `skills`
- keeping delivery disciplined through PRD, Linear, planning, review, implementation, and validation loops

## Workspace Layout

- `mock_design` — runnable Next.js mock product, design tokens, and iterative UX exploration
- `frontend` — production-track Next.js application shell
- `backend` — FastAPI control plane scaffold
- `pipeline` — realtime call runtime scaffold
- `jobs` — async worker scaffold
- `migrator` — Alembic migrations and local seed flows
- `docs` — operating process, templates, and delivery rules
- `skills` — reusable repo-local skill playbooks for planning and execution

## Quick Start

1. Copy `.env.example` to `.env`
2. Install Python dependencies with `make setup`
3. Install Node dependencies with `make node-setup`
4. Create or map Supabase Postgres environments for `dev` and `prod`, then place their connection strings in `.env`
5. Install the Temporal CLI if needed, then start the local dev server with `make temporal-dev`
6. Apply migrations with `make db-migrate ENV=dev`
7. Seed the default admin workspace with `make db-seed ENV=dev`
8. Verify Alembic head, required indexes, and seed health with `make db-verify ENV=dev`
9. Install LiveKit Server locally if needed, then start it with `make livekit`
10. In separate terminals run `make backend ENV=dev`, `make pipeline ENV=dev`, `make pipeline-worker ENV=dev`, `make jobs ENV=dev`, and `make mock`

Minimal local-first app flow without `make` also works:

1. `cp .env.example .env`
2. `npm install`
3. `uv sync`
4. `npm run db:migrate`
5. `npm run db:seed`
6. `npm run dev:backend`
7. `npm run dev:frontend`

Local defaults after startup:

- mock design: `http://localhost:3000`
- backend: `http://localhost:8100/health`
- pipeline: `http://localhost:8101/health`
- jobs: `http://localhost:8102/health`
- live browser room test: `http://localhost:3000/live`
- Temporal Web UI: `http://localhost:8233`

## Environment Strategy

- `VOICE_ENVIRONMENT=dev|test|prod` selects which database URL is active
- `VOICE_DATABASE_URL` can override everything for one-off runs
- `VOICE_DATABASE_URL_DEV`, `VOICE_DATABASE_URL_TEST`, and `VOICE_DATABASE_URL_PROD` hold your Supabase connection strings
- `VOICE_SESSION_SECRET` signs backend session cookies and must be set explicitly in production
- `VOICE_PIPELINE_BASE_URL` tells the backend where to build browser session manifests
- `VOICE_LIVEKIT_URL`, `VOICE_LIVEKIT_API_KEY`, and `VOICE_LIVEKIT_API_SECRET` default to the local LiveKit dev server in non-production environments
- for local development on typical IPv4 networks, prefer Supabase session-pooler URLs over direct `db.<ref>.supabase.co` URLs
- `test` falls back to the `dev` database when its own URL is not set
- `prod` still fails fast if its database URL is not configured
- PostgreSQL connections automatically use the private `app_private` schema, so application tables stay out of Supabase's default `public` data API surface
- Docker-backed local Postgres remains optional, but it is no longer the default path

## Auth And Seed Bootstrap

- Auth is cookie-backed and enforced by the backend for app APIs
- `voice-seed` creates or refreshes the first platform admin, default tenant workspace, and provider accounts
- `VOICE_SEED_MODE=demo` adds realistic mock workflows and call history for local demos
- `VOICE_SEED_MODE=minimal` creates a clean production-style starting point without sample business data

## Product Delivery Loop

1. Add or update the PRD in Notion
2. Create or sync the delivery task in Linear
3. Write an implementation plan from the PRD
4. Review and revise the plan until it is ready
5. Approve the plan before code changes start
6. Implement, test, review, and validate
7. Perform manual product review
8. Approve and merge

The current phase is moving from design-first into a local-first implementation scaffold, while the full product mock still lives in `mock_design`.

For a full repo audit from scratch, run `make review-end-2-end` for the shared verification
baseline and invoke the repo-local Codex skill `$review-end-2-end` for the multi-agent review
and developer-fix loop.
