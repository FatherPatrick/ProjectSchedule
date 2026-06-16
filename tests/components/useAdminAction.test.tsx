// @vitest-environment jsdom
/**
 * Behavioural tests for the shared admin mutation hook. We mock the router and
 * the toast seam (both side-effects the hook owns) and drive it through a tiny
 * harness component, asserting the success vs. failure branches.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const { refresh, toast } = vi.hoisted(() => ({
  refresh: vi.fn(),
  toast: vi.fn(),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
vi.mock("@/app/admin/AdminToaster", () => ({ notifyAdminToast: toast }));

import { useAdminAction } from "@/app/admin/useAdminAction";

function Harness() {
  const { pending, error, run } = useAdminAction();
  return (
    <div>
      <button
        onClick={() =>
          run({
            request: () => fetch("/x", { method: "POST" }),
            success: "Done!",
            failure: "Nope.",
          })
        }
      >
        go
      </button>
      {pending && <span>pending</span>}
      {error && <span role="alert">{error}</span>}
    </div>
  );
}

afterEach(() => {
  cleanup();
  refresh.mockClear();
  toast.mockClear();
  vi.unstubAllGlobals();
});

describe("useAdminAction", () => {
  it("on success: refreshes and fires a success toast, no error shown", async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: true, json: async () => ({}) }))
    );

    render(<Harness />);
    await user.click(screen.getByText("go"));

    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith({ message: "Done!" })
    );
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("on failure: surfaces the server error, fires an error toast, skips refresh", async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: false, json: async () => ({ error: "Boom" }) }))
    );

    render(<Harness />);
    await user.click(screen.getByText("go"));

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toBe("Boom");
    expect(toast).toHaveBeenCalledWith({ kind: "error", message: "Boom" });
    expect(refresh).not.toHaveBeenCalled();
  });
});
