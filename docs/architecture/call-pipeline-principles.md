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

The v1 LiveKit turn policy uses a layered strategy rather than a single threshold:

1. Deepgram streaming endpoint signals provide the primary user-turn boundary.
2. Dynamic endpointing adapts the pause window between configured minimum and maximum delays.
3. Local VAD is the default interruption path for predictable response latency. LiveKit adaptive
   interruption detection remains available as an explicit opt-in when a deployment needs stronger
   barge-in classification.
4. Minimum interruption duration and word gates suppress short noise and acknowledgements.
5. False interruptions resume the paused agent after a bounded silence timeout.
6. Preemptive LLM generation reduces response latency, while preemptive TTS stays disabled by
   default so an early interruption does not waste audio generation.
7. Browser live sessions use the turn-aware Deepgram Flux websocket stream. Legacy Nova profiles
   are upgraded at the browser boundary and receive an 800 ms utterance boundary so an old saved
   profile cannot silently reintroduce buffered turn detection.
8. The LLM uses the OpenAI Responses websocket and Cartesia uses its pooled websocket stream with
   sentence pacing disabled. Provider metrics must expose whether streaming is active.

The browser voice path has a two-second response-start target. Its default budget is a 350 ms VAD
silence window, an 800 ms Deepgram Flux end-of-turn timeout, a 250-1200 ms LiveKit endpointing
window, and a bounded 240-token voice response. These are latency guardrails rather than a promise
that an external provider can never exceed the target. The worker emits redacted structured timing
events for EOU, STT, LLM first-token, and TTS first-byte measurements so provider or network
regressions can be isolated from turn-taking delay.

## Latency diagnosis

The live console records end-of-turn, transcript finalization, LLM first-token, TTS first-audio,
and response-start timings. A slow turn should be diagnosed in this order:

1. Transcript finalization or end-of-turn above the configured budget means the STT stream or turn
   boundary is the bottleneck.
2. LLM first-token above the budget means prompt size, model selection, provider queueing, or a
   websocket reconnect is the bottleneck.
3. Multiple LLM timings for one speech ID indicate tool follow-up generation; keep tool prompts
   short and avoid transitions that do not change the workflow state.
4. TTS first-audio above the budget means the streaming TTS connection is not warm or is buffering
   text before synthesis.

The worker publishes a redacted `transport.streaming_ready` event and the measured response-start
metric to the browser over the `voice_runtime` room topic. VAD heartbeat metrics remain visible in
memory but are not persisted individually, preventing observability writes from adding database
traffic to an active call.

Endpointing has two explicit modes. `fixed` applies `endpointing_ms` as the exact post-speech
pause. `dynamic` uses `min_endpointing_ms`, `max_endpointing_ms`, and `endpointing_alpha` so the
runtime can adapt the pause from recent turn history; `endpointing_ms` remains the fixed-mode
value and is not silently treated as a dynamic target. Interruption sensitivity is a preset for
the default gates: low requires a longer utterance and two words, balanced uses the standard
threshold, and high accepts a shorter, single-word barge-in. Explicit non-default duration or word
values override the preset.

Every layer is controlled by the canonical `TurnPolicy` and is applied identically to the
production worker and provider-backed evaluation caller. State changes, overlap decisions, and
false-interruption recovery are logged as structured runtime events. The policy is configurable
through `VOICE_PIPELINE_*` environment variables and must be tuned from call evidence, not by
silently weakening evaluation assertions.

Provider-backed evaluation callers convert caller-side TTS or runtime failures into an explicit
`caller_runtime_error` outcome and evidence record. They must not silently wait until the case
timeout, because that obscures whether a failure came from turn-taking or the evaluator runtime.

Session teardown is bounded and uses the LiveKit async close contract. Speech playout, runtime
event publication, and session close must not hold a call open indefinitely; cancellation paths
must await their tasks and log failures. Live evaluation suites should include intentional
barge-in, short backchannel, false-interruption recovery, and terminal-overlap cases in addition
to business-flow assertions.

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
