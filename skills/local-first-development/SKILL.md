# Local First Development

Use this for any foundational repo work.

## Goal

Preserve a development experience where the whole system can be started, reset, seeded, and debugged locally without paid services.

## Rules

1. Default to open-source local dependencies.
2. Any cloud dependency must have a local or stubbed development path.
3. Document setup in the same change that introduces the dependency.
4. Keep bootstrap steps short and deterministic.
5. Include example env files, seed paths, and health checks early.

## Required outputs

- simple setup steps
- reset or reseed instructions
- logs or health verification steps
- explicit local assumptions
