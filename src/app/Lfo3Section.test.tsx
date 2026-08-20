import type { Connection } from "../midi";
import type { CcField } from "../protocol";
import type { AppStateControls } from "./app-state";
import { fireEvent, render, screen, within } from "@solidjs/testing-library";
import { EMPTY } from "rxjs";
import { beforeEach, describe, expect, it } from "vitest";
import {
  LFO3_AFTERTOUCH,
  LFO3_MOD_WHEEL,
  LFO3_RATE,
  LFO3_SHAPE,
  ccToField,
  readField,
} from "../protocol";
import { createAppState } from "./app-state";
import { Lfo3Section, SECTION_TITLE, SILENT_NOTE, nextShape } from "./Lfo3Section";
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

const SHAPE_STEPS: readonly number[] = [32, 64, 96, 0];

function renderSection(): void {
  sent.length = 0;
  controls = createAppState();
  controls.setReceiveChannel({ kind: "channel", channel: 1 });
  render(() => <Lfo3Section live={createLiveEdit(controls, () => connection)} />);
}

function section(): HTMLElement {
  return screen.getByRole("region", { name: SECTION_TITLE });
}

function cap(layer: string): HTMLElement {
  const button = [...section().querySelectorAll("button[aria-label]")].find((element) =>
    (element.getAttribute("aria-label") ?? "").startsWith(`${layer}:`),
  );
  if (!(button instanceof HTMLElement)) {
    throw new Error(`no ${layer} button in the section`);
  }
  return button;
}

function selection(layer: string): string {
  return (cap(layer).getAttribute("aria-label") ?? "").replace(`${layer}: `, "");
}

function lenses(): readonly HTMLElement[] {
  return [...section().querySelectorAll("span")].filter(
    (span) => span.getAttribute("aria-hidden") === "true",
  );
}

function litLenses(): readonly HTMLElement[] {
  return lenses().filter((lens) => lens.style.background === "var(--e7-led-on)");
}

function fieldValue(field: CcField): number {
  return readField(controls.state.editor.preset, field);
}

describe("Lfo3Section", () => {
  beforeEach(renderSection);

  it("lays the box out in the panel's control order", () => {
    expect(selection("Wave shape")).toBe("Triangle");
    expect(
      within(section())
        .getAllByRole("slider")
        .map((slider) => slider.getAttribute("aria-label")),
    ).toEqual(["Rate", "Mod Wheel"]);
  });

  it("puts Aftertouch on the Mod Wheel knob's shift layer, as the panel silkscreens it", () => {
    expect(
      [...section().querySelectorAll("button:not([aria-label])")].map(
        (element) => element.textContent,
      ),
    ).toEqual(["Mod Wheel", "Aftertouch"]);
  });

  it("draws no Mode control, LFO 3 having neither a field nor a panel button for one", () => {
    expect(within(section()).queryByRole("button", { name: "Mode" })).toBeNull();
    expect(section().textContent).not.toContain("Mode");
  });

  it("drives every LFO 3 field, sending the control change the spec gives it", async () => {
    await fireEvent.click(cap("Wave shape"));
    expect(fieldValue("lfo3Shape")).toBe(32);
    expect(sent).toContainEqual({ controller: LFO3_SHAPE, value: 32 });

    await fireEvent.keyDown(within(section()).getByRole("slider", { name: "Rate" }), {
      key: "ArrowUp",
    });
    expect(fieldValue("lfo3Rate")).toBe(1);
    expect(sent).toContainEqual({ controller: LFO3_RATE, value: 1 });

    await fireEvent.keyDown(within(section()).getByRole("slider", { name: "Mod Wheel" }), {
      key: "ArrowUp",
    });
    expect(fieldValue("lfo3ModWheel")).toBe(1);
    expect(sent).toContainEqual({ controller: LFO3_MOD_WHEEL, value: 1 });

    await fireEvent.click(within(section()).getByRole("button", { name: "Aftertouch" }));
    await fireEvent.keyDown(within(section()).getByRole("slider", { name: "Aftertouch" }), {
      key: "ArrowUp",
    });
    expect(fieldValue("lfo3Aftertouch")).toBe(1);
    expect(sent).toContainEqual({ controller: LFO3_AFTERTOUCH, value: 1 });
  });

  it("reflects each of the four control changes onto one field of its own", () => {
    for (const cc of [LFO3_SHAPE, LFO3_RATE, LFO3_MOD_WHEEL, LFO3_AFTERTOUCH]) {
      expect(ccToField(cc)).toBeDefined();
    }
  });

  it("steps the wave shape through four LEDs and back to the first, with no S&H", async () => {
    const seen: number[] = [];
    for (let press = 0; press < SHAPE_STEPS.length; press += 1) {
      await fireEvent.click(cap("Wave shape"));
      seen.push(fieldValue("lfo3Shape"));
    }

    expect(seen).toEqual(SHAPE_STEPS);
    expect(lenses()).toHaveLength(4);
    expect(litLenses()).toHaveLength(1);
    expect(nextShape("square")).toBe("triangle");
  });

  it("reads the shape in 32-wide zones rather than the 16-wide ones LFO 1 and LFO 2 use", () => {
    controls.editField("lfo3Shape", 16);
    expect(selection("Wave shape")).toBe("Triangle");

    controls.editField("lfo3Shape", 64);
    expect(selection("Wave shape")).toBe("Ramp down");

    controls.editField("lfo3Shape", 127);
    expect(selection("Wave shape")).toBe("Square");
  });

  it("says the LFO is silent while both performance controls sit at zero", async () => {
    expect(section().textContent).toContain(SILENT_NOTE);

    await fireEvent.keyDown(within(section()).getByRole("slider", { name: "Mod Wheel" }), {
      key: "ArrowUp",
    });

    expect(section().textContent).not.toContain(SILENT_NOTE);
  });

  it("keeps the note while only aftertouch raises the amplitude back to zero", () => {
    controls.editField("lfo3Aftertouch", 64);
    expect(section().textContent).not.toContain(SILENT_NOTE);

    controls.editField("lfo3Aftertouch", 0);
    expect(section().textContent).toContain(SILENT_NOTE);
  });
});
