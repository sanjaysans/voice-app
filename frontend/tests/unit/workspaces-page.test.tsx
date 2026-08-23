import React from "react";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import WorkspacesPage from "@/app/(app)/workspaces/page";

const reloadWorkspaceContext = vi.fn();
const mockAppContext = {
  tenantSlug: "voice-demo",
  workspaceId: "workspace_sales",
  workspaceOptions: [
    { workspace_id: "workspace_sales", name: "Sales", is_default: true },
    { workspace_id: "workspace_support", name: "Support", is_default: false },
  ],
  reloadWorkspaceContext,
};

vi.mock("@/lib/mock-app", () => ({
  useMockApp: () => mockAppContext,
}));

describe("WorkspacesPage", () => {
  beforeEach(() => {
    reloadWorkspaceContext.mockReset();
  });

  it("renders workspace records from the shared app context", async () => {
    render(<WorkspacesPage />);

    expect(await screen.findByText("Sales")).toBeInTheDocument();
    expect(screen.getByText("Support")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Make default" })).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Rename" })).toHaveLength(2);
  });
});
