"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Room, RoomEvent, Track, type Participant, type TrackPublication, type TranscriptionSegment } from "livekit-client";
import {
  Bot,
  CheckCircle2,
  Gauge,
  CircleAlert,
  Mic,
  PhoneOff,
  Radio,
  RefreshCw,
  UserRound,
  Volume2,
} from "lucide-react";
import { Badge, Button, Card, EmptyState, Input, PageHeader, Select } from "@/components/ui";
import { TextChatTest } from "@/components/text-chat-test";
import {
  createBrowserRtcSession,
  updateLiveTestSession,
  type LiveTestSessionRecord,
  type LiveTestSessionUpdatePayload,
} from "@/lib/live-session";
import { useMockApp } from "@/lib/mock-app";
import { getProviderLabel, parsePhoneNumbers } from "@/lib/voice-stack";

type SessionStatus =
  | "idle"
  | "preparing"
  | "connecting"
  | "connected"
  | "reconnecting"
  | "stalled"
  | "error";

type JoinDetails = {
  roomName: string;
  participantIdentity: string;
  participantName: string;
  dispatchId: string;
};

type TranscriptTurn = {
  speaker: string;
  timestamp: string;
  text: string;
};

type ParticipantActivity = "you" | "agent" | null;
type LiveTestMode = "voice" | "chat";

type ParticipantConnectionTone = "neutral" | "warning" | "success";

type PersistedEvent = NonNullable<LiveTestSessionUpdatePayload["append_events"]>[number];

type RuntimeEvent = PersistedEvent & {
  source: "browser" | "worker";
};

type RuntimeMetric = RuntimeEvent & {
  payload: Record<string, unknown>;
};

function statusTone(status: SessionStatus) {
  switch (status) {
    case "connected":
      return "success";
    case "error":
      return "danger";
    case "preparing":
    case "connecting":
    case "reconnecting":
    case "stalled":
      return "warning";
    default:
      return "neutral";
  }
}

function statusLabel(status: SessionStatus) {
  switch (status) {
    case "preparing":
      return "Preparing";
    case "connecting":
      return "Connecting";
    case "connected":
      return "Connected";
    case "reconnecting":
      return "Reconnecting";
    case "stalled":
      return "Waiting for agent";
    case "error":
      return "Needs attention";
    default:
      return "Ready";
  }
}

function hasSavedCredential(account: { configKeys?: string[] } | undefined) {
  const keys = account?.configKeys ?? [];
  return keys.includes("api_key") || keys.includes("api_key_ref");
}

function nowLabel() {
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
  }).format(new Date());
}

function formatClockOffset(startedAt: string | null) {
  if (!startedAt) {
    return nowLabel();
  }
  const elapsedSeconds = Math.max(
    0,
    Math.floor((Date.now() - new Date(startedAt).getTime()) / 1000)
  );
  const minutes = Math.floor(elapsedSeconds / 60)
    .toString()
    .padStart(2, "0");
  const seconds = (elapsedSeconds % 60).toString().padStart(2, "0");
  return `${minutes}:${seconds}`;
}

function formatDuration(startedAt: string | null, endedAt?: string) {
  if (!startedAt) {
    return "00:00";
  }
  const endTime = endedAt ? new Date(endedAt).getTime() : Date.now();
  const elapsedSeconds = Math.max(0, Math.floor((endTime - new Date(startedAt).getTime()) / 1000));
  const minutes = Math.floor(elapsedSeconds / 60)
    .toString()
    .padStart(2, "0");
  const seconds = (elapsedSeconds % 60).toString().padStart(2, "0");
  return `${minutes}:${seconds}`;
}

function formatRuntimeValue(value: unknown, field?: string) {
  if (typeof value === "number") {
    const isSeconds = Boolean(
      field && ["delay", "ttft", "ttfb", "duration", "latency", "time"].some((part) => field.includes(part))
    );
    return isSeconds ? `${value.toFixed(2)}s` : String(value);
  }
  if (typeof value === "boolean") {
    return value ? "yes" : "no";
  }
  return value === null || value === undefined ? "-" : String(value);
}

function runtimeEventMessage(eventType: string, payload: Record<string, unknown>) {
  if (eventType === "turn.metrics") {
    return `${String(payload.label || payload.metric_type || "Provider")} timing recorded`;
  }
  if (eventType === "turn.stt_final") {
    return `STT finalized${payload.characters ? ` (${payload.characters} chars)` : ""}`;
  }
  if (eventType.endsWith("user_state_changed")) {
    return `User state: ${String(payload.new_state || "changed")}`;
  }
  if (eventType.endsWith("agent_state_changed")) {
    return `Agent state: ${String(payload.new_state || "changed")}`;
  }
  if (eventType === "turn.overlapping_speech") {
    return payload.is_interruption ? "Interruption detected" : "Overlapping speech observed";
  }
  if (eventType === "turn.false_interruption") {
    return payload.resumed ? "False interruption recovered" : "False interruption detected";
  }
  return eventType.replaceAll(".", " ");
}

function buildWaveBars(active: boolean) {
  const idleHeights = [12, 18, 14, 22, 12, 16, 10, 20, 14, 18];
  const activeHeights = [20, 34, 24, 42, 18, 30, 20, 38, 24, 32];
  const heights = active ? activeHeights : idleHeights;

  return (
    <div className="flex h-14 items-end gap-1.5">
      {heights.map((height, index) => (
        <span
          key={`${height}-${index}`}
          className={`w-2 rounded-full transition-all duration-300 ${
            active ? "bg-[#8B7FFF]" : "bg-[rgba(102,89,255,0.16)]"
          } ${active ? "animate-pulse" : ""}`}
          style={{ height }}
        />
      ))}
    </div>
  );
}

function ParticipantMeter({
  active,
  icon,
  label,
  sublabel,
  statusLabel,
  statusTone = "neutral",
}: {
  active: boolean;
  icon: "agent" | "you";
  label: string;
  sublabel: string;
  statusLabel: string;
  statusTone?: ParticipantConnectionTone;
}) {
  return (
    <div
      className={`rounded-[24px] border px-5 py-5 transition ${
        active
          ? "border-[rgba(139,127,255,0.36)] bg-[rgba(139,127,255,0.12)]"
          : "border-border bg-[#FCFCFF]"
      }`}
    >
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div
            className={`flex h-11 w-11 items-center justify-center rounded-2xl ${
              active ? "bg-[rgba(139,127,255,0.18)] text-accent" : "bg-[rgba(102,89,255,0.10)] text-accent"
            }`}
          >
            {icon === "agent" ? <Bot size={18} /> : <UserRound size={18} />}
          </div>
          <div>
            <p className="text-sm font-medium text-[#17171F]">{label}</p>
            <p className="mt-1 text-xs text-[#6D6D78]">{sublabel}</p>
          </div>
        </div>
        <Badge tone={active ? "success" : statusTone}>{active ? "Speaking" : statusLabel}</Badge>
      </div>

      <div className="mt-5">{buildWaveBars(active)}</div>
    </div>
  );
}

