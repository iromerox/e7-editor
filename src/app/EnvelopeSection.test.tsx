import type { BoundFunctions, queries } from "@solidjs/testing-library";
import type { Connection } from "../midi";
import type { CcField } from "../protocol";
import type { AppStateControls } from "./app-state";
import type { EnvelopeName } from "./EnvelopeSection";
import { fireEvent, render, screen, within } from "@solidjs/testing-library";
import { EMPTY } from "rxjs";
import { beforeEach, describe, expect, it } from "vitest";
import { fieldToCc, readField } from "../protocol";
import { createAppState } from "./app-state";
import { EnvelopeSection } from "./EnvelopeSection";
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

type FieldSuffix =
  | "Attack"
  | "AttackVelocityMod"
  | "Decay"
  | "KeyboardTracking"
  | "Sustain"
  | "Release"
  | "ReleaseVelocityMod";

type KnobEntry = readonly [label: string, suffix: FieldSuffix, shift: boolean];

const KNOBS: readonly KnobEntry[] = [
  ["Attack", "Attack", false],
  ["Attack velocity mod", "AttackVelocityMod", true],
  ["Decay", "Decay", false],
  ["Keyboard tracking", "KeyboardTracking", true],
  ["Sustain", "Sustain", false],
  ["Release", "Release", false],
  ["Release velocity mod", "ReleaseVelocityMod", true],
];

function fieldOf(envelope: EnvelopeName, suffix: FieldSuffix): CcField {
  return `${envelope}${suffix}`;
}

function renderBoth(): void {
  sent.length = 0;
  controls = createAppState();
  controls.setReceiveChannel({ kind: "channel", channel: 1 });
  const live = createLiveEdit(controls, () => connection);
  render(() => (
    <>
      <EnvelopeSection live={live} envelope="eg1" />
      <EnvelopeSection live={live} envelope="eg2" />
    </>
  ));
}

function box(envelope: EnvelopeName): HTMLElement {
  return screen.getByRole("region", { name: `ENVELOPE GENERATOR ${envelope.slice(2)}` });
}

function section(envelope: EnvelopeName): BoundFunctions<typeof queries> {
  return within(box(envelope));
}

function knob(envelope: EnvelopeName, label: string): HTMLElement {
  return section(envelope).getByRole("slider", { name: label });
}

async function nudge(envelope: EnvelopeName, entry: KnobEntry): Promise<void> {
  const [label, , shift] = entry;
  if (shift) {
    await fireEvent.click(section(envelope).getByRole("button", { name: label }));
  }
  await fireEvent.keyDown(knob(envelope, label), { key: "ArrowUp" });
}

describe("EnvelopeSection", () => {
  beforeEach(renderBoth);

  it("gives both envelopes the same controls in the panel's order", () => {
    for (const envelope of ["eg1", "eg2"] as const) {
      expect(
        section(envelope)
          .getAllByRole("slider")
          .map((control) => control.getAttribute("aria-label")),
      ).toEqual([
        "Attack",
        "Decay",
        "Sustain",
        "Release",
        `${envelope.toUpperCase()} Attack`,
        `${envelope.toUpperCase()} Decay`,
        `${envelope.toUpperCase()} Sustain`,
        `${envelope.toUpperCase()} Release`,
      ]);
    }
  });

  it("carries the shift layer on every stage but Sustain, naming which velocity mod each is", () => {
    expect(
      section("eg1")
        .getAllByRole("button")
        .map((label) => label.textContent),
    ).toEqual([
      "Attack",
      "Attack velocity mod",
      "Decay",
      "Keyboard tracking",
      "Release",
      "Release velocity mod",
    ]);
  });

  it("drives every field of both envelopes, sending the control change the spec gives it", async () => {
    for (const envelope of ["eg1", "eg2"] as const) {
      for (const entry of KNOBS) {
        const field = fieldOf(envelope, entry[1]);
        await nudge(envelope, entry);
        expect(readField(controls.state.editor.preset, field)).toBe(1);
        expect(sent).toContainEqual({ controller: fieldToCc(field), value: 1 });
      }
    }
  });

  it("follows the stage values the device reports, on the knob and on the curve alike", () => {
    controls.editField("eg2Sustain", 96);

    expect(knob("eg2", "Sustain")).toHaveAttribute("aria-valuenow", "96");
    expect(knob("eg2", "EG2 Sustain")).toHaveAttribute("aria-valuenow", "96");
  });

  it("keeps an edit to one envelope out of the other's displayed state", async () => {
    await fireEvent.keyDown(knob("eg1", "Attack"), { key: "PageUp" });
    await fireEvent.keyDown(knob("eg2", "EG2 Release"), { key: "End" });

    expect(knob("eg1", "Attack")).toHaveAttribute("aria-valuenow", "10");
    expect(knob("eg1", "EG1 Attack")).toHaveAttribute("aria-valuenow", "10");
    expect(knob("eg2", "Attack")).toHaveAttribute("aria-valuenow", "0");
    expect(knob("eg2", "EG2 Attack")).toHaveAttribute("aria-valuenow", "0");

    expect(knob("eg2", "Release")).toHaveAttribute("aria-valuenow", "127");
    expect(knob("eg1", "Release")).toHaveAttribute("aria-valuenow", "0");

    expect(readField(controls.state.editor.preset, "eg1Attack")).toBe(10);
    expect(readField(controls.state.editor.preset, "eg2Attack")).toBe(0);
    expect(readField(controls.state.editor.preset, "eg2Release")).toBe(127);
    expect(readField(controls.state.editor.preset, "eg1Release")).toBe(0);
  });

  it("draws each envelope its own curve", () => {
    controls.editField("eg1Decay", 120);

    const curve = (envelope: EnvelopeName): string | null =>
      box(envelope).querySelector('path[stroke="var(--e7-silkscreen)"]')?.getAttribute("d") ?? null;

    expect(curve("eg1")).not.toBeNull();
    expect(curve("eg1")).not.toBe(curve("eg2"));
  });
});
