import type { Connection } from "../midi";
import type { CcField } from "../protocol";
import type { AppStateControls } from "./app-state";
import type { LfoFields } from "./LfoSection";
import { fireEvent, render, screen, within } from "@solidjs/testing-library";
import { EMPTY } from "rxjs";
import { beforeEach, describe, expect, it } from "vitest";
import { LFO1_SHAPE, LFO2_EG1_MOD, ccToField, fieldToCc, readField } from "../protocol";
import { createAppState } from "./app-state";
import {
  EG1_MOD_DESCRIPTION,
  EG1_MOD_LABEL,
  EG1_MOD_UNAVAILABLE_DETAIL,
  EG1_MOD_UNAVAILABLE_READOUT,
  LFO1_FIELDS,
  LFO2_FIELDS,
  LfoSection,
  MODE_ORDER,
  isEg1ModAvailable,
  nextMode,
  nextShape,
} from "./LfoSection";
import { createLiveEdit } from "./live-edit";
import { LEGEND_ROW, OSCILLATOR_GRID_ROWS } from "./panel-rows";

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

const LFOS: readonly (readonly [name: string, fields: LfoFields])[] = [
  ["LFO 1", LFO1_FIELDS],
  ["LFO 2", LFO2_FIELDS],
];

const SHAPE_STEPS: readonly number[] = [16, 32, 48, 64, 0];

const MODE_STEPS: readonly number[] = [16, 32, 48, 64, 80, 0];

const CLOCK_SYNC_MODES: readonly number[] = [64, 80];

const FREE_MODES: readonly number[] = [0, 16, 32, 48];

const POLYPHONIC = 16;

const EG1_MOD_GATE: readonly (readonly [mode: number, available: boolean])[] = [
  [POLYPHONIC, true],
  [64, false],
  [32, true],
  [0, false],
  [80, true],
];

const RATE_DIVISIONS: readonly (readonly [value: number, name: string])[] = [
  [0, "Whole Note"],
  [48, "1/4 Note"],
  [127, "1/32 Note"],
];

function renderSection(): void {
  sent.length = 0;
  controls = createAppState();
  controls.setReceiveChannel({ kind: "channel", channel: 1 });
  render(() => <LfoSection live={createLiveEdit(controls, () => connection)} />);
}

function lfo(name: string): HTMLElement {
  return screen.getByRole("group", { name });
}

function cap(scope: HTMLElement, layer: string): HTMLElement {
  const button = [...scope.querySelectorAll("button[aria-label]")].find((element) =>
    (element.getAttribute("aria-label") ?? "").startsWith(`${layer}:`),
  );
  if (!(button instanceof HTMLElement)) {
    throw new Error(`no ${layer} button in ${scope.getAttribute("aria-label") ?? "the section"}`);
  }
  return button;
}

function selection(scope: HTMLElement, layer: string): string {
  return (cap(scope, layer).getAttribute("aria-label") ?? "").replace(`${layer}: `, "");
}

function shown(element: HTMLElement): boolean {
  for (let node: HTMLElement | null = element; node !== null; node = node.parentElement) {
    if (node.style.visibility === "hidden") {
      return false;
    }
  }
  return true;
}

function lenses(scope: HTMLElement): readonly HTMLElement[] {
  return [...scope.querySelectorAll("span")].filter(
    (span) => span.getAttribute("aria-hidden") === "true" && shown(span),
  );
}

function litLenses(scope: HTMLElement): readonly HTMLElement[] {
  return lenses(scope).filter((lens) => lens.style.background === "var(--e7-led-on)");
}

function fieldValue(field: CcField): number {
  return readField(controls.state.editor.preset, field);
}

