# LiveKit Pipeline Foundation

This document records the initial generic pipeline contract for Voice.

The intent is to keep product behavior above any single provider SDK while still
choosing LiveKit as the transport and worker runtime for v1.

## What the current scaffold covers

- canonical pipeline modes:
  - `realtime_s2s`
  - `stt_llm_tts`
  - `stt_realtime`
  - `text_llm_tts`
- explicit call state and conversation state enums
- provider capability registry for telephony, STT, LLM, TTS, realtime, and VAD
- runtime plan compilation from a generic agent blueprint
- explicit separation between:
  - agent handoff
  - telephony transfer
- LiveKit runtime description with local-first startup modes:
  - `console`
  - `connect`
  - `dispatch`
- client-supplied WebRTC session manifests for the first browser voice flow
- initial provider-backed three-layer path:
  - Deepgram STT
  - OpenAI Responses LLM
  - Cartesia TTS
  - Silero VAD
- variable-aware workflow prompts with per-call values validated before dispatch
- a canonical `End call` terminal state that plays one closing note and terminates

## Why this shape

1. Product configuration should not become a thin wrapper over one SDK.
2. We need to support single-layer, two-layer, and three-layer speech architectures.
3. We need deterministic local validation before real telephony and vendor credentials exist.
4. We need one internal planning model that can later back UI configuration and database persistence.

## Current code path

- `pipeline/src/voice_pipeline/domain` owns the canonical runtime model
- `pipeline/src/voice_pipeline/application/planner.py` compiles a blueprint into a validated runtime plan
- `pipeline/src/voice_pipeline/application/session_manifest.py` converts client session config into dispatch metadata and a validated runtime plan
- `pipeline/src/voice_pipeline/infrastructure/provider_registry.py` holds the initial WebRTC capability catalog
- `pipeline/src/voice_pipeline/infrastructure/livekit_providers.py` builds concrete Deepgram, OpenAI, Cartesia, and Silero runtime objects
- `pipeline/src/voice_pipeline/infrastructure/livekit_runtime.py` translates the generic plan into a LiveKit-oriented runtime descriptor
- `pipeline/src/voice_pipeline/interfaces/livekit/worker.py` is the worker bootstrap boundary
- `pipeline/src/voice_pipeline/app.py` exposes health, readiness, provider catalog, runtime inspection, and WebRTC session manifest generation
- `backend/src/voice_backend/services/agent_config.py` normalizes state graphs, adds a terminal
  node, and closes leaf states without permitting terminal outgoing edges

## Local-first expectation

- `console` startup mode is the default so the pipeline can be exercised without remote LiveKit credentials
- `connect` and `dispatch` modes become available through env configuration
- the worker can be driven from explicit job metadata without persisting provider secrets in repo config
- browser-facing session config is validated before the worker starts

## What this does not do yet

- implement telephony trunks, dispatch rules, or SIP lifecycle hooks
- run post-call jobs or transcript persistence
- evaluate transition requests inside the worker; v1 passes each configured natural-language
  condition to the agent, accepts only configured edges, requires transition evidence, and
  applies a bounded transition budget

## Workflow Prompt Contract

- The shared system prompt is for persona, tone, safety, and global guardrails.
- The opening message and every state prompt may reference a declared variable using
  `{{variable_key}}`.
- Variable definitions are stored in the agent routing configuration with a stable snake_case key,
  label, data type, required flag, optional default, and enum options where applicable.
- Live calls validate and normalize values before a room is dispatched. Unknown keys and missing
  required values fail with a client-visible validation error.
- Evaluation cases should store their own variable values under `scenario.variables`; the same
  agent definition is reused while each case supplies its own inputs.
- A state graph always contains one canonical `end_call` node. Leaf states are wired to it, and it
  has no outgoing transitions. The runtime generates and plays one closing note when the terminal
  node is reached, then terminates without waiting for another caller turn. A direct `end_call`
  action remains available as an idempotent fallback.

## Next implementation steps

1. add deterministic state evaluation and transition telemetry inside the worker
2. persist call state, conversation events, and handoff events through the backend
3. add telephony adapters and dispatch rules without changing the workflow contract
4. add provider-backed evaluation execution using the same variable and terminal contracts
