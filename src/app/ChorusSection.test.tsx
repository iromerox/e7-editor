import type { Connection } from "../midi";
import type { CcField } from "../protocol";
import type { AppStateControls } from "./app-state";
import { fireEvent, render, screen } from "@solidjs/testing-library";
import { EMPTY } from "rxjs";
import { describe, expect, it } from "vitest";
import { CHORUS_TYPE, fieldToCc, readField } from "../protocol";
import { createAppState, emptyPreset } from "./app-state";
import { ChorusSection } from "./ChorusSection";
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

const KNOBS: readonly (readonly [label: string, field: CcField])[] = [
  ["Rate", "chorusRate"],
  ["Depth", "chorusDepth"],
  ["Mix", "chorusMix"],
];

function renderSection(part?: 2): void {
  sent.length = 0;
  controls = createAppState();
  controls.setReceiveChannel({ kind: "channel", channel: 1 });
  if (part !== undefined) {
    controls.loadEditor(emptyPreset(), { kind: "Empty" }, part);
  }
  render(() => <ChorusSection live={createLiveEdit(controls, () => connection)} />);
}

function typeKnob(): HTMLElement {
  fireEvent.click(screen.getByRole("button", { name: "Type" }));
  return screen.getByRole("slider", { name: "Type" });
}

describe("ChorusSection", () => {
  it("lays the panel's three knobs out in order, with the type on the rate knob's shift layer", () => {
    renderSection();

    expect(screen.getAllByRole("slider").map((knob) => knob.getAttribute("aria-label"))).toEqual([
      "Rate",
      "Depth",
      "Mix",
    ]);
    expect(screen.getAllByRole("button").map((label) => label.textContent)).toEqual([
      "Rate",
      "Type",
    ]);
  });

  it("drives every chorus field, sending the control change the spec gives it", async () => {
    renderSection();

    for (const [label, field] of KNOBS) {
      await fireEvent.keyDown(screen.getByRole("slider", { name: label }), { key: "ArrowUp" });
      expect(readField(controls.state.editor.preset, field)).toBe(1);
      expect(sent).toContainEqual({ controller: fieldToCc(field), value: 1 });
    }
  });

  it("names the algorithm the type knob's travel has landed in", async () => {
    renderSection();
    const knob = typeKnob();

    expect(knob).toHaveAttribute("aria-valuetext", "Basic");

    await fireEvent.keyDown(knob, { key: "End" });

    expect(knob).toHaveAttribute("aria-valuetext", "Ensemble");
    expect(sent).toContainEqual({ controller: CHORUS_TYPE, value: 127 });

    await fireEvent.keyDown(knob, { key: "Home" });

    expect(knob).toHaveAttribute("aria-valuetext", "Basic");
  });

  it("lights the header indicator only once the mix is above zero", async () => {
    renderSection();

    expect(screen.getByRole("img", { name: "Chorus: none" })).toBeInTheDocument();

    await fireEvent.keyDown(screen.getByRole("slider", { name: "Mix" }), { key: "End" });

    expect(screen.getByRole("img", { name: "Chorus: On" })).toBeInTheDocument();
  });

  it("stops editing and says why when the preset in hand is a multi's part 2", () => {
    renderSection(2);

    expect(screen.getByText(/Part 1 of a multi sets the chorus/)).toBeInTheDocument();
    for (const [label] of KNOBS) {
      expect(screen.getByRole("slider", { name: label })).toHaveAttribute("aria-readonly", "true");
    }
    expect(typeKnob()).toHaveAttribute("aria-readonly", "true");
  });
});
