# Text Chat Test Mode

## Purpose

Text Chat is a testing-only execution mode exposed in the Live Test page and evaluation suite runs. It exercises the saved agent version, prompt, variables, LLM, workflow state, transitions, and persisted evidence without using STT, TTS, microphone capture, or LiveKit media.

It does not replace Live Voice testing. Audio quality, endpointing, VAD, interruption handling, TTS playback, WebRTC, and room cleanup remain covered only by the Live Voice mode.

## Runtime Contract

The backend creates a test call with `execution_mode: text_chat` and freezes the selected agent version, rendered variables, workflow, prompt, and LLM configuration. Provider credentials remain encrypted in provider accounts and are resolved only on the server for the LLM request.

The opening message is rendered directly from the agent configuration. Each user message is sent to the server, where the same prompt/workflow context is assembled and the LLM response is persisted as a transcript turn. Workflow transitions are accepted only when the returned target is a configured outgoing edge from the current state.

Text sessions are stored as test calls, so the existing call evidence and evaluation history can inspect their transcript, event log, state transitions, and latency metrics without adding a separate chat data model.

## Evaluation Modes

- `scripted_text`: existing deterministic simulation for fast fixture-style checks.
- `text_chat`: live LLM-backed text execution using the saved agent configuration.
- `live_audio`: full LiveKit evaluation with the audio pipeline.

Text chat cases use the caller inputs in `scenario.turns[*].user` or the case `initial_utterance`. Audio-only metrics are not applicable to text chat runs and must not be interpreted as voice coverage.

## Semantic LLM Judge

`text_chat` and `live_audio` evaluation runs use a semantic LLM judge by default when the completed case has assistant output. The judge reuses the agent version's configured LLM provider account and model, so equivalent answers are not rejected just because they do not contain an exact keyword. The request is made once per completed testcase.

Deterministic checks remain authoritative for hard requirements such as outcomes, state transitions, tool calls, variables, guardrails, maximum turns, and critical assertions. Non-critical `contains`, `not_contains`, and `regex` assertions may be interpreted semantically by the judge. If the judge is unavailable or returns invalid output, evaluation safely falls back to the deterministic result.

Suites may override the default judge through `execution_defaults` when creating a suite or suite version:

```json
{
  "semantic_judge": {
    "enabled": true,
    "model": "gpt-4.1-mini",
    "providerAccountId": "provider-account-id",
    "threshold": 0.7,
    "priorityTier": "standard"
  }
}
```

`providerAccountId` must reference an encrypted LLM provider account. API keys and provider secrets are never accepted in suite configuration, persisted in evaluation evidence, or sent to the frontend. Run details show the judge score, explanation, model, and judge metadata without exposing credentials.

## Verification Notes

- Backend service and evaluation tests cover session creation, LLM response parsing, transcript persistence, and secret isolation.
- Frontend tests cover switching from Live Voice to Chat Test and starting a text session.
- Manual review is still required with a configured LLM account to validate provider-specific Responses API behavior and workflow transition prompts.
