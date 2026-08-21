# AGENTS.md

## Repo Intent

Voice is being built in stages.
Right now this repo is a base for product design, planning discipline, and mock-first execution.
Do not expand the architecture prematurely.

## Current Build Rules

1. Keep the repo lean until the first validated mock design and operating loop are stable.
2. Prefer improving `mock_design`, `frontend`, `docs`, and `skills` before adding new top-level services.
3. Do not scaffold backend, workers, eval systems, or pipeline packages unless there is an approved plan that requires them.
4. Treat Notion as the PRD source of truth and Linear as the execution source of truth.
5. No implementation should start before the plan is explicitly reviewed and approved.
6. Every substantial change should end with verification notes: what was built, what was tested, what still needs manual review.

## Working Process

1. PRD exists or is updated in Notion
2. Linear task exists and is linked to the PRD
3. A concrete implementation plan is written
4. Plan review and revision loop happens
5. Plan is approved
6. Implementation starts
7. Testing, review, and validation happen before handoff
8. Manual product review happens before merge

## Repo Conventions

- Runnable design prototype lives in `mock_design`
- Future production frontend implementation will live in `frontend`
- Process docs and templates live in `docs`
- Reusable execution playbooks live in `skills`

## What To Avoid

- speculative microservices
- placeholder infra folders without active use
- backend contracts invented without product flow context
- disconnected tickets without PRD linkage
