# Unit Test Strategy

## Goal

Each code package in Voice must own a dedicated unit test layer that validates:

- happy-path behavior
- config defaults and overrides
- failure/degraded states
- dispatch logic
- pure helper behavior

Integration and end-to-end tests will come later when frontend, backend, pipeline,
and jobs are wired together. Those tests should validate flows. Unit tests should
validate branch behavior and edge cases inside each package boundary.

## Current Layout

- `backend/tests/unit`
- `pipeline/tests/unit`
- `jobs/tests/unit`
- `migrator/tests/unit`

## Coverage Expectations

- `backend`: endpoint contracts, readiness branches, config normalization
- `pipeline`: mode exposure, readiness payloads, provider/runtime config behavior
- `jobs`: Temporal target/namespace behavior, registered workflow exposure
- `migrator`: config resolution, CLI dispatch, seed helper correctness

## Test Design Rules

- Prefer pure-function tests where possible.
- Isolate database/network behavior with monkeypatching in unit tests.
- Avoid real Docker, Postgres, Temporal, or LiveKit dependencies in unit suites.
- Put integration coverage in future `e2e` and service-integration layers, not in unit tests.
- New modules should ship with tests in the same change unless explicitly deferred in plan review.

## Current Limitation

The unit layer is now scaffolded and covers the initial starter branches, but it is
not meant to imply the codebase is feature-complete. As domain logic grows, tests
must deepen alongside repositories, services, orchestration flows, and vendor adapters.
