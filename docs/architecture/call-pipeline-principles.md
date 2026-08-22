# Call Pipeline Principles

## Goal

Build a runtime that can support telephony and voice orchestration without coupling product behavior to one specific vendor or one fixed audio architecture.

## Primary runtime choice

- LiveKit is the primary media and telephony runtime for v1
- Voice owns the canonical runtime configuration model above the runtime SDK

## Product-level pipeline modes

The platform should support these modes through one internal contract:

- `realtime_s2s`
- `stt_llm_tts`
- `stt_realtime`
- `text_llm_tts`

## Runtime layers

### Transport layer

- telephony ingress and egress
- room/session lifecycle
- SIP and phone routing hooks
- recording hooks

### Turn management layer

- VAD abstraction
- endpointing policy
- interruption policy
- false interruption recovery policy

### Reasoning layer

- single-agent execution
- router-agent execution
- handoff to specialist agent
- tool execution and tool result shaping

### Speech layer

- STT adapter
- TTS adapter
- speech-to-speech realtime adapter

### Safety and policy layer

- redaction hooks
- allowed tool boundaries
- guardrail policy checks
- escalation policy

## Canonical adapter model

Every provider adapter should declare:

- provider kind
- supported modalities
- supports streaming input
- supports streaming output
- supports partial transcripts
- supports server-side VAD
- supports interruption recovery
- vendor-specific limits

## State model

### Call state

- created
- dialing
- ringing
- connecting
- active
- transferring
- wrapup
- completed
- failed
- canceled

### Conversation state

- listening
- thinking
- speaking
- interrupted
- waiting_tool
- handoff_pending
- paused

## Handoff principles

1. Agent handoff is not the same as telephony transfer.
2. Agent handoff changes which workflow brain is in control.
3. Telephony transfer changes where the call media is routed.
4. Both should be recorded as explicit events with summaries and outcomes.

## Local-first development principles

- start with local media simulation and seeded demo flows
- allow fake providers and no-cost local stubs for non-critical dependencies
- keep a deterministic test mode for state transitions and handoff logic

## What we should avoid

- embedding vendor conditionals all over business logic
- making provider SDK objects the domain model
- treating agent workflow definitions as unversioned mutable state
