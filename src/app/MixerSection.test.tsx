import type { Connection } from "../midi";
import type { CcField } from "../protocol";
import type { AppStateControls } from "./app-state";
import { fireEvent, render, screen } from "@solidjs/testing-library";
import { EMPTY } from "rxjs";
import { beforeEach, describe, expect, it } from "vitest";
import { fieldToCc, readField } from "../protocol";
import { createAppState } from "./app-state";
import { createLiveEdit } from "./live-edit";
import { MixerSection } from "./MixerSection";

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

const KNOBS: readonly (readonly [label: string, field: CcField])[] = [
  ["OSC1", "mixerOsc1Level"],
  ["Sub1", "mixerSub1Level"],
  ["OSC2", "mixerOsc2Level"],
  ["Sub2", "mixerSub2Level"],
  ["Noise/Ext", "mixerNoiseExtLevel"],
];

function renderSection(): void {
  sent.length = 0;
  controls = createAppState();
  controls.setReceiveChannel({ kind: "channel", channel: 1 });
  render(() => <MixerSection live={createLiveEdit(controls, () => connection)} />);
}

describe("MixerSection", () => {
  beforeEach(renderSection);

  it("lays the five levels out in the panel's reading order", () => {
    expect(screen.getAllByRole("slider").map((knob) => knob.getAttribute("aria-label"))).toEqual(
      KNOBS.map(([label]) => label),
    );
  });

  it("says at each control what the panel label alone does not", () => {
    const described = (label: string): string =>
      screen.getByRole("slider", { name: label }).getAttribute("title") ?? "";

    expect(described("Sub1")).toContain("OSC 1");
    expect(described("Sub2")).toContain("OSC 2");
    expect(described("Noise/Ext")).toContain("External In");
  });

  it("drives every mixer field, sending the control change the spec gives it", async () => {
    for (const [label, field] of KNOBS) {
      await fireEvent.keyDown(screen.getByRole("slider", { name: label }), { key: "ArrowUp" });
      expect(readField(controls.state.editor.preset, field)).toBe(1);
      expect(sent).toContainEqual({ controller: fieldToCc(field), value: 1 });
    }
  });

  it("carries no shift layer, as the panel gives it none", () => {
    expect(screen.queryAllByRole("button")).toHaveLength(0);
  });
});
