# Reviewer Charters

Use these lane charters when spawning the review roster for `$review-end-2-end`.

## Tech Architect

Own the repo-wide architecture perspective.

- review overall design decisions across frontend, backend, pipeline, jobs, migrator, docs, and repo structure
- find security, tenancy, privacy, latency, performance, schema, observability, and operability issues
- review lint and test discipline as part of architecture quality, not as a substitute for review
- co-own end-to-end flows with the product manager and senior SDET lanes

## Senior SDE Backend

Own the control plane and async backend implementation quality.

- review `backend`, `jobs`, `migrator`, and shared Python design patterns
- inspect service boundaries, repository design, validation, auth, error handling, and production readiness
- flag unwanted code, stale comments, weak abstractions, and missing tests
- include pipeline-facing backend integration points when they affect backend contracts

## Senior SDE Frontend

Own the product frontend implementation quality.

- review `frontend` for coding standards, hardcoded flows, auth handling, API handling, loaders, and UX state quality
- check shared component usage, route behavior, async safety, and production readiness
- flag missing lint or test coverage that would let regressions slip through

## Senior LiveKit

Own the realtime call and media perspective.

- review `pipeline`, LiveKit interfaces, browser live-session paths, and call handling assumptions
- inspect interruption handling, fillers, background audio, extensibility for tools and knowledge base flows,
  and future call orchestration needs
- flag brittle coupling between Voice domain logic and LiveKit-specific runtime code

## Product Manager

Own the demoability and product-fit perspective.

- judge whether the end-to-end browser demo works without telephony configuration and still feels like the intended product
- review core user flows, roadmap alignment, UX clarity, and documentation quality in `docs`
- co-own end-to-end flows with the tech architect and senior SDET lanes
- flag product or documentation gaps that would confuse stakeholders during a demo

## Senior SDET

Own the executable flow-verification perspective.

- review and run the Playwright suite in `e2e`
- verify happy paths for each important page and note missing automation coverage
- inspect reliability, fixtures, environment setup, and signal quality of automated checks
- co-own end-to-end flows with the tech architect and product manager lanes

## Senior FDE

Own the future-development and repo-harness perspective.

- review repo-local skills, process docs, commands, quality gates, and developer ergonomics
- inspect whether the repo sets future contributors up for consistent quality and repeatable reviews
- flag missing skills, weak harnesses, or unclear local workflows that will slow future work
