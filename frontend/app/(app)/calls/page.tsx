"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, PhoneForwarded, Radio, RefreshCw } from "lucide-react";
import { useMockApp } from "@/lib/mock-app";
import { useAsyncAction } from "@/lib/use-async-action";
import { Badge, Button, Card, EmptyState, Input, PageHeader, Select } from "@/components/ui";

const callViews = [
  { id: "launch", label: "Launch" },
  { id: "live", label: "In call" }
] as const;

export default function CallsPage() {
  const {
    agents,
    selectedAgentId,
    scenarios,
    activeCall,
    callHistory,
    callsView,
    setCallsView,
    startCall,
  } = useMockApp();
  const startAction = useAsyncAction();
  const [agentId, setAgentId] = useState(selectedAgentId);
  const [scenarioId, setScenarioId] = useState(scenarios[0].id);
  const selectedScenario = scenarios.find((scenario) => scenario.id === scenarioId) ?? scenarios[0];
  const [leadName, setLeadName] = useState(selectedScenario.leadName);
  const [company, setCompany] = useState(selectedScenario.company);
  const [phone, setPhone] = useState(selectedScenario.phone);
  const [error, setError] = useState("");
  const currentAgentName = agents.find((agent) => agent.id === agentId)?.name ?? agents[0]?.name;

  useEffect(() => {
    setAgentId((current) =>
      agents.some((agent) => agent.id === current) ? current : selectedAgentId || agents[0]?.id || ""
    );
  }, [agents, selectedAgentId]);

  if (!agents.length) {
    return (
      <div className="space-y-6">
        <PageHeader
          eyebrow="Operate"
          title="Calls"
          description="Trigger a call and watch the live progression through dialing, connection, and completion."
        />
        <EmptyState
          title="Create a workflow before launching calls"
          description="Calls depend on at least one agent workflow. Add or seed a workflow first, then come back here to launch the first run."
        />
      </div>
    );
  }

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
        description="Use this surface only for call launch and live progress. Historical review lives in Call logs."
        actions={
          <>
            <Button asChild href="/calls/logs" variant="secondary">
              Open call logs
            </Button>
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
            <Button
              loading={startAction.isPending}
              loadingText="Starting call"
              onClick={() => void startAction.run(handleStart)}
            >
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
        <Card className="space-y-4">
          <div>
            <h2 className="text-lg font-semibold">Trigger & connect</h2>
            <p className="mt-1 text-sm text-[#6D6D78]">
              Pick an agent, choose a call plan, and launch a new run.
            </p>
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

          <Input
            label="Phone number"
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
            placeholder="+1 555 010 2440"
          />

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

          <Button
            className="w-full justify-center"
            loading={startAction.isPending}
            loadingText="Triggering call"
            size="lg"
            onClick={() => void startAction.run(handleStart)}
          >
            <PhoneForwarded size={16} />
            Trigger & connect
          </Button>
        </Card>

        <div className="space-y-6">
          {callsView === "launch" ? (
            <Card>
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold">Launch preview</h2>
                  <p className="mt-1 text-sm text-[#6D6D78]">
                    Review the workflow path and expected outcome before launch.
                  </p>
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
                  <p className="mt-1 text-sm text-[#6D6D78]">
                    Follow dialing, connection, and completion as the current run advances.
                  </p>
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
                        {active ? (
                          <CheckCircle2 className="text-accent" size={16} />
                        ) : (
                          <Radio className="text-[#B1B1BD]" size={16} />
                        )}
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
                    <p className="mt-2 text-sm leading-6 text-[#6D6D78]">
                      {activeCall?.nextStep ?? selectedScenario.nextStep}
                    </p>
                  </div>
                  <div className="rounded-2xl border border-[rgba(102,89,255,0.16)] bg-[rgba(102,89,255,0.08)] p-4">
                    <p className="text-sm leading-6 text-[#5D52D6]">
                      Completed runs automatically move into Call logs with transcripts, variables,
                      guardrails, and sync actions.
                    </p>
                  </div>
                </div>
              </div>
            </Card>
          ) : null}

          <Card>
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold">Recent outcomes</h2>
                <p className="mt-1 text-sm text-[#6D6D78]">
                  Historical review stays separated in Call logs so this page remains launch-focused.
                </p>
              </div>
              <Button asChild href="/calls/logs" variant="secondary">
                Review logs
              </Button>
            </div>

            {callHistory.length ? (
              <div className="mt-4 space-y-3">
                {callHistory.slice(0, 3).map((call) => (
                  <div key={call.id} className="rounded-2xl border border-border bg-[#fcfcff] p-4">
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
                  </div>
                ))}
              </div>
            ) : (
              <div className="mt-4 rounded-2xl border border-dashed border-border bg-[#fcfcff] p-6 text-sm leading-6 text-[#6D6D78]">
                No completed calls yet. Launch the first run to populate Call logs.
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
