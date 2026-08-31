# Repo Skills

These are repo-local playbooks for how Voice work should be executed.

- `prd-intake` — normalize a PRD into actionable build context
- `linear-task-shaping` — turn PRD scope into good Linear issues
- `plan-review-loop` — draft, critique, revise, and approve implementation plans
- `implementation-gate` — define the pre-merge validation bar
- `backend-bootstrap-planning` — guide early backend, migrator, pipeline, and jobs decisions
- `local-first-development` — keep setup, reset, seed, and debug flows simple
- `architecture-review` — review foundational service and schema decisions before implementation
- `change-review-gate` — require a senior SDE plus tech-architect review before completion
- `review-end-2-end` — run the full multi-agent repo review roster plus developer-fix loop
- `frontend-ui-guidelines` — enforce shared dropdowns, loading states, and double-click protection
- `backend-layer-guidelines` — enforce clean boundaries in the control plane
- `pipeline-layer-guidelines` — enforce extensible realtime runtime design
- `jobs-layer-guidelines` — enforce durable async workflow patterns
- `migrator-layer-guidelines` — enforce safe schema and seed evolution
- `diagnosing-bugs` — require a tight, red-capable loop for bugs and performance regressions
- `tdd` — drive fixes and features through behavior-focused red-green-refactor slices
- `codebase-design` — provide shared vocabulary for deep modules, seams, adapters, and locality
- `research` — capture vendor and technical findings from high-trust primary sources
- `writing-for-agents` — keep skills, agent guidance, and linked docs predictable for future agents
- `frontend-architecture` — structure Next.js routes, modules, data flows, and client/server boundaries
- `frontend-quality` — enforce reliable async states, accessibility, responsiveness, and frontend tests
- `frontend-visual-system` — create distinctive tokenized themes, typography, composition, and motion

## Integration Rules

The added engineering skills are supporting disciplines, not replacements for the Voice workflow:

- `review-end-2-end` remains the top-level multi-agent audit and fix-loop orchestrator.
- `diagnosing-bugs` is the default method for LiveKit, audio, latency, and performance regressions.
- `tdd` is used by developer-resolver agents at agreed public seams before applying fixes.
- `codebase-design` is shared vocabulary for architecture, backend, frontend, and LiveKit reviews.
- `research` is used for vendor/API questions and writes findings under `docs/research/` when a durable note is needed.
- `writing-for-agents` applies when maintaining `AGENTS.md`, skills, reviewer charters, or agent-facing docs.

The existing PRD, Linear, implementation, architecture, and layer-specific skills remain authoritative for Voice-specific process and design rules.
