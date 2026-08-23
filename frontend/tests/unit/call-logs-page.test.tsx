import React from "react";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import CallLogsPage from "@/app/(app)/calls/logs/page";

const mockUseMockApp = vi.fn();
const mockApi = vi.fn();

vi.mock("@/lib/mock-app", () => ({
  useMockApp: () => mockUseMockApp(),
}));

vi.mock("@/lib/api-client", () => ({
  api: (...args: unknown[]) => mockApi(...args),
}));

function buildResponse(overrides?: Partial<{ page: number; total_pages: number; has_previous: boolean; has_next: boolean; total_items: number }>) {
  return {
    items: [
      {
        call_id: "call-1",
        agent_id: "agent-1",
        is_test: true,
        direction: "test",
        agent_name: "Lead Router",
        lead_name: "Sanjay Kumar",
        company: "Vegrow",
        phone: "+15550101",
        scenario_name: "Browser live test",
        status: "Completed",
        status_tone: "success",
        duration: "00:42",
        time: "Today",
        summary: "Completed browser validation run.",
        outcome: "Qualified",
        next_step: "Review transcript.",
        vendor_trace: "Deepgram -> OpenAI -> Cartesia",
        synced_to_crm: false,
        extracted_variables: [{ key: "language", value: "English" }],
        tool_calls: [{ name: "calendar.lookup", result: "No booking requested" }],
        guardrails: [],
        transcript: [{ speaker: "Voice", timestamp: "00:03", text: "Hello there." }],
        created_at: "2026-08-22T18:00:00Z",
        started_at: "2026-08-22T18:00:00Z",
        ended_at: "2026-08-22T18:00:42Z",
      },
    ],
    page: overrides?.page ?? 1,
    page_size: 10,
    total_items: overrides?.total_items ?? 1,
    total_pages: overrides?.total_pages ?? 1,
    has_previous: overrides?.has_previous ?? false,
    has_next: overrides?.has_next ?? false,
  };
}

describe("CallLogsPage", () => {
  beforeEach(() => {
    mockUseMockApp.mockReset();
    mockApi.mockReset();
    mockUseMockApp.mockReturnValue({
      tenantSlug: "voice-demo",
      workspaceId: "workspace-1",
    });
  });

  afterEach(() => {
    cleanup();
  });

  it("loads call logs and renders test calls in the review surface", async () => {
    mockApi.mockResolvedValue(buildResponse());

    render(<CallLogsPage />);

    expect(screen.getByText("Loading call logs")).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText("Sanjay Kumar")).toBeInTheDocument();
    });

    expect(screen.getByText("Browser live test")).toBeInTheDocument();
    expect(screen.getAllByText(/Test/)[0]).toBeInTheDocument();
    expect(screen.getAllByText("Completed browser validation run.")).toHaveLength(2);
  });

  it("applies search filters and paginates with refreshed requests", async () => {
    const user = userEvent.setup();
    mockApi
      .mockResolvedValueOnce(buildResponse({ total_items: 12, total_pages: 2, has_next: true }))
      .mockResolvedValueOnce(buildResponse({ total_items: 12, total_pages: 2, has_next: true }))
      .mockResolvedValueOnce(buildResponse({ page: 2, total_items: 12, total_pages: 2, has_previous: true }));

    render(<CallLogsPage />);

    await waitFor(() => {
      expect(screen.getByText("Sanjay Kumar")).toBeInTheDocument();
    });

    await user.type(screen.getByPlaceholderText("Search agent, lead, company, phone, scenario, or summary"), "browser");
    await user.click(screen.getByRole("button", { name: "Apply filters" }));

    await waitFor(() => {
      expect(mockApi).toHaveBeenCalledWith(
        expect.stringContaining("query=browser")
      );
    });

    await user.click(screen.getByRole("button", { name: "Next" }));

    await waitFor(() => {
      expect(mockApi).toHaveBeenCalledWith(
        expect.stringContaining("page=2")
      );
    });
  });
});
