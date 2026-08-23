import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import CallsPage from "@/app/(app)/calls/page";

describe("CallsPage", () => {
  it("redirects operators toward the supported browser-live demo flow", () => {
    render(<CallsPage />);

    expect(screen.getByText("Telephony launch is not configured yet")).toBeInTheDocument();
    expect(
      screen.getByText(
        "Use Live for the supported no-telephony browser demo, then review the persisted transcript and outcome details in call logs."
      )
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open Live" })).toHaveAttribute("href", "/live");
    expect(screen.getByRole("link", { name: "Open call logs" })).toHaveAttribute("href", "/calls/logs");
  });
});
