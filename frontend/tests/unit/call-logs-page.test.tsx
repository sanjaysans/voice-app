import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import CallLogsPage from "@/app/(app)/calls/logs/page";

describe("CallLogsPage", () => {
  it("shows the intentional empty state", () => {
    render(<CallLogsPage />);

    expect(screen.getByText("Call logs are not configured yet")).toBeInTheDocument();
    expect(
      screen.getByText(
        "No historical review workflow or call-detail experience is in scope right now, so this page stays intentionally empty."
      )
    ).toBeInTheDocument();
  });
});
