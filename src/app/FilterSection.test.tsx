import type { Connection } from "../midi";
import type { CcField } from "../protocol";
import type { AppStateControls } from "./app-state";
import { fireEvent, render, screen } from "@solidjs/testing-library";
import { EMPTY } from "rxjs";
import { beforeEach, describe, expect, it } from "vitest";
import { FILTER_RESONANCE, fieldToCc, readField } from "../protocol";
import { createAppState } from "./app-state";
import { FilterSection } from "./FilterSection";
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
  sendProgramChange: () => {},
  close: () => Promise.resolve(),
};

type KnobEntry = readonly [label: string, field: CcField, shift: boolean];

const KNOBS: readonly KnobEntry[] = [
  ["Cutoff", "filterCutoff", false],
  ["EG1 Mod", "filterEg1Mod", false],
  ["Velocity EG1 Mod", "filterVelocityEg1Mod", true],
  ["LFO1 Mod", "filterLfo1Mod", false],
  ["LFO2 Mod", "filterLfo2Mod", false],
  ["LFO3 Mod", "filterLfo3Mod", true],
  ["Keyboard tracking", "filterKeyboardTracking", false],
  ["Mod Wheel", "filterModWheel", false],
  ["Aftertouch", "filterAftertouch", true],
];

function renderSection(): void {
  sent.length = 0;
  controls = createAppState();
  controls.setReceiveChannel({ kind: "channel", channel: 1 });
  render(() => <FilterSection live={createLiveEdit(controls, () => connection)} />);
}

function labelsOf(selector: string): string[] {
  return [...screen.getByRole("region", { name: "FILTER" }).querySelectorAll(selector)].map(
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

describe("FilterSection", () => {
  beforeEach(renderSection);

  it("lays the seven knobs out in the panel's control order", () => {
    expect(screen.getAllByRole("slider").map((knob) => knob.getAttribute("aria-label"))).toEqual([
      "Cutoff",
      "EG1 Mod",
      "LFO1 Mod",
      "LFO2 Mod",
      "Resonance",
      "Keyboard tracking",
      "Mod Wheel",
    ]);
  });

  it("puts the panel's shift labels on the three controls that carry them", () => {
    expect(labelsOf("button")).toEqual([
      "EG1 Mod",
      "Velocity EG1 Mod",
      "LFO2 Mod",
      "LFO3 Mod",
      "Mod Wheel",
      "Aftertouch",
    ]);
  });

  it("gives Cutoff the larger cap the panel gives it", () => {
    expect(screen.getByRole("slider", { name: "Cutoff" }).style.width).toBe("5.1rem");
    expect(screen.getByRole("slider", { name: "Resonance" }).style.width).toBe("3rem");
  });

  it("drives every writable filter field, sending the control change the spec gives it", async () => {
    for (const entry of KNOBS) {
      await nudge(entry);
      expect(readField(controls.state.editor.preset, entry[1])).toBe(1);
      expect(sent).toContainEqual({ controller: fieldToCc(entry[1]), value: 1 });
    }
  });

  it("leaves Resonance to the device, since CC 71 is not known to be writable", async () => {
    const resonance = screen.getByRole("slider", { name: "Resonance" });
    expect(resonance).toHaveAttribute("aria-readonly", "true");

    await fireEvent.keyDown(resonance, { key: "ArrowUp" });
    fireEvent.pointerDown(resonance, { button: 0, clientX: 0, clientY: 300 });
    fireEvent.pointerMove(window, { clientX: 0, clientY: 100 });
    fireEvent.pointerUp(window);

    expect(readField(controls.state.editor.preset, "filterResonance")).toBe(0);
    expect(sent.filter((cc) => cc.controller === FILTER_RESONANCE)).toHaveLength(0);
  });

  it("still follows the resonance the device reports", () => {
    controls.editField("filterResonance", 96);

    expect(screen.getByRole("slider", { name: "Resonance" })).toHaveAttribute(
      "aria-valuenow",
      "96",
    );
  });

  it("says at Resonance why it is the one knob that does not turn", () => {
    expect(screen.getByRole("slider", { name: "Resonance" }).getAttribute("title")).toContain(
      "follows the instrument",
    );
  });
});
