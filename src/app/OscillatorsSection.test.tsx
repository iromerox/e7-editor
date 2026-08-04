import type { Connection } from "../midi";
import type { CcField } from "../protocol";
import type { AppStateControls } from "./app-state";
import type { OscillatorFields } from "./OscillatorsSection";
import { fireEvent, render, screen, within } from "@solidjs/testing-library";
import { EMPTY } from "rxjs";
import { beforeEach, describe, expect, it } from "vitest";
import { OSC1_SHAPE, OSC2_SHAPE, OSC2_SYNC, fieldToCc, readField } from "../protocol";
import { createAppState } from "./app-state";
import { createLiveEdit } from "./live-edit";
import {
  OSC1_FIELDS,
  OSC2_FIELDS,
  OscillatorsSection,
  transposeReadout,
  tuneReadout,
} from "./OscillatorsSection";

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
  close: () => Promise.resolve(),
};

type KnobEntry = readonly [label: string, field: keyof OscillatorFields, shift: boolean];

const KNOBS: readonly KnobEntry[] = [
  ["Tune", "tune", false],
  ["Transpose", "transpose", true],
  ["LFO1 Mod", "lfo1Mod", false],
  ["EG1 Mod", "eg1Mod", true],
  ["LFO2 Mod", "lfo2Mod", false],
  ["LFO3 Mod", "lfo3Mod", true],
  ["Pulse Width", "pulseWidth", false],
  ["EG1 PWM", "eg1Pwm", false],
  ["LFO1 PWM", "lfo1Pwm", false],
];

function renderSection(): void {
  sent.length = 0;
  controls = createAppState();
  controls.setReceiveChannel({ kind: "channel", channel: 1 });
  render(() => <OscillatorsSection live={createLiveEdit(controls, () => connection)} />);
}

function oscillator(name: string): HTMLElement {
  return screen.getByRole("group", { name });
}

function labelsOf(scope: HTMLElement, selector: string): string[] {
  return [...scope.querySelectorAll(selector)].map(
    (element) => element.getAttribute("aria-label") ?? element.textContent ?? "",
  );
}

async function nudge(scope: HTMLElement, entry: KnobEntry): Promise<void> {
  const [label, , shift] = entry;
  if (shift) {
    await fireEvent.click(within(scope).getByRole("button", { name: label }));
  }
  await fireEvent.keyDown(within(scope).getByRole("slider", { name: label }), { key: "ArrowUp" });
}

async function press(scope: HTMLElement, name: string): Promise<void> {
  const cap = [...scope.querySelectorAll("button[aria-label]")].find((button) =>
    (button.getAttribute("aria-label") ?? "").startsWith(name),
  );
  if (cap === null || cap === undefined) {
    throw new Error(`no ${name} button in ${scope.getAttribute("aria-label") ?? "the section"}`);
  }
  await fireEvent.click(cap);
}

function shapeOf(field: CcField): number {
  return readField(controls.state.editor.preset, field);
}

describe("OscillatorsSection", () => {
  beforeEach(renderSection);

  it("lays both oscillators out in the panel's control order", () => {
    for (const name of ["OSC 1", "OSC 2"]) {
      expect(labelsOf(oscillator(name), '[role="slider"]')).toEqual([
        "Tune",
        "LFO1 Mod",
        "LFO2 Mod",
        "Pulse Width",
        "EG1 PWM",
        "LFO1 PWM",
      ]);
    }
  });

  it("offers no control for the two PWM sources the instrument does not have", () => {
    expect(screen.queryByRole("slider", { name: "LFO2 PWM" })).toBeNull();
    expect(screen.queryByRole("slider", { name: "LFO3 PWM" })).toBeNull();
  });

  it("puts the panel's shift labels on the controls that carry them", () => {
    expect(labelsOf(oscillator("OSC 1"), "button:not([aria-label])")).toEqual([
      "Tune",
      "Transpose",
      "LFO1 Mod",
      "EG1 Mod",
      "LFO2 Mod",
      "LFO3 Mod",
    ]);
    expect(labelsOf(oscillator("OSC 2"), "button:not([aria-label])")).toEqual([
      "Tune",
      "Transpose",
      "LFO1 Mod",
      "EG1 Mod",
      "LFO2 Mod",
      "LFO3 Mod",
      "Pulse generator",
      "Sync",
    ]);
  });

  it("drives every oscillator field, sending the control change the spec gives it", async () => {
    for (const [name, fields] of [
      ["OSC 1", OSC1_FIELDS],
      ["OSC 2", OSC2_FIELDS],
    ] as const) {
      for (const entry of KNOBS) {
        const field = fields[entry[1]];
        await nudge(oscillator(name), entry);
        expect(readField(controls.state.editor.preset, field)).toBe(1);
        expect(sent).toContainEqual({ controller: fieldToCc(field), value: 1 });
      }
    }
  });

  it("reads Tune and Transpose out in the units the spec tabulates them in", () => {
    expect(tuneReadout(63)).toBe("0.000 st");
    expect(tuneReadout(127)).toBe("+0.500 st");
    expect(tuneReadout(0)).toBe("-0.500 st");
    expect(transposeReadout(0)).toBe("-24 st");
    expect(transposeReadout(64)).toBe("0 st");
    expect(transposeReadout(127)).toBe("+24 st");
  });

  it("steps the waveform selector through the three waveforms and back past none", async () => {
    const scope = oscillator("OSC 1");
    const seen: number[] = [];
    for (let press_ = 0; press_ < 4; press_ += 1) {
      await press(scope, "Waveform selector");
      seen.push(shapeOf(OSC1_FIELDS.shape));
    }

    expect(seen).toEqual([16, 32, 48, 0]);
    expect(sent.filter((cc) => cc.controller === OSC1_SHAPE)).toHaveLength(4);
  });

  it("switches the pulse generator without disturbing the waveform", async () => {
    const scope = oscillator("OSC 2");
    await press(scope, "Waveform selector");
    await press(scope, "Pulse generator");

    expect(shapeOf(OSC2_FIELDS.shape)).toBe(80);
    expect(sent).toContainEqual({ controller: OSC2_SHAPE, value: 80 });

    await press(scope, "Pulse generator");

    expect(shapeOf(OSC2_FIELDS.shape)).toBe(16);
  });

  it("carries hard sync on the shift layer of OSC 2's pulse button, and nowhere on OSC 1", async () => {
    expect(within(oscillator("OSC 1")).queryByRole("button", { name: "Sync" })).toBeNull();

    const scope = oscillator("OSC 2");
    await fireEvent.click(within(scope).getByRole("button", { name: "Sync" }));
    await press(scope, "Sync");

    expect(readField(controls.state.editor.preset, "osc2Sync")).toBe(64);
    expect(sent).toContainEqual({ controller: OSC2_SYNC, value: 64 });

    await press(scope, "Sync");

    expect(readField(controls.state.editor.preset, "osc2Sync")).toBe(0);
  });
});
