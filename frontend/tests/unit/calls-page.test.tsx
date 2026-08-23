import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import CallsPage from "@/app/(app)/calls/page";

describe("CallsPage", () => {
  it("shows the intentional empty state", () => {
    render(<CallsPage />);

    expect(screen.getByText("Call launch is not configured yet")).toBeInTheDocument();
    expect(
      screen.getByText(
        "No trigger-call workflow or live launch experience is in scope right now, so this page stays intentionally empty."
      )
    ).toBeInTheDocument();
  });
});
