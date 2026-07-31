import type { JSX } from "solid-js";
import { fireEvent, render, screen } from "@solidjs/testing-library";
import { createSignal } from "solid-js";
import { describe, expect, it } from "vitest";
import { AppStateProvider, useAppState } from "./AppStateProvider";

const seen: unknown[] = [];

function Reader(): JSX.Element {
  const { state } = useAppState();

  return <span data-testid="notice">{state.connection.notice}</span>;
}

function Writer(): JSX.Element {
  const controls = useAppState();
  seen.push(controls);

  return (
    <button type="button" onClick={() => controls.setNotice("device unplugged")}>
      notify
    </button>
  );
}

describe("AppStateProvider", () => {
  it("hands the same state to every consumer below it", async () => {
    render(() => (
      <AppStateProvider>
        <Writer />
        <Reader />
      </AppStateProvider>
    ));

    await fireEvent.click(screen.getByRole("button", { name: "notify" }));

    expect(screen.getByTestId("notice")).toHaveTextContent("device unplugged");
  });

  it("keeps one state across a consumer that remounts", async () => {
    const [shown, setShown] = createSignal(true);
    seen.length = 0;
    render(() => (
      <AppStateProvider>
        {shown() ? <Writer /> : <span />}
        <Reader />
      </AppStateProvider>
    ));

    await fireEvent.click(screen.getByRole("button", { name: "notify" }));
    setShown(false);
    setShown(true);

    expect(seen).toHaveLength(2);
    expect(seen[1]).toBe(seen[0]);
    expect(screen.getByTestId("notice")).toHaveTextContent("device unplugged");
  });

  it("rejects a consumer mounted outside the provider", () => {
    expect(() => render(() => <Reader />)).toThrow(
      "useAppState called outside an AppStateProvider",
    );
  });
});
