# Voice Delivery Process

This directory defines how work moves from product intent to merged code.

## System Of Record

- Notion holds PRDs, product context, requirements, and design rationale
- Linear holds execution tasks, statuses, owners, and delivery sequencing
- Git holds implementation, review discussion, and the final shipped history

## Delivery Flow

1. Create or refine the PRD in Notion
2. Create the Linear issue and link it back to the PRD
3. Draft an implementation plan using the template in this folder
4. Review the plan with product and engineering context in mind
5. Revise until the plan is approved
6. Implement in small, reviewable steps
7. Test, review, and validate against the PRD
8. Run manual product review for UX and edge cases
9. Approve and merge

## Templates In This Folder

- `notion-prd-template.md` for PRD structure
- `linear-task-template.md` for task creation
- `plan-template.md` for implementation planning
- `manual-review-checklist.md` for pre-merge product review

## Exit Criteria Before Merge

- scope matches the approved plan
- important assumptions are documented
- tests or validation steps are recorded
- manual review has happened for user-facing changes
- any follow-up work is explicit, not implicit
