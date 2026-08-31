import { describe, expect, it } from "vitest";
import {
  delayTimeReadout,
  isClockSyncedDelayType,
  isClockSyncedLfoMode,
  lfoRateReadout,
} from "./clock-rate";

const MANUAL_ORDER: readonly string[] = [
  "Whole Note",
  "Dotted 1/2 Note",
  "Whole Note Triplet",
  "1/2 Note",
  "Dotted 1/4 Note",
  "1/2 Note Triplet",
  "1/4 Note",
  "Dotted 1/8 Note",
  "1/4 Note Triplet",
  "1/8 Note",
  "Dotted 1/16 Note",
  "1/8 Note Triplet",
  "1/16 Note",
  "1/16 Note Triplet",
  "1/32 Note",
];

const BAND_WIDTH = 8;

describe("clock-synced rate readouts", () => {
  it("names the fifteen divisions as the manual prints them, in its order", () => {
    expect(MANUAL_ORDER.map((_, band) => lfoRateReadout(band * BAND_WIDTH))).toEqual(MANUAL_ORDER);
  });

  it("runs the delay's axis the opposite way from the LFO's", () => {
    expect(lfoRateReadout(0)).toBe("Whole Note");
    expect(lfoRateReadout(127)).toBe("1/32 Note");
    expect(delayTimeReadout(0)).toBe("1/32 Note");
    expect(delayTimeReadout(127)).toBe("Whole Note");
  });

  it("mirrors one readout onto the other at every controller value", () => {
    for (let value = 0; value <= 127; value += 1) {
      expect(delayTimeReadout(value)).toBe(lfoRateReadout(127 - value));
    }
  });

  it("clamps a value outside the controller range rather than throwing", () => {
    expect(lfoRateReadout(-1)).toBe("Whole Note");
    expect(delayTimeReadout(200)).toBe("Whole Note");
  });

  it("counts only the two clock-sync modes as synced", () => {
    expect(isClockSyncedLfoMode("clock-sync")).toBe(true);
    expect(isClockSyncedLfoMode("keyboard-clock-sync")).toBe(true);
    for (const mode of [
      "monophonic",
      "polyphonic",
      "keyboard-tracking",
      "keyboard-sync",
    ] as const) {
      expect(isClockSyncedLfoMode(mode)).toBe(false);
    }
  });

  it("counts only the two Sync delay types as synced", () => {
    expect(isClockSyncedDelayType("stereo-sync")).toBe(true);
    expect(isClockSyncedDelayType("ping-pong-sync")).toBe(true);
    expect(isClockSyncedDelayType("stereo")).toBe(false);
    expect(isClockSyncedDelayType("ping-pong")).toBe(false);
  });
});