function PipelineMetrics({ metrics }: { metrics: Record<string, RuntimeMetric> }) {
  const timingRows = [
    { label: "End-of-turn decision", metric: "eou_metrics", field: "end_of_utterance_delay" },
    { label: "Transcript finalization", metric: "eou_metrics", field: "transcription_delay" },
    { label: "LLM first token", metric: "llm_metrics", field: "ttft" },
    { label: "TTS first audio", metric: "tts_metrics", field: "ttfb" },
    { label: "Response start", metric: "response_latency", field: "latency_seconds" },
  ];
  const metricCount = Object.keys(metrics).length;

  return (
    <div className="rounded-[24px] border border-border bg-white p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[rgba(102,89,255,0.12)] text-accent">
            <Gauge size={18} />
          </div>
          <div>
            <h3 className="text-base font-semibold text-[#17171F]">Pipeline metrics</h3>
            <p className="mt-1 text-sm text-[#6D6D78]">Latest timings received from the worker.</p>
          </div>
        </div>
        <Badge tone={metricCount ? "success" : "neutral"}>{metricCount} layers</Badge>
      </div>

      <div className="mt-5 grid gap-2 sm:grid-cols-2">
        {timingRows.map((row) => {
          const metric = metrics[row.metric];
          return (
            <div className="rounded-2xl border border-border bg-[#FAFAFD] px-3 py-3" key={row.label}>
              <p className="text-[10px] uppercase tracking-[0.14em] text-[#8F8FA3]">{row.label}</p>
              <p className="mt-1 text-sm font-semibold text-[#17171F]">
                {formatRuntimeValue(metric?.payload[row.field], row.field)}
              </p>
            </div>
          );
        })}
      </div>

      {metricCount ? (
        <div className="mt-4 space-y-2 border-t border-border pt-4">
          {Object.entries(metrics).map(([metricType, event]) => (
            <div className="flex items-center justify-between gap-3 text-xs" key={metricType}>
              <span className="font-medium text-[#4B4B59]">
                {formatRuntimeValue(event.payload.label || metricType)}
              </span>
              <span className="text-[#8F8FA3]">{event.occurred_at ? new Date(event.occurred_at).toLocaleTimeString() : "-"}</span>
            </div>
          ))}
        </div>
      ) : (
        <div className="mt-4 rounded-2xl border border-dashed border-border bg-[#FCFCFF] px-4 py-4 text-center text-sm text-[#6D6D78]">
          Worker metrics will appear after the first turn.
        </div>
      )}
    </div>
  );
}

