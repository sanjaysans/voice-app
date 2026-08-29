import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import EvaluationsPage from "@/app/(app)/evaluations/page";
import { EvaluationSuiteScreen } from "@/components/evaluation-suite-screen";

const mockUseMockApp = vi.fn();
const mockApi = vi.fn();

vi.mock("@/lib/mock-app", () => ({
  useMockApp: () => mockUseMockApp(),
}));

vi.mock("@/lib/api-client", () => ({
  api: (...args: unknown[]) => mockApi(...args),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

const suite = {
  suite_id: "suite-1",
  agent_id: "agent-1",
  name: "Conversation confidence",
  description: "Core checks",
  status: "active",
  latest_version_number: 1,
  case_count: 1,
  last_run_status: null,
  last_run_score: null,
  updated_at: "2026-08-29T10:00:00Z",
};

const detail = {
  ...suite,
  created_at: "2026-08-28T10:00:00Z",
  cases: [
    {
      case_id: "case-1",
      case_key: "greeting",
      name: "Greeting",
      scenario: { initial_utterance: "Hello" },
      expected_behavior: { outcome: "supported" },
      assertions: [],
    },
  ],
};

describe("EvaluationsPage", () => {
  beforeEach(() => {
    mockUseMockApp.mockReset();
    mockApi.mockReset();
    mockUseMockApp.mockReturnValue({
      tenantSlug: "voice-demo",
      workspaceId: "workspace-1",
      agents: [{ id: "agent-1", name: "Lead Router", status: "Published" }],
    });
  });

  it("lists suites without opening one inline", async () => {
    mockApi.mockResolvedValue([suite]);

    render(<EvaluationsPage />);

    await waitFor(() => expect(screen.getByText("Confidence checks for your agents")).toBeInTheDocument());
    expect(screen.getByRole("link", { name: /Conversation confidence/i })).toHaveAttribute("href", "/evaluations/suite-1");
    expect(screen.queryByRole("tablist")).not.toBeInTheDocument();
  });
});

describe("EvaluationSuiteScreen", () => {
  beforeEach(() => {
    mockUseMockApp.mockReset();
    mockApi.mockReset();
    mockUseMockApp.mockReturnValue({
      tenantSlug: "voice-demo",
      workspaceId: "workspace-1",
      agents: [{ id: "agent-1", name: "Lead Router", status: "Published" }],
    });
    mockApi.mockImplementation((path: string) => {
      if (path.endsWith("/evaluations/suite-1")) return Promise.resolve(detail);
      if (path.endsWith("/evaluations/suite-1/runs?limit=50")) return Promise.resolve([]);
      return Promise.resolve([]);
    });
  });

  it("opens with cases and switches to run history", async () => {
    const user = userEvent.setup();
    render(<EvaluationSuiteScreen suiteId="suite-1" />);

    await waitFor(() => expect(screen.getByRole("tab", { name: /Test cases/i })).toHaveAttribute("aria-selected", "true"));
    expect(screen.getByText("Greeting")).toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: /Run history/i }));

    expect(screen.getByText("No runs yet")).toBeInTheDocument();
  });
});
