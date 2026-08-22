# Coding Standards

## Goal

Keep implementation quality high from the first real code commit without making the codebase heavy or overexplained.

## Core rules

1. Prefer simple, explicit designs over clever abstractions.
2. Keep domain logic separate from framework and vendor SDK code.
3. Add comments only when the intent would otherwise be hard to infer.
4. Default to small modules with clear responsibilities.
5. Favor typed interfaces and validated config over implicit conventions.

## Python standards

- Python 3.11+
- `uv` for dependency and environment management
- `ruff` for linting and formatting
- `pytest` for tests
- strict type hints on public functions, services, and domain models
- Pydantic for config and input/output contracts

## Code organization

### Prefer this shape

- `domain/` for entities, enums, policies, and core business rules
- `application/` for use cases and orchestration
- `infrastructure/` for database, external services, SDK bindings, and transport adapters
- `interfaces/` for HTTP routes, workers, CLI entrypoints, and webhooks

### Avoid this shape

- vendor SDK calls mixed directly into route handlers
- giant utility modules
- shared helpers with unclear ownership
- circular imports between runtime layers

## Frontend standards

- use shared UI primitives before adding page-local controls
- no browser-native `<select>` in product UI; use the shared dropdown component
- async actions must show a loading state and disable repeat clicks while pending
- row actions should prefer keyed pending state so only the affected row locks
- full-page or surface-blocking loaders are reserved for collection rebuilds, context changes, or actions that materially refresh the current view
- in-place mutations such as health checks or row updates should keep loading scoped to the triggering control whenever the surrounding UI can remain interactive
- destructive or irreversible actions must require a confirmation modal before the API call begins
- create, save, and standard edit flows should not add confirmation friction unless the action is destructive
- keep shell chrome quiet; avoid stacking low-value buttons into the header

## Comment style

Use comments only for:

- non-obvious business rules
- protocol edge cases
- state machine invariants
- temporary constraints with a clear follow-up path

Do not add comments for:

- restating the code
- obvious assignments
- framework boilerplate

## Logging rules

- use structured logs
- no free-form print debugging in committed code
- log boundary events, failures, and important state transitions
- include correlation ids and domain ids whenever available

## Error handling

1. Fail early on invalid configuration.
2. Use typed exceptions or clearly named exception classes at service boundaries.
3. Do not swallow errors from external calls without logging enough context.
4. Surface retryable vs non-retryable failures clearly in jobs and pipeline logic.

## Linting target

The first bootstrap should aim to enforce:

- formatting through `ruff format`
- linting through `ruff check`
- import ordering
- unused import removal
- obvious complexity and correctness checks

## Testing target

- unit tests for domain logic and config validation
- focused integration tests for DB, job, and pipeline boundaries
- deterministic local test fixtures wherever possible

## Review bar

Code is ready only when it is:

- readable without excessive comments
- structured around stable boundaries
- locally runnable
- logged well enough to debug
- lint-clean and testable
