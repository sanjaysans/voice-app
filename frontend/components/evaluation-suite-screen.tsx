"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, CheckCircle2, Clock3, FileAudio, Play, Plus, RefreshCw, Trash2, XCircle } from "lucide-react";
import { Badge, Button, Card, ConfirmActionModal, ContentLoader, EmptyState, Input, Modal, SurfaceLoader } from "@/components/ui";
import { api, apiBlob } from "@/lib/api-client";
import { useMockApp } from "@/lib/mock-app";
import { useAsyncAction, useKeyedAsyncAction } from "@/lib/use-async-action";

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
};

type EvalCase = {
  case_id: string;
  name: string;
  scenario: Record<string, unknown>;
  expected_behavior: Record<string, unknown>;
  assertions: Array<{ key: string; type: string }>;
};

type EvalSuiteDetail = EvalSuite & { cases: EvalCase[]; created_at: string; updated_at: string };
type EvalRunSummary = {
  run_id: string;
  suite_id: string;
  execution_mode: string;
  status: string;
  total_cases: number;
  passed_cases: number;
  failed_cases: number;
  score: number | null;
  summary: string;
  created_at: string;
  started_at: string | null;
  ended_at: string | null;
};
type EvalRun = EvalRunSummary & {
  case_runs: Array<{
    case_run_id: string;
    case_name: string;
    call_id: string | null;
    passed: boolean | null;
    score: number | null;
    failure_summary: string;
    evidence: Record<string, unknown>;
    assertions: Array<{ assertion_key: string; passed: boolean; explanation: string }>;
  }>;
};

const emptyCaseForm = { caseName: "", initialUtterance: "", sampleResponse: "", outcome: "", requiredText: "" };
type SuiteTab = "overview" | "cases" | "history";

function formatDate(value: string | null) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("en", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(value));
}

function scoreLabel(score: number | null) {
  return score == null ? "Not run" : `${Math.round(score * 100)}%`;
}

function statusTone(status: string): "neutral" | "success" | "warning" | "danger" {
  if (status === "completed") return "success";
  if (status === "failed" || status === "cancelled") return "danger";
  if (status === "running" || status === "queued" || status === "scoring") return "warning";
  return "neutral";
}

function caseStatus(passed: boolean | null) {
  if (passed === true) return { label: "Passed", tone: "success" as const };
  if (passed === false) return { label: "Failed", tone: "danger" as const };
  return { label: "Pending", tone: "warning" as const };
}

