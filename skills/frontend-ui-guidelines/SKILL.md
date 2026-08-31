# Frontend UI Guidelines

Use `frontend-architecture` for module and data-flow decisions, `frontend-quality` for behavior,
accessibility, and responsive validation, and `frontend-visual-system` for visual direction,
themes, typography, tokens, and motion. This skill remains the concise Voice-specific baseline.

## Goal

Keep the product UI consistent, believable, and safe against duplicate user actions as the mock design evolves into the real frontend.

## Shared primitives first

1. Prefer shared UI primitives from `frontend/components/ui.tsx` before creating page-local controls.
2. Do not use browser-native `<select>` controls in product UI. Use the shared dropdown component.
3. Reuse the shared `Button` loading state instead of hand-rolling inline spinners.
4. Use the shared prompt editor for system, opening, and state prompts so declared variables can be
   inserted as `{{variable_key}}` tokens consistently.

## Async interaction rules

1. Any async action that saves, deletes, retries, publishes, signs out, or changes workspace context must show a loading state.
2. Async buttons must disable themselves while pending to prevent double clicks.
3. Row-level actions should use keyed pending state so only the affected row locks.
4. Navigation actions that trigger stateful transitions should lock once clicked when the route change is not immediate.
5. Use page or surface overlays only when the full surface is being rebuilt, refetched, or context-swapped after the action completes.
6. In-place mutations such as health checks, retries, status refreshes, row edits, and row deletes should prefer button-level or row-level loading instead of blocking the whole page.
7. Any destructive or irreversible action such as delete, remove, discard, or sign out must require an explicit confirmation step before the request starts.
8. Do not add confirmation popups for normal create, save, or edit flows unless the action is actually destructive.

## UX consistency

1. Preserve the existing shell language: dark sidebar, light content area, low-noise header.
2. Keep labels, badges, and button copy explicit and operator-friendly.
3. Empty, loading, and error states should feel intentional, not like missing UI.
4. Page surfaces should use the available content width; reserve `max-w-*` for readable text or intentionally focused empty states, not primary application cards.
5. Avoid fixed page widths that break when the viewport is resized or browser zoom changes. Use fluid grids and responsive min/max columns instead.

## Implementation bias

1. Prefer extending shared hooks such as `useAsyncAction` over duplicating pending-state logic.
2. Keep forms controlled and predictable.
3. Avoid ornamental controls that do not improve clarity or speed.
4. Render call-variable inputs from the agent variable definitions; do not hardcode use-case fields.
