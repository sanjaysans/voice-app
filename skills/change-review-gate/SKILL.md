# Change Review Gate

Use this skill before marking any substantial Voice repo change as complete.

## Intent

Every meaningful code change should go through:

1. verification
2. senior SDE review
3. tech architect review

This skill exists so the repo consistently treats review as part of delivery, not as an optional summary step.

## Required Order

1. Confirm the implementation still matches the approved plan.
2. Run `make verify` unless a narrower validation command is more appropriate and explicitly justified.
3. Review the exact working-tree diff or change set.
4. Prioritize findings by severity and impact.
5. Fix issues when feasible in the same turn.
6. Re-run verification after fixes.
7. Only then report completion.

Run the review on two independent axes:

- **Standards:** compare the change with `AGENTS.md`, the relevant `docs/architecture` guidance,
  and the applicable layer skill. Use `codebase-design` terms when identifying shallow modules,
  leaked seams, duplicated policy, or poor locality.
- **Spec:** compare the behavior with the approved plan, PRD, issue, or user request. Report
  missing requirements and scope creep separately from standards findings.

Keep the two axes independent while reviewing, then consolidate duplicate findings before fixing.

## Review Expectations

### Senior SDE lens

- find correctness bugs
- find boundary violations
- find missing edge-case handling
- find inadequate or misleading tests
- find maintainability risks

### Tech architect lens

- check fit with repo stage and approved architecture
- reject premature abstraction
- protect local-first workflows
- protect multi-tenant safety and future extensibility
- check operational clarity and logging/debuggability

## Output Format

When findings exist, report them first with:

- severity
- file reference
- why it matters

When no findings exist, say that explicitly and still mention:

- verification performed
- residual risks
- any manual review still needed

## Notes

- Do not confuse `lint` and `test` success with approval.
- Prefer concrete findings over broad compliments.
- If the change is user-facing, manual product review is still required after this skill.
