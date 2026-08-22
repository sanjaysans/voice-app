"use client";

import { useState } from "react";
import {
  CheckCircle2,
  Clock3,
  PhoneForwarded,
  Radio,
  RefreshCw,
  Sparkles,
  Trash2
} from "lucide-react";
import { useMockApp } from "@/lib/mock-app";
import { Badge, Button, Card, Input, PageHeader, Select } from "@/components/ui";

const callViews = [
  { id: "launch", label: "Launch" },
  { id: "live", label: "In call" },
  { id: "review", label: "Review" }
] as const;

export default function CallsPage() {
  const {
    agents,
    selectedAgentId,
    scenarios,
    activeCall,
    callHistory,
    selectedCall,
    callsView,
    setCallsView,
    startCall,
    selectCall,
    markSynced,
    deleteCall
  } = useMockApp();
  const [agentId, setAgentId] = useState(selectedAgentId);
  const [scenarioId, setScenarioId] = useState(scenarios[0].id);
  const selectedScenario = scenarios.find((scenario) => scenario.id === scenarioId) ?? scenarios[0];
  const [leadName, setLeadName] = useState(selectedScenario.leadName);
  const [company, setCompany] = useState(selectedScenario.company);
  const [phone, setPhone] = useState(selectedScenario.phone);
  const [error, setError] = useState("");
  const currentAgentName = agents.find((agent) => agent.id === agentId)?.name ?? agents[0]?.name;

  const handleScenarioChange = (value: string) => {
    const scenario = scenarios.find((item) => item.id === value) ?? scenarios[0];
    setScenarioId(value);
    setLeadName(scenario.leadName);
    setCompany(scenario.company);
    setPhone(scenario.phone);
  };

  const handleStart = () => {
    if (phone.replace(/\D/g, "").length < 10) {
      setError("Enter a valid phone number to launch the call.");
      return;
    }

    setError("");
    startCall({
      agentId,
      scenarioId,
      leadName,
      company,
      phone
    });
  };

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Operate"
        title="Calls"
        description="Launch a call, watch live progression, and review the full result with transcript, tool usage, and structured outcomes."
        actions={
          <>
            <Button
              variant="secondary"
              onClick={() => {
                setLeadName(selectedScenario.leadName);
                setCompany(selectedScenario.company);
                setPhone(selectedScenario.phone);
                setError("");
              }}
            >
              <RefreshCw size={16} />
              Reset form
            </Button>
            <Button onClick={handleStart}>
              <PhoneForwarded size={16} />
              Start call
            </Button>
          </>
        }
      />

      <div className="flex rounded-xl border border-border bg-white p-1">
        {callViews.map((view) => (
          <button
            key={view.id}
            className={`flex-1 rounded-lg px-3 py-2 text-sm transition ${
              callsView === view.id ? "bg-[rgba(102,89,255,0.12)] text-accent" : "text-[#6D6D78]"
            }`}
            onClick={() => setCallsView(view.id)}
            type="button"
          >
            {view.label}
          </button>
        ))}
      </div>

      <div className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
        <div className="space-y-6">
          {callsView !== "review" ? (
            <Card className="space-y-4">
              <div>
                <h2 className="text-lg font-semibold">Trigger & connect</h2>
                <p className="mt-1 text-sm text-[#6D6D78]">Configure the workflow, destination, and call plan before launching the call.</p>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <Select
                  label="Agent"
                  value={agentId}
                  options={agents.map((agent) => ({ label: agent.name, value: agent.id }))}
                  onChange={(event) => setAgentId(event.target.value)}
                />
                <Select
                  label="Call plan"
                  value={scenarioId}
                  options={scenarios.map((scenario) => ({ label: scenario.name, value: scenario.id }))}
                  onChange={(event) => handleScenarioChange(event.target.value)}
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <Input label="Lead name" value={leadName} onChange={(event) => setLeadName(event.target.value)} />
                <Input label="Company" value={company} onChange={(event) => setCompany(event.target.value)} />
              </div>

              <Input label="Phone number" value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="+1 555 010 2440" />

              {error ? (
                <div className="rounded-2xl border border-[rgba(220,38,38,0.16)] bg-[rgba(220,38,38,0.08)] px-4 py-3 text-sm text-danger">
                  {error}
                </div>
              ) : null}

              <div className="rounded-2xl border border-border bg-[#fafafe] p-4">
                <div className="flex items-center justify-between gap-3">
                  <p className="font-medium">{selectedScenario.name}</p>
                  <Badge tone={selectedScenario.tone}>{selectedScenario.outcome}</Badge>
                </div>
                <p className="mt-2 text-sm leading-6 text-[#6D6D78]">{selectedScenario.summary}</p>
              </div>

              <Button className="w-full justify-center" size="lg" onClick={handleStart}>
                <PhoneForwarded size={16} />
                Trigger & connect
              </Button>
            </Card>
          ) : null}

          <Card>
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold">Recent outcomes</h2>
                <p className="mt-1 text-sm text-[#6D6D78]">Click any item to load the review panel.</p>
              </div>
              <Badge tone="neutral">{callHistory.length} calls</Badge>
            </div>

            <div className="mt-4 space-y-3">
              {callHistory.map((call) => (
                <button
                  key={call.id}
                  className="w-full rounded-2xl border border-border bg-white p-4 text-left transition hover:border-[rgba(102,89,255,0.22)]"
                  onClick={() => selectCall(call.id)}
                  type="button"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-medium">
                        {call.leadName} · {call.company}
                      </p>
                      <p className="mt-1 text-sm text-[#6D6D78]">
                        {call.agentName} · {call.time}
                      </p>
                    </div>
                    <Badge tone={call.statusTone}>{call.outcome}</Badge>
                  </div>
                </button>
              ))}
            </div>
          </Card>
        </div>

        <div className="space-y-6">
          {callsView === "launch" ? (
            <Card>
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold">Launch preview</h2>
                  <p className="mt-1 text-sm text-[#6D6D78]">Review the current workflow, expected journey, and planned outcome before launching.</p>
                </div>
                <Badge tone={selectedScenario.tone}>{selectedScenario.outcome}</Badge>
              </div>

              <div className="mt-6 grid gap-3 sm:grid-cols-4">
                {selectedScenario.timeline.map((phase) => (
                  <div key={phase} className="rounded-2xl border border-border bg-white p-4">
                    <p className="text-sm font-medium">{phase}</p>
                  </div>
                ))}
              </div>

              <div className="mt-6 grid gap-4 md:grid-cols-3">
                <div className="rounded-2xl border border-border bg-[#fafafe] p-4">
                  <p className="text-xs uppercase tracking-[0.16em] text-[#6D6D78]">Workflow</p>
                  <p className="mt-2 font-medium">{currentAgentName}</p>
                </div>
                <div className="rounded-2xl border border-border bg-[#fafafe] p-4">
                  <p className="text-xs uppercase tracking-[0.16em] text-[#6D6D78]">Lead</p>
                  <p className="mt-2 font-medium">{leadName}</p>
                  <p className="mt-1 text-sm text-[#6D6D78]">{company}</p>
                </div>
                <div className="rounded-2xl border border-border bg-[#fafafe] p-4">
                  <p className="text-xs uppercase tracking-[0.16em] text-[#6D6D78]">Next step</p>
                  <p className="mt-2 text-sm leading-6 text-[#4B4B59]">{selectedScenario.nextStep}</p>
                </div>
              </div>
            </Card>
          ) : null}

          {callsView === "live" ? (
            <Card>
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold">Live state</h2>
                  <p className="mt-1 text-sm text-[#6D6D78]">The call view advances through dialing, connection, and outcome states in one place.</p>
                </div>
                <Badge tone={activeCall ? "warning" : "neutral"}>
                  {activeCall ? activeCall.phases[activeCall.phaseIndex] : "Idle"}
                </Badge>
              </div>

              <div className="mt-6 grid gap-3 sm:grid-cols-4">
                {(activeCall?.phases ?? selectedScenario.timeline).map((phase, index) => {
                  const active = activeCall ? activeCall.phaseIndex >= index : false;
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
                  <div className="mt-4 space-y-3">
                    {(activeCall?.timeline ?? [`Preview • ${selectedScenario.timeline[0]}`]).map((event) => (
                      <div key={event} className="rounded-xl border border-border bg-white px-4 py-3 text-sm text-[#4B4B59]">
                        {event}
                      </div>
                    ))}
                  </div>
                </div>

                <div className="space-y-3">
                  <div className="rounded-2xl border border-border bg-white p-4">
                    <p className="text-xs uppercase tracking-[0.16em] text-[#6D6D78]">Current workflow</p>
                    <p className="mt-2 text-lg font-semibold">{currentAgentName}</p>
                  </div>
                  <div className="rounded-2xl border border-border bg-white p-4">
                    <p className="text-xs uppercase tracking-[0.16em] text-[#6D6D78]">Expected next step</p>
                    <p className="mt-2 text-sm leading-6 text-[#6D6D78]">{activeCall?.nextStep ?? selectedScenario.nextStep}</p>
                  </div>
                  <div className="rounded-2xl border border-[rgba(102,89,255,0.16)] bg-[rgba(102,89,255,0.08)] p-4">
                    <div className="flex items-start gap-3">
                      <div className="mt-0.5 flex h-9 w-9 items-center justify-center rounded-xl bg-white text-accent">
                        <Sparkles size={17} />
                      </div>
                      <p className="text-sm leading-6 text-[#5D52D6]">
                        Completed calls move into the review workspace with transcripts, variables, and downstream sync actions.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </Card>
          ) : null}

          {callsView === "review" ? (
            <Card>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold">Call review</h2>
                <p className="mt-1 text-sm text-[#6D6D78]">The right-hand review stays populated even after the live call finishes.</p>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <Badge tone={selectedCall.statusTone}>{selectedCall.outcome}</Badge>
                <Button variant="secondary" onClick={() => markSynced(selectedCall.id)} disabled={selectedCall.syncedToCrm}>
                  {selectedCall.syncedToCrm ? "CRM synced" : "Sync to CRM"}
                </Button>
                <Button
                  variant="ghost"
                  disabled={callHistory.length === 1}
                  onClick={() => void deleteCall(selectedCall.id)}
                  title={
                    callHistory.length === 1
                      ? "Keep at least one review record in the prototype"
                      : "Delete call"
                  }
                >
                  <Trash2 size={16} />
                  Delete
                </Button>
              </div>
            </div>

            <div className="mt-5 grid gap-4 md:grid-cols-3">
              <div className="rounded-2xl border border-border bg-[#fafafe] p-4">
                <p className="text-xs uppercase tracking-[0.16em] text-[#6D6D78]">Lead</p>
                <p className="mt-2 font-medium">{selectedCall.leadName}</p>
                <p className="mt-1 text-sm text-[#6D6D78]">{selectedCall.company}</p>
              </div>
              <div className="rounded-2xl border border-border bg-[#fafafe] p-4">
                <p className="text-xs uppercase tracking-[0.16em] text-[#6D6D78]">Duration</p>
                <p className="mt-2 font-medium">{selectedCall.duration}</p>
                <p className="mt-1 text-sm text-[#6D6D78]">{selectedCall.vendorTrace}</p>
              </div>
              <div className="rounded-2xl border border-border bg-[#fafafe] p-4">
                <p className="text-xs uppercase tracking-[0.16em] text-[#6D6D78]">Next step</p>
                <p className="mt-2 text-sm leading-6 text-[#4B4B59]">{selectedCall.nextStep}</p>
              </div>
            </div>

            <div className="mt-5 grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
              <div className="space-y-4">
                <div className="rounded-2xl border border-border bg-white p-4">
                  <div className="flex items-center gap-2">
                    <Clock3 size={16} className="text-accent" />
                    <p className="font-medium">Transcript</p>
                  </div>
                  <div className="mt-4 space-y-3">
                    {selectedCall.transcript.map((turn) => (
                      <div key={`${turn.timestamp}-${turn.text}`} className="rounded-xl border border-border bg-[#fafafe] px-4 py-3">
                        <div className="flex items-center justify-between gap-3">
                          <p className="text-sm font-medium">{turn.speaker}</p>
                          <p className="text-xs text-[#6D6D78]">{turn.timestamp}</p>
                        </div>
                        <p className="mt-2 text-sm leading-6 text-[#4B4B59]">{turn.text}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <div className="rounded-2xl border border-border bg-white p-4">
                  <p className="font-medium">Extracted variables</p>
                  <div className="mt-4 space-y-3">
                    {selectedCall.extractedVariables.map((item) => (
                      <div key={item.key} className="flex items-center justify-between gap-3 rounded-xl border border-border bg-[#fafafe] px-4 py-3 text-sm">
                        <span className="text-[#6D6D78]">{item.key}</span>
                        <span className="font-medium">{item.value}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="rounded-2xl border border-border bg-white p-4">
                  <p className="font-medium">Tool activity</p>
                  <div className="mt-4 space-y-3">
                    {selectedCall.toolCalls.map((item) => (
                      <div key={item.name} className="rounded-xl border border-border bg-[#fafafe] px-4 py-3">
                        <p className="text-sm font-medium">{item.name}</p>
                        <p className="mt-1 text-sm leading-6 text-[#6D6D78]">{item.result}</p>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="rounded-2xl border border-border bg-white p-4">
                  <p className="font-medium">Guardrails</p>
                  <div className="mt-4 flex flex-wrap gap-2">
                    {selectedCall.guardrails.map((item) => (
                      <Badge key={item} tone="neutral">
                        {item}
                      </Badge>
                    ))}
                  </div>
                </div>
              </div>
            </div>
            </Card>
          ) : null}
        </div>
      </div>
    </div>
  );
}
