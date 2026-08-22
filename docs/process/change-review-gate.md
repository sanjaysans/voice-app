# Change Review Gate

Use this after implementation and after `make verify`, but before marking work complete.

## Objective

Review each substantial change from two angles:

- senior SDE review
- tech architect review

The goal is to catch correctness issues, design drift, hidden complexity, unsafe coupling,
and missing tests before the change is treated as done.

## Required Sequence

1. Confirm the approved plan is still the source of scope.
2. Run `make verify`.
3. Review the exact working-tree diff or commit range.
4. Record findings in severity order.
5. Fix findings or explicitly capture why they are deferred.
6. Re-run `make verify` after fixes.
7. Only then mark the task complete.

## Review Lenses

### Senior SDE

- correctness and regressions
- edge-case handling
- test depth and branch coverage
- code clarity and maintainability
- boundary hygiene between modules and layers

### Tech Architect

- alignment with approved architecture and repo intent
- future extensibility without premature abstraction
- multi-tenant safety
- local-first operability
- observability and debugging quality

## Expected Output

- `Findings`: ordered by severity with file references
- `Open Questions`: only when they materially affect the design
- `Verification`: exact commands run
- `Residual Risk`: anything intentionally left for later

## Completion Rule

If the review finds meaningful issues, the task is not complete until they are addressed
or explicitly accepted as follow-up work.
