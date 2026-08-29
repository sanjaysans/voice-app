# Voice Architecture Docs

These docs describe the approved technical direction for the first implementation phase after the mock design is frozen.

The goal is not to overbuild. The goal is to make the first real system:

- local-first
- easy to run from scratch
- explicit about environment targeting
- extensible across tenants and vendors
- explicit about tradeoffs
- observable enough to debug without guesswork

## Documents

- `v1-stack-and-bootstrap-plan.md` — recommended stack, repo layout, and phased bootstrap plan
- `data-model-principles.md` — multi-tenant schema and persistence principles
- `call-pipeline-principles.md` — media/runtime architecture and extensibility model
- `livekit-pipeline-foundation.md` — current generic pipeline contract and LiveKit runtime scaffold
- `jobs-and-operations.md` — async work, logging, and local operations model
- `evaluation-system.md` — versioned suites, simulated callers, assertions, scoring, and release gates
- `coding-standards.md` — coding style, layering, linting, comments, logging, and review rules

## Rules

1. Product-facing runtime decisions should be recorded here before they spread into code.
2. Local developer experience is a first-class design constraint, not a follow-up task.
3. Any new service should justify why it cannot be folded into existing runtime boundaries.
