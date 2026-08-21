"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, PhoneForwarded, Play, Radio, TriangleAlert } from "lucide-react";
import { agents } from "@/lib/mock-data";
import { Badge, Button, Card, Input, PageHeader, Select } from "@/components/ui";

const callPhases = ["Dialing", "Connecting", "Live call", "Completed"];

export default function CallsPage() {
  const [selectedAgent, setSelectedAgent] = useState(agents[0].name);
  const [phoneNumber, setPhoneNumber] = useState("+1 415 555 0188");
  const [phaseIndex, setPhaseIndex] = useState(-1);
  const [error, setError] = useState("");
  const [events, setEvents] = useState<string[]>([]);

  useEffect(() => {
    if (phaseIndex < 0 || phaseIndex >= callPhases.length - 1) {
      return;
    }

    const timer = window.setTimeout(() => {
      setPhaseIndex((current) => current + 1);
      setEvents((current) => [...current, `${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} • ${callPhases[phaseIndex + 1]}`]);
    }, 1200);

    return () => window.clearTimeout(timer);
  }, [phaseIndex]);

  const startCall = () => {
    if (phoneNumber.replace(/\D/g, "").length < 10) {
      setError("Enter a valid phone number to simulate the outbound call.");
      return;
    }

    setError("");
    setPhaseIndex(0);
    setEvents([`${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} • ${callPhases[0]}`]);
  };

  const currentPhase = phaseIndex >= 0 ? callPhases[phaseIndex] : "Idle";

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Operate"
        title="Trigger & connect"
        description="Simulate outbound test calls before the real telephony pipeline and vendor credentials are wired in."
        actions={
          <>
            <Button asChild href="/calls/logs" variant="secondary">Open call logs</Button>
            <Button onClick={startCall}>
              <Play size={16} />
              Start test call
            </Button>
          </>
        }
      />

      <div className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
        <Card className="space-y-5">
          <Select
            label="Agent"
            value={selectedAgent}
            options={agents.map((agent) => agent.name)}
            onChange={(event) => setSelectedAgent(event.target.value)}
          />
          <Input
            label="Destination number"
            value={phoneNumber}
            onChange={(event) => setPhoneNumber(event.target.value)}
            placeholder="+1 555 010 2440"
          />
          {error ? (
            <div className="rounded-2xl border border-[rgba(220,38,38,0.16)] bg-[rgba(220,38,38,0.08)] px-4 py-3 text-sm text-danger">
              {error}
            </div>
          ) : null}

          <div className="rounded-2xl border border-border bg-[#fafafe] p-4">
            <p className="text-sm font-medium">Call scenario</p>
            <p className="mt-2 text-sm leading-6 text-[#6D6D78]">
              Voice will simulate call state progression, event logs, and the target agent selection using in-memory mock data.
            </p>
          </div>

          <Button className="w-full justify-center" size="lg" onClick={startCall}>
            <PhoneForwarded size={16} />
            Trigger & connect
          </Button>
        </Card>

        <Card>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold">Live call state</h2>
              <p className="mt-1 text-sm text-[#6D6D78]">Mocked streaming lifecycle for the selected outbound scenario.</p>
            </div>
            <Badge tone={phaseIndex === callPhases.length - 1 ? "success" : phaseIndex >= 0 ? "warning" : "neutral"}>
              {currentPhase}
            </Badge>
          </div>

          <div className="mt-6 grid gap-3 sm:grid-cols-4">
            {callPhases.map((phase, index) => {
              const active = phaseIndex >= index;
              return (
                <div
                  key={phase}
                  className={`rounded-2xl border p-4 ${
                    active ? "border-[rgba(102,89,255,0.22)] bg-[rgba(102,89,255,0.08)]" : "border-border bg-white"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium">{phase}</p>
                    {active ? <CheckCircle2 className="text-accent" size={16} /> : <Radio className="text-[#B1B1BD]" size={16} />}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="mt-6 grid gap-6 xl:grid-cols-[1fr_0.85fr]">
            <div className="rounded-2xl border border-border bg-[#fcfcff] p-4">
              <p className="text-sm font-medium">Event stream</p>
              {events.length ? (
                <div className="mt-4 space-y-3">
                  {events.map((event) => (
                    <div key={event} className="rounded-xl border border-border bg-white px-4 py-3 text-sm text-[#4B4B59]">
                      {event}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="mt-4 rounded-xl border border-dashed border-border px-4 py-10 text-center text-sm text-[#6D6D78]">
                  No active call yet. Start a test call to inspect live call transitions.
                </div>
              )}
            </div>

            <div className="space-y-3">
              <div className="rounded-2xl border border-border bg-white p-4">
                <p className="text-xs uppercase tracking-[0.16em] text-[#6D6D78]">Selected agent</p>
                <p className="mt-2 text-lg font-semibold">{selectedAgent}</p>
              </div>
              <div className="rounded-2xl border border-border bg-white p-4">
                <p className="text-xs uppercase tracking-[0.16em] text-[#6D6D78]">Guardrail posture</p>
                <div className="mt-3 flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[rgba(217,119,6,0.1)] text-warning">
                    <TriangleAlert size={18} />
                  </div>
                  <p className="text-sm leading-6 text-[#6D6D78]">
                    Escalation policy and PII masking remain active through the simulated call lifecycle.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
