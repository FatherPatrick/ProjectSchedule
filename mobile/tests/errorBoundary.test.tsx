/**
 * Behavioural tests for the top-level mobile ErrorBoundary.
 *
 * Vitest runs in jsdom and can't load real React Native primitives, so
 * we mock `react-native` with thin DOM stand-ins (`div` / `span` /
 * `button`). That's enough to exercise the boundary's contract:
 *   - on a successful render it just shows children
 *   - if a child throws during render, fallback UI appears with the
 *     thrown message
 *   - tapping "Try again" re-mounts the children (recovery works)
 *   - the optional `onError` callback fires once per caught error
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render } from "@testing-library/react";
import { useState } from "react";

vi.mock("react-native", () => {
  const React = require("react");
  return {
    View: ({ children, ...rest }: { children?: React.ReactNode }) =>
      React.createElement("div", rest, children),
    Text: ({ children, ...rest }: { children?: React.ReactNode }) =>
      React.createElement("span", rest, children),
    // Strip RN-only props (style-as-function) and accept onPress as onClick.
    Pressable: ({
      children,
      onPress,
      accessibilityLabel,
    }: {
      children?: React.ReactNode;
      onPress?: () => void;
      accessibilityLabel?: string;
    }) =>
      React.createElement(
        "button",
        { onClick: onPress, "aria-label": accessibilityLabel },
        children
      ),
    StyleSheet: { create: (s: Record<string, unknown>) => s },
  };
});

import { ErrorBoundary } from "@/components/ErrorBoundary";

// Quiet the expected `console.error` noise from React + the boundary.
let consoleErrorSpy: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  consoleErrorSpy.mockRestore();
  cleanup();
});

function Boom({ shouldThrow }: { shouldThrow: boolean }) {
  if (shouldThrow) throw new Error("kaboom");
  return <span>child-ok</span>;
}

/**
 * Helper that lets a parent flip the throw flag on its child after a
 * "Try again" click, so we can assert the boundary actually recovers
 * when the underlying issue is gone.
 */
function Harness() {
  const [shouldThrow, setShouldThrow] = useState(true);
  return (
    <>
      <button onClick={() => setShouldThrow(false)}>fix</button>
      <ErrorBoundary>
        <Boom shouldThrow={shouldThrow} />
      </ErrorBoundary>
    </>
  );
}

describe("ErrorBoundary", () => {
  it("renders children unchanged when nothing throws", () => {
    const { getByText, queryByText } = render(
      <ErrorBoundary>
        <Boom shouldThrow={false} />
      </ErrorBoundary>
    );
    expect(getByText("child-ok")).toBeTruthy();
    expect(queryByText("Something went wrong")).toBeNull();
  });

  it("shows the fallback UI with the thrown error's message on a render crash", () => {
    const { getByText } = render(
      <ErrorBoundary>
        <Boom shouldThrow={true} />
      </ErrorBoundary>
    );
    expect(getByText("Something went wrong")).toBeTruthy();
    expect(getByText("kaboom")).toBeTruthy();
    expect(getByText("Try again")).toBeTruthy();
  });

  it("calls the optional onError callback once with the caught error", () => {
    const onError = vi.fn();
    render(
      <ErrorBoundary onError={onError}>
        <Boom shouldThrow={true} />
      </ErrorBoundary>
    );
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError.mock.calls[0][0]).toBeInstanceOf(Error);
    expect((onError.mock.calls[0][0] as Error).message).toBe("kaboom");
  });

  it("recovers when the underlying problem is fixed and 'Try again' is tapped", () => {
    const { getByText, queryByText } = render(<Harness />);
    // Fallback is showing.
    expect(getByText("Something went wrong")).toBeTruthy();

    // Resolve the underlying problem first, THEN reset — otherwise the
    // boundary just re-trips on the next render.
    fireEvent.click(getByText("fix"));
    fireEvent.click(getByText("Try again"));

    expect(queryByText("Something went wrong")).toBeNull();
    expect(getByText("child-ok")).toBeTruthy();
  });

  it("falls back to a generic message when the error has no message", () => {
    function ThrowEmpty(): null {
      throw new Error("");
    }
    const { getByText } = render(
      <ErrorBoundary>
        <ThrowEmpty />
      </ErrorBoundary>
    );
    expect(getByText("An unexpected error occurred.")).toBeTruthy();
  });
});
