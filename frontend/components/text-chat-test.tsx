"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, CheckCircle2, CircleAlert, MessageCircle, RefreshCw, Send, Square, Workflow } from "lucide-react";
import { Badge, Button, Card, Input, Select } from "@/components/ui";
import {
  createTextChatSession,
  endTextChatSession,
  sendTextChatMessage,
  type TextChatSessionRecord,
} from "@/lib/live-session";
import { useMockApp } from "@/lib/mock-app";

type ChatMessage = { speaker: string; timestamp: string; text: string };

function formatTime(value: string) {
  return new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit" }).format(new Date(value));
}

export function TextChatTest({ onModeChange }: { onModeChange: (mode: "voice" | "chat") => void }) {
  const { tenantSlug, workspaceId, currentUser, agents, selectedAgent, selectedAgentId, selectAgent, providerAccounts } = useMockApp();
  const [session, setSession] = useState<TextChatSessionRecord | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [events, setEvents] = useState<Array<{ type: string; message: string; time: string }>>([]);
  const [variableInputs, setVariableInputs] = useState<Record<string, string>>({});
  const [draft, setDraft] = useState("");
  const [isStarting, setIsStarting] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [isEnding, setIsEnding] = useState(false);
  const [error, setError] = useState("");

  const llmAccount = providerAccounts.find(
    (account) => account.id === selectedAgent?.runtimeProfile.llm.providerAccountId
  );
  const isActive = session?.lifecycle_status === "in_progress";
  const requiredVariables = useMemo(
    () => (selectedAgent?.variables ?? []).filter((variable) => variable.required),
    [selectedAgent?.variables]
  );

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

  function appendEvent(type: string, message: string) {
    setEvents((current) => [{ type, message, time: new Date().toISOString() }, ...current].slice(0, 50));
  }

  async function startSession() {
    if (!selectedAgent || isStarting) return;
    const missing = requiredVariables.filter((variable) => !variableInputs[variable.key]?.trim());
    if (missing.length) {
      setError(`Enter the required test variables: ${missing.map((variable) => variable.label).join(", ")}.`);
      return;
    }
    setError("");
    setIsStarting(true);
    try {
      const created = await createTextChatSession(tenantSlug, workspaceId, {
        agent_id: selectedAgent.id,
        variables: Object.fromEntries(
          (selectedAgent.variables ?? [])
            .filter((variable) => variableInputs[variable.key]?.trim())
            .map((variable) => [variable.key, variableInputs[variable.key]])
        ),
      });
      setSession(created);
      setMessages(created.transcript);
      setEvents(created.event_log.map((event) => ({ type: event.event_type, message: event.message, time: event.occurred_at })));
      appendEvent("session.connected", "Text chat session is ready.");
    } catch (startError) {
      setError(startError instanceof Error ? startError.message : "We could not start the text chat test.");
    } finally {
      setIsStarting(false);
    }
  }

  async function sendMessage() {
    const text = draft.trim();
    if (!session || !isActive || !text || isSending) return;
    setError("");
    setDraft("");
    const now = new Date().toISOString();
    setMessages((current) => [...current, { speaker: currentUser?.displayName || "You", timestamp: now, text }]);
    setIsSending(true);
    try {
      const turn = await sendTextChatMessage(tenantSlug, workspaceId, session.call_id, text);
      const assistantTime = new Date().toISOString();
      setMessages((current) => [...current, { speaker: session.agent_name, timestamp: assistantTime, text: turn.assistant_text }]);
      setSession((current) => current ? {
        ...current,
        lifecycle_status: turn.ended ? "completed" : "in_progress",
        active_state_id: turn.active_state_id,
        active_state_label: turn.active_state_label,
        transcript: [...current.transcript, { speaker: currentUser?.displayName || "You", timestamp: now, text }, { speaker: current.agent_name, timestamp: assistantTime, text: turn.assistant_text }],
        ended_at: turn.ended ? assistantTime : current.ended_at,
        metrics: { ...current.metrics, turn_count: Number(current.metrics.turn_count ?? 0) + 1, last_turn_latency_ms: turn.latency_ms },
      } : current);
      appendEvent("turn.completed", `Response completed in ${Math.round(turn.latency_ms)} ms.`);
      if (turn.transitioned) appendEvent("workflow.transitioned", turn.transition_reason || `Moved to ${turn.active_state_label || "the next state"}.`);
      if (turn.ended) appendEvent("session.ended", "The agent marked the text test complete.");
    } catch (sendError) {
      setError(sendError instanceof Error ? sendError.message : "The text chat response failed.");
    } finally {
      setIsSending(false);
    }
  }

  async function endSession() {
    if (!session || isEnding) return;
    setIsEnding(true);
    try {
      const ended = await endTextChatSession(tenantSlug, workspaceId, session.call_id);
      setSession(ended);
      appendEvent("session.ended", "Text chat test ended by the user.");
    } catch (endError) {
      setError(endError instanceof Error ? endError.message : "We could not end the text chat test.");
    } finally {
      setIsEnding(false);
    }
  }

  async function leaveChatMode() {
    if (isActive) {
      await endSession();
    }
    onModeChange("voice");
  }

  async function startNewTest() {
    if (isActive) {
      await endSession();
    }
    reset();
  }

  function reset() {
    setSession(null);
    setMessages([]);
    setEvents([]);
    setDraft("");
    setError("");
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <Button variant="ghost" size="sm" onClick={() => void leaveChatMode()} disabled={isEnding}><ArrowLeft size={16} /> Live voice</Button>
        <div className="flex items-center gap-2 rounded-2xl border border-border bg-white p-1" role="tablist" aria-label="Live test mode">
          <button type="button" role="tab" aria-selected={false} onClick={() => void leaveChatMode()} disabled={isEnding} className="rounded-xl px-4 py-2 text-sm text-[#6D6D78]">Live voice</button>
          <button type="button" role="tab" aria-selected={true} className="rounded-xl bg-[rgba(102,89,255,0.12)] px-4 py-2 text-sm font-semibold text-accent">Chat test</button>
        </div>
      </div>

      <Card className="overflow-hidden p-0">
        <div className="flex flex-wrap items-start justify-between gap-5 border-b border-border bg-[linear-gradient(135deg,rgba(102,89,255,0.10),rgba(139,127,255,0.02))] px-8 py-7">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-accent">Prompt test</p>
            <h1 className="mt-3 text-2xl font-semibold text-[#17171F]">Chat test</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-[#5B5B68]">Exercise the saved agent prompt, workflow, variables, and LLM without STT, TTS, microphone, or LiveKit media.</p>
          </div>
          <Badge tone={isActive ? "success" : session ? "neutral" : "warning"}>{isActive ? "In progress" : session ? "Ended" : "Ready"}</Badge>
        </div>

        {!session ? (
          <div className="space-y-6 px-8 py-8">
            <Select label="Agent" options={agents.map((agent) => ({ label: agent.name, value: agent.id }))} value={selectedAgentId} onChange={(event) => selectAgent(event.target.value)} />
            <div className="grid gap-4 md:grid-cols-3">
              <Info label="Execution" value="Text chat" />
              <Info label="LLM" value={llmAccount?.vendorName ? `${llmAccount.vendorName} connected` : "Needs LLM connection"} />
              <Info label="Audio layers" value="Not used" />
            </div>
            {(selectedAgent?.variables ?? []).length ? <div className="rounded-2xl border border-border bg-[#fafafe] p-4"><h2 className="font-medium text-[#17171F]">Test variables</h2><p className="mt-1 text-sm text-[#6D6D78]">These values are frozen into this test session.</p><div className="mt-4 grid gap-4 md:grid-cols-2">{(selectedAgent?.variables ?? []).map((variable) => variable.dataType === "enum" ? <Select key={variable.key} label={`${variable.label}${variable.required ? " *" : ""}`} options={variable.options} value={variableInputs[variable.key] ?? ""} onChange={(event) => setVariableInputs((current) => ({ ...current, [variable.key]: event.target.value }))} /> : <Input key={variable.key} label={`${variable.label}${variable.required ? " *" : ""}`} value={variableInputs[variable.key] ?? ""} onChange={(event) => setVariableInputs((current) => ({ ...current, [variable.key]: event.target.value }))} placeholder={variable.description || `Enter ${variable.label.toLowerCase()}`} />)}</div></div> : null}
            {error ? <ErrorMessage message={error} /> : null}
            <div className="flex items-center justify-between gap-3 rounded-2xl border border-border bg-[#fcfcff] px-4 py-4"><p className="text-sm text-[#5B5B68]">The opening message is rendered directly; no extra LLM call is made for it.</p><Button loading={isStarting} loadingText="Starting" onClick={() => void startSession()} disabled={!selectedAgent || !llmAccount}><MessageCircle size={16} /> Start chat test</Button></div>
          </div>
        ) : (
          <div className="grid gap-6 p-6 xl:grid-cols-[minmax(0,1.25fr)_minmax(300px,0.75fr)]">
            <div className="flex min-h-[620px] flex-col rounded-[24px] border border-border bg-[#fcfcff] p-5">
              <div className="flex items-center justify-between gap-3 border-b border-border pb-4"><div><p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent">Conversation</p><h2 className="mt-2 text-lg font-semibold text-[#17171F]">{session.agent_name}</h2></div><Badge tone="neutral">{session.model}</Badge></div>
              <div className="min-h-0 flex-1 space-y-3 overflow-y-auto py-5">{messages.length ? messages.map((message, index) => <div key={`${message.timestamp}-${index}`} className={`max-w-[88%] rounded-[22px] px-4 py-3 ${message.speaker === "You" || message.speaker === currentUser?.displayName ? "ml-auto bg-[rgba(102,89,255,0.12)] text-[#17171F]" : "border border-border bg-white text-[#4B4B59]"}`}><div className="flex items-center justify-between gap-3"><p className="text-sm font-medium">{message.speaker === "You" ? currentUser?.displayName || "You" : message.speaker}</p><p className="text-xs text-[#7B7B88]">{formatTime(message.timestamp)}</p></div><p className="mt-2 whitespace-pre-wrap text-sm leading-6">{message.text}</p></div>) : <div className="rounded-2xl border border-dashed border-border px-4 py-12 text-center text-sm text-[#6D6D78]">Send a message to begin the prompt test.</div>}</div>
              {error ? <ErrorMessage message={error} /> : null}
              <div className="border-t border-border pt-4"><textarea aria-label="Chat message" value={draft} onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void sendMessage(); } }} disabled={!isActive || isSending} placeholder={isActive ? "Type a message and press Enter" : "This test session has ended"} className="min-h-24 w-full resize-none rounded-2xl border border-border bg-white px-4 py-3 text-sm outline-none transition focus:border-accent focus:ring-4 focus:ring-[rgba(102,89,255,0.10)] disabled:cursor-not-allowed disabled:bg-[#f6f6fa]" /><div className="mt-3 flex items-center justify-between gap-3"><p className="text-xs text-[#8A8A98]">Enter to send · Shift+Enter for a new line</p><Button onClick={() => void sendMessage()} loading={isSending} loadingText="Thinking" disabled={!isActive || !draft.trim()}><Send size={16} /> Send</Button></div></div>
            </div>
            <div className="space-y-4"><Card><div className="flex items-center gap-3"><Workflow size={18} className="text-accent" /><div><h2 className="font-semibold text-[#17171F]">Workflow state</h2><p className="mt-1 text-sm text-[#6D6D78]">State and runtime evidence for this text test.</p></div></div><div className="mt-5 rounded-2xl border border-border bg-[#fafafe] p-4"><p className="text-xs uppercase tracking-[0.16em] text-[#8F8FA3]">Active state</p><p className="mt-2 text-sm font-semibold text-[#17171F]">{session.active_state_label || "No workflow state"}</p><p className="mt-2 text-xs text-[#6D6D78]">{session.active_state_id || "-"}</p></div><div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-1"><Info label="Turn count" value={String(session.metrics.turn_count ?? 0)} /><Info label="Last latency" value={session.metrics.last_turn_latency_ms ? `${Math.round(Number(session.metrics.last_turn_latency_ms))} ms` : "-"} /></div></Card><Card><div className="flex items-center justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent">Runtime feed</p><h2 className="mt-2 font-semibold text-[#17171F]">Events</h2></div><Badge tone={events.length ? "success" : "neutral"}>{events.length}</Badge></div><div className="mt-4 max-h-64 space-y-2 overflow-y-auto">{events.map((event, index) => <div key={`${event.time}-${index}`} className="rounded-xl border border-border bg-[#fafafe] px-3 py-2"><p className="font-mono text-[10px] text-[#8F8FA3]">{event.type}</p><p className="mt-1 text-xs text-[#4B4B59]">{event.message}</p></div>)}</div></Card><div className="flex flex-wrap justify-end gap-3"><Button variant="secondary" onClick={() => void startNewTest()} loading={isEnding} loadingText="Ending" disabled={isSending || isEnding}><RefreshCw size={16} /> New test</Button>{isActive ? <Button variant="ghost" onClick={() => void endSession()} loading={isEnding} loadingText="Ending"><Square size={15} /> End test</Button> : <div className="flex items-center gap-2 text-sm text-success"><CheckCircle2 size={16} /> Persisted as a test call</div>}</div></div>
          </div>
        )}
      </Card>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return <div className="rounded-2xl border border-border bg-[#fafafe] p-4"><p className="text-xs uppercase tracking-[0.14em] text-[#8A8A98]">{label}</p><p className="mt-2 text-sm font-medium text-[#17171F]">{value}</p></div>;
}

function ErrorMessage({ message }: { message: string }) {
  return <div className="flex items-start gap-3 rounded-2xl border border-[rgba(220,38,38,0.16)] bg-[rgba(220,38,38,0.08)] px-4 py-3 text-sm text-danger"><CircleAlert className="mt-0.5 shrink-0" size={16} /><p>{message}</p></div>;
}
