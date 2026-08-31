---
name: frontend-visual-system
description: "Create distinctive, coherent, tokenized frontend visual systems and themes for Voice instead of generic AI-generated dashboards. Use when designing or restyling pages, components, themes, typography, color, motion, or responsive composition."
---

# Frontend Visual System

Use this skill when a frontend change has visual or interaction-design impact. The goal is a
recognizable product language with deliberate choices, not a collection of polished defaults.

## Establish A Direction

Before writing JSX or CSS, define a short visual brief:

- the product mood and operator context
- one visual premise or metaphor that gives the surface character
- typography pairing and hierarchy
- palette roles and contrast strategy
- surface, border, radius, and depth language
- density and composition rules for the primary task
- a small set of meaningful motion moments

Choose a direction and apply it consistently. Do not combine unrelated visual trends because they
are individually popular.

## Voice Constraints

The existing product language is a dark sidebar, light content canvas, low-noise header, and
operator-focused density. Extend that system unless the request explicitly calls for a new product
direction. Add character through hierarchy, typography, spacing rhythm, icon treatment, data
visualization, and purposeful states rather than decorative clutter.

Avoid generic AI UI signals: default system/Inter/Roboto typography, purple gradients on white,
identical rounded cards, excessive glassmorphism, decorative blobs, random neon accents, dashboard
tiles with no hierarchy, and icons used without a clear action or meaning.

## Theme And Tokens

- Define semantic roles such as canvas, surface, elevated surface, ink, muted ink, border, accent,
  success, warning, danger, focus, and interactive hover states.
- Store reusable values in `frontend/tokens.json` and expose them through CSS variables and the
  Tailwind theme; do not scatter raw hex colors or one-off shadows through components.
- Build themes from roles, not from global search-and-replace of colors. A dark theme and a light
  theme must both preserve contrast, hierarchy, focus visibility, and semantic meaning.
- Use a small type scale and spacing scale. A new value needs a reason tied to hierarchy or
  density, not because the default spacing felt ordinary.
- Keep states distinguishable without color alone, especially for call, auth, error, and provider
  status surfaces.

## Composition

- Give each page one dominant task and one clear visual anchor.
- Use asymmetry, controlled whitespace, section rhythm, or a strong editorial header where it
  improves orientation; do not make every section a bordered card.
- Make important information visually loud and supporting metadata quiet.
- Treat loading, empty, error, and success states as designed compositions, not afterthoughts.
- Use icons consistently from the existing icon system and pair them with labels when meaning is
  not universally obvious.

## Motion And Responsive Design

- Use motion to explain entrance, hierarchy, progress, or state change. Keep it short and avoid
  animating every hover or element on page load.
- Provide reduced-motion behavior and never hide essential information behind animation.
- Design the smallest viewport first for content priority, then add composition at wider sizes.
  Preserve touch targets, readable line lengths, and usable zoom behavior.

## Visual QA

Review the rendered page at narrow, standard, and wide widths before handoff. Check hierarchy,
contrast, focus, overflow, loading and error states, and whether repeated patterns feel intentional
rather than cloned. Use screenshots or a browser inspection when visual differences are hard to
reason about, then validate with the existing frontend build and tests.
