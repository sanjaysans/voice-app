# Review End To End

Use this when the user asks for a whole-repo review from scratch, asks for `review-end-2-end`,
or wants multiple specialist reviewers plus a developer-fix loop.

## Intent

Run a full Voice repo audit with parallel specialist agents, consolidate findings,
fix issues in bounded batches, and loop until no actionable findings remain or the
remaining work is explicitly blocked by external dependencies or manual-only review.

## Required Baseline

1. Treat the current repo state as the review target, including the working tree.
2. Run `make review-end-2-end` before spawning reviewers unless the user explicitly asks
   for a narrower scope.
3. Review from the repo root, not from an individual package in isolation.

## Shared Review Disciplines

Apply these skills inside the roster and resolver loop:

1. Use `codebase-design` vocabulary when reviewing module depth, seams, adapters, and locality.
2. Use `diagnosing-bugs` for reproducible bug or performance findings, especially in LiveKit,
   browser media, STT, TTS, and persistence paths.
3. Use `tdd` for the developer-resolver regression test before changing behavior whenever a
   suitable public seam exists.
4. Use `research` only for vendor or standards questions that require first-party evidence,
   and capture durable findings under `docs/research/`.

## Required Reviewer Roster

Spawn these reviewer lanes in parallel. Each lane owns its own perspective and should avoid
redoing another lane's core job:

1. tech architect
2. senior SDE backend
3. senior SDE frontend
4. senior LiveKit
5. product manager
6. senior SDET
7. senior FDE

Read [references/reviewer-charters.md](references/reviewer-charters.md) before writing the
lane prompts.

## Loop

1. Run the baseline command.
2. Spawn the reviewer roster in parallel with explicit ownership.
3. Consolidate unique findings, ordered by severity.
4. Spawn one developer-resolver lane for the highest-value fix batch.
5. Re-run the relevant validation commands after fixes.
6. Re-run the affected reviewers, plus the tech architect, product manager, and senior SDET
   when the changes affect end-to-end flows.
7. Repeat until the reviewers report no actionable findings or the remaining gaps are blocked
   on manual product judgement, infrastructure access, or deliberate scope deferral.

Read [references/fix-loop.md](references/fix-loop.md) for the batching and stop conditions.

## Output Contract

When reporting back:

- list findings first, grouped by reviewer lane and ordered by severity
- call out duplicates only once after consolidation
- state what the developer-resolver fixed
- include exact validation commands run
- note what still needs manual review

## Notes

- The tech architect, product manager, and senior SDET lanes all co-own end-to-end flow quality.
- The product manager lane must judge whether the browser-live demo path works without telephony
  configuration and whether docs reflect the real product and technical decisions.
- The senior SDET lane should prefer the existing Playwright suite in `e2e` and identify missing
  coverage when the happy paths are incomplete.
- The senior FDE lane should review repo-local skills, harnesses, and quality gates instead of
  application behavior alone.
- The developer-resolver should use `diagnosing-bugs` and `tdd` for bug fixes, then re-run the
  affected reviewers and the full baseline.
