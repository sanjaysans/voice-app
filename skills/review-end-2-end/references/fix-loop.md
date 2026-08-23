# Fix Loop

Use this when converting review findings into developer-resolver work.

## Consolidation

1. Merge duplicate findings across lanes before opening the next fix batch.
2. Keep the most complete wording and preserve the strongest severity.
3. Separate actionable fixes from manual-only judgement calls.

## Developer-Resolver Lane

Spawn one developer-resolver lane at a time unless the fix scopes are clearly disjoint.

The developer-resolver should:

- fix the highest-value actionable batch first
- keep the write scope explicit
- run the narrowest meaningful validation after each batch
- summarize touched files and remaining risk

## Re-Review Rule

After each fix batch:

1. re-run the relevant validation commands
2. re-run the reviewer lanes that flagged the issue
3. re-run the tech architect, product manager, and senior SDET lanes whenever the fix changes
   end-to-end behavior, browser demo flows, auth, navigation, API contracts, or test harnesses

## Stop Conditions

Stop only when one of these is true:

1. all reviewer lanes report no actionable findings
2. the only remaining items require manual product judgement or stakeholder sign-off
3. the only remaining items are explicitly deferred follow-ups accepted by the user
4. progress is blocked by missing infrastructure, secrets, or external systems that are not available

## Reporting

Every loop summary should include:

- findings fixed in the batch
- validation rerun
- reviewers rerun
- remaining blockers or manual checks
