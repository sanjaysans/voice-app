# Jobs Layer Guidelines

Use this when writing code in `jobs`.

## Goal

Keep async processing durable, observable, and easy to reason about.

## Structure

- workflow definitions for orchestration
- activities for side effects
- domain services for reusable business logic

## Rules

1. Keep workflows deterministic.
2. Put network calls, DB I/O, and provider interactions in activities.
3. Distinguish retryable and terminal failures clearly.
4. Emit logs with workflow id, job id, tenant id, and call id when possible.
5. Keep long-running jobs resumable and idempotent.

## Avoid

- embedding large business logic blobs directly inside Temporal workflows
- silent retries without clear logging
- ad hoc cron scripts when the work belongs in the job system