export function EvaluationSuiteScreen({ suiteId }: { suiteId: string }) {
  const { tenantSlug, workspaceId, agents } = useMockApp();
  const [suite, setSuite] = useState<EvalSuiteDetail | null>(null);
  const [runs, setRuns] = useState<EvalRunSummary[]>([]);
  const [selectedRun, setSelectedRun] = useState<EvalRun | null>(null);
  const [activeTab, setActiveTab] = useState<SuiteTab>("cases");
  const [caseForm, setCaseForm] = useState(emptyCaseForm);
  const [isCaseOpen, setIsCaseOpen] = useState(false);
  const [caseToDelete, setCaseToDelete] = useState<EvalCase | null>(null);
  const [evidenceCase, setEvidenceCase] = useState<EvalRun["case_runs"][number] | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isHistoryLoading, setIsHistoryLoading] = useState(false);
  const [error, setError] = useState("");
  const caseAction = useAsyncAction();
  const runAction = useAsyncAction();
  const deleteCaseAction = useKeyedAsyncAction();

  const suitePath = `/api/v1/tenants/${tenantSlug}/workspaces/${workspaceId}/evaluations/${suiteId}`;

  async function loadSuite() {
    setIsLoading(true);
    setError("");
    try {
      const response = await api<EvalSuiteDetail>(suitePath);
      setSuite(response);
    } catch (loadError) {
      console.error("evaluation suite load failed", loadError);
      setError("We could not load this evaluation suite.");
    } finally {
      setIsLoading(false);
    }
  }

  async function loadRuns() {
    setIsHistoryLoading(true);
    try {
      const response = await api<EvalRunSummary[]>(`${suitePath}/runs?limit=50`);
      setRuns(response);
    } catch (loadError) {
      console.error("evaluation run history load failed", loadError);
      setError("We could not load run history for this suite.");
    } finally {
      setIsHistoryLoading(false);
    }
  }

  useEffect(() => {
    if (tenantSlug && workspaceId) {
      void loadSuite();
      void loadRuns();
    }
  }, [tenantSlug, workspaceId, suiteId]);

  function updateCaseForm(key: keyof typeof emptyCaseForm, value: string) {
    setCaseForm((current) => ({ ...current, [key]: value }));
  }

  async function createCase() {
    if (!suite || !caseForm.caseName.trim()) return;
    try {
      await caseAction.run(async () => {
        await api<EvalCase>(`${suitePath}/cases`, {
          method: "POST",
          body: JSON.stringify({
            case_key: caseForm.caseName.trim().toLowerCase().replace(/\s+/g, "-"),
            name: caseForm.caseName.trim(),
            scenario: {
              initial_utterance: caseForm.initialUtterance.trim(),
              turns: caseForm.initialUtterance.trim() || caseForm.sampleResponse.trim()
                ? [{ user: caseForm.initialUtterance.trim(), assistant: caseForm.sampleResponse.trim() }]
                : [],
            },
            expected_behavior: { outcome: caseForm.outcome.trim(), sample_response: caseForm.sampleResponse.trim() },
            assertions: caseForm.requiredText.trim()
              ? [{ key: "required_response", type: "contains", expected: { text: caseForm.requiredText.trim() }, critical: true }]
              : [],
            rubric: [],
            caller_config: { mode: "scripted_text" },
          }),
        });
        setCaseForm(emptyCaseForm);
        setIsCaseOpen(false);
        await loadSuite();
      });
    } catch (createError) {
      console.error("evaluation case create failed", createError);
      setError(createError instanceof Error ? createError.message : "We could not add the evaluation case.");
    }
  }

  async function deleteCase() {
    if (!caseToDelete) return;
    try {
      await deleteCaseAction.run(`delete:${caseToDelete.case_id}`, async () => {
        await api<void>(`${suitePath}/cases/${caseToDelete.case_id}`, { method: "DELETE" });
        setCaseToDelete(null);
        await loadSuite();
      });
    } catch (deleteError) {
      console.error("evaluation case delete failed", deleteError);
      setError(deleteError instanceof Error ? deleteError.message : "We could not delete the evaluation case.");
    }
  }

  async function runSuite() {
    if (!suite?.cases.length) return;
    try {
      await runAction.run(async () => {
        const response = await api<EvalRun>(`${suitePath}/runs`, {
          method: "POST",
          body: JSON.stringify({ execution_mode: "live_audio", repeat_count: 1 }),
        });
        setSelectedRun(response);
        setActiveTab("history");
        await waitForRun(response.run_id);
        await Promise.all([loadSuite(), loadRuns()]);
      });
    } catch (runError) {
      console.error("evaluation suite run failed", runError);
      setError(runError instanceof Error ? runError.message : "We could not run the evaluation suite.");
    }
  }

  async function waitForRun(runId: string) {
    for (let attempt = 0; attempt < 120; attempt += 1) {
      await new Promise((resolve) => window.setTimeout(resolve, 2000));
      const response = await api<EvalRun>(`/api/v1/tenants/${tenantSlug}/workspaces/${workspaceId}/evaluations/runs/${runId}`);
      setSelectedRun(response);
      if (["completed", "failed", "cancelled"].includes(response.status)) return;
    }
    throw new Error("The live evaluation is still running. Check run history for progress.");
  }

  async function openRun(runId: string) {
    try {
      const response = await api<EvalRun>(`/api/v1/tenants/${tenantSlug}/workspaces/${workspaceId}/evaluations/runs/${runId}`);
      setSelectedRun(response);
    } catch (runError) {
      console.error("evaluation run load failed", runError);
      setError("We could not load that evaluation run.");
    }
  }

  const agentName = agents.find((agent) => agent.id === suite?.agent_id)?.name ?? "Unknown agent";

  if (isLoading) return <ContentLoader title="Loading evaluation suite" description="Fetching suite configuration and test cases." />;

  if (!suite) {
    return <EmptyState title="Suite not found" description={error || "This evaluation suite is no longer available."} action={<Button asChild href="/evaluations" variant="secondary">Back to suites</Button>} />;
  }

  const tabs: Array<{ id: SuiteTab; label: string; description: string }> = [
    { id: "overview", label: "Overview", description: "Suite scope and latest result" },
    { id: "cases", label: "Test cases", description: `${suite.cases.length} scenarios` },
    { id: "history", label: "Run history", description: `${runs.length} recorded runs` },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <Button asChild href="/evaluations" variant="ghost" size="sm"><ArrowLeft size={16} /> All suites</Button>
        <div className="flex items-center gap-3"><Button variant="secondary" loading={isLoading || isHistoryLoading} onClick={() => void Promise.all([loadSuite(), loadRuns()])}><RefreshCw size={16} /> Refresh</Button><Button loading={runAction.isPending} loadingText="Running" onClick={() => void runSuite()} disabled={!suite.cases.length}><Play size={16} /> Run suite</Button></div>
      </div>

      {error ? <Card className="border-[rgba(220,38,38,0.22)] bg-[rgba(220,38,38,0.04)]"><p className="text-sm text-danger">{error}</p></Card> : null}

      <Card className="p-0">
        <div className="flex flex-wrap items-start justify-between gap-5 border-b border-border p-6">
          <div><p className="text-xs font-semibold uppercase tracking-[0.2em] text-accent">Evaluation suite</p><h1 className="mt-2 text-2xl font-semibold text-[#17171F]">{suite.name}</h1><p className="mt-2 max-w-3xl text-sm leading-6 text-[#6D6D78]">{suite.description || "Validate this agent with repeatable scenarios before production traffic."}</p></div>
          <Badge tone={suite.status === "active" ? "success" : "warning"}>{suite.status}</Badge>
        </div>
        <div className="grid gap-3 border-b border-border bg-[#fcfcff] p-4 sm:grid-cols-3"><div className="rounded-2xl border border-border bg-white p-4"><p className="text-xs uppercase tracking-[0.14em] text-[#8A8A98]">Agent</p><p className="mt-2 text-sm font-medium">{agentName}</p></div><div className="rounded-2xl border border-border bg-white p-4"><p className="text-xs uppercase tracking-[0.14em] text-[#8A8A98]">Frozen version</p><p className="mt-2 text-sm font-medium">v{suite.latest_version_number}</p></div><div className="rounded-2xl border border-border bg-white p-4"><p className="text-xs uppercase tracking-[0.14em] text-[#8A8A98]">Latest score</p><p className="mt-2 text-sm font-medium">{scoreLabel(suite.last_run_score)}</p></div></div>
        <div className="flex flex-wrap gap-2 p-3" role="tablist" aria-label="Evaluation suite sections">{tabs.map((tab) => <button key={tab.id} type="button" role="tab" aria-selected={activeTab === tab.id} onClick={() => setActiveTab(tab.id)} className={`rounded-xl px-4 py-3 text-left transition ${activeTab === tab.id ? "bg-[rgba(102,89,255,0.1)] text-accent" : "text-[#6D6D78] hover:bg-[#f7f7f9]"}`}><span className="block text-sm font-semibold">{tab.label}</span><span className="mt-1 block text-xs">{tab.description}</span></button>)}</div>
      </Card>

      {activeTab === "overview" ? <OverviewTab suite={suite} runs={runs} onOpenHistory={() => setActiveTab("history")} /> : null}
      {activeTab === "cases" ? <CasesTab suite={suite} onAdd={() => setIsCaseOpen(true)} onDelete={setCaseToDelete} /> : null}
      {activeTab === "history" ? <HistoryTab runs={runs} selectedRun={selectedRun} isLoading={isHistoryLoading} onOpenRun={openRun} onOpenEvidence={setEvidenceCase} /> : null}

      <CallEvidenceModal tenantSlug={tenantSlug} workspaceId={workspaceId} caseRun={evidenceCase} onClose={() => setEvidenceCase(null)} />

      <Modal title="Add evaluation case" description="Define one repeatable caller scenario and its expected response." isOpen={isCaseOpen} onClose={() => { if (!caseAction.isPending) setIsCaseOpen(false); }}>
        <div className="space-y-4"><Input label="Case name" value={caseForm.caseName} onChange={(event) => updateCaseForm("caseName", event.target.value)} placeholder="Clear request" /><Input label="Caller opening" value={caseForm.initialUtterance} onChange={(event) => updateCaseForm("initialUtterance", event.target.value)} placeholder="What the simulated caller says first" /><Input label="Recorded agent response" value={caseForm.sampleResponse} onChange={(event) => updateCaseForm("sampleResponse", event.target.value)} placeholder="The response captured in this trace" /><Input label="Expected outcome" value={caseForm.outcome} onChange={(event) => updateCaseForm("outcome", event.target.value)} placeholder="The workflow outcome" /><Input label="Required response text" value={caseForm.requiredText} onChange={(event) => updateCaseForm("requiredText", event.target.value)} placeholder="Optional exact text fragment" /><div className="flex justify-end gap-3 pt-2"><Button variant="secondary" onClick={() => setIsCaseOpen(false)} disabled={caseAction.isPending}>Cancel</Button><Button loading={caseAction.isPending} loadingText="Adding" onClick={() => void createCase()} disabled={!caseForm.caseName.trim()}><Plus size={16} /> Add case</Button></div></div>
      </Modal>

      <ConfirmActionModal title="Delete evaluation case?" description={`This removes ${caseToDelete?.name ?? "this case"} from active scenarios. Cases with run evidence are archived so their history remains intact.`} isOpen={Boolean(caseToDelete)} onClose={() => { if (!deleteCaseAction.isPending) setCaseToDelete(null); }} isPending={deleteCaseAction.pendingKey === `delete:${caseToDelete?.case_id ?? ""}`} confirmLabel="Delete case" onConfirm={() => void deleteCase()} />
    </div>
  );
}

