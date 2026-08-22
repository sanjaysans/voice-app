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

## Local-first expectation

- `console` startup mode is the default so the pipeline can be exercised without remote LiveKit credentials
- `connect` and `dispatch` modes become available through env configuration
- the worker can be driven from explicit job metadata without persisting provider secrets in repo config
- browser-facing session config is validated before the worker starts

## What this does not do yet

- model persisted agent graphs from the database
- implement telephony trunks, dispatch rules, or SIP lifecycle hooks
- run post-call jobs or transcript persistence
- mint browser tokens or expose the actual WebRTC frontend

## Next implementation steps

1. add backend endpoints to mint browser session tokens and dispatch this manifest into LiveKit
2. connect prompt, tools, and routing graph loading to backend-managed agent configuration
3. persist call state, conversation events, and handoff events through the backend
4. add deterministic simulation tests for interruption and handoff behavior
5. add the browser WebRTC client that uses this manifest flow end to end
