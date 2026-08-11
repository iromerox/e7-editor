import type { Connection } from "../midi";
import type { AppStateControls } from "./app-state";
import { fireEvent, render, screen } from "@solidjs/testing-library";
import { EMPTY } from "rxjs";
import { describe, expect, it } from "vitest";
import { OTHER_VOICES, readField } from "../protocol";
import { createAppState, emptyPreset } from "./app-state";
import { createLiveEdit } from "./live-edit";
import { VoicesSection } from "./VoicesSection";

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
  render(() => <VoicesSection live={createLiveEdit(controls, () => connection)} />);
}

function choice(name: string): HTMLSelectElement {
  const element = screen.getByLabelText(name);
  if (!(element instanceof HTMLSelectElement)) {
    throw new Error(`${name} is not a selector`);
  }
  return element;
}

describe("VoicesSection", () => {
  it("offers the two selections the Preset Menu holds, not the seven-LED row", () => {
    renderSection();

    expect([...choice("Polyphonic voices").options].map((option) => option.textContent)).toEqual([
      "All",
      "Even",
      "Odd",
      "1→7",
      "7→1",
    ]);
    expect([...choice("Monophonic voice").options].map((option) => option.textContent)).toEqual([
      "Free",
      "1",
      "2",
      "3",
      "4",
      "5",
      "6",
      "7",
    ]);
    expect(screen.queryByRole("img")).toBeNull();
  });

  it("packs both selections into the one control change the spec gives them", async () => {
    renderSection();

    await fireEvent.change(choice("Polyphonic voices"), { target: { value: "3" } });

    expect(readField(controls.state.editor.preset, "voices")).toBe(48);
    expect(sent).toContainEqual({ controller: OTHER_VOICES, value: 48 });

    await fireEvent.change(choice("Monophonic voice"), { target: { value: "5" } });

    expect(controls.state.editor.preset.polyVoice).toBe(3);
    expect(controls.state.editor.preset.monoVoice).toBe(5);
    expect(sent).toContainEqual({ controller: OTHER_VOICES, value: 53 });
  });

  it("unpacks what the device reports into the selection each half stands for", async () => {
    renderSection();

    controls.editField("voices", 71);

    expect(choice("Polyphonic voices").value).toBe("4");
    expect(choice("Monophonic voice").value).toBe("7");
  });

  it("says so rather than failing when the preset in hand holds a reserved pair", async () => {
    renderSection();

    controls.loadEditor({ ...emptyPreset(), polyVoice: 6 }, { kind: "Empty" });

    expect(screen.getByRole("status")).toHaveTextContent("reserves");
    expect(choice("Polyphonic voices").value).toBe("");

    await fireEvent.change(choice("Polyphonic voices"), { target: { value: "1" } });

    expect(readField(controls.state.editor.preset, "voices")).toBe(16);
    expect(screen.queryByRole("status")).toBeNull();
  });
});
