import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh, push: vi.fn() }) }));

import { ActionDialog, InviteLink } from "./ActionDialog";

const fields = [
  { name: "email", label: "Email", type: "email" as const },
  { name: "note", label: "Note", type: "textarea" as const },
];

beforeEach(() => refresh.mockClear());

describe("ActionDialog", () => {
  it("submits the typed values with one key, refreshes and closes on success", async () => {
    const action = vi.fn().mockResolvedValue({ ok: true, data: null });
    render(
      <ActionDialog trigger="Open" title="T" fields={fields} submitLabel="Save" action={action} />,
    );
    await userEvent.click(screen.getByRole("button", { name: "Open" }));
    await userEvent.type(screen.getByLabelText("Email"), "a@b.co");
    await userEvent.type(screen.getByLabelText("Note"), "hi");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(action).toHaveBeenCalledWith(
      { email: "a@b.co", note: "hi" },
      expect.stringMatching(/[0-9a-f-]{36}/),
    );
    expect(refresh).toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
  it("shows field errors under the field and keeps the dialog open; a retry reuses the key", async () => {
    const action = vi.fn().mockResolvedValue({
      ok: false,
      code: "VALIDATION",
      message: "x",
      fieldErrors: { email: "Enter a valid email" },
    });
    render(
      <ActionDialog trigger="Open" title="T" fields={fields} submitLabel="Save" action={action} />,
    );
    await userEvent.click(screen.getByRole("button", { name: "Open" }));
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByText("Enter a valid email")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(action.mock.calls[0]![1]).toBe(action.mock.calls[1]![1]);
    expect(refresh).not.toHaveBeenCalled();
  });
  it("shows a general failure as an alert", async () => {
    const action = vi.fn().mockResolvedValue({
      ok: false,
      code: "FORBIDDEN",
      message: "You don't have permission to do this.",
    });
    render(
      <ActionDialog trigger="Open" title="T" fields={fields} submitLabel="Save" action={action} />,
    );
    await userEvent.click(screen.getByRole("button", { name: "Open" }));
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("permission");
  });
  it("can swap the form for a one-time result such as an invitation link", async () => {
    const action = vi.fn().mockResolvedValue({ ok: true, data: { token: "abc123" } });
    render(
      <ActionDialog
        trigger="Open"
        title="T"
        fields={fields}
        submitLabel="Save"
        action={action}
        success={(d: { token: string }) => <InviteLink token={d.token} />}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: "Open" }));
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    const link = (await screen.findByLabelText("Invitation link")) as HTMLInputElement;
    expect(link.value).toContain("/invite/abc123");
    expect(screen.queryByLabelText("Email")).not.toBeInTheDocument();
  });
  it("starts clean each time it is reopened", async () => {
    render(
      <ActionDialog trigger="Open" title="T" fields={fields} submitLabel="Save" action={vi.fn()} />,
    );
    await userEvent.click(screen.getByRole("button", { name: "Open" }));
    await userEvent.type(screen.getByLabelText("Email"), "a@b.co");
    await userEvent.click(screen.getByRole("button", { name: "Close" }));
    await userEvent.click(screen.getByRole("button", { name: "Open" }));
    expect(screen.getByLabelText("Email")).toHaveValue("");
  });
});
