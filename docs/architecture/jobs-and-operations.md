# Jobs And Operations

## Goal

Keep realtime call handling thin and move retries, enrichment, sync, and analytics to durable async execution.

## Workflow engine

- Temporal

## Job categories

### Immediate async work

- CRM sync
- webhook fanout
- call summary generation
- extracted variable persistence
- recording metadata finalization

### Heavy post-call work

- QA scoring
- eval execution
- policy audits
- transcript normalization
- analytics enrichment

### Scheduled work

- daily aggregates
- provider health checks
- retention cleanup
- stale delivery retries
- knowledge sync refresh

## Logging rules

All services should emit structured logs with:

- timestamp
- level
- service
- environment
- request id
- workflow id when applicable
- job id when applicable
- tenant id when applicable
- call id when applicable

## Debugging principles

1. Every externally triggered flow should have a correlation id.
2. Logs should be readable locally without a paid platform.
3. Health endpoints and startup logs should clearly describe dependency readiness.
4. Failures should be logged once with enough context, not spammed repeatedly.

## Local operations target

A new developer should be able to:

1. install dependencies
2. start PostgreSQL and Temporal locally
3. run migrations
4. seed a default admin workspace
5. start backend, pipeline, jobs, and mock design
6. observe logs in separate terminals with minimal setup

## First bootstrap command set target

The eventual root workflow should aim for commands similar to:

```text
make setup
make infra-up
make db-migrate
make db-seed
make dev
```

The exact command names can change, but the developer experience should stay this short.
