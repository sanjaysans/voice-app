# Frontend

This folder now contains the production-track Next.js application shell for Voice.

Purpose:

- authenticate into the backend-backed app shell
- render real seeded or user-created workspace state
- evolve alongside the control-plane API without depending on the design-only prototype

Contents:

- `app` — Next.js App Router pages for the product shell
- `components` — shared UI primitives and application chrome
- `lib` — client API helpers, workspace state, runtime configuration, and domain types
- `tests` — frontend unit coverage

The production-track frontend reads workspace, agent, provider, evaluation, and call state from the backend. It does not fabricate call history or provider health in the browser. Browser LiveKit validation is a real test session and is kept separate from production call totals.

Run from the repo root with `npm run dev:frontend`.
