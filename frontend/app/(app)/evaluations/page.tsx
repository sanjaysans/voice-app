"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ClipboardCheck, Plus, RefreshCw } from "lucide-react";
import { Badge, Button, Card, ContentLoader, EmptyState, Input, Modal, PageHeader, Select } from "@/components/ui";
import { api } from "@/lib/api-client";
import { useMockApp } from "@/lib/mock-app";
import { useAsyncAction } from "@/lib/use-async-action";

type EvalSuite = {
  suite_id: string;
  agent_id: string;
  name: string;
  description: string;
  status: "draft" | "active" | "archived";
  latest_version_number: number;
  case_count: number;
  last_run_status: string | null;
  last_run_score: number | null;
  updated_at: string;
};

const emptyForm = {
  suiteKey: "",
  name: "",
  description: "",
  caseName: "",
  initialUtterance: "",
  sampleResponse: "",
  outcome: "",
  requiredText: "",
};

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en", { month: "short", day: "numeric", year: "numeric" }).format(new Date(value));
}

function statusTone(status: EvalSuite["status"], lastRunStatus: string | null): "neutral" | "success" | "warning" {
  if (lastRunStatus === "completed") return "success";
  if (status === "draft") return "warning";
  return "neutral";
}

export default function EvaluationsPage() {
  const { tenantSlug, workspaceId, agents } = useMockApp();
  const router = useRouter();
  const [suites, setSuites] = useState<EvalSuite[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [selectedAgentId, setSelectedAgentId] = useState(agents[0]?.id ?? "");
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const createAction = useAsyncAction();

  async function loadSuites() {
    setIsLoading(true);
    setError("");
    try {
      const response = await api<EvalSuite[]>(
        `/api/v1/tenants/${tenantSlug}/workspaces/${workspaceId}/evaluations`
      );
      setSuites(response);
    } catch (loadError) {
      console.error("evaluation suites load failed", loadError);
      setError("We could not load evaluation suites for this workspace.");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    if (tenantSlug && workspaceId) void loadSuites();
  }, [tenantSlug, workspaceId]);

  useEffect(() => {
    if (!agents.some((agent) => agent.id === selectedAgentId)) setSelectedAgentId(agents[0]?.id ?? "");
  }, [agents, selectedAgentId]);

  function updateForm(key: keyof typeof emptyForm, value: string) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function createSuite() {
    const selectedAgent = agents.find((agent) => agent.id === selectedAgentId) ?? agents[0];
    if (!selectedAgent || !form.name.trim()) return;
    try {
      await createAction.run(async () => {
        const created = await api<{ suite_id: string }>(
          `/api/v1/tenants/${tenantSlug}/workspaces/${workspaceId}/evaluations`,
          {
            method: "POST",
            body: JSON.stringify({
              suite_key: form.suiteKey.trim() || form.name.trim().toLowerCase().replace(/\s+/g, "-"),
              name: form.name.trim(),
              description: form.description.trim(),
              agent_id: selectedAgent.id,
              status: "active",
              cases: form.caseName.trim()
                ? [{
                    case_key: form.caseName.trim().toLowerCase().replace(/\s+/g, "-"),
                    name: form.caseName.trim(),
                    scenario: {
                      initial_utterance: form.initialUtterance.trim(),
                      turns: form.initialUtterance.trim() || form.sampleResponse.trim()
                        ? [{ user: form.initialUtterance.trim(), assistant: form.sampleResponse.trim() }]
                        : [],
                    },
                    expected_behavior: { outcome: form.outcome.trim(), sample_response: form.sampleResponse.trim() },
                    assertions: form.requiredText.trim()
                      ? [{ key: "required_response", type: "contains", expected: { text: form.requiredText.trim() }, critical: true }]
                      : [],
                    rubric: [],
                    caller_config: { mode: "scripted_text" },
                  }]
                : [],
            }),
          }
        );
        setForm(emptyForm);
        setIsCreateOpen(false);
        await loadSuites();
        router.push(`/evaluations/${created.suite_id}`);
      });
    } catch (createError) {
      console.error("evaluation suite create failed", createError);
      setError(createError instanceof Error ? createError.message : "We could not create the evaluation suite.");
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Operate"
        title="Evaluations"
        description="Create repeatable confidence checks for each agent, then inspect scenarios and run evidence from a dedicated suite workspace."
        actions={
          <>
            <Button variant="secondary" loading={isLoading} onClick={() => void loadSuites()}>
              <RefreshCw size={16} /> Refresh
            </Button>
            <Button onClick={() => setIsCreateOpen(true)} disabled={!agents.length}>
              <Plus size={16} /> New suite
            </Button>
          </>
        }
      />

      {error ? <Card className="border-[rgba(220,38,38,0.22)] bg-[rgba(220,38,38,0.04)]"><p className="text-sm text-danger">{error}</p></Card> : null}
      {isLoading ? <ContentLoader title="Loading test suites" description="Fetching suites for the current workspace." /> : null}

      {!isLoading && !suites.length ? (
        <EmptyState
          title="No test suites yet"
          description="Create a suite for an agent to start validating its behavior before production traffic."
          action={<Button onClick={() => setIsCreateOpen(true)} disabled={!agents.length}><Plus size={16} /> Create suite</Button>}
        />
      ) : null}

      {!isLoading && suites.length ? (
        <Card>
          <div className="flex flex-wrap items-end justify-between gap-4 border-b border-border pb-5">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-accent">Test suites</p>
              <h2 className="mt-2 text-lg font-semibold">Confidence checks for your agents</h2>
              <p className="mt-1 text-sm text-[#6D6D78]">Open a suite to manage its cases, runs, and versioned evidence.</p>
            </div>
            <Badge tone="neutral">{suites.length} {suites.length === 1 ? "suite" : "suites"}</Badge>
          </div>
          <div className="mt-5 divide-y divide-border">
            {suites.map((suite) => {
              const agent = agents.find((item) => item.id === suite.agent_id);
              return (
                <Link
                  key={suite.suite_id}
                  href={`/evaluations/${suite.suite_id}`}
                  className="group flex flex-wrap items-center justify-between gap-5 py-5 first:pt-0 last:pb-0"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-3">
                      <h3 className="font-semibold text-[#17171F] group-hover:text-accent">{suite.name}</h3>
                      <Badge tone={statusTone(suite.status, suite.last_run_status)}>{suite.last_run_status ?? suite.status}</Badge>
                    </div>
                    <p className="mt-2 line-clamp-2 text-sm leading-6 text-[#6D6D78]">{suite.description || "No description"}</p>
                    <p className="mt-3 text-xs text-[#8A8A98]">Agent: {agent?.name ?? "Unknown agent"} · Updated {formatDate(suite.updated_at)}</p>
                  </div>
                  <div className="flex items-center gap-8 text-right">
                    <div><p className="text-xs uppercase tracking-[0.14em] text-[#8A8A98]">Cases</p><p className="mt-1 font-semibold">{suite.case_count}</p></div>
                    <div><p className="text-xs uppercase tracking-[0.14em] text-[#8A8A98]">Last score</p><p className="mt-1 font-semibold">{suite.last_run_score == null ? "Not run" : `${Math.round(suite.last_run_score * 100)}%`}</p></div>
                    <span className="text-sm font-medium text-accent">Open <span aria-hidden="true">-&gt;</span></span>
                  </div>
                </Link>
              );
            })}
          </div>
        </Card>
      ) : null}

      <Modal title="Create evaluation suite" description="Start with one scenario. Add more cases from the suite workspace." isOpen={isCreateOpen} onClose={() => { if (!createAction.isPending) setIsCreateOpen(false); }}>
        <div className="space-y-4">
          <Select label="Agent" options={agents.map((agent) => ({ label: agent.name, value: agent.id }))} value={selectedAgentId} onChange={(event) => setSelectedAgentId(event.target.value)} />
          <div className="grid gap-4 sm:grid-cols-2"><Input label="Suite name" value={form.name} onChange={(event) => updateForm("name", event.target.value)} placeholder="Conversation confidence" /><Input label="Suite key" value={form.suiteKey} onChange={(event) => updateForm("suiteKey", event.target.value)} placeholder="conversation-confidence" /></div>
          <Input label="Description" value={form.description} onChange={(event) => updateForm("description", event.target.value)} placeholder="What this suite protects" />
          <div className="border-t border-border pt-4"><p className="text-sm font-semibold">First scenario <span className="font-normal text-[#8A8A98]">(optional)</span></p><div className="mt-3 space-y-4"><Input label="Case name" value={form.caseName} onChange={(event) => updateForm("caseName", event.target.value)} placeholder="Clear request" /><Input label="Caller opening" value={form.initialUtterance} onChange={(event) => updateForm("initialUtterance", event.target.value)} placeholder="What the simulated caller says first" /><Input label="Recorded agent response" value={form.sampleResponse} onChange={(event) => updateForm("sampleResponse", event.target.value)} placeholder="The response captured in this trace" /><Input label="Expected outcome" value={form.outcome} onChange={(event) => updateForm("outcome", event.target.value)} placeholder="The workflow outcome" /><Input label="Required response text" value={form.requiredText} onChange={(event) => updateForm("requiredText", event.target.value)} placeholder="Optional exact text fragment" /></div></div>
          <div className="flex justify-end gap-3 pt-2"><Button variant="secondary" onClick={() => setIsCreateOpen(false)} disabled={createAction.isPending}>Cancel</Button><Button loading={createAction.isPending} loadingText="Creating" onClick={() => void createSuite()} disabled={!form.name.trim() || !agents.length}><ClipboardCheck size={16} /> Create suite</Button></div>
        </div>
      </Modal>
    </div>
  );
}
