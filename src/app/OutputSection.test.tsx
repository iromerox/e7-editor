import type { Connection } from "../midi";
import type { AppStateControls } from "./app-state";
import { fireEvent, render, screen } from "@solidjs/testing-library";
import { EMPTY } from "rxjs";
import { describe, expect, it } from "vitest";
import { CHORUS_MIX, VOLUME } from "../protocol";
import { FULL_MASTER_VOLUME, createAppState } from "./app-state";
import { createMasterVolume } from "./master-volume";
import { OutputSection } from "./OutputSection";

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

function renderSection(): ReturnType<typeof createMasterVolume> {
  sent.length = 0;
  controls = createAppState();
  controls.setReceiveChannel({ kind: "channel", channel: 1 });
  const volume = createMasterVolume(controls, () => connection);
  render(() => <OutputSection volume={volume} />);
  return volume;
}

function knob(): HTMLElement {
  return screen.getByRole("slider", { name: "Master Volume" });
}

describe("OutputSection", () => {
  it("starts at full and says the level is the instrument's, not the preset's", () => {
    renderSection();

    expect(knob()).toHaveAttribute("aria-valuenow", String(FULL_MASTER_VOLUME));
    expect(knob().getAttribute("title")).toContain("not part of any preset");
  });

  it("sends the volume control change without touching the preset in the editor", async () => {
    renderSection();
    const before = controls.state.editor.preset;

    await fireEvent.keyDown(knob(), { key: "ArrowDown" });

    expect(sent).toEqual([{ controller: VOLUME, value: FULL_MASTER_VOLUME - 1 }]);
    expect(controls.state.output.masterVolume).toBe(FULL_MASTER_VOLUME - 1);
    expect(controls.state.editor.preset).toEqual(before);
  });

  it("follows the volume the device reports and leaves other controllers alone", () => {
    const volume = renderSection();

    expect(volume.receive({ channel: 1, controller: VOLUME, value: 40, timestamp: 0 })).toBe(true);
    expect(knob()).toHaveAttribute("aria-valuenow", "40");

    expect(volume.receive({ channel: 1, controller: CHORUS_MIX, value: 90, timestamp: 0 })).toBe(
      false,
    );
    expect(knob()).toHaveAttribute("aria-valuenow", "40");
  });
});