describe("LfoSection", () => {
  beforeEach(renderSection);

  it("lays both LFOs out in the panel's control order", () => {
    for (const [name] of LFOS) {
      const scope = lfo(name);
      expect(selection(scope, "Wave shape")).toBe("Triangle");
      expect(within(scope).getByRole("slider").getAttribute("aria-label")).toBe("Rate");
    }
  });

  it("puts each shift layer where the panel silkscreens it, and nowhere else", () => {
    const layers = (name: string): readonly (string | null)[] =>
      [...lfo(name).querySelectorAll("button:not([aria-label])")].map(
        (element) => element.textContent,
      );

    expect(layers("LFO 1")).toEqual(["Wave shape", "Mode"]);
    expect(layers("LFO 2")).toEqual(["Wave shape", "Mode", "Rate", EG1_MOD_LABEL]);
  });

  it("drives every LFO field, sending the control change the spec gives it", async () => {
    for (const [name, fields] of LFOS) {
      const scope = lfo(name);

      await fireEvent.keyDown(within(scope).getByRole("slider", { name: "Rate" }), {
        key: "ArrowUp",
      });
      expect(fieldValue(fields.rate)).toBe(1);
      expect(sent).toContainEqual({ controller: fieldToCc(fields.rate), value: 1 });

      await fireEvent.click(cap(scope, "Wave shape"));
      expect(fieldValue(fields.shape)).toBe(16);
      expect(sent).toContainEqual({ controller: fieldToCc(fields.shape), value: 16 });

      await fireEvent.click(within(scope).getByRole("button", { name: "Mode" }));
      await fireEvent.click(cap(scope, "Mode"));
      expect(fieldValue(fields.mode)).toBe(16);
      expect(sent).toContainEqual({ controller: fieldToCc(fields.mode), value: 16 });
    }
  });

  it("steps the wave shape through the five LEDs and back to the first", async () => {
    const scope = lfo("LFO 1");
    const seen: number[] = [];
    for (let press = 0; press < SHAPE_STEPS.length; press += 1) {
      await fireEvent.click(cap(scope, "Wave shape"));
      seen.push(fieldValue(LFO1_FIELDS.shape));
    }

    expect(seen).toEqual(SHAPE_STEPS);
    expect(sent.filter((cc) => cc.controller === LFO1_SHAPE)).toHaveLength(SHAPE_STEPS.length);
  });

  it("steps the mode through all six, reading each in words since it lights no lens", async () => {
    const scope = lfo("LFO 2");
    await fireEvent.click(within(scope).getByRole("button", { name: "Mode" }));
    const seen: number[] = [];
    for (let press = 0; press < MODE_STEPS.length; press += 1) {
      await fireEvent.click(cap(scope, "Mode"));
      seen.push(fieldValue(LFO2_FIELDS.mode));
    }

    expect(seen).toEqual(MODE_STEPS);
    expect(selection(scope, "Mode")).toBe("Monophonic");
    expect(scope.textContent).toContain("Monophonic");
  });

  it("reads each rate as a musical division in the two clock-sync modes, shortest at the top of the travel", () => {
    for (const [name, fields] of LFOS) {
      const rate = within(lfo(name)).getByRole("slider", { name: "Rate" });

      for (const mode of CLOCK_SYNC_MODES) {
        controls.editField(fields.mode, mode);
        for (const [value, division] of RATE_DIVISIONS) {
          controls.editField(fields.rate, value);
          expect(rate).toHaveAttribute("aria-valuetext", division);
        }
      }
    }
  });

  it("returns each rate to the value itself as the mode leaves clock sync", () => {
    for (const [name, fields] of LFOS) {
      const rate = within(lfo(name)).getByRole("slider", { name: "Rate" });
      controls.editField(fields.rate, 48);
      controls.editField(fields.mode, 64);
      expect(rate).toHaveAttribute("aria-valuetext", "1/4 Note");

      for (const mode of FREE_MODES) {
        controls.editField(fields.mode, mode);
        expect(rate).toHaveAttribute("aria-valuetext", "48");
      }
    }
  });

  it("keeps the wave shape's lenses lit and named while Mode holds the button", async () => {
    const scope = lfo("LFO 2");
    await fireEvent.click(cap(scope, "Wave shape"));
    await fireEvent.click(within(scope).getByRole("button", { name: "Mode" }));

    expect(lenses(scope)).toHaveLength(5);
    expect(litLenses(scope)).toHaveLength(1);
    expect(scope.textContent).toContain("Ramp up");
  });

  it("leaves a lit shape to its own lens rather than repeating it in words", () => {
    const scope = lfo("LFO 1");

    expect(litLenses(scope)).toHaveLength(1);
    expect(scope.textContent).toBe("LFO 1TriangleRamp upRamp downSquareS&HWave shapeModeRate0");
  });

  it("reads the sixth wave shape the button never reaches as S&H with no LED lit", () => {
    controls.editField("lfo1Shape", 100);

    const scope = lfo("LFO 1");
    expect(selection(scope, "Wave shape")).toBe("S&H (LED off)");
    expect(lenses(scope)).toHaveLength(5);
    expect(litLenses(scope)).toHaveLength(0);
    expect(scope.textContent).toContain("S&H (LED off)");
  });

  it("leaves the sixth wave shape at the first LED on the next press", async () => {
    controls.editField("lfo1Shape", 100);

    const scope = lfo("LFO 1");
    await fireEvent.click(cap(scope, "Wave shape"));

    expect(fieldValue(LFO1_FIELDS.shape)).toBe(0);
    expect(selection(scope, "Wave shape")).toBe("Triangle");
  });

  it("cycles the shapes and modes the spec tabulates, the LED-off shape rejoining at the first", () => {
    expect(nextShape("square")).toBe("noise-sample-hold");
    expect(nextShape("noise-sample-hold")).toBe("triangle");
    expect(nextShape("noise-sample-hold-led-off")).toBe("triangle");
    expect(nextMode("clock-sync")).toBe("keyboard-clock-sync");
    expect(nextMode("keyboard-clock-sync")).toBe("monophonic");
  });

  it("carries EG1 Mod on LFO 2's Rate knob, the layer the panel silkscreens there", async () => {
    const scope = lfo("LFO 2");
    controls.editField(LFO2_FIELDS.mode, POLYPHONIC);
    await fireEvent.click(within(scope).getByRole("button", { name: EG1_MOD_LABEL }));
    const knob = within(scope).getByRole("slider", { name: EG1_MOD_LABEL });

    await fireEvent.keyDown(knob, { key: "ArrowUp" });

    expect(ccToField(LFO2_EG1_MOD)).toBe("lfo2Eg1Mod");
    expect(fieldValue("lfo2Eg1Mod")).toBe(1);
    expect(sent).toContainEqual({ controller: LFO2_EG1_MOD, value: 1 });
    expect(knob.getAttribute("title")).toContain(EG1_MOD_DESCRIPTION);
  });

  it("opens and shuts the layer as the mode crosses the two the instrument refuses it in", async () => {
    const scope = lfo("LFO 2");
    await fireEvent.click(within(scope).getByRole("button", { name: EG1_MOD_LABEL }));
    const knob = within(scope).getByRole("slider", { name: EG1_MOD_LABEL });

    for (const [mode, available] of EG1_MOD_GATE) {
      controls.editField(LFO2_FIELDS.mode, mode);
      const held = fieldValue("lfo2Eg1Mod");
      const sends = sent.length;
      await fireEvent.keyDown(knob, { key: "ArrowUp" });

      expect(knob).toHaveAttribute("aria-readonly", String(!available));
      expect(fieldValue("lfo2Eg1Mod")).toBe(available ? held + 1 : held);
      expect(sent).toHaveLength(available ? sends + 1 : sends);
      expect(knob).toHaveAttribute(
        "aria-valuetext",
        available ? String(held + 1) : EG1_MOD_UNAVAILABLE_READOUT,
      );
    }
  });

  it("says at the knob why the layer is shut, in the terms the instrument uses", async () => {
    const scope = lfo("LFO 2");
    controls.editField(LFO2_FIELDS.mode, 64);
    await fireEvent.click(within(scope).getByRole("button", { name: EG1_MOD_LABEL }));
    const knob = within(scope).getByRole("slider", { name: EG1_MOD_LABEL });

    expect(knob.getAttribute("title")).toContain(EG1_MOD_UNAVAILABLE_DETAIL);
    expect(scope.textContent).toContain(EG1_MOD_UNAVAILABLE_READOUT);
  });

  it("refuses the layer in the two modes the manual names and no others", () => {
    expect(MODE_ORDER.filter((mode) => !isEg1ModAvailable(mode))).toEqual([
      "monophonic",
      "clock-sync",
    ]);
  });

  it("gives LFO 1's Rate knob no shift layer, the panel printing none there", () => {
    const scope = lfo("LFO 1");

    expect(within(scope).queryByRole("button", { name: EG1_MOD_LABEL })).toBeNull();
    expect(scope.textContent).not.toContain(EG1_MOD_LABEL);
  });

  it("keeps both halves on the same fixed guides, neither needing a row for prose", () => {
    const gridOf = (name: string): CSSStyleDeclaration => {
      const grid = lfo(name).querySelector<HTMLElement>("div[style*='grid']");
      if (grid === null) {
        throw new Error(`no grid in ${name}`);
      }
      return grid.style;
    };

    for (const name of ["LFO 1", "LFO 2"]) {
      expect(gridOf(name).gridTemplateRows).toBe(OSCILLATOR_GRID_ROWS);
      expect(gridOf(name).justifyItems).toBe("center");
      expect(gridOf(name).gridTemplateColumns).not.toContain(" ");
    }
  });

  it("names each half where the Oscillators name theirs, in the same legend row", () => {
    for (const name of ["LFO 1", "LFO 2"]) {
      const legend = lfo(name).querySelector("legend");
      expect(legend?.textContent).toBe(name);
      expect(legend?.style.textAlign).toBe("");
      expect(legend?.style.height).toBe(LEGEND_ROW);
    }
  });
});
