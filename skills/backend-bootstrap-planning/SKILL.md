# Backend Bootstrap Planning

Use this when adding or changing backend, migrator, jobs, or pipeline foundations.

## Goal

Keep early infrastructure decisions simple, local-first, and extensible.

## Rules

1. Prefer one clear runtime boundary per folder.
2. Optimize for local setup speed before production complexity.
3. Add shared abstractions only when at least two services need them.
4. Make migrations, seeds, and logs part of the initial design, not follow-up tasks.
5. Do not introduce paid-only defaults for core development workflows.

## Review checklist

- can a new developer run this locally with a short command sequence?
- does the design separate domain model from vendor SDK details?
- are logs and correlation ids designed in from the start?
- is configuration versionable and testable?
