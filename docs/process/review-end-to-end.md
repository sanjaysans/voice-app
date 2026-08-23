# Review End To End

Use this when the repo needs a whole-repo audit from scratch rather than a narrow change review.

## Trigger

- user asks for `review-end-2-end`
- user asks for a repo-wide quality audit
- user wants multiple specialist review agents with a developer-fix loop

## Baseline Command

Run this first from the repo root:

```bash
make review-end-2-end
```

This baseline runs the shared quality gates and the existing Playwright browser flow so every
review lane starts from the same verification snapshot.

## Required Reviewer Roster

1. Tech architect
2. Senior SDE backend
3. Senior SDE frontend
4. Senior LiveKit
5. Product manager
6. Senior SDET
7. Senior FDE

Each reviewer owns a distinct perspective. The tech architect, product manager, and senior SDET
also co-own end-to-end flow quality across the whole product, not just their narrow specialty.

## Developer-Fix Loop

1. Spawn the review roster in parallel.
2. Consolidate duplicate findings.
3. Spawn a developer-resolver lane for the highest-value actionable batch.
4. Re-run the relevant validation commands.
5. Re-run the affected reviewers.
6. Repeat until no actionable findings remain.

## Ownership Summary

- Tech architect: overall architecture, security, latency, performance, db design, repo structure, lint/test discipline, and end-to-end fit
- Senior SDE backend: backend, jobs, migrator, Python design, auth, services, repositories, and production-readiness quality
- Senior SDE frontend: frontend architecture, coding standards, API/auth handling, loaders, UI states, and hardcoded-flow detection
- Senior LiveKit: LiveKit runtime, browser live session, call handling, interruption paths, fillers, background audio, and future extensibility
- Product manager: demo quality without telephony config, roadmap fit, UX clarity, stakeholder readiness, and product/tech documentation quality
- Senior SDET: Playwright automation quality, happy-path coverage, fixture reliability, and end-to-end verification
- Senior FDE: repo skills, commands, harnesses, docs, and long-term developer quality rails

## Output Format

- Findings: grouped by reviewer lane and ordered by severity
- Fixes: what the developer-resolver changed in the current batch
- Verification: exact commands rerun
- Remaining risk: manual-only checks, external blockers, or accepted follow-ups

## Notes

- Use this in addition to the normal change review gate when a narrow diff review is not enough.
- Manual stakeholder review still matters for user-facing demo polish even after all automated and agent reviews pass.
