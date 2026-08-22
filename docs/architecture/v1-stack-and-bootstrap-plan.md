# V1 Stack And Bootstrap Plan

## Objective

Turn the current design-first repo into a local-first implementation base for:

- backend control plane
- database migrations
- realtime call pipeline
- async jobs

without prematurely expanding into paid infrastructure or unnecessary services.

## Recommended Stack

### Backend control plane

- Python
- `uv` for Python environment and dependency management
- FastAPI
- Pydantic
- SQLAlchemy 2.x
- psycopg

### Database

- Supabase-managed PostgreSQL as the primary system of record
- `jsonb` only for provider-specific or evolving configuration edges
- relational tables for tenant, routing, agent, call, and audit state

### Migrations

- Alembic
- one shared migration project for the primary PostgreSQL schema

### Call pipeline

- Python
- LiveKit as the primary realtime telephony and media runtime
- provider adapter layer owned by Voice so vendor choice stays internal

### Async jobs

- Temporal as the durable workflow engine
- Python workers for post-call processing and scheduled operations

### Logging and observability

- structured JSON logs by default
- `structlog` over standard logging for consistent structured output
- request id, tenant id, agent id, call id, workflow id in log context whenever available
- OpenTelemetry-friendly instrumentation boundaries, even if tracing export is added later

### Local development

- Supabase `dev`, `test`, and `prod` database URLs selected by environment variables
- Temporal CLI dev server for local Temporal workflows
- `Makefile` for short bootstrap and dev commands
- `pytest` for tests
- `ruff` for linting and formatting
- app services runnable directly from the host with simple commands
- no Docker requirement for the default dev path

## Why this fits the current requirements

### Local-first

- Supabase gives a managed Postgres target while the apps still run directly on the host
- FastAPI and Python workers are simple to run without containerizing every service
- backend, pipeline, and jobs can share models, configs, and tooling

### Extensible vendor support

- Voice owns a canonical provider abstraction instead of binding product logic to one runtime SDK
- pipeline config can support:
  - speech-to-speech realtime
  - STT -> LLM -> TTS
  - STT -> realtime model
  - text LLM -> TTS

### Multi-tenant future

- PostgreSQL supports row-level security and partitioning when needed
- schema can separate stable core entities from vendor-specific config blobs

### Low-cost starting point

- host-run services first
- avoid managed queues, paid observability, or vendor lock-in during bootstrap

## Proposed Repo Layout After Approval

```text
voice-app/
  backend/
  pipeline/
  jobs/
  migrator/
  docs/
  frontend/
  mock_design/
  skills/
```

### Folder intent

- `backend` — control plane API, auth boundary later, admin flows, config APIs
- `pipeline` — realtime media runtime, provider adapters, agent orchestration, telephony hooks
- `jobs` — Temporal workflows, activities, scheduled jobs, analytics and post-call processing
- `migrator` — Alembic config, migration environment, seed utilities, bootstrap scripts

## Implementation phases

### Phase 1: workspace bootstrap

- add Python workspace structure
- add shared config and logging libraries
- add env-based database targeting for Supabase environments
- use Temporal CLI dev server for local Temporal
- add migrator and first database baseline
- add root commands for local setup and service startup

### Phase 2: backend foundation

- health endpoints
- tenant/workspace bootstrap model
- provider account and credential model
- agent definition and versioning model
- local seed flow for first admin workspace

### Phase 3: pipeline foundation

- LiveKit-backed runtime skeleton
- canonical pipeline config model
- transport and vendor adapter interfaces
- initial state machine and handoff model

### Phase 4: jobs foundation

- Temporal worker setup
- first post-call placeholder workflows
- analytics/event fanout skeleton

## Non-goals for the first implementation setup

- production auth
- billing
- warehouse or BI stack
- multi-region deployment
- managed cloud infrastructure
- advanced autoscaling

## Approval bar before scaffolding

The next implementation step is approved only if we agree on:

1. Python-first across backend, pipeline, and jobs
2. PostgreSQL as the primary system of record
3. LiveKit as the primary call runtime
4. Temporal as the async workflow engine
5. Supabase Postgres plus host-run commands and Temporal CLI as the default local developer experience
