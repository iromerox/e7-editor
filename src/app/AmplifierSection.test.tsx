import type { Connection } from "../midi";
import type { CcField } from "../protocol";
import type { AppStateControls } from "./app-state";
import { fireEvent, render, screen } from "@solidjs/testing-library";
import { EMPTY } from "rxjs";
import { beforeEach, describe, expect, it } from "vitest";
import { fieldToCc, readField } from "../protocol";
import { AmplifierSection } from "./AmplifierSection";
import { createAppState } from "./app-state";
import { createLiveEdit } from "./live-edit";

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

type KnobEntry = readonly [label: string, field: CcField, shift: boolean];

const KNOBS: readonly KnobEntry[] = [
  ["LFO1 Mod", "amplifierLfo1Mod", false],
  ["Level", "amplifierLevel", true],
  ["LFO2 Mod", "amplifierLfo2Mod", false],
  ["LFO3 Mod", "amplifierLfo3Mod", true],
  ["Keyboard tracking", "amplifierKeyboardTracking", false],
  ["Stereo spread", "stereoSpread", true],
  ["Velocity EG2 mod", "amplifierVelocityEg2Mod", false],
  ["Stereo motion", "stereoMotion", true],
];

function renderSection(): void {
  sent.length = 0;
  controls = createAppState();
  controls.setReceiveChannel({ kind: "channel", channel: 1 });
  render(() => <AmplifierSection live={createLiveEdit(controls, () => connection)} />);
}

function labelsOf(selector: string): string[] {
  return [...screen.getByRole("region", { name: "AMPLIFIER" }).querySelectorAll(selector)].map(
    (element) => element.textContent ?? "",
  );
}

async function nudge(entry: KnobEntry): Promise<void> {
  const [label, , shift] = entry;
  if (shift) {
    await fireEvent.click(screen.getByRole("button", { name: label }));
  }
  await fireEvent.keyDown(screen.getByRole("slider", { name: label }), { key: "ArrowUp" });
}

describe("AmplifierSection", () => {
  beforeEach(renderSection);

  it("lays the four knobs out in the panel's 2x2 reading order", () => {
    expect(screen.getAllByRole("slider").map((knob) => knob.getAttribute("aria-label"))).toEqual([
      "LFO1 Mod",
      "LFO2 Mod",
      "Keyboard tracking",
      "Velocity EG2 mod",
    ]);
  });

  it("gives every knob the shift label the panel prints under it", () => {
    expect(labelsOf("button")).toEqual(KNOBS.map(([label]) => label));
  });

  it("drives every amplifier field, sending the control change the spec gives it", async () => {
    for (const entry of KNOBS) {
      await nudge(entry);
      expect(readField(controls.state.editor.preset, entry[1])).toBe(1);
      expect(sent).toContainEqual({ controller: fieldToCc(entry[1]), value: 1 });
    }
  });

  it("says where the stereo pair lives and what Level is not", () => {
    const described = (label: string): string => {
      fireEvent.click(screen.getByRole("button", { name: label }));
      return screen.getByRole("slider", { name: label }).getAttribute("title") ?? "";
    };

    expect(described("Level")).toContain("master volume");
    expect(described("Stereo spread")).toContain("part 1");
    expect(described("Stereo motion")).toContain("Stereo spread");
  });
});
