import type { Connection } from "../midi";
import type { CcField, MultiPreset } from "../protocol";
import type { AppStateControls } from "./app-state";
import { fireEvent, render, screen } from "@solidjs/testing-library";
import { EMPTY } from "rxjs";
import { describe, expect, it } from "vitest";
import {
  DELAY_TYPE,
  MULTI_PRESET_BYTES,
  decodeMultiPreset,
  fieldToCc,
  readField,
} from "../protocol";
import { createAppState } from "./app-state";
import { DelaySection } from "./DelaySection";
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

function emptyMulti(): MultiPreset {
  return decodeMultiPreset(new Uint8Array(MULTI_PRESET_BYTES));
}

const KNOBS: readonly (readonly [label: string, field: CcField])[] = [
  ["Delay Time", "delayTime"],
  ["Feedback", "delayFeedback"],
  ["Mix", "delayMix"],
];

const TYPE_ZONES: readonly (readonly [value: number, name: string])[] = [
  [0, "Stereo"],
  [31, "Stereo"],
  [32, "Ping-Pong"],
  [63, "Ping-Pong"],
  [64, "Stereo Sync"],
  [95, "Stereo Sync"],
  [96, "Ping-Pong Sync"],
  [127, "Ping-Pong Sync"],
];

const SYNCED_TYPES: readonly number[] = [64, 96];

const PLAIN_TYPES: readonly number[] = [0, 32];

const TIME_DIVISIONS: readonly (readonly [value: number, name: string])[] = [
  [0, "1/32 Note"],
  [64, "Dotted 1/8 Note"],
  [127, "Whole Note"],
];

function renderSection(part?: 3): void {
  sent.length = 0;
  controls = createAppState();
  controls.setReceiveChannel({ kind: "channel", channel: 1 });
  if (part !== undefined) {
    controls.loadMulti(emptyMulti(), { kind: "Empty" }, part);
  }
  render(() => <DelaySection live={createLiveEdit(controls, () => connection)} />);
}

function typeKnob(): HTMLElement {
  fireEvent.click(screen.getByRole("button", { name: "Type" }));
  return screen.getByRole("slider", { name: "Type" });
}

describe("DelaySection", () => {
  it("lays the panel's three knobs out in order, with the type on the time knob's shift layer", () => {
    renderSection();

    expect(screen.getAllByRole("slider").map((knob) => knob.getAttribute("aria-label"))).toEqual([
      "Delay Time",
      "Feedback",
      "Mix",
    ]);
    expect(screen.getAllByRole("button").map((label) => label.textContent)).toEqual([
      "Delay Time",
      "Type",
    ]);
  });

  it("drives every delay field, sending the control change the spec gives it", async () => {
    renderSection();

    for (const [label, field] of KNOBS) {
      await fireEvent.keyDown(screen.getByRole("slider", { name: label }), { key: "ArrowUp" });
      expect(readField(controls.state.editor.preset, field)).toBe(1);
      expect(sent).toContainEqual({ controller: fieldToCc(field), value: 1 });
    }
  });

  it("names each quarter of the type knob's travel as the manual names it", () => {
    renderSection();
    const knob = typeKnob();

    for (const [value, name] of TYPE_ZONES) {
      controls.editField("delayType", value);
      expect(knob).toHaveAttribute("aria-valuetext", name);
    }
  });

  it("sends the type as the knob is turned", async () => {
    renderSection();

    await fireEvent.keyDown(typeKnob(), { key: "End" });

    expect(sent).toContainEqual({ controller: DELAY_TYPE, value: 127 });
  });

  it("reads the time as a musical division in the two Sync types, longest at the top of the travel", () => {
    renderSection();
    const time = screen.getByRole("slider", { name: "Delay Time" });

    for (const type of SYNCED_TYPES) {
      controls.editField("delayType", type);
      for (const [value, name] of TIME_DIVISIONS) {
        controls.editField("delayTime", value);
        expect(time).toHaveAttribute("aria-valuetext", name);
      }
    }
  });

  it("leaves the Stereo and Ping-Pong types reading the value itself", () => {
    renderSection();
    const time = screen.getByRole("slider", { name: "Delay Time" });

    for (const type of PLAIN_TYPES) {
      controls.editField("delayType", type);
      for (const [value] of TIME_DIVISIONS) {
        controls.editField("delayTime", value);
        expect(time).toHaveAttribute("aria-valuetext", String(value));
      }
    }
  });

  it("lights the header indicator only once the mix is above zero", async () => {
    renderSection();

    expect(screen.getByRole("img", { name: "Delay: none" })).toBeInTheDocument();

    await fireEvent.keyDown(screen.getByRole("slider", { name: "Mix" }), { key: "End" });

    expect(screen.getByRole("img", { name: "Delay: On" })).toBeInTheDocument();
  });

  it("stops editing and says why when the preset in hand is a multi's part 3", () => {
    renderSection(3);

    expect(screen.getByText(/Part 1 of a multi sets the delay/)).toBeInTheDocument();
    for (const [label] of KNOBS) {
      expect(screen.getByRole("slider", { name: label })).toHaveAttribute("aria-readonly", "true");
    }
    expect(typeKnob()).toHaveAttribute("aria-readonly", "true");
  });
});
