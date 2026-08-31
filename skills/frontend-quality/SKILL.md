---
name: frontend-quality
description: "Build reliable, accessible, responsive frontend flows with complete async, auth, error, and test behavior. Use when changing a Voice page, form, interaction, navigation flow, or browser media surface."
---

# Frontend Quality

Use this skill to make a frontend change production-ready, not merely visually complete. Read
`skills/frontend-ui-guidelines/SKILL.md` and the relevant page tests before implementation.

## User-Visible States

Every async surface must intentionally handle:

- initial loading without layout collapse or misleading stale controls
- success with the updated data visible
- empty state with a useful next action
- recoverable error with a clear message and retry path
- disabled or pending state that prevents duplicate mutations
- permission or expired-auth state without leaking server details

Use shared buttons, dropdowns, dialogs, and async-action helpers. A page-level spinner is only
appropriate when the whole surface is unavailable; row and field operations should stay local.

## Accessibility

- Use semantic elements and accessible names before adding ARIA.
- Every input needs a visible label or equivalent accessible name, an error association, and a
  keyboard path.
- Preserve visible focus, sufficient contrast, and an understandable tab order.
- Do not make color, hover, animation, or audio the only way to understand state.
- Respect `prefers-reduced-motion` and keep the UI usable when media permissions are denied.

## Responsive And Performance Quality

- Test narrow, medium, wide, and browser-zoom layouts; use fluid grids instead of fixed page
  widths.
- Keep navigation client-side and avoid refetching or remounting the entire shell for a route
  change unless the data contract requires it.
- Avoid unnecessary client components, broad context subscriptions, repeated polling, and large
  render-time transformations.
- For browser LiveKit surfaces, distinguish transport, microphone, remote audio, and agent state;
  do not show `Connected` when only the HTTP session has been created.

## Testing

Test behavior through public UI seams with semantic queries. Cover the critical path plus at least
one failure or permission path for new interactions. Prefer focused tests for state transitions,
form validation, auth redirects, navigation, and duplicate-action protection over snapshots of
large page trees.

Before handoff, run `npm run typecheck:frontend`, `npm run test:frontend`, and `npm run build`.
For user-facing or media changes, run the relevant Playwright flow and perform a manual keyboard,
responsive, and visual pass.
