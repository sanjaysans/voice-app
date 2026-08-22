"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Room, RoomEvent, Track } from "livekit-client";
import { Mic, PhoneOff, Radio, RefreshCw, Wifi } from "lucide-react";
import { Badge, Button, Card, EmptyState, PageHeader, Select } from "@/components/ui";
import { createBrowserRtcSession } from "@/lib/live-session";
import { useMockApp } from "@/lib/mock-app";
import { getProviderLabel, parsePhoneNumbers } from "@/lib/voice-stack";

type SessionStatus = "idle" | "preparing" | "connecting" | "connected" | "error";

type JoinDetails = {
  roomName: string;
  participantIdentity: string;
  participantName: string;
  dispatchId: string;
};

function statusTone(status: SessionStatus) {
  switch (status) {
    case "connected":
      return "success";
    case "error":
      return "danger";
    case "preparing":
    case "connecting":
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
    case "error":
      return "Needs attention";
    default:
      return "Ready";
  }
}

function nowLabel() {
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
  }).format(new Date());
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
  const [error, setError] = useState("");
  const [details, setDetails] = useState<JoinDetails | null>(null);
  const [events, setEvents] = useState<string[]>([]);
  const audioHostRef = useRef<HTMLDivElement | null>(null);
  const roomRef = useRef<Room | null>(null);
  const isConnecting = status === "preparing" || status === "connecting";

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

  const readinessItems = useMemo(
    () => [
      {
        label: "STT",
        ready: Boolean(sttAccount?.preview.api_key),
        detail: sttAccount
          ? `${getProviderLabel("stt", sttAccount.vendorName)} connected`
          : "Bind an STT connection in agent runtime"
      },
      {
        label: "LLM",
        ready: Boolean(llmAccount?.preview.api_key),
        detail: llmAccount
          ? `${getProviderLabel("llm", llmAccount.vendorName)} connected`
          : "Bind an LLM connection in agent runtime"
      },
      {
        label: "TTS",
        ready: Boolean(ttsAccount?.preview.api_key),
        detail: ttsAccount
          ? `${getProviderLabel("tts", ttsAccount.vendorName)} connected`
          : "Bind a TTS connection in agent runtime"
      },
      {
        label: "Telephony",
        ready: Boolean(!telephonyAccount || selectedPhoneNumber),
        detail: telephonyAccount
          ? selectedPhoneNumber || "Select a launch number in agent runtime"
          : "Optional for browser live"
      }
    ],
    [llmAccount, selectedPhoneNumber, sttAccount, telephonyAccount, ttsAccount]
  );

  useEffect(() => {
    return () => {
      const room = roomRef.current;
      roomRef.current = null;
      if (room) {
        void room.disconnect();
      }
    };
  }, []);

  function pushEvent(message: string) {
    setEvents((current) => [`${nowLabel()} · ${message}`, ...current].slice(0, 10));
  }

  async function disconnectRoom() {
    const room = roomRef.current;
    roomRef.current = null;
    if (room) {
      await room.disconnect();
    }
    if (audioHostRef.current) {
      audioHostRef.current.innerHTML = "";
    }
    setStatus("idle");
    pushEvent("Disconnected from the room.");
  }

  function bindRoomEvents(room: Room) {
    room
      .on(RoomEvent.Connected, () => {
        setStatus("connected");
        pushEvent("Connected to LiveKit room.");
      })
      .on(RoomEvent.Disconnected, () => {
        if (audioHostRef.current) {
          audioHostRef.current.innerHTML = "";
        }
        setStatus("idle");
        pushEvent("LiveKit room closed.");
      })
      .on(RoomEvent.ParticipantConnected, (participant) => {
        pushEvent(`${participant.identity} joined the room.`);
      })
      .on(RoomEvent.TrackSubscribed, (track, _publication, participant) => {
        if (track.kind !== Track.Kind.Audio || !audioHostRef.current) {
          return;
        }
        const element = track.attach();
        element.autoplay = true;
        element.className = "hidden";
        audioHostRef.current.appendChild(element);
        void element.play().catch(() => undefined);
        pushEvent(`Remote audio subscribed for ${participant.identity}.`);
      })
      .on(RoomEvent.TrackUnsubscribed, (track) => {
        track.detach().forEach((element) => element.remove());
      });
  }

  async function handleConnect() {
    if (!tenantSlug || !workspaceId || !selectedAgent) {
      setStatus("error");
      setError("Select an agent before joining the live room.");
      return;
    }
    if (!sttAccount?.preview.api_key || !llmAccount?.preview.api_key || !ttsAccount?.preview.api_key) {
      setStatus("error");
      setError("Finish the STT, LLM, and TTS connections in the agent runtime before launch.");
      return;
    }

    setError("");
    setStatus("preparing");
    setEvents([]);

    try {
      if (roomRef.current) {
        await disconnectRoom();
      }

      const session = await createBrowserRtcSession(tenantSlug, workspaceId, {
        dispatch_agent_name: selectedAgent.name.toLowerCase().replace(/\s+/g, "-"),
        prompt: {
          system_prompt: [selectedAgent.sharedPrompt, selectedAgent.flowNodes[0]?.prompt]
            .filter(Boolean)
            .join("\n\n"),
          opening_message: selectedAgent.runtimeProfile.prompt.openingMessage,
        },
        stt: {
          api_key: String(sttAccount.preview.api_key),
          model: String(selectedAgent.runtimeProfile.stt.model || "flux-general-en"),
          language: String(selectedAgent.runtimeProfile.stt.language || "en-US"),
          keyterms: String(selectedAgent.runtimeProfile.stt.keyterms || "")
            .split(",")
            .map((item) => item.trim())
            .filter(Boolean),
        },
        llm: {
          api_key: String(llmAccount.preview.api_key),
          model: String(selectedAgent.runtimeProfile.llm.model || "gpt-4.1-mini"),
          temperature: Number(selectedAgent.runtimeProfile.llm.temperature ?? 0.2),
        },
        tts: {
          api_key: String(ttsAccount.preview.api_key),
          model: String(selectedAgent.runtimeProfile.tts.model || "sonic-3"),
          voice: String(selectedAgent.runtimeProfile.tts.voiceId || ""),
          language: String(selectedAgent.runtimeProfile.tts.language || "en"),
          speed: Number(selectedAgent.runtimeProfile.tts.speed ?? 1),
          emotion: String(selectedAgent.runtimeProfile.tts.emotion || "neutral"),
          volume: Number(selectedAgent.runtimeProfile.tts.volume ?? 1),
          sample_rate: Number(selectedAgent.runtimeProfile.workflow.sampleRate ?? 24000),
        },
        metadata: {
          workspace: workspaceId,
          launched_by: currentUser?.email ?? "voice-user",
          agent_id: selectedAgent.id,
          agent_name: selectedAgent.name,
          launch_number: selectedPhoneNumber || parsePhoneNumbers(telephonyAccount?.preview.phone_numbers)[0] || "browser-live",
        },
      });

      setDetails({
        roomName: session.room_name,
        participantIdentity: session.participant_identity,
        participantName: session.participant_name,
        dispatchId: session.dispatch_id,
      });
      pushEvent(`Session prepared for ${selectedAgent.name}.`);

      setStatus("connecting");
      const room = new Room();
      roomRef.current = room;
      bindRoomEvents(room);
      await room.connect(session.server_url, session.access_token);
      await room.localParticipant.setMicrophoneEnabled(true);
      pushEvent("Microphone published to the room.");
    } catch (sessionError) {
      const message =
        sessionError instanceof Error ? sessionError.message : "Failed to start the live room.";
      setStatus("error");
      setError(message);
      pushEvent(message);
    }
  }

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

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Operate"
        title="Live"
        description="Pick a configured agent and join a local LiveKit room using the provider stack already connected in the tenant."
        actions={
          <>
            <Button
              disabled={isConnecting}
              variant="secondary"
              onClick={() => {
                setError("");
                setEvents([]);
                setDetails(null);
              }}
            >
              <RefreshCw size={16} />
              Clear state
            </Button>
            {status === "connected" || status === "connecting" ? (
              <Button
                loading={status === "connecting"}
                loadingText="Joining room"
                variant="secondary"
                onClick={() => void disconnectRoom()}
              >
                <PhoneOff size={16} />
                Leave room
              </Button>
            ) : (
              <Button loading={isConnecting} loadingText="Joining room" onClick={() => void handleConnect()}>
                <Radio size={16} />
                Join live room
              </Button>
            )}
          </>
        }
      />

      <div className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
        <Card className="space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold">Launch config</h2>
              <p className="mt-1 text-sm text-[#6D6D78]">
                This page no longer captures provider secrets directly. Everything comes from Connections and Agent studio.
              </p>
            </div>
            <Badge tone={statusTone(status)}>{statusLabel(status)}</Badge>
          </div>

          <Select
            label="Agent"
            options={agents.map((agent) => ({ label: agent.name, value: agent.id }))}
            value={selectedAgentId}
            onChange={(event) => selectAgent(event.target.value)}
          />

          <div className="rounded-2xl border border-border bg-[#fafafe] p-4">
            <p className="text-xs uppercase tracking-[0.16em] text-[#6D6D78]">Workflow purpose</p>
            <p className="mt-2 text-sm leading-6 text-[#4B4B59]">
              {selectedAgent?.description || "Select an agent to see its live launch intent."}
            </p>
          </div>

          <div className="grid gap-3">
            {readinessItems.map((item) => (
              <div
                key={item.label}
                className="flex items-center justify-between rounded-2xl border border-border bg-white px-4 py-3"
              >
                <div>
                  <p className="text-sm font-medium text-[#17171F]">{item.label}</p>
                  <p className="mt-1 text-xs text-[#6D6D78]">{item.detail}</p>
                </div>
                <Badge tone={item.ready ? "success" : "warning"}>
                  {item.ready ? "Ready" : "Needs config"}
                </Badge>
              </div>
            ))}
          </div>

          {error ? (
            <div className="rounded-2xl border border-[rgba(220,38,38,0.16)] bg-[rgba(220,38,38,0.08)] px-4 py-3 text-sm text-danger">
              {error}
            </div>
          ) : null}
        </Card>

        <div className="space-y-6">
          <Card className="space-y-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold">Connection state</h2>
                <p className="mt-1 text-sm text-[#6D6D78]">
                  The room launches with the selected agent’s saved stack and publishes local microphone audio when connected.
                </p>
              </div>
              <Wifi className="text-accent" size={18} />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="rounded-2xl border border-border bg-[#fafafe] p-4">
                <p className="text-xs uppercase tracking-[0.16em] text-[#6D6D78]">Room</p>
                <p className="mt-2 font-medium">{details?.roomName ?? "Not joined yet"}</p>
              </div>
              <div className="rounded-2xl border border-border bg-[#fafafe] p-4">
                <p className="text-xs uppercase tracking-[0.16em] text-[#6D6D78]">Dispatch</p>
                <p className="mt-2 font-medium">{details?.dispatchId ?? "Waiting to launch"}</p>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <div className="rounded-2xl border border-border bg-white p-4">
                <p className="text-xs uppercase tracking-[0.16em] text-[#6D6D78]">STT</p>
                <p className="mt-2 text-sm font-medium">
                  {sttAccount ? getProviderLabel("stt", sttAccount.vendorName) : "Missing"}
                </p>
              </div>
              <div className="rounded-2xl border border-border bg-white p-4">
                <p className="text-xs uppercase tracking-[0.16em] text-[#6D6D78]">LLM</p>
                <p className="mt-2 text-sm font-medium">
                  {llmAccount ? getProviderLabel("llm", llmAccount.vendorName) : "Missing"}
                </p>
              </div>
              <div className="rounded-2xl border border-border bg-white p-4">
                <p className="text-xs uppercase tracking-[0.16em] text-[#6D6D78]">TTS</p>
                <p className="mt-2 text-sm font-medium">
                  {ttsAccount ? getProviderLabel("tts", ttsAccount.vendorName) : "Missing"}
                </p>
              </div>
            </div>

            <div ref={audioHostRef} />
          </Card>

          <Card>
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[rgba(102,89,255,0.12)] text-accent">
                <Mic size={18} />
              </div>
              <div>
                <h2 className="text-lg font-semibold">Event stream</h2>
                <p className="mt-1 text-sm text-[#6D6D78]">
                  Track room join, dispatch, microphone, and remote audio milestones here.
                </p>
              </div>
            </div>

            <div className="mt-5 space-y-3">
              {events.length ? (
                events.map((event) => (
                  <div key={event} className="rounded-2xl border border-border bg-[#fcfcff] px-4 py-3 text-sm text-[#4B4B59]">
                    {event}
                  </div>
                ))
              ) : (
                <div className="rounded-2xl border border-dashed border-border bg-[#fcfcff] px-4 py-8 text-center text-sm text-[#6D6D78]">
                  Launch the room to populate live runtime events.
                </div>
              )}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
