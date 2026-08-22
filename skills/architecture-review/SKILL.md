# Architecture Review

Use this before approving foundational implementation work.

## Goal

Catch overengineering and weak boundaries before they land in code.

## Review questions

- is the service boundary justified?
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
