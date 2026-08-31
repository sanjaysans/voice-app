---
name: frontend-architecture
description: "Design and implement frontend modules, routes, data flows, and client/server boundaries in the Voice Next.js app. Use when adding or restructuring frontend pages, components, hooks, or API interactions."
---

# Frontend Architecture

Use this skill for structural frontend work. Pair it with `frontend-quality` for behavior and
accessibility, and `frontend-visual-system` when the change affects the visual language.

## Explore First

Read `frontend/README.md`, `frontend/app/globals.css`, `frontend/tokens.json`,
`frontend/components/ui.tsx`, and the relevant tests before changing structure. Follow the
existing App Router conventions and preserve the established shell unless the request explicitly
changes it.

## Module Shape

- Keep route files focused on composition, data loading, and route-level state.
- Put reusable controls in `frontend/components/ui.tsx` or a clearly named shared module.
- Put product concepts in domain components; do not copy the same card, form, table, or state
  machine into multiple pages.
- Keep API and transport details in `frontend/lib`; use the typed API client rather than inline
  `fetch` calls scattered through components.
- Keep LiveKit/media mechanics in the live-session library and expose product-level state to UI.
- Prefer a small public interface with behavior hidden behind it. Do not introduce a wrapper that
  only forwards props or a generic abstraction without a second real use case.

## Client And Server Boundaries

- Make components server-rendered by default; add `"use client"` only for browser state, events,
  media, or APIs that require the client runtime.
- Never expose provider credentials, auth tokens, or server-only configuration to client props,
  serialized data, logs, or browser-visible API responses.
- Use the existing auth and workspace context instead of deriving identity from route strings or
  hardcoding a tenant, agent, or call identifier.
- Keep navigation client-side and preserve loaded shell state; do not use full-page redirects for
  ordinary in-app navigation.

## State And Data Flow

- Model loading, success, empty, error, and pending mutation states explicitly.
- Keep server data, form state, transient UI state, and media/session state separate.
- Use `useAsyncAction` and shared API helpers for mutations; make retries and duplicate clicks safe.
- Derive rendered fields from API/domain data. A demo fixture belongs in mock-data helpers, never
  hidden inside a production route or component branch.

## Completion

For structural changes, add or update a behavior test at the highest useful public seam, run
frontend typechecking and tests, and check that the resulting module is easier to navigate than
the code it replaced.
