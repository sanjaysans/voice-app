# Frontend

This folder now contains the production-track Next.js application shell for Voice.

Purpose:

- authenticate into the backend-backed app shell
- render real seeded or user-created workspace state
- evolve alongside the control-plane API without depending on the design-only prototype

Contents:

- `app` — Next.js App Router pages for the product shell
- `components` — shared UI primitives and application chrome
- `lib` — client helpers, state provider, and mock scenario helpers for call simulation
- `tests` — frontend unit coverage

Run from the repo root with `npm run dev:frontend`.