function OverviewTab({ suite, runs, onOpenHistory }: { suite: EvalSuiteDetail; runs: EvalRunSummary[]; onOpenHistory: () => void }) {
  const latestRun = runs[0];
  return <div className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]"><Card><p className="text-xs font-semibold uppercase tracking-[0.2em] text-accent">Suite overview</p><h2 className="mt-2 text-xl font-semibold">What this suite protects</h2><p className="mt-2 text-sm leading-6 text-[#6D6D78]">Every run joins a real isolated LiveKit room with the saved agent and an automated caller, then scores the captured call evidence.</p><div className="mt-6 grid gap-3 sm:grid-cols-2"><Info label="Test cases" value={String(suite.cases.length)} /><Info label="Execution mode" value="Live audio" /><Info label="Created" value={formatDate(suite.created_at)} /><Info label="Last updated" value={formatDate(suite.updated_at)} /></div></Card><Card><div className="flex items-start justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-[0.2em] text-accent">Latest run</p><h2 className="mt-2 text-xl font-semibold">{latestRun ? scoreLabel(latestRun.score) : "Not run yet"}</h2></div>{latestRun ? <Badge tone={statusTone(latestRun.status)}>{latestRun.status}</Badge> : null}</div>{latestRun ? <><p className="mt-3 text-sm text-[#6D6D78]">{latestRun.summary}</p><div className="mt-5 grid grid-cols-3 gap-2"><Info label="Passed" value={String(latestRun.passed_cases)} /><Info label="Failed" value={String(latestRun.failed_cases)} /><Info label="Cases" value={String(latestRun.total_cases)} /></div><Button variant="secondary" size="sm" className="mt-5" onClick={onOpenHistory}>View run history</Button></> : <p className="mt-3 text-sm leading-6 text-[#6D6D78]">Run this suite to create the first evidence record.</p>}</Card></div>;
}

