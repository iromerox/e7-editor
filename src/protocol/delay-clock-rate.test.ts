import type { DelayClockRate } from "./delay-clock-rate";
import { describe, expect, it } from "vitest";
import { delayClockRateFromCc, delayClockRateToCc } from "./delay-clock-rate";
import { ReservedValue } from "./errors";
import { lfoClockRateFromCc, lfoClockRateToCc } from "./lfo-clock-rate";

const BOUNDARIES: readonly [min: number, max: number, rate: DelayClockRate][] = [
  [0, 15, "thirty-second"],
  [16, 23, "sixteenth-triplet"],
  [24, 31, "sixteenth"],
  [32, 39, "eighth-triplet"],
  [40, 47, "dotted-sixteenth"],
  [48, 55, "eighth"],
  [56, 63, "quarter-triplet"],
  [64, 71, "dotted-eighth"],
  [72, 79, "quarter"],
  [80, 87, "half-triplet"],
  [88, 95, "dotted-quarter"],
  [96, 103, "half"],
  [104, 111, "whole-triplet"],
  [112, 119, "dotted-half"],
  [120, 127, "whole"],
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

  it("mirrors LfoClockRate across the controller range", () => {
    for (let cc = 0; cc <= 127; cc++) {
      expect(delayClockRateFromCc(cc)).toBe(lfoClockRateFromCc(127 - cc));
    }
  });

  it("is not interchangeable with LfoClockRate at the same CC value", () => {
    expect(delayClockRateToCc("whole")).toBe(120);
    expect(lfoClockRateToCc("whole")).toBe(0);
    expect(delayClockRateFromCc(0)).not.toBe(lfoClockRateFromCc(0));
  });
});
