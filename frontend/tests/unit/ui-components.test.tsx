import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Button, ConfirmActionModal, Select } from "@/components/ui";

describe("shared ui components", () => {
  it("opens the custom dropdown and returns the selected value", async () => {
    const user = userEvent.setup();
    const handleChange = vi.fn();

    render(
      <Select
        ariaLabel="Workspace"
        options={[
          { label: "Fresh Workspace", value: "fresh" },
          { label: "Sales Workspace", value: "sales" }
        ]}
        value="fresh"
        onChange={handleChange}
      />
    );

    await user.click(screen.getByRole("button", { name: "Workspace" }));
    await user.click(screen.getByRole("option", { name: "Sales Workspace" }));

    expect(handleChange).toHaveBeenCalledWith({ target: { value: "sales" } });
  });

  it("disables button interactions while loading", async () => {
    const user = userEvent.setup();
    const handleClick = vi.fn();

    render(
      <Button loading loadingText="Saving" onClick={handleClick}>
        Save
      </Button>
    );

    const button = screen.getByRole("button", { name: "Loading Saving" });
    expect(button).toBeDisabled();

    await user.click(button);

    expect(handleClick).not.toHaveBeenCalled();
  });

  it("requires explicit confirmation before destructive actions continue", async () => {
    const user = userEvent.setup();
    const handleConfirm = vi.fn();
    const handleClose = vi.fn();

    render(
      <ConfirmActionModal
        title="Delete item"
        description="Delete this record permanently."
        confirmLabel="Delete"
        isOpen
        onClose={handleClose}
        onConfirm={handleConfirm}
      />
    );

    await user.click(screen.getByRole("button", { name: "Delete" }));
    expect(handleConfirm).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(handleClose).toHaveBeenCalledTimes(1);
  });
});
