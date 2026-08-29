# Pipeline Layer Guidelines

Use this when writing code in `pipeline`.

## Goal

Build a realtime runtime that stays extensible across telephony, STT, LLM, TTS, and future speech architectures.

## Structure

- `domain` for canonical pipeline config and state machines
- `application` for orchestration and handoff policy
- `infrastructure` for LiveKit and provider adapters
- `interfaces` for worker entrypoints and telephony hooks

## Rules

1. Keep Voice domain contracts above runtime SDK contracts.
2. Model call state and conversation state explicitly.
3. Normalize provider capabilities instead of branching ad hoc across the codebase.
4. Separate agent handoff from telephony transfer.
5. Keep interruption, VAD, and endpointing policies configurable.
6. Treat the normalized workflow graph as the runtime source of truth: evaluate state transitions
   explicitly and make `end_call` terminal.
7. When a terminal state is reached, generate and play one closing response, then terminate without
   waiting for another caller turn.
8. Accept per-session variables only after boundary validation; do not log variable values when they
   could contain personal or sensitive data.
9. Preserve transition conditions in the runtime graph, require transition evidence from the model,
   and enforce a bounded transition budget for valid clarification cycles.

## Avoid

- vendor-specific conditionals spread through orchestration code
- mutable workflow definitions without version tracking
- hidden side effects during state transitions
