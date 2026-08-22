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

## Avoid

- SDK calls in route handlers
- route files that implement business workflows directly
- hidden implicit globals for tenant or request context
