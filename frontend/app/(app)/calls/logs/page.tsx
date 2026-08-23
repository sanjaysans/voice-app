"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Search } from "lucide-react";
import { Badge, Button, Card, ContentLoader, EmptyState, Input, PageHeader, Select, SurfaceLoader } from "@/components/ui";
import { api } from "@/lib/api-client";
import { useMockApp } from "@/lib/mock-app";

type CallLogItem = {
  call_id: string;
  agent_id: string | null;
  is_test: boolean;
  direction: string;
  agent_name: string;
  lead_name: string;
  company: string;
  phone: string;
  scenario_name: string;
  status: "Completed" | "Follow-up" | "Dropped";
  status_tone: "success" | "warning" | "danger";
  duration: string;
  time: string;
  summary: string;
  outcome: string;
  next_step: string;
  vendor_trace: string;
  synced_to_crm: boolean;
  extracted_variables: Array<{ key: string; value: string }>;
  tool_calls: Array<{ name: string; result: string }>;
  guardrails: string[];
  transcript: Array<{ speaker: string; timestamp: string; text: string }>;
  created_at: string;
  started_at: string | null;
  ended_at: string | null;
};

type CallLogsResponse = {
  items: CallLogItem[];
  page: number;
  page_size: number;
  total_items: number;
  total_pages: number;
  has_previous: boolean;
  has_next: boolean;
};

