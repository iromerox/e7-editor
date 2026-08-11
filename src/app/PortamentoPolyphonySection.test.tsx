import type { Connection } from "../midi";
import type { AppStateControls } from "./app-state";
import { fireEvent, render, screen } from "@solidjs/testing-library";
import { EMPTY } from "rxjs";
import { describe, expect, it } from "vitest";
import {
  OTHER_MODE,
  PITCH_BEND_RANGE,
  PORTAMENTO_SWITCH,
  PORTAMENTO_TIME,
  readField,
} from "../protocol";
import { createAppState } from "./app-state";
import { createLiveEdit } from "./live-edit";
import { PortamentoPolyphonySection, nextMode } from "./PortamentoPolyphonySection";

interface SentCc {
  readonly controller: number;
  readonly value: number;
}

const sent: SentCc[] = [];

let controls: AppStateControls;

const connection: Connection = {
  inputName: "GS Music e7 IN",
  outputName: "GS Music e7 OUT",
  sysex: EMPTY,
  sysexMonitor: EMPTY,
  cc: EMPTY,
  isOpen: true,
  reassembly: { pendingBytes: 0, fragmentedFrames: 0, discardedPartials: 0 },
  send: () => {},
  sendCommand: () => {},
  sendControlChange: (_channel, controller, value) => sent.push({ controller, value }),
  sendProgramChange: () => {},
  close: () => Promise.resolve(),
};

function renderSection(): void {
  sent.length = 0;
  controls = createAppState();
  controls.setReceiveChannel({ kind: "channel", channel: 1 });
  render(() => <PortamentoPolyphonySection live={createLiveEdit(controls, () => connection)} />);
}

function modeButton(): HTMLElement {
  return screen.getByRole("button", { name: /^Mode:/ });
}

describe("PortamentoPolyphonySection", () => {
  it("carries the block's two panel controls, the knob's shift layer among them", () => {
    renderSection();

    expect(modeButton()).toBeInTheDocument();
    expect(screen.getByRole("slider", { name: "Portamento Time" })).toBeInTheDocument();
    expect(screen.getAllByRole("button").map((element) => element.textContent)).toContain(
      "Bend range",
    );
  });

  it("says the block's title is the manual's rather than a silkscreen", () => {
    renderSection();

    expect(screen.getByRole("heading", { name: "PORTAMENTO / POLYPHONY MODES" })).toHaveAttribute(
      "title",
      expect.stringContaining("no title"),
    );
  });

  it("steps the five modes in the order the spec zones them", async () => {
    renderSection();

    for (const value of [16, 32, 48, 64, 0]) {
      await fireEvent.click(modeButton());
      expect(sent.at(-1)).toEqual({ controller: OTHER_MODE, value });
    }
  });

  it("lights Unison alongside the trigger mode it combines with, as the panel does", async () => {
    renderSection();

    expect(modeButton()).toHaveAttribute("aria-label", "Mode: Poly");

    controls.editField("mode", 48);
    expect(modeButton()).toHaveAttribute("aria-label", "Mode: ST, Unison");
    expect(screen.getByText("Unison, Single Trigger")).toBeInTheDocument();

    controls.editField("mode", 64);
    expect(modeButton()).toHaveAttribute("aria-label", "Mode: MT, Unison");
  });

  it("lights nothing for the reserved range, and leaves it on the next press", async () => {
    renderSection();

    controls.editField("mode", 100);

    expect(modeButton()).toHaveAttribute("aria-label", "Mode: none");
    expect(screen.getByText("Reserved")).toBeInTheDocument();

    await fireEvent.click(modeButton());

    expect(sent).toContainEqual({ controller: OTHER_MODE, value: 0 });
    expect(nextMode(undefined)).toBe("polyphonic");
  });

  it("drives the portamento time and bend range the knob's two layers hold", async () => {
    renderSection();

    await fireEvent.keyDown(screen.getByRole("slider", { name: "Portamento Time" }), {
      key: "ArrowUp",
    });
    expect(sent).toContainEqual({ controller: PORTAMENTO_TIME, value: 1 });

    await fireEvent.click(screen.getByRole("button", { name: "Bend range" }));
    const range = screen.getByRole("slider", { name: "Bend range" });
    await fireEvent.keyDown(range, { key: "ArrowUp" });

    expect(range).toHaveAttribute("aria-valuetext", "1 st");
    expect(sent).toContainEqual({ controller: PITCH_BEND_RANGE, value: 1 });
  });

  it("switches portamento on as the time leaves zero, the parameter having no control of its own", async () => {
    renderSection();
    const time = screen.getByRole("slider", { name: "Portamento Time" });

    expect(screen.queryByRole("button", { name: /Portamento On/ })).toBeNull();

    await fireEvent.keyDown(time, { key: "ArrowUp" });

    expect(readField(controls.state.editor.preset, "portamentoSwitch")).toBe(127);
    expect(sent).toContainEqual({ controller: PORTAMENTO_SWITCH, value: 127 });
  });

  it("switches it off again only when the time comes back to zero", async () => {
    renderSection();
    const time = screen.getByRole("slider", { name: "Portamento Time" });

    await fireEvent.keyDown(time, { key: "PageUp" });
    await fireEvent.keyDown(time, { key: "PageUp" });

    expect(sent.filter((cc) => cc.controller === PORTAMENTO_SWITCH)).toEqual([
      { controller: PORTAMENTO_SWITCH, value: 127 },
    ]);

    await fireEvent.keyDown(time, { key: "Home" });

    expect(readField(controls.state.editor.preset, "portamentoSwitch")).toBe(0);
    expect(sent.filter((cc) => cc.controller === PORTAMENTO_SWITCH)).toEqual([
      { controller: PORTAMENTO_SWITCH, value: 127 },
      { controller: PORTAMENTO_SWITCH, value: 0 },
    ]);
  });
});
