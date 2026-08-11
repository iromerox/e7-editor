import type { CcEvent, Connection } from "../midi";
import { fireEvent, render, screen } from "@solidjs/testing-library";
import { EMPTY, Subject } from "rxjs";
import { describe, expect, it } from "vitest";
import { MIXER_OSC1_LEVEL, OSC1_TRANSPOSE, VOLUME } from "../protocol";
import { AppStateProvider } from "./AppStateProvider";
import { EditorPane } from "./EditorPane";

function stubConnection(cc: Subject<CcEvent>): Connection {
  return {
    inputName: "GS Music e7 IN",
    outputName: "GS Music e7 OUT",
    sysex: EMPTY,
    sysexMonitor: EMPTY,
    cc,
    isOpen: true,
    reassembly: { pendingBytes: 0, fragmentedFrames: 0, discardedPartials: 0 },
    send: () => {},
    sendCommand: () => {},
    sendControlChange: () => {},
    sendProgramChange: () => {},
    close: () => Promise.resolve(),
  };
}

function renderPane(connection: Connection | undefined): void {
  render(() => (
    <AppStateProvider>
      <EditorPane connection={connection} />
    </AppStateProvider>
  ));
}

function knob(name: string): string {
  return screen.getByRole("slider", { name }).getAttribute("aria-valuenow") ?? "";
}

function nudge(name: string, key: string): void {
  fireEvent.keyDown(screen.getByRole("slider", { name }), { key });
}

function step(button: string): HTMLElement {
  return screen.getByRole("button", { name: button });
}

describe("EditorPane", () => {
  it("follows a control change the device sends", () => {
    const cc = new Subject<CcEvent>();
    renderPane(stubConnection(cc));

    cc.next({ channel: 1, controller: MIXER_OSC1_LEVEL, value: 99, timestamp: 0 });

    expect(knob("OSC1")).toBe("99");
  });

  it("leaves a control change that names more than one field where it is", () => {
    const cc = new Subject<CcEvent>();
    renderPane(stubConnection(cc));

    cc.next({ channel: 1, controller: OSC1_TRANSPOSE, value: 120, timestamp: 0 });

    expect(screen.getAllByRole("slider", { name: "Tune" })[0]?.getAttribute("aria-valuenow")).toBe(
      "0",
    );
  });

  it("follows the master volume the device reports, which no preset field holds", () => {
    const cc = new Subject<CcEvent>();
    renderPane(stubConnection(cc));

    cc.next({ channel: 1, controller: VOLUME, value: 12, timestamp: 0 });

    expect(knob("Master Volume")).toBe("12");
  });

  it("says edits reach the editor only while nothing is connected", () => {
    renderPane(undefined);

    expect(screen.getByText(/edits change the preset in the editor only/)).toBeInTheDocument();
  });

  it("says so when the device never reported a channel to send on", () => {
    renderPane(stubConnection(new Subject<CcEvent>()));

    expect(screen.getByRole("status")).toHaveTextContent("never reported a receive channel");
  });

  it("walks the editor's history from the header buttons", () => {
    renderPane(stubConnection(new Subject<CcEvent>()));

    expect(step("Undo")).toBeDisabled();
    expect(step("Redo")).toBeDisabled();

    nudge("OSC1", "PageUp");
    expect(knob("OSC1")).toBe("10");

    fireEvent.click(step("Undo"));
    expect(knob("OSC1")).toBe("0");
    expect(step("Undo")).toBeDisabled();

    fireEvent.click(step("Redo"));
    expect(knob("OSC1")).toBe("10");
    expect(step("Redo")).toBeDisabled();
  });

  it("walks it from the keyboard as well", () => {
    renderPane(stubConnection(new Subject<CcEvent>()));
    nudge("OSC1", "PageUp");

    fireEvent.keyDown(window, { key: "z", ctrlKey: true });
    expect(knob("OSC1")).toBe("0");

    fireEvent.keyDown(window, { key: "z", ctrlKey: true, shiftKey: true });
    expect(knob("OSC1")).toBe("10");
  });

  it("leaves the shortcut to a field being typed into", () => {
    renderPane(stubConnection(new Subject<CcEvent>()));
    nudge("OSC1", "PageUp");
    const typed = document.createElement("input");
    document.body.append(typed);

    fireEvent.keyDown(typed, { key: "z", ctrlKey: true });

    expect(knob("OSC1")).toBe("10");
    typed.remove();
  });

  it("has nothing to undo for a control change the device sends", () => {
    const cc = new Subject<CcEvent>();
    renderPane(stubConnection(cc));

    cc.next({ channel: 1, controller: MIXER_OSC1_LEVEL, value: 99, timestamp: 0 });

    expect(step("Undo")).toBeDisabled();
  });
});
