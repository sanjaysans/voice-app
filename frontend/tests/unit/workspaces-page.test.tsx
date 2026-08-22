import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import WorkspacesPage from "@/app/(app)/workspaces/page";

const reloadWorkspaceContext = vi.fn();

vi.mock("@/lib/mock-app", () => ({
  useMockApp: () => ({
    tenantSlug: "voice-demo",
    workspaceId: "workspace_sales",
    reloadWorkspaceContext,
  }),
}));

describe("WorkspacesPage", () => {
  beforeEach(() => {
    reloadWorkspaceContext.mockReset();
    vi.restoreAllMocks();
  });

  it("loads workspaces and promotes a workspace to default", async () => {
    const user = userEvent.setup();
    const fetchMock = vi
      .spyOn(global, "fetch")
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify([
            { workspace_id: "workspace_sales", name: "Sales", is_default: true },
            { workspace_id: "workspace_support", name: "Support", is_default: false },
          ]),
          { status: 200 }
        )
      )
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), { status: 200 }))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify([
            { workspace_id: "workspace_sales", name: "Sales", is_default: false },
            { workspace_id: "workspace_support", name: "Support", is_default: true },
          ]),
          { status: 200 }
        )
      );

    render(<WorkspacesPage />);

    expect(await screen.findByText("Sales")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Make default" }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining("/api/v1/tenants/voice-demo/workspaces/workspace_support"),
        expect.objectContaining({ method: "PATCH" })
      )
    );
    expect(reloadWorkspaceContext).toHaveBeenCalledWith("workspace_support");
  });
});
