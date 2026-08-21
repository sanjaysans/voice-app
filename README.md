# Voice

Multi-tenant, multi-vendor telephony voice agent SaaS platform.

This repo is intentionally lean for the current phase.
The focus right now is:

- building and iterating the clickable product mock in `mock_design`
- keeping `frontend` open for the future production implementation
- codifying team workflow in `docs` and `skills`
- keeping delivery disciplined through PRD, Linear, planning, review, implementation, and validation loops

## Workspace Layout

- `mock_design` — runnable Next.js mock product, design tokens, and iterative UX exploration
- `frontend` — reserved for the eventual production frontend implementation
- `docs` — operating process, templates, and delivery rules
- `skills` — reusable repo-local skill playbooks for planning and execution

## Quick Start

1. Install dependencies from the repo root with `npm install`
2. Start the mock design app with `npm run dev`
3. Open `http://localhost:3000`

## Product Delivery Loop

1. Add or update the PRD in Notion
2. Create or sync the delivery task in Linear
3. Write an implementation plan from the PRD
4. Review and revise the plan until it is ready
5. Approve the plan before code changes start
6. Implement, test, review, and validate
7. Perform manual product review
8. Approve and merge

The current phase is design-first, with the full prototype living in `mock_design` and using mocked data only.