function CasesTab({ suite, onAdd, onDelete }: { suite: EvalSuiteDetail; onAdd: () => void; onDelete: (item: EvalCase) => void }) {
  return <Card><div className="flex flex-wrap items-end justify-between gap-4 border-b border-border pb-5"><div><p className="text-xs font-semibold uppercase tracking-[0.2em] text-accent">Scenarios</p><h2 className="mt-2 text-xl font-semibold">Test cases</h2><p className="mt-1 text-sm text-[#6D6D78]">Each case is a repeatable caller scenario with explicit expected behavior.</p></div><Button size="sm" variant="secondary" onClick={onAdd}><Plus size={15} /> Add case</Button></div>{suite.cases.length ? <div className="mt-5 divide-y divide-border">{suite.cases.map((item, index) => <div key={item.case_id} className="flex flex-wrap items-start justify-between gap-4 py-5 first:pt-0 last:pb-0"><div className="flex min-w-0 gap-4"><div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-[rgba(102,89,255,0.1)] text-sm font-semibold text-accent">{index + 1}</div><div className="min-w-0"><div className="flex flex-wrap items-center gap-3"><h3 className="font-semibold">{item.name}</h3><Badge tone="neutral">{item.assertions.length} assertions</Badge></div><p className="mt-2 text-sm leading-6 text-[#6D6D78]">{String(item.scenario.initial_utterance || "No caller opening defined")}</p><p className="mt-3 text-xs uppercase tracking-[0.14em] text-[#8A8A98]">Expected outcome <span className="normal-case tracking-normal text-[#4B4B59]">{String(item.expected_behavior.outcome || "Not defined")}</span></p></div></div><Button variant="ghost" size="sm" aria-label={`Delete ${item.name}`} onClick={() => onDelete(item)}><Trash2 size={15} /></Button></div>)}</div> : <EmptyState title="No test cases yet" description="Add a scenario to make this suite runnable." action={<Button onClick={onAdd}><Plus size={16} /> Add case</Button>} />}</Card>;
}

function HistoryTab({ runs, selectedRun, isLoading, onOpenRun, onOpenEvidence }: { runs: EvalRunSummary[]; selectedRun: EvalRun | null; isLoading: boolean; onOpenRun: (runId: string) => void; onOpenEvidence: (caseRun: EvalRun["case_runs"][number]) => void }) {
  if (isLoading) return <ContentLoader title="Loading run history" description="Fetching previous suite executions." />;
  return <div className="grid items-start gap-6 lg:grid-cols-[minmax(260px,30%)_minmax(0,1fr)]"><Card className="lg:sticky lg:top-6"><div className="flex items-end justify-between gap-4 border-b border-border pb-5"><div><p className="text-xs font-semibold uppercase tracking-[0.2em] text-accent">Evidence</p><h2 className="mt-2 text-xl font-semibold">Run history</h2><p className="mt-1 text-sm text-[#6D6D78]">Select an execution to inspect its evidence.</p></div><Badge tone="neutral">{runs.length}</Badge></div>{runs.length ? <div className="mt-5 space-y-2">{runs.map((run) => <button key={run.run_id} type="button" onClick={() => onOpenRun(run.run_id)} className={`w-full rounded-2xl border p-4 text-left transition ${selectedRun?.run_id === run.run_id ? "border-[rgba(102,89,255,0.35)] bg-[rgba(102,89,255,0.08)] text-accent" : "border-border bg-white hover:border-[rgba(102,89,255,0.25)] hover:bg-[#fcfcff]"}`}><div className="flex items-start justify-between gap-3"><div className="flex min-w-0 items-start gap-3"><Clock3 size={17} className="mt-0.5 shrink-0 text-[#8A8A98]" /><div className="min-w-0"><p className="truncate font-medium">{formatDate(run.created_at)}</p><p className="mt-1 text-xs capitalize text-[#8A8A98]">{run.execution_mode.replace("_", " ")}</p></div></div><span className="shrink-0 text-sm font-semibold">{scoreLabel(run.score)}</span></div><div className="mt-3 flex items-center justify-between gap-3"><span className="text-xs text-[#6D6D78]">{run.passed_cases}/{run.total_cases} passed</span><Badge tone={statusTone(run.status)}>{run.status}</Badge></div></button>)}</div> : <div className="py-10"><EmptyState title="No runs yet" description="Run the suite to create the first evidence record." /></div>}</Card>{selectedRun ? <RunDetail run={selectedRun} onOpenEvidence={onOpenEvidence} /> : <Card className="flex min-h-[360px] items-center justify-center"><EmptyState title="Select a run" description="Choose an execution from the history list to review its cases, assertions, and evidence." /></Card>}</div>;
}

function RunDetail({ run, onOpenEvidence }: { run: EvalRun; onOpenEvidence: (caseRun: EvalRun["case_runs"][number]) => void }) {
  return <Card><div className="flex flex-wrap items-start justify-between gap-4 border-b border-border pb-5"><div><p className="text-xs font-semibold uppercase tracking-[0.2em] text-accent">Run detail</p><h2 className="mt-2 text-xl font-semibold">{run.summary}</h2><p className="mt-2 text-sm text-[#6D6D78]">Started {formatDate(run.started_at)} · Ended {formatDate(run.ended_at)}</p></div><Badge tone={run.failed_cases ? "danger" : "success"}>{scoreLabel(run.score)}</Badge></div><div className="mt-5 space-y-3">{run.case_runs.map((item) => { const result = caseStatus(item.passed); return <div key={item.case_run_id} className={`rounded-2xl border p-4 ${item.passed === true ? "border-[rgba(22,163,74,0.24)] bg-[rgba(22,163,74,0.04)]" : item.passed === false ? "border-[rgba(220,38,38,0.24)] bg-[rgba(220,38,38,0.04)]" : "border-[rgba(217,119,6,0.24)] bg-[rgba(217,119,6,0.04)]"}`}><div className="flex flex-wrap items-center gap-3">{item.passed === true ? <CheckCircle2 className="text-success" size={20} /> : item.passed === false ? <XCircle className="text-danger" size={20} /> : <Clock3 className="text-warning" size={20} />}<p className="font-semibold">{item.case_name}</p><Badge tone={result.tone}>{result.label}</Badge><span className="ml-auto font-semibold">{scoreLabel(item.score)}</span>{item.call_id ? <Button variant="secondary" size="sm" onClick={() => onOpenEvidence(item)}><FileAudio size={15} /> View call</Button> : null}</div>{item.failure_summary ? <p className="mt-3 rounded-xl border border-[rgba(220,38,38,0.16)] bg-white/70 px-3 py-2 text-sm font-medium text-danger">{item.failure_summary}</p> : null}<div className="mt-3 space-y-2">{item.assertions.map((assertion) => <p key={assertion.assertion_key} className="text-sm text-[#6D6D78]"><span className={assertion.passed ? "font-semibold text-success" : "font-semibold text-danger"}>{assertion.passed ? "PASS" : "FAIL"}</span> · {assertion.explanation}</p>)}</div></div>; })}</div></Card>;
}

function CallEvidenceModal({ tenantSlug, workspaceId, caseRun, onClose }: { tenantSlug: string; workspaceId: string; caseRun: EvalRun["case_runs"][number] | null; onClose: () => void }) {
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [isAudioLoading, setIsAudioLoading] = useState(false);
  const [audioError, setAudioError] = useState("");

  useEffect(() => {
    setAudioUrl(null);
    setAudioError("");
    if (!caseRun?.call_id) {
      setIsAudioLoading(false);
      setAudioUrl(null);
      return;
    }
    let objectUrl: string | null = null;
    setIsAudioLoading(true);
    void apiBlob(`/api/v1/tenants/${tenantSlug}/workspaces/${workspaceId}/calls/${caseRun.call_id}/recording`)
      .then((blob) => {
        objectUrl = URL.createObjectURL(blob);
        setAudioUrl(objectUrl);
      })
      .catch(() => setAudioError("No audio recording is available for this call."))
      .finally(() => setIsAudioLoading(false));
    return () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [caseRun, tenantSlug, workspaceId]);

  const transcript = (caseRun?.evidence.transcript as Array<{ speaker?: string; text?: string }> | undefined) ?? [];
  return <Modal title={caseRun?.case_name ?? "Call evidence"} description="Review the captured transcript and recording from this live evaluation call." isOpen={Boolean(caseRun)} onClose={onClose}><div className="space-y-5"><div className="rounded-2xl border border-border bg-[#fcfcff] p-4"><div className="flex items-center justify-between gap-3"><p className="text-sm font-medium text-[#17171F]">Audio recording</p><Badge tone={audioUrl ? "success" : "neutral"}>{isAudioLoading ? "Loading" : audioUrl ? "Available" : "Unavailable"}</Badge></div>{audioUrl ? <audio className="mt-4 w-full" controls src={audioUrl} /> : <p className="mt-3 text-sm text-[#6D6D78]">{isAudioLoading ? "Fetching the call recording..." : audioError || "This call has no recording artifact."}</p>}</div><div className="rounded-2xl border border-border bg-white p-4"><div className="flex items-center justify-between gap-3"><p className="text-sm font-medium text-[#17171F]">Transcript</p><Badge tone={transcript.length ? "success" : "neutral"}>{transcript.length} turns</Badge></div><div className="mt-4 max-h-[420px] space-y-3 overflow-y-auto pr-1">{transcript.length ? transcript.map((turn, index) => <div key={`${turn.speaker}-${index}`} className="rounded-2xl border border-border bg-[#fcfcff] px-4 py-3"><p className="text-xs font-semibold uppercase tracking-[0.14em] text-accent">{turn.speaker || "Unknown"}</p><p className="mt-2 text-sm leading-6 text-[#4B4B59]">{turn.text || ""}</p></div>) : <p className="text-sm text-[#6D6D78]">No transcript was captured for this call.</p>}</div></div></div></Modal>;
}

function Info({ label, value }: { label: string; value: string }) {
  return <div className="rounded-2xl border border-border bg-[#fcfcff] p-4"><p className="text-xs uppercase tracking-[0.14em] text-[#8A8A98]">{label}</p><p className="mt-2 text-sm font-medium text-[#17171F]">{value}</p></div>;
}
