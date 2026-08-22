# Migrator Layer Guidelines

Use this when writing code in `migrator`.

## Goal

Make schema evolution, local bootstrap, and seeding safe and repeatable.

## Rules

1. Migrations should be deterministic and reviewable.
2. Seed data should be explicit and environment-aware.
3. Bootstrap commands should be short and safe to rerun.
4. Schema changes should be paired with updated docs when the domain model changes.
5. Destructive migrations should be clearly called out before implementation.

## Avoid

- mixing long-term seed logic into application startup
- hidden schema mutations outside the migration tool
- unreviewed raw SQL when a structured migration is clearer