function formatDateTime(value: string | null) {
  if (!value) {
    return "Not available";
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function rangeLabel(response: CallLogsResponse | null) {
  if (!response || response.total_items === 0) {
    return "0 results";
  }

  const start = (response.page - 1) * response.page_size + 1;
  const end = start + response.items.length - 1;
  return `${start}-${end} of ${response.total_items}`;
}

export default function CallLogsPage() {
  const { tenantSlug, workspaceId } = useMockApp();
  const [logs, setLogs] = useState<CallLogsResponse | null>(null);
  const [selectedCallId, setSelectedCallId] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [searchDraft, setSearchDraft] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [callTypeFilter, setCallTypeFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState("10");
  const hasLoadedRef = useRef(false);

  useEffect(() => {
    if (!tenantSlug || !workspaceId) {
      return;
    }

    let cancelled = false;

    async function loadLogs() {
      const showInitialLoader = !hasLoadedRef.current;
      if (!showInitialLoader) {
        setIsRefreshing(true);
      }

      try {
        setError("");
        const response = await api<CallLogsResponse>(
          `/api/v1/tenants/${tenantSlug}/workspaces/${workspaceId}/calls/logs?${new URLSearchParams({
            page: String(page),
            page_size: pageSize,
            call_type: callTypeFilter,
            ...(statusFilter !== "all" ? { status: statusFilter } : {}),
            ...(searchQuery ? { query: searchQuery } : {}),
          }).toString()}`
        );

        if (cancelled) {
          return;
        }

        setLogs(response);
        hasLoadedRef.current = true;
        setSelectedCallId((current) =>
          response.items.some((item) => item.call_id === current) ? current : response.items[0]?.call_id || ""
        );
      } catch (loadError) {
        if (cancelled) {
          return;
        }
        console.error("call logs load failed", loadError);
        setLogs({
          items: [],
          page,
          page_size: Number(pageSize),
          total_items: 0,
          total_pages: 1,
          has_previous: false,
          has_next: false,
        });
        setSelectedCallId("");
        setError("We couldn’t load call logs for this workspace. Retry once backend connectivity is stable.");
      } finally {
        if (cancelled) {
          return;
        }
        setIsLoading(false);
        setIsRefreshing(false);
      }
    }

    void loadLogs();

    return () => {
      cancelled = true;
    };
  }, [callTypeFilter, page, pageSize, searchQuery, statusFilter, tenantSlug, workspaceId]);

  const selectedCall = useMemo(
    () => logs?.items.find((item) => item.call_id === selectedCallId) ?? logs?.items[0] ?? null,
    [logs, selectedCallId]
  );

  function applySearch() {
    setPage(1);
    setSearchQuery(searchDraft.trim());
  }

  function resetFilters() {
    setSearchDraft("");
    setSearchQuery("");
    setStatusFilter("all");
    setCallTypeFilter("all");
    setPageSize("10");
    setPage(1);
  }

  const hasItems = Boolean(logs?.items.length);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Operate"
        title="Call logs"
        description="Review production and test calls together, then filter down by status, call type, or free-text search when you need a narrower investigation view."
      />

      <Card className="space-y-5">
        <div className="grid gap-4 xl:grid-cols-[1.2fr_0.7fr_0.7fr_0.5fr_auto]">
          <Input
            label="Search"
            icon={Search}
            placeholder="Search agent, lead, company, phone, scenario, or summary"
            value={searchDraft}
            onChange={(event) => setSearchDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                applySearch();
              }
            }}
          />

          <Select
            label="Status"
            options={[
              { label: "All statuses", value: "all" },
              { label: "Completed", value: "Completed" },
              { label: "Follow-up", value: "Follow-up" },
              { label: "Dropped", value: "Dropped" },
            ]}
            value={statusFilter}
            onChange={(event) => {
              setPage(1);
              setStatusFilter(event.target.value);
            }}
          />

          <Select
            label="Call type"
            options={[
              { label: "All calls", value: "all" },
              { label: "Production only", value: "production" },
              { label: "Test only", value: "test" },
            ]}
            value={callTypeFilter}
            onChange={(event) => {
              setPage(1);
              setCallTypeFilter(event.target.value);
            }}
          />

          <Select
            label="Page size"
            options={[
              { label: "10", value: "10" },
              { label: "25", value: "25" },
              { label: "50", value: "50" },
            ]}
            value={pageSize}
            onChange={(event) => {
              setPage(1);
              setPageSize(event.target.value);
            }}
          />

          <div className="flex items-end gap-3">
            <Button className="justify-center" onClick={applySearch}>
              Apply filters
            </Button>
            <Button variant="secondary" onClick={resetFilters}>
              Reset
            </Button>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-[#FCFCFF] px-4 py-3">
          <p className="text-sm text-[#4B4B59]">
            {rangeLabel(logs)}
            {searchQuery ? ` matching "${searchQuery}"` : ""}
          </p>
          <div className="flex items-center gap-2">
            <Badge tone="neutral">{callTypeFilter === "all" ? "Production + test" : callTypeFilter}</Badge>
            {statusFilter !== "all" ? <Badge tone="neutral">{statusFilter}</Badge> : null}
          </div>
        </div>

        {error ? (
          <div className="rounded-2xl border border-[rgba(220,38,38,0.16)] bg-[rgba(220,38,38,0.08)] px-4 py-3 text-sm text-danger">
            {error}
          </div>
        ) : null}
      </Card>

      {isLoading ? (
        <ContentLoader
          title="Loading call logs"
          description="Fetching historical production and test calls for this workspace."
        />
      ) : null}

      {!isLoading ? (
        <div className="relative">
          {isRefreshing ? <SurfaceLoader message="Refreshing call logs..." /> : null}
          {hasItems ? (
            <div className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
              <Card>
                <div className="space-y-3">
                  {logs?.items.map((call) => {
                    const isSelected = call.call_id === selectedCall?.call_id;

                    return (
                      <button
                        key={call.call_id}
                        type="button"
                        onClick={() => setSelectedCallId(call.call_id)}
                        className={`w-full rounded-2xl border px-4 py-4 text-left transition ${
                          isSelected
                            ? "border-[rgba(102,89,255,0.30)] bg-[rgba(102,89,255,0.08)]"
                            : "border-border bg-[#FCFCFF] hover:bg-white"
                        }`}
                      >
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div>
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="text-sm font-semibold text-[#17171F]">{call.lead_name}</p>
                              <Badge tone={call.status_tone}>{call.status}</Badge>
                              <Badge tone="neutral">{call.is_test ? "Test" : "Production"}</Badge>
                            </div>
                            <p className="mt-1 text-sm text-[#4B4B59]">
                              {call.company} · {call.agent_name}
                            </p>
                          </div>
                          <div className="text-right">
                            <p className="text-xs uppercase tracking-[0.14em] text-[#8A8A97]">{call.duration}</p>
                            <p className="mt-1 text-sm text-[#6D6D78]">{formatDateTime(call.created_at)}</p>
                          </div>
                        </div>

                        <div className="mt-3 grid gap-2 text-sm text-[#5D5D6A]">
                          <p>{call.phone}</p>
                          <p>{call.summary}</p>
                          <p className="text-xs uppercase tracking-[0.14em] text-[#8A8A97]">{call.vendor_trace}</p>
                        </div>
                      </button>
                    );
                  })}
                </div>

                <div className="mt-5 flex items-center justify-between gap-3 border-t border-border pt-4">
                  <p className="text-sm text-[#6D6D78]">
                    Page {logs?.page ?? 1} of {logs?.total_pages ?? 1}
                  </p>
                  <div className="flex items-center gap-3">
                    <Button
                      variant="secondary"
                      disabled={!logs?.has_previous || isRefreshing}
                      onClick={() => setPage((current) => Math.max(current - 1, 1))}
                    >
                      Previous
                    </Button>
                    <Button
                      variant="secondary"
                      disabled={!logs?.has_next || isRefreshing}
                      onClick={() => setPage((current) => current + 1)}
                    >
                      Next
                    </Button>
                  </div>
                </div>
              </Card>

              <Card className="space-y-5">
                {selectedCall ? (
                  <>
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge tone={selectedCall.status_tone}>{selectedCall.status}</Badge>
                          <Badge tone="neutral">{selectedCall.is_test ? "Test call" : "Production call"}</Badge>
                          {selectedCall.synced_to_crm ? <Badge tone="success">CRM synced</Badge> : null}
                        </div>
                        <h2 className="mt-3 text-xl font-semibold text-[#17171F]">
                          {selectedCall.lead_name} · {selectedCall.company}
                        </h2>
                        <p className="mt-2 text-sm text-[#6D6D78]">
                          {selectedCall.agent_name} · {selectedCall.phone} · {formatDateTime(selectedCall.created_at)}
                        </p>
                      </div>
                      <div className="rounded-2xl border border-border bg-[#FAFAFD] px-4 py-3">
                        <p className="text-xs uppercase tracking-[0.16em] text-[#8A8A97]">Scenario</p>
                        <p className="mt-1 text-sm font-medium text-[#17171F]">{selectedCall.scenario_name}</p>
                      </div>
                    </div>

                    <div className="grid gap-4 md:grid-cols-2">
                      <div className="rounded-2xl border border-border bg-[#FAFAFD] p-4">
                        <p className="text-xs uppercase tracking-[0.16em] text-[#8A8A97]">Outcome</p>
                        <p className="mt-2 text-sm font-medium text-[#17171F]">{selectedCall.outcome}</p>
                      </div>
                      <div className="rounded-2xl border border-border bg-[#FAFAFD] p-4">
                        <p className="text-xs uppercase tracking-[0.16em] text-[#8A8A97]">Next step</p>
                        <p className="mt-2 text-sm font-medium text-[#17171F]">{selectedCall.next_step}</p>
                      </div>
                    </div>

                    <div className="rounded-2xl border border-border bg-white p-4">
                      <p className="text-sm font-medium text-[#17171F]">Summary</p>
                      <p className="mt-2 text-sm leading-6 text-[#4B4B59]">{selectedCall.summary}</p>
                    </div>

                    <div className="grid gap-4 md:grid-cols-3">
                      <div className="rounded-2xl border border-border bg-[#FAFAFD] p-4">
                        <p className="text-xs uppercase tracking-[0.16em] text-[#8A8A97]">Vendor trace</p>
                        <p className="mt-2 text-sm font-medium text-[#17171F]">{selectedCall.vendor_trace}</p>
                      </div>
                      <div className="rounded-2xl border border-border bg-[#FAFAFD] p-4">
                        <p className="text-xs uppercase tracking-[0.16em] text-[#8A8A97]">Started</p>
                        <p className="mt-2 text-sm font-medium text-[#17171F]">{formatDateTime(selectedCall.started_at)}</p>
                      </div>
                      <div className="rounded-2xl border border-border bg-[#FAFAFD] p-4">
                        <p className="text-xs uppercase tracking-[0.16em] text-[#8A8A97]">Ended</p>
                        <p className="mt-2 text-sm font-medium text-[#17171F]">{formatDateTime(selectedCall.ended_at)}</p>
                      </div>
                    </div>

                    <div className="grid gap-4 md:grid-cols-3">
                      <div className="rounded-2xl border border-border bg-white p-4">
                        <p className="text-sm font-medium text-[#17171F]">Extracted variables</p>
                        <div className="mt-3 space-y-2">
                          {selectedCall.extracted_variables.length ? (
                            selectedCall.extracted_variables.map((item) => (
                              <div key={`${item.key}-${item.value}`} className="rounded-xl border border-border bg-[#FAFAFD] px-3 py-2">
                                <p className="text-xs uppercase tracking-[0.14em] text-[#8A8A97]">{item.key}</p>
                                <p className="mt-1 text-sm text-[#17171F]">{item.value}</p>
                              </div>
                            ))
                          ) : (
                            <p className="text-sm text-[#6D6D78]">No extracted variables recorded.</p>
                          )}
                        </div>
                      </div>

                      <div className="rounded-2xl border border-border bg-white p-4">
                        <p className="text-sm font-medium text-[#17171F]">Tool calls</p>
                        <div className="mt-3 space-y-2">
                          {selectedCall.tool_calls.length ? (
                            selectedCall.tool_calls.map((item) => (
                              <div key={`${item.name}-${item.result}`} className="rounded-xl border border-border bg-[#FAFAFD] px-3 py-2">
                                <p className="text-xs uppercase tracking-[0.14em] text-[#8A8A97]">{item.name}</p>
                                <p className="mt-1 text-sm text-[#17171F]">{item.result}</p>
                              </div>
                            ))
                          ) : (
                            <p className="text-sm text-[#6D6D78]">No tool activity recorded.</p>
                          )}
                        </div>
                      </div>

                      <div className="rounded-2xl border border-border bg-white p-4">
                        <p className="text-sm font-medium text-[#17171F]">Guardrails</p>
                        <div className="mt-3 space-y-2">
                          {selectedCall.guardrails.length ? (
                            selectedCall.guardrails.map((item) => (
                              <div key={item} className="rounded-xl border border-border bg-[#FAFAFD] px-3 py-2 text-sm text-[#17171F]">
                                {item}
                              </div>
                            ))
                          ) : (
                            <p className="text-sm text-[#6D6D78]">No guardrail flags recorded.</p>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="rounded-2xl border border-border bg-white p-4">
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-sm font-medium text-[#17171F]">Transcript</p>
                        <Badge tone={selectedCall.transcript.length ? "success" : "neutral"}>
                          {selectedCall.transcript.length} turns
                        </Badge>
                      </div>
                      <div className="mt-4 space-y-3">
                        {selectedCall.transcript.length ? (
                          selectedCall.transcript.map((turn, index) => (
                            <div key={`${turn.timestamp}-${index}`} className="rounded-2xl border border-border bg-[#FAFAFD] px-4 py-3">
                              <div className="flex items-center justify-between gap-3">
                                <p className="text-sm font-medium text-[#17171F]">{turn.speaker}</p>
                                <p className="text-xs text-[#6D6D78]">{turn.timestamp}</p>
                              </div>
                              <p className="mt-2 text-sm leading-6 text-[#4B4B59]">{turn.text}</p>
                            </div>
                          ))
                        ) : (
                          <p className="text-sm text-[#6D6D78]">No transcript captured for this call yet.</p>
                        )}
                      </div>
                    </div>
                  </>
                ) : null}
              </Card>
            </div>
          ) : (
            <EmptyState
              title="No call logs match these filters"
              description="Broaden the filters or clear the search to bring production and test calls back into the review list."
            />
          )}
        </div>
      ) : null}
    </div>
  );
}