export default function LivePage() {
  const {
    tenantSlug,
    workspaceId,
    currentUser,
    agents,
    selectedAgent,
    selectedAgentId,
    selectAgent,
    providerAccounts,
  } = useMockApp();
  const [status, setStatus] = useState<SessionStatus>("idle");
  const [testMode, setTestMode] = useState<LiveTestMode>("voice");
  const [error, setError] = useState("");
  const [details, setDetails] = useState<JoinDetails | null>(null);
  const [events, setEvents] = useState<RuntimeEvent[]>([]);
  const [latestMetrics, setLatestMetrics] = useState<Record<string, RuntimeMetric>>({});
  const [transcript, setTranscript] = useState<TranscriptTurn[]>([]);
  const [sessionRecord, setSessionRecord] = useState<LiveTestSessionRecord | null>(null);
  const [activeSpeaker, setActiveSpeaker] = useState<ParticipantActivity>(null);
  const [microphonePublished, setMicrophonePublished] = useState(false);
  const [agentParticipantConnected, setAgentParticipantConnected] = useState(false);
  const [remoteAudioSubscribed, setRemoteAudioSubscribed] = useState(false);
  const [audioPlaybackBlocked, setAudioPlaybackBlocked] = useState(false);
  const [isEnding, setIsEnding] = useState(false);
  const [variableInputs, setVariableInputs] = useState<Record<string, string>>({});
  const [, setClockTick] = useState(0);

  const audioHostRef = useRef<HTMLDivElement | null>(null);
  const roomRef = useRef<Room | null>(null);
  const persistTimerRef = useRef<number | null>(null);
  const speakerTimerRef = useRef<number | null>(null);
  const stallTimerRef = useRef<number | null>(null);
  const callIdRef = useRef<string | null>(null);
  const startedAtRef = useRef<string | null>(null);
  const transcriptRef = useRef<TranscriptTurn[]>([]);
  const transcriptDirtyRef = useRef(false);
  const pendingEventsRef = useRef<PersistedEvent[]>([]);
  const latestMetricsRef = useRef<Record<string, RuntimeMetric>>({});
  const persistChainRef = useRef(Promise.resolve());
  const finalizedRef = useRef(false);
  const manualDisconnectRef = useRef(false);
  const disconnectingRef = useRef(false);
  const detailsRef = useRef<JoinDetails | null>(null);
  const eventCountRef = useRef(0);
  const statusRef = useRef<SessionStatus>("idle");
  const agentNameRef = useRef("");

  const isConnecting = status === "preparing" || status === "connecting";
  const isLive = status === "connected" || status === "reconnecting" || status === "stalled";

  const sttAccount = providerAccounts.find(
    (account) => account.id === selectedAgent?.runtimeProfile.stt.providerAccountId
  );
  const llmAccount = providerAccounts.find(
    (account) => account.id === selectedAgent?.runtimeProfile.llm.providerAccountId
  );
  const ttsAccount = providerAccounts.find(
    (account) => account.id === selectedAgent?.runtimeProfile.tts.providerAccountId
  );
  const telephonyAccount = providerAccounts.find(
    (account) => account.id === selectedAgent?.runtimeProfile.telephony.providerAccountId
  );
  const selectedPhoneNumber = selectedAgent?.runtimeProfile.telephony.phoneNumber || "";
  const vendorTrace = selectedAgent
    ? `${selectedAgent.stack.stt} -> ${selectedAgent.stack.llm} -> ${selectedAgent.stack.tts}`
    : "";
  const effectiveDuration = formatDuration(startedAtRef.current, sessionRecord?.ended_at || undefined);
  const localParticipantStatus =
    activeSpeaker === "you"
      ? { label: "Speaking", tone: "success" as const }
      : microphonePublished
        ? { label: "Mic live", tone: "success" as const }
        : status === "connected"
          ? { label: "Connected", tone: "success" as const }
          : status === "connecting" || status === "preparing"
            ? { label: "Connecting", tone: "warning" as const }
            : { label: "Waiting", tone: "neutral" as const };
  const agentParticipantStatus =
    activeSpeaker === "agent"
      ? { label: "Speaking", tone: "success" as const }
      : remoteAudioSubscribed
        ? { label: "Audio live", tone: "success" as const }
        : agentParticipantConnected
          ? { label: "Connected", tone: "success" as const }
          : status === "connecting" || status === "preparing"
            ? { label: "Joining", tone: "warning" as const }
            : { label: "Waiting", tone: "neutral" as const };

  useEffect(() => {
    statusRef.current = status;
  }, [status]);

  useEffect(() => {
    agentNameRef.current = selectedAgent?.name || "";
  }, [selectedAgent?.name]);

  useEffect(() => {
    setVariableInputs(
      Object.fromEntries(
        (selectedAgent?.variables ?? []).map((variable) => [
          variable.key,
          variable.defaultValue === undefined ? "" : String(variable.defaultValue),
        ])
      )
    );
  }, [selectedAgentId, selectedAgent?.variables]);

  useEffect(() => {
    if (status !== "connected") {
      return;
    }

    const timer = window.setInterval(() => {
      setClockTick((current) => current + 1);
    }, 1000);

    return () => {
      window.clearInterval(timer);
    };
  }, [status]);

  const readinessItems = useMemo(
    () => [
      {
        label: "STT",
        ready: hasSavedCredential(sttAccount),
        detail: sttAccount
          ? `${getProviderLabel("stt", sttAccount.vendorName)} connected`
          : "Bind an STT connection in agent runtime",
      },
      {
        label: "LLM",
        ready: hasSavedCredential(llmAccount),
        detail: llmAccount
          ? `${getProviderLabel("llm", llmAccount.vendorName)} connected`
          : "Bind an LLM connection in agent runtime",
      },
      {
        label: "TTS",
        ready: hasSavedCredential(ttsAccount),
        detail: ttsAccount
          ? `${getProviderLabel("tts", ttsAccount.vendorName)} connected`
          : "Bind a TTS connection in agent runtime",
      },
      {
        label: "Telephony",
        ready: Boolean(!telephonyAccount || selectedPhoneNumber),
        detail: telephonyAccount
          ? selectedPhoneNumber || "Select a launch number in agent runtime"
          : "Optional for browser live",
      },
    ],
    [llmAccount, selectedPhoneNumber, sttAccount, telephonyAccount, ttsAccount]
  );

  function pulseSpeaker(nextSpeaker: ParticipantActivity) {
    setActiveSpeaker(nextSpeaker);
    if (speakerTimerRef.current) {
      window.clearTimeout(speakerTimerRef.current);
    }
    speakerTimerRef.current = window.setTimeout(() => {
      setActiveSpeaker(null);
    }, 1400);
  }

  function buildMetrics(endedAt?: string) {
    return {
      room_name: detailsRef.current?.roomName || "",
      dispatch_id: detailsRef.current?.dispatchId || "",
      duration: formatDuration(startedAtRef.current, endedAt),
      transcript_turns: transcriptRef.current.length,
      event_count: eventCountRef.current,
      transport: "livekit",
      stt_vendor: sttAccount?.vendorName || "",
      llm_vendor: llmAccount?.vendorName || "",
      tts_vendor: ttsAccount?.vendorName || "",
      sample_rate: selectedAgent?.runtimeProfile.workflow.sampleRate || 24000,
      runtime_metrics: Object.fromEntries(
        Object.entries(latestMetricsRef.current).map(([metricType, event]) => [metricType, event.payload])
      ),
    };
  }

  function resetLiveState() {
    setError("");
    setDetails(null);
    setEvents([]);
    setLatestMetrics({});
    setTranscript([]);
    setSessionRecord(null);
    setActiveSpeaker(null);
    setMicrophonePublished(false);
    setAgentParticipantConnected(false);
    setRemoteAudioSubscribed(false);
    setAudioPlaybackBlocked(false);
    eventCountRef.current = 0;
    detailsRef.current = null;
    callIdRef.current = null;
    startedAtRef.current = null;
    transcriptRef.current = [];
    transcriptDirtyRef.current = false;
    pendingEventsRef.current = [];
    latestMetricsRef.current = {};
    finalizedRef.current = false;
    disconnectingRef.current = false;
    manualDisconnectRef.current = false;
    setIsEnding(false);
    if (speakerTimerRef.current) {
      window.clearTimeout(speakerTimerRef.current);
      speakerTimerRef.current = null;
    }
  }

  async function flushSessionDraft(force = false) {
    const callId = callIdRef.current;
    if (!callId) {
      return;
    }

    const appendEvents = [...pendingEventsRef.current];
    const transcriptDirty = transcriptDirtyRef.current;
    if (!force && !appendEvents.length && !transcriptDirty) {
      return;
    }

    pendingEventsRef.current = [];
    transcriptDirtyRef.current = false;

    const payload: LiveTestSessionUpdatePayload = {
      metrics: buildMetrics(),
    };
    if (appendEvents.length) {
      payload.append_events = appendEvents;
    }
    if (transcriptDirty) {
      payload.transcript = transcriptRef.current;
    }

    try {
      const updated = await updateLiveTestSession(tenantSlug, workspaceId, callId, payload);
      setSessionRecord(updated);
    } catch (persistError) {
      pendingEventsRef.current = [...appendEvents, ...pendingEventsRef.current];
      if (transcriptDirty) {
        transcriptDirtyRef.current = true;
      }
      console.error("live session draft persist failed", persistError);
    }
  }

  function queuePersist(force = false) {
    persistChainRef.current = persistChainRef.current
      .then(() => flushSessionDraft(force))
      .catch((persistError) => {
        console.error("live session persistence queue failed", persistError);
      });
    return persistChainRef.current;
  }

  function schedulePersist() {
    if (!callIdRef.current) {
      return;
    }
    if (persistTimerRef.current) {
      window.clearTimeout(persistTimerRef.current);
    }
    persistTimerRef.current = window.setTimeout(() => {
      void queuePersist();
    }, 450);
  }

  function appendRuntimeEvent(event: RuntimeEvent) {
    const payload = event.payload || {};
    const normalizedEvent: RuntimeEvent = { ...event, payload };
    setEvents((current) => [normalizedEvent, ...current].slice(0, 100));
    eventCountRef.current += 1;

    if (event.event_type === "turn.metrics" && typeof payload.metric_type === "string") {
      const metric = normalizedEvent as RuntimeMetric;
      latestMetricsRef.current = { ...latestMetricsRef.current, [payload.metric_type]: metric };
      setLatestMetrics(latestMetricsRef.current);
    }

    // VAD emits roughly once per second. Keep it visible locally, but do not turn
    // every heartbeat into a database write during a live call.
    if (!(event.event_type === "turn.metrics" && payload.metric_type === "vad_metrics")) {
      pendingEventsRef.current.push({
        event_type: event.event_type,
        message: event.message,
        occurred_at: event.occurred_at,
        payload,
      });
      schedulePersist();
    }
  }

  function pushEvent(message: string, eventType = "runtime", payload: Record<string, unknown> = {}) {
    appendRuntimeEvent({
      event_type: eventType,
      message,
      occurred_at: new Date().toISOString(),
      payload,
      source: "browser",
    });
  }

  function ingestRuntimeData(data: Uint8Array, topic?: string) {
    if (topic && topic !== "voice_runtime") {
      return;
    }
    try {
      const decoded: unknown = JSON.parse(new TextDecoder().decode(data));
      if (!decoded || typeof decoded !== "object" || Array.isArray(decoded)) {
        return;
      }
      const record = decoded as Record<string, unknown>;
      if (typeof record.event_type !== "string") {
        return;
      }
      const { event_type: eventType, message, ...payload } = record;
      appendRuntimeEvent({
        event_type: eventType,
        message: typeof message === "string" ? message : runtimeEventMessage(eventType, payload),
        occurred_at: new Date().toISOString(),
        payload,
        source: "worker",
      });
      if (eventType === "workflow.ended" && roomRef.current && !disconnectingRef.current) {
        void disconnectRoom();
      }
    } catch {
      pushEvent("Received an unreadable runtime event.", "runtime_event_error");
    }
  }

  function appendTranscriptSegments(
    segments: TranscriptionSegment[],
    participant?: Participant,
    publication?: TrackPublication
  ) {
    const finalSegments = segments.filter((segment) => segment.final && segment.text.trim());
    if (!finalSegments.length) {
      return;
    }

    const speaker =
      participant && "identity" in participant && participant.identity === roomRef.current?.localParticipant?.identity
        ? "You"
        : participant?.name || (publication ? selectedAgent?.name || "Voice" : "Voice");

    pulseSpeaker(speaker === "You" ? "you" : "agent");

    setTranscript((current) => {
      const next = [...current];
      finalSegments.forEach((segment) => {
        next.push({
          speaker,
          timestamp: formatClockOffset(startedAtRef.current),
          text: segment.text.trim(),
        });
      });
      transcriptRef.current = next;
      transcriptDirtyRef.current = true;
      return next;
    });
    schedulePersist();
  }

  async function finalizeSession(
    lifecycleStatus: "completed" | "failed" | "cancelled",
    summary: string,
    outcome: string,
    nextStep: string
  ) {
    if (finalizedRef.current || !callIdRef.current) {
      return;
    }
    finalizedRef.current = true;
    if (persistTimerRef.current) {
      window.clearTimeout(persistTimerRef.current);
      persistTimerRef.current = null;
    }

    // Teardown must not wait for the live UI. Persistence remains serialized so
    // the final snapshot is written after any already in-flight draft update.
    await queuePersist(true);

    const endedAt = new Date().toISOString();
    try {
      const updated = await updateLiveTestSession(tenantSlug, workspaceId, callIdRef.current, {
        lifecycle_status: lifecycleStatus,
        display_status: lifecycleStatus === "completed" ? "Completed" : "Dropped",
        summary,
        outcome,
        next_step: nextStep,
        transcript: transcriptRef.current,
        extracted_variables: [],
        tool_calls: [],
        guardrails: [],
        metrics: buildMetrics(endedAt),
        ended_at: endedAt,
      });
      setSessionRecord(updated);
    } catch (persistError) {
      console.error("live session finalization failed", persistError);
    }
  }

  async function disconnectRoom() {
    if (disconnectingRef.current) {
      return;
    }
    disconnectingRef.current = true;
    setIsEnding(true);
    manualDisconnectRef.current = true;
    const room = roomRef.current;
    roomRef.current = null;
    // Stop capture and leave the live branch immediately. Remote persistence
    // and LiveKit cleanup must never keep the microphone open in the browser.
    setStatus("idle");
    setActiveSpeaker(null);
    setMicrophonePublished(false);
    setAgentParticipantConnected(false);
    setRemoteAudioSubscribed(false);
    if (audioHostRef.current) {
      audioHostRef.current.innerHTML = "";
    }
    if (room) {
      await room.localParticipant.setMicrophoneEnabled(false).catch(() => undefined);
      await Promise.race([
        room.disconnect().catch(() => undefined),
        new Promise<void>((resolve) => window.setTimeout(resolve, 1500)),
      ]);
    }
    await finalizeSession(
      "completed",
      `Browser live test completed for ${selectedAgent?.name || "the selected agent"}.`,
      "Test call completed",
      "Review the transcript and runtime events in the Live console."
    );
  }

  function bindRoomEvents(room: Room) {
    room
      .on(RoomEvent.Connected, () => {
        const startedAt = startedAtRef.current || new Date().toISOString();
        startedAtRef.current = startedAt;
        setStatus("connected");
        pushEvent("Connected to LiveKit room.", "room_connected", {
          room_name: detailsRef.current?.roomName || "",
        });
        if (stallTimerRef.current) {
          window.clearTimeout(stallTimerRef.current);
        }
        stallTimerRef.current = window.setTimeout(() => {
          const roomHasRemoteParticipant = room.remoteParticipants.size > 0;
          if (!roomHasRemoteParticipant) {
            setStatus("stalled");
            setError("The room is connected, but the agent has not joined or published audio yet.");
            pushEvent("Waiting for agent audio timed out.", "agent_wait_timeout");
          }
        }, 12000);
        if (callIdRef.current) {
          persistChainRef.current = persistChainRef.current
            .then(async () => {
              if (finalizedRef.current || !callIdRef.current) {
                return;
              }
              const updated = await updateLiveTestSession(tenantSlug, workspaceId, callIdRef.current, {
                lifecycle_status: "in_progress",
                started_at: startedAt,
                metrics: buildMetrics(),
              });
              if (!finalizedRef.current) {
                setSessionRecord(updated);
              }
            })
            .catch((persistError) => console.error("live session start persist failed", persistError));
        }
      })
      .on(RoomEvent.Disconnected, () => {
        if (stallTimerRef.current) {
          window.clearTimeout(stallTimerRef.current);
          stallTimerRef.current = null;
        }
        if (audioHostRef.current) {
          audioHostRef.current.innerHTML = "";
        }
        setStatus("idle");
        setActiveSpeaker(null);
        setMicrophonePublished(false);
        setAgentParticipantConnected(false);
        setRemoteAudioSubscribed(false);
        pushEvent("LiveKit room closed.", "room_disconnected");
        if (!manualDisconnectRef.current) {
          void finalizeSession(
            "cancelled",
            `The browser live test disconnected before completion for ${selectedAgent?.name || "the selected agent"}.`,
            "LiveKit connection closed",
            "Check the browser network and microphone permissions, then rejoin the room."
          );
        }
      })
      .on(RoomEvent.Reconnecting, () => {
        setStatus("reconnecting");
        pushEvent("LiveKit is reconnecting.", "room_reconnecting");
      })
      .on(RoomEvent.Reconnected, () => {
        setStatus("connected");
        setError("");
        pushEvent("LiveKit reconnected.", "room_reconnected");
      })
      .on(RoomEvent.AudioPlaybackStatusChanged, (playing) => {
        setAudioPlaybackBlocked(!playing);
        if (!playing) {
          pushEvent("Browser audio playback needs user interaction.", "audio_playback_blocked");
        }
      })
      .on(RoomEvent.MediaDevicesError, (deviceError) => {
        setError(`Microphone access failed: ${deviceError.message}`);
        pushEvent("Microphone access failed.", "microphone_error");
      })
      .on(RoomEvent.ParticipantConnected, (participant) => {
        if (participant.identity !== room.localParticipant.identity) {
          setAgentParticipantConnected(true);
        }
        pushEvent(`${participant.identity} joined the room.`, "participant_connected", {
          participant_identity: participant.identity,
        });
      })
      .on(RoomEvent.TrackSubscribed, (track, _publication, participant) => {
        if (track.kind !== Track.Kind.Audio || !audioHostRef.current) {
          return;
        }
        setAgentParticipantConnected(true);
        setRemoteAudioSubscribed(true);
        const element = track.attach();
        element.autoplay = true;
        element.className = "hidden";
        audioHostRef.current.appendChild(element);
        void element.play().catch(() => {
          setAudioPlaybackBlocked(true);
          pushEvent("Browser blocked remote audio playback.", "audio_playback_blocked");
        });
        pushEvent(`Remote audio subscribed for ${participant.identity}.`, "audio_subscribed", {
          participant_identity: participant.identity,
        });
      })
      .on(RoomEvent.TrackUnsubscribed, (track) => {
        track.detach().forEach((element) => element.remove());
      })
      .on(RoomEvent.TranscriptionReceived, (segments, participant, publication) => {
        appendTranscriptSegments(segments, participant, publication);
      })
      .on(RoomEvent.DataReceived, (payload, _participant, _kind, topic) => {
        ingestRuntimeData(payload, topic);
      });
  }

  async function enableAudioPlayback() {
    const room = roomRef.current;
    if (!room) {
      return;
    }
    try {
      await room.startAudio();
      setAudioPlaybackBlocked(false);
      setError("");
      pushEvent("Remote audio playback enabled.", "audio_playback_enabled");
    } catch (playbackError) {
      const message = playbackError instanceof Error ? playbackError.message : "Audio playback is still blocked.";
      setError(`${message} Click Enable audio again after interacting with the page.`);
    }
  }

  async function handleConnect() {
    if (!tenantSlug || !workspaceId || !selectedAgent) {
      setStatus("error");
      setError("Select an agent before joining the live room.");
      return;
    }
    if (!hasSavedCredential(sttAccount) || !hasSavedCredential(llmAccount) || !hasSavedCredential(ttsAccount)) {
      setStatus("error");
      setError("Finish the STT, LLM, and TTS connections in the agent runtime before launch.");
      return;
    }

    const missingVariables = (selectedAgent.variables ?? [])
      .filter((variable) => variable.required && !variableInputs[variable.key]?.trim())
      .map((variable) => variable.label);
    if (missingVariables.length) {
      setStatus("error");
      setError(`Enter the required call variables: ${missingVariables.join(", ")}.`);
      return;
    }

    const variables = Object.fromEntries(
      (selectedAgent.variables ?? [])
        .filter((variable) => variableInputs[variable.key]?.trim())
        .map((variable) => [variable.key, variableInputs[variable.key]])
    );

    try {
      if (roomRef.current) {
        await disconnectRoom();
      }
      resetLiveState();
      setStatus("preparing");

      const session = await createBrowserRtcSession(tenantSlug, workspaceId, {
        agent_id: selectedAgent.id,
        participant_name: currentUser?.displayName ?? "Voice User",
        metadata: {
          workspace: workspaceId,
          launched_by: currentUser?.email ?? "voice-user",
          agent_id: selectedAgent.id,
          agent_name: selectedAgent.name,
          vendor_trace: vendorTrace,
          launch_number: selectedPhoneNumber || parsePhoneNumbers(telephonyAccount?.preview.phone_numbers)[0] || "browser-live",
        },
        variables,
      });

      callIdRef.current = session.call_id;
      setDetails({
        roomName: session.room_name,
        participantIdentity: session.participant_identity,
        participantName: session.participant_name,
        dispatchId: session.dispatch_id,
      });
      detailsRef.current = {
        roomName: session.room_name,
        participantIdentity: session.participant_identity,
        participantName: session.participant_name,
        dispatchId: session.dispatch_id,
      };
      pushEvent(`Session prepared for ${selectedAgent.name}.`, "session_prepared", {
        dispatch_id: session.dispatch_id,
        room_name: session.room_name,
      });

      setStatus("connecting");
      const room = new Room();
      roomRef.current = room;
      bindRoomEvents(room);
      await room.connect(session.server_url, session.access_token);
      await room.localParticipant.setMicrophoneEnabled(true);
      setMicrophonePublished(true);
      pulseSpeaker("you");
      pushEvent("Microphone published to the room.", "microphone_published");
    } catch (sessionError) {
      const message =
        sessionError instanceof Error ? sessionError.message : "Failed to start the live room.";
      setStatus("error");
      setError(message);
      pushEvent(message, "session_error");
      const room = roomRef.current;
      roomRef.current = null;
      if (room) {
        manualDisconnectRef.current = true;
        await room.disconnect().catch(() => undefined);
        manualDisconnectRef.current = false;
      }
      await finalizeSession(
        "failed",
        `Browser live test failed for ${selectedAgent?.name || "the selected agent"}.`,
        "Test session failed",
        "Check the provider configuration and room connectivity, then retry."
      );
    }
  }

  useEffect(() => {
    return () => {
      const room = roomRef.current;
      roomRef.current = null;
      if (persistTimerRef.current) {
        window.clearTimeout(persistTimerRef.current);
      }
      if (speakerTimerRef.current) {
        window.clearTimeout(speakerTimerRef.current);
      }
      if (stallTimerRef.current) {
        window.clearTimeout(stallTimerRef.current);
      }
      manualDisconnectRef.current = true;
      if (room) {
        void room.disconnect();
      }
      void finalizeSession(
        statusRef.current === "connected" ? "cancelled" : "failed",
        `Browser live test closed for ${agentNameRef.current || "the selected agent"}.`,
        "Test session closed",
        "Rejoin Live to continue evaluating the workflow."
      );
    };
  }, []);

  if (!agents.length) {
    return (
      <div className="space-y-6">
        <PageHeader
          eyebrow="Operate"
          title="Live"
          description="Launch a configured agent into a real room once the callable stack is connected."
        />
        <EmptyState
          title="No agents available yet"
          description="Create and configure an agent before using the live room."
        />
      </div>
    );
  }

  if (testMode === "chat") {
    return <TextChatTest onModeChange={setTestMode} />;
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        <div className="flex items-center gap-2 rounded-2xl border border-border bg-white p-1" role="tablist" aria-label="Live test mode">
          <button type="button" role="tab" aria-selected={true} className="rounded-xl bg-[rgba(102,89,255,0.12)] px-4 py-2 text-sm font-semibold text-accent">Live voice</button>
          <button type="button" role="tab" aria-selected={false} onClick={() => setTestMode("chat")} className="rounded-xl px-4 py-2 text-sm text-[#6D6D78]">Chat test</button>
        </div>
      </div>
      <PageHeader
        eyebrow="Operate"
        title="Live"
        description="Use Live as the focused browser call console for validating a saved agent against the real STT, LLM, and TTS stack. Every session is stored as a test call."
      />

      {isConnecting ? (
        <Card className="w-full overflow-hidden p-0">
          <div className="border-b border-border bg-[linear-gradient(135deg,rgba(102,89,255,0.12),rgba(139,127,255,0.04))] px-8 py-7">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-accent">Preparing call</p>
                <h2 className="mt-3 text-2xl font-semibold text-[#17171F]">
                  Joining {selectedAgent?.name || "selected agent"}
                </h2>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-[#5B5B68]">
                  Creating the test session, joining the LiveKit room, and publishing your browser microphone.
                </p>
              </div>
              <Badge tone={statusTone(status)}>{statusLabel(status)}</Badge>
            </div>
          </div>

          <div className="px-8 py-10">
            <div className="rounded-[28px] border border-border bg-white px-8 py-10">
              <div className="flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[rgba(139,127,255,0.18)]">
                  <RefreshCw className="animate-spin text-[#B2AAFF]" size={22} />
                </div>
                <div>
                  <p className="text-base font-semibold text-[#17171F]">Connecting your test call</p>
                  <p className="mt-1 text-sm text-[#6D6D78]">
                    {vendorTrace || "Resolving runtime stack"} {details?.roomName ? `· ${details.roomName}` : ""}
                  </p>
                </div>
              </div>

              <div className="mt-8 grid gap-4 md:grid-cols-2">
                <ParticipantMeter
                  active={status === "connecting"}
                  icon="you"
                  label={currentUser?.displayName || "You"}
                  sublabel="Browser microphone"
                  statusLabel={status === "connecting" ? "Connecting" : "Waiting"}
                  statusTone={status === "connecting" ? "warning" : "neutral"}
                />
                <ParticipantMeter
                  active={status === "preparing" || status === "connecting"}
                  icon="agent"
                  label={selectedAgent?.name || "Voice"}
                  sublabel="Agent runtime"
                  statusLabel={status === "preparing" || status === "connecting" ? "Starting" : "Waiting"}
                  statusTone={status === "preparing" || status === "connecting" ? "warning" : "neutral"}
                />
              </div>
            </div>
          </div>
        </Card>
      ) : isLive ? (
        <div className="space-y-6">
          <Card className="p-0">
            <div className="flex flex-col gap-5 border-b border-border px-6 py-5 xl:flex-row xl:items-center xl:justify-between">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone="success">Live test</Badge>
                  <Badge tone={statusTone(status)}>{statusLabel(status)}</Badge>
                  {sessionRecord ? <Badge tone="neutral">Persisted as a test call</Badge> : null}
                </div>
                <h2 className="mt-3 text-2xl font-semibold text-[#17171F]">
                  {selectedAgent?.name || "Selected agent"}
                </h2>
                <p className="mt-2 text-sm leading-6 text-[#6D6D78]">
                  Room {details?.roomName || "pending"} · {vendorTrace || "Vendor stack pending"}
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <div className="rounded-2xl border border-border bg-[#fafafe] px-4 py-3">
                  <p className="text-xs uppercase tracking-[0.16em] text-[#6D6D78]">Duration</p>
                  <p className="mt-1 text-sm font-semibold text-[#17171F]">{effectiveDuration}</p>
                </div>
                <div className="rounded-2xl border border-border bg-[#fafafe] px-4 py-3">
                  <p className="text-xs uppercase tracking-[0.16em] text-[#6D6D78]">Dispatch</p>
                  <p className="mt-1 text-sm font-semibold text-[#17171F]">{details?.dispatchId || "Pending"}</p>
                </div>
              <Button
                variant="secondary"
                loading={isEnding}
                loadingText="Ending call"
                onClick={() => void disconnectRoom()}
              >
                  <PhoneOff size={16} />
                  End call
                </Button>
              </div>
            </div>

            <div className="px-6 py-6">
              {audioPlaybackBlocked ? (
                <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-warning/20 bg-warning/10 px-4 py-3 text-sm text-[#7A4B00]">
                  <div className="flex items-start gap-3">
                    <Volume2 className="mt-0.5 shrink-0" size={16} />
                    <p>Remote audio is connected but browser playback is waiting for your permission.</p>
                  </div>
                  <Button size="sm" onClick={() => void enableAudioPlayback()}>
                    Enable audio
                  </Button>
                </div>
              ) : null}
              {error ? (
                <div className="mb-5 flex items-start gap-3 rounded-2xl border border-danger/20 bg-danger/10 px-4 py-3 text-sm text-danger">
                  <CircleAlert className="mt-0.5 shrink-0" size={16} />
                  <p>{error}</p>
                </div>
              ) : null}
              <div className="rounded-[28px] border border-border bg-[#FAFAFD] p-6">
                <div className="grid gap-4 lg:grid-cols-2">
                  <ParticipantMeter
                    active={activeSpeaker === "you"}
                    icon="you"
                    label={currentUser?.displayName || "You"}
                    sublabel="Local participant"
                    statusLabel={localParticipantStatus.label}
                    statusTone={localParticipantStatus.tone}
                  />
                  <ParticipantMeter
                    active={activeSpeaker === "agent"}
                    icon="agent"
                    label={selectedAgent?.name || "Voice"}
                    sublabel="Agent runtime"
                    statusLabel={agentParticipantStatus.label}
                    statusTone={agentParticipantStatus.tone}
                  />
                </div>

                <div className="mt-6 grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
                  <div className="rounded-[24px] border border-border bg-white p-5">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[rgba(139,127,255,0.18)] text-[#C7C0FF]">
                          <Volume2 size={18} />
                        </div>
                        <div>
                          <h3 className="text-base font-semibold text-[#17171F]">Transcript</h3>
                          <p className="mt-1 text-sm text-[#6D6D78]">
                            Final room transcripts are persisted into the test call record.
                          </p>
                        </div>
                      </div>
                      <Badge tone={transcript.length ? "success" : "neutral"}>{transcript.length} turns</Badge>
                    </div>

                    <div className="mt-5 max-h-[420px] space-y-3 overflow-y-auto pr-1">
                      {transcript.length ? (
                        transcript.map((turn, index) => {
                          const isYou = turn.speaker === "You";

                          return (
                            <div
                              key={`${turn.timestamp}-${index}`}
                              className={`max-w-[88%] rounded-[22px] px-4 py-3 ${
                                isYou
                                  ? "ml-auto bg-[rgba(102,89,255,0.12)] text-[#17171F]"
                                  : "border border-border bg-[#FCFCFF] text-[#4B4B59]"
                              }`}
                            >
                              <div className="flex items-center justify-between gap-3">
                                <p className="text-sm font-medium">
                                  {isYou ? currentUser?.displayName || "You" : turn.speaker}
                                </p>
                                <p className="text-xs text-[#7B7B88]">{turn.timestamp}</p>
                              </div>
                              <p className="mt-2 text-sm leading-6">{turn.text}</p>
                            </div>
                          );
                        })
                      ) : (
                        <div className="rounded-[22px] border border-dashed border-border bg-[#FCFCFF] px-4 py-10 text-center text-sm text-[#6D6D78]">
                          Once audio and transcription are flowing, turns will appear here live.
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="space-y-4">
                    <div className="rounded-[24px] border border-border bg-white p-5">
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[rgba(139,127,255,0.18)] text-[#C7C0FF]">
                          <Mic size={18} />
                        </div>
                        <div>
                          <h3 className="text-base font-semibold text-[#17171F]">Runtime state</h3>
                          <p className="mt-1 text-sm text-[#6D6D78]">Focused on the current browser test only.</p>
                        </div>
                      </div>

                      <div className="mt-5 space-y-3">
                        <div className="rounded-2xl border border-border bg-[#FAFAFD] px-4 py-3">
                          <p className="text-xs uppercase tracking-[0.16em] text-[#8F8FA3]">Transport</p>
                          <p className="mt-1 text-sm font-medium text-[#17171F]">
                            {status === "connected" ? "LiveKit WebRTC connected" : "Not connected"}
                          </p>
                        </div>
                        <div className="rounded-2xl border border-border bg-[#FAFAFD] px-4 py-3">
                          <p className="text-xs uppercase tracking-[0.16em] text-[#8F8FA3]">Microphone</p>
                          <p className="mt-1 text-sm font-medium text-[#17171F]">
                            {microphonePublished ? "Published to room" : "Not published"}
                          </p>
                        </div>
                        <div className="rounded-2xl border border-border bg-[#FAFAFD] px-4 py-3">
                          <p className="text-xs uppercase tracking-[0.16em] text-[#8F8FA3]">Remote audio</p>
                          <p className="mt-1 text-sm font-medium text-[#17171F]">
                            {remoteAudioSubscribed ? "Subscribed from agent" : "Waiting for agent audio track"}
                          </p>
                        </div>
                        <div className="rounded-2xl border border-border bg-[#FAFAFD] px-4 py-3">
                          <p className="text-xs uppercase tracking-[0.16em] text-[#8F8FA3]">Participant</p>
                          <p className="mt-1 text-sm font-medium text-[#17171F]">
                            {details?.participantName || currentUser?.displayName || "You"}
                          </p>
                        </div>
                        <div className="rounded-2xl border border-border bg-[#FAFAFD] px-4 py-3">
                          <p className="text-xs uppercase tracking-[0.16em] text-[#8F8FA3]">Sample rate</p>
                          <p className="mt-1 text-sm font-medium text-[#17171F]">
                            {selectedAgent?.runtimeProfile.workflow.sampleRate || 24000} Hz
                          </p>
                        </div>
                        <div className="rounded-2xl border border-border bg-[#FAFAFD] px-4 py-3">
                          <p className="text-xs uppercase tracking-[0.16em] text-[#8F8FA3]">Session type</p>
                          <p className="mt-1 text-sm font-medium text-[#17171F]">Browser live test</p>
                        </div>
                      </div>
                    </div>

                    <PipelineMetrics metrics={latestMetrics} />

                    <div className="rounded-[24px] border border-border bg-white p-5">
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[rgba(139,127,255,0.18)] text-[#C7C0FF]">
                          <CheckCircle2 size={18} />
                        </div>
                        <div>
                          <h3 className="text-base font-semibold text-[#17171F]">Persistence</h3>
                          <p className="mt-1 text-sm text-[#6D6D78]">
                            This call stays isolated from normal reporting by default.
                          </p>
                        </div>
                      </div>

                      <div className="mt-5 rounded-2xl border border-border bg-[#FAFAFD] px-4 py-3 text-sm leading-6 text-[#4B4B59]">
                        {sessionRecord
                          ? `Call ID ${sessionRecord.call_id} is already being persisted with the test-session flag.`
                          : "The session record is being created and synchronized in the background."}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div ref={audioHostRef} />
            </div>
          </Card>

          <div className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
            <Card>
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2 text-accent">
                    <Gauge size={16} />
                    <p className="text-xs font-semibold uppercase tracking-[0.24em]">Runtime feed</p>
                  </div>
                  <h3 className="mt-3 text-lg font-semibold text-[#17171F]">Event stream</h3>
                  <p className="mt-2 text-sm leading-6 text-[#6D6D78]">
                    Browser, LiveKit, turn-taking, and provider events for this test session.
                  </p>
                </div>
                <Badge tone={events.length ? "success" : "neutral"}>{events.length} events</Badge>
              </div>

              <div className="mt-5 max-h-[560px] space-y-3 overflow-y-auto pr-1">
                {events.length ? (
                  events.map((event, index) => (
                    <div key={`${event.occurred_at}-${event.event_type}-${index}`} className="rounded-2xl border border-border bg-[#fcfcff] px-4 py-3 text-sm text-[#4B4B59]">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex min-w-0 items-center gap-2">
                          <Badge tone={event.source === "worker" ? "neutral" : "success"}>
                            {event.source === "worker" ? "Worker" : "Browser"}
                          </Badge>
                          <span className="truncate font-mono text-[11px] text-[#8F8FA3]">{event.event_type}</span>
                        </div>
                        <span className="shrink-0 text-[11px] text-[#8F8FA3]">
                          {event.occurred_at ? new Date(event.occurred_at).toLocaleTimeString() : "-"}
                        </span>
                      </div>
                      <p className="mt-2 font-medium text-[#17171F]">{event.message}</p>
                      {event.payload && Object.keys(event.payload).length ? (
                        <div className="mt-3 flex flex-wrap gap-2">
                          {Object.entries(event.payload).map(([field, value]) => (
                            <span className="rounded-lg bg-white px-2 py-1 font-mono text-[11px] text-[#6D6D78]" key={field}>
                              {field}={formatRuntimeValue(value, field)}
                            </span>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  ))
                ) : (
                  <div className="rounded-2xl border border-dashed border-border bg-[#fcfcff] px-4 py-8 text-center text-sm text-[#6D6D78]">
                    Runtime events will appear here as the room activity progresses.
                  </div>
                )}
              </div>
            </Card>

            <Card>
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.24em] text-accent">Test record</p>
                  <h3 className="mt-3 text-lg font-semibold text-[#17171F]">Session summary</h3>
                  <p className="mt-2 text-sm leading-6 text-[#6D6D78]">
                    Persisted metadata for the current live test call.
                  </p>
                </div>
                <Badge tone={sessionRecord ? "success" : "neutral"}>
                  {sessionRecord ? sessionRecord.lifecycle_status.replace("_", " ") : "Syncing"}
                </Badge>
              </div>

              <div className="mt-5 grid gap-4 sm:grid-cols-2">
                <div className="rounded-2xl border border-border bg-[#fafafe] p-4">
                  <p className="text-xs uppercase tracking-[0.16em] text-[#6D6D78]">Vendor trace</p>
                  <p className="mt-2 text-sm font-medium text-[#17171F]">{sessionRecord?.vendor_trace || vendorTrace || "Pending"}</p>
                </div>
                <div className="rounded-2xl border border-border bg-[#fafafe] p-4">
                  <p className="text-xs uppercase tracking-[0.16em] text-[#6D6D78]">Transcript turns</p>
                  <p className="mt-2 text-sm font-medium text-[#17171F]">
                    {String(sessionRecord?.metrics?.transcript_turns ?? transcript.length)}
                  </p>
                </div>
              </div>

              <div className="mt-4 rounded-2xl border border-border bg-white p-4">
                <p className="text-sm font-medium text-[#17171F]">Summary</p>
                <p className="mt-2 text-sm leading-6 text-[#4B4B59]">
                  {sessionRecord?.summary || "The call summary will settle once the session ends or persistence sync completes."}
                </p>
              </div>
            </Card>
          </div>
        </div>
      ) : (
        <Card className="w-full overflow-hidden p-0">
          <div className="border-b border-border bg-[linear-gradient(135deg,rgba(102,89,255,0.10),rgba(139,127,255,0.02))] px-8 py-7">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-accent">Phase 1</p>
                <h2 className="mt-3 text-2xl font-semibold text-[#17171F]">Start a browser live test</h2>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-[#5B5B68]">
                  Pick a configured agent, confirm the connected runtime stack, and launch a real room-backed test call.
                </p>
              </div>
              <Badge tone={statusTone(status)}>{statusLabel(status)}</Badge>
            </div>
          </div>

          <div className="px-8 py-8">
            <div className="grid gap-6">
              <Select
                label="Agent"
                options={agents.map((agent) => ({ label: agent.name, value: agent.id }))}
                value={selectedAgentId}
                onChange={(event) => selectAgent(event.target.value)}
              />

              <div className="grid gap-4 md:grid-cols-3">
                <div className="rounded-2xl border border-border bg-[#fafafe] p-4">
                  <p className="text-xs uppercase tracking-[0.16em] text-[#6D6D78]">Workflow purpose</p>
                  <p className="mt-2 text-sm leading-6 text-[#4B4B59]">
                    {selectedAgent?.description || "Select an agent to review its live runtime intent."}
                  </p>
                </div>
                <div className="rounded-2xl border border-border bg-[#fafafe] p-4">
                  <p className="text-xs uppercase tracking-[0.16em] text-[#6D6D78]">Runtime stack</p>
                  <p className="mt-2 text-sm font-medium text-[#17171F]">{vendorTrace || "Pending"}</p>
                </div>
                <div className="rounded-2xl border border-border bg-[#fafafe] p-4">
                  <p className="text-xs uppercase tracking-[0.16em] text-[#6D6D78]">Launch number</p>
                  <p className="mt-2 text-sm font-medium text-[#17171F]">
                    {selectedPhoneNumber || parsePhoneNumbers(telephonyAccount?.preview.phone_numbers)[0] || "Browser live"}
                  </p>
                </div>
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                {readinessItems.map((item) => (
                  <div
                    key={item.label}
                    className="flex items-start justify-between gap-4 rounded-2xl border border-border bg-white px-4 py-4"
                  >
                    <div>
                      <p className="text-sm font-medium text-[#17171F]">{item.label}</p>
                      <p className="mt-1 text-xs leading-5 text-[#6D6D78]">{item.detail}</p>
                    </div>
                    <Badge tone={item.ready ? "success" : "warning"}>
                      {item.ready ? "Ready" : "Needs config"}
                    </Badge>
                  </div>
                ))}
              </div>

              {(selectedAgent?.variables ?? []).length ? (
                <div className="rounded-2xl border border-border bg-[#fafafe] p-4">
                  <div>
                    <h3 className="font-medium text-[#17171F]">Call variables</h3>
                    <p className="mt-1 text-sm leading-6 text-[#6D6D78]">
                      Supply the context this test call should use. Required values must be set before joining.
                    </p>
                  </div>
                  <div className="mt-4 grid gap-4 md:grid-cols-2">
                    {(selectedAgent?.variables ?? []).map((variable) => {
                      const value = variableInputs[variable.key] ?? "";
                      if (variable.dataType === "enum") {
                        return (
                          <Select
                            key={variable.key}
                            label={`${variable.label}${variable.required ? " *" : ""}`}
                            options={variable.options}
                            placeholder={`Select ${variable.label.toLowerCase()}`}
                            value={value}
                            onChange={(event) =>
                              setVariableInputs((current) => ({ ...current, [variable.key]: event.target.value }))
                            }
                          />
                        );
                      }
                      if (variable.dataType === "boolean") {
                        return (
                          <Select
                            key={variable.key}
                            label={`${variable.label}${variable.required ? " *" : ""}`}
                            options={[{ label: "Yes", value: "true" }, { label: "No", value: "false" }]}
                            placeholder={`Select ${variable.label.toLowerCase()}`}
                            value={value}
                            onChange={(event) =>
                              setVariableInputs((current) => ({ ...current, [variable.key]: event.target.value }))
                            }
                          />
                        );
                      }
                      return (
                        <Input
                          key={variable.key}
                          label={`${variable.label}${variable.required ? " *" : ""}`}
                          type={
                            variable.dataType === "number"
                              ? "number"
                              : variable.dataType === "date"
                                ? "date"
                                : variable.dataType === "datetime"
                                  ? "datetime-local"
                                  : "text"
                          }
                          placeholder={variable.description || `Enter ${variable.label.toLowerCase()}`}
                          value={value}
                          onChange={(event) =>
                            setVariableInputs((current) => ({ ...current, [variable.key]: event.target.value }))
                          }
                        />
                      );
                    })}
                  </div>
                </div>
              ) : null}

              {error ? (
                <div className="flex items-start gap-3 rounded-2xl border border-[rgba(220,38,38,0.16)] bg-[rgba(220,38,38,0.08)] px-4 py-3 text-sm text-danger">
                  <CircleAlert className="mt-0.5 shrink-0" size={16} />
                  <p>{error}</p>
                </div>
              ) : null}

              {sessionRecord ? (
                <div className="rounded-2xl border border-[rgba(22,163,74,0.14)] bg-[rgba(22,163,74,0.06)] p-4">
                  <div className="flex items-center gap-2 text-[#17171F]">
                    <CheckCircle2 size={16} className="text-success" />
                    <p className="font-medium">Last test call persisted</p>
                  </div>
                  <p className="mt-2 text-sm leading-6 text-[#4B4B59]">
                    {sessionRecord.summary || `Call ID ${sessionRecord.call_id} is stored as a test session.`}
                  </p>
                </div>
              ) : null}

              <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-[#fcfcff] px-4 py-4">
                <p className="text-sm leading-6 text-[#5B5B68]">
                  The next screen opens only after the room is created and your browser has joined successfully.
                </p>
                <div className="flex flex-wrap items-center gap-3">
                  <Button
                    variant="secondary"
                    onClick={() => {
                      resetLiveState();
                      setStatus("idle");
                    }}
                  >
                    <RefreshCw size={16} />
                    Clear state
                  </Button>
                  <Button loading={isConnecting} loadingText="Joining room" onClick={() => void handleConnect()}>
                    <Radio size={16} />
                    Join live room
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}
