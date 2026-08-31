# Architecture Review

Use this before approving foundational implementation work.

## Goal

Catch overengineering and weak boundaries before they land in code.

Use `codebase-design` as the shared vocabulary for this review. Evaluate whether each
module has a small interface, useful depth, a clear seam, and enough locality that a
change can be understood and verified without tracing unrelated callers.

## Review questions

- is the service boundary justified?
- does the proposed module pass the deletion test, or is it only a pass-through?
- is the highest useful test seam exposed without leaking implementation details?
- does the schema separate stable concepts from vendor-specific details?
- can the runtime support multiple providers without rewriting domain logic?
- can failures be traced through logs and identifiers?
- is the local-first path still the default?

## Approval bar

A foundational change is ready only when it is:

- understandable
- runnable locally
- observable
- versionable
- reversible through normal migrations or config changes
