# Voice Demo Scope

## Purpose

The current milestone is a browser-first operator console for validating a saved voice agent over a real LiveKit WebRTC session. Telephony is intentionally out of scope for this demo; the browser microphone and agent audio are the product proof point.

## Demo acceptance criteria

- Sign in with a seeded demo account and land on a hydrated dashboard.
- Create or select an agent with STT, LLM, and TTS provider accounts bound by reference.
- Join a browser LiveKit room only after a server-side session record and dispatch are prepared.
- Show microphone publication, agent participation, remote audio playback, and final transcript turns as distinct states.
- Recover from browser autoplay or microphone permission blocks with an explicit user action.
- Finalize the test call on user end, remote disconnect, failed join, or page teardown without exposing provider secrets.
- Review the persisted test record from the Live console and Call logs.

## Deliberate prototype boundaries

- Webhooks currently simulate delivery history and are labeled as prototype behavior.
- Knowledge, tools, guardrails, analytics, and telephony navigation remain roadmap surfaces until their backend contracts and acceptance tests exist.
- Evaluation suites support the documented execution mode only; provider-backed live evaluation requires the jobs/Temporal implementation to be enabled.

## Source of truth

The product PRD remains in Notion and execution tasks remain in Linear. Link the approved PRD and Linear project here before treating this document as a replacement for those systems.

## Technical proof points

- Browser tokens can publish microphone audio and subscribe to room audio, but cannot publish arbitrary data.
- Provider credentials are encrypted at rest and are sent only through the authenticated backend-to-pipeline-to-LiveKit worker handoff.
- Route hydration uses a shared loading/error surface and rejects stale workspace responses.
- `make review-end-2-end` is the release gate for local verification and the Playwright stakeholder flow.
