import type { DelayClockRate } from "./delay-clock-rate";
import { describe, expect, it } from "vitest";
import { delayClockRateFromCc, delayClockRateToCc } from "./delay-clock-rate";
import { ReservedValue } from "./errors";

const BOUNDARIES: readonly [min: number, max: number, rate: DelayClockRate][] = [
  [0, 15, "sixteenth"],
  [16, 17, "sixteenth-triplet"],
  [18, 25, "eighth-triplet"],
  [26, 33, "dotted-sixteenth"],
  [34, 41, "eighth"],
  [42, 49, "quarter-triplet"],
  [50, 58, "dotted-eighth"],
  [59, 66, "quarter"],
  [67, 73, "half-triplet"],
  [74, 81, "dotted-quarter"],
  [82, 90, "half"],
  [91, 98, "whole-triplet"],
  [99, 106, "dotted-half"],
  [107, 119, "whole"],
  [120, 127, "thirty-second"],
];

describe("DelayClockRate", () => {
  it("round-trips every zone boundary", () => {
    for (const [min, max, rate] of BOUNDARIES) {
      expect(delayClockRateFromCc(min)).toBe(rate);
      expect(delayClockRateFromCc(max)).toBe(rate);
      expect(delayClockRateFromCc(delayClockRateToCc(rate))).toBe(rate);
    }
  });

  it("covers all 128 CC values with no gaps", () => {
    for (let cc = 0; cc <= 127; cc++) {
      expect(() => delayClockRateFromCc(cc)).not.toThrow();
    }
  });

  it("rejects a CC value past the last zone", () => {
    expect(() => delayClockRateFromCc(128)).toThrow(ReservedValue);
  });

  it("uses a different byte ordering than LfoClockRate despite sharing division names", () => {
    expect(delayClockRateToCc("sixteenth")).toBe(0);
    expect(delayClockRateToCc("whole")).toBe(107);
    expect(delayClockRateToCc("thirty-second")).toBe(120);
  });
});
