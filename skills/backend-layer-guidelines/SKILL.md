# Backend Layer Guidelines

Use this when writing code in `backend`.

## Goal

Keep the control plane clean, typed, and independent from pipeline runtime details.

## Structure

- `domain` for backend business concepts
- `application` for use cases
- `infrastructure` for persistence and external integrations
- `interfaces/http` for FastAPI routes

## Rules

1. Route handlers should stay thin.
2. Validation belongs at the boundary.
3. Business rules should not depend on FastAPI objects.
4. Persistence code should not leak directly into domain models.
5. Tenant scoping should be explicit in every read and write path.
6. Every new or materially changed API should clear the local seeded latency budget of `0.5s` or less.
7. Run the backend latency harness before marking API work complete:
   `uv run --project backend python backend/scripts/profile_api_latency.py`
8. When browser timings look high, inspect `X-Process-Time-Ms` or `Server-Timing` first to separate backend handler time from frontend or network overhead.
9. Keep agent configuration generic: shared prompts define persona and global guardrails, while
   state prompts define conversation behavior and transitions.
10. Validate declared call variables at the API boundary. Reject unknown keys and missing required
    values before dispatch, and never store provider secrets as call variables.
11. Normalize every workflow graph to one terminal `end_call` node. Leaf states must point to it,
    and terminal nodes must not have outgoing transitions.
12. Enable backend source reload only in the `dev` environment. Test and production launchers must
    run without watch mode.

## Avoid

- SDK calls in route handlers
- route files that implement business workflows directly
- hidden implicit globals for tenant or request context
