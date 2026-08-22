import type { LfoClockRate } from "./lfo-clock-rate";
import { describe, expect, it } from "vitest";
import { ReservedValue } from "./errors";
import { lfoClockRateFromCc, lfoClockRateToCc } from "./lfo-clock-rate";

const BOUNDARIES: readonly [min: number, max: number, rate: LfoClockRate][] = [
  [0, 7, "whole"],
  [8, 15, "dotted-half"],
  [16, 23, "whole-triplet"],
  [24, 31, "half"],
  [32, 39, "dotted-quarter"],
  [40, 47, "half-triplet"],
  [48, 55, "quarter"],
  [56, 63, "dotted-eighth"],
  [64, 71, "quarter-triplet"],
  [72, 79, "eighth"],
  [80, 87, "dotted-sixteenth"],
  [88, 95, "eighth-triplet"],
  [96, 103, "sixteenth"],
  [104, 111, "sixteenth-triplet"],
  [112, 127, "thirty-second"],
];

describe("LfoClockRate", () => {
  it("round-trips every zone boundary", () => {
    for (const [min, max, rate] of BOUNDARIES) {
      expect(lfoClockRateFromCc(min)).toBe(rate);
      expect(lfoClockRateFromCc(max)).toBe(rate);
      expect(lfoClockRateFromCc(lfoClockRateToCc(rate))).toBe(rate);
    }
  });

  it("covers all 128 CC values with no gaps", () => {
    for (let cc = 0; cc <= 127; cc++) {
      expect(() => lfoClockRateFromCc(cc)).not.toThrow();
    }
  });

  it("rejects a CC value past the last zone", () => {
    expect(() => lfoClockRateFromCc(128)).toThrow(ReservedValue);
  });

  it("bands the range in eights, the last division taking the remainder", () => {
    const order = BOUNDARIES.map(([, , rate]) => rate);
    for (let cc = 0; cc <= 127; cc++) {
      expect(lfoClockRateFromCc(cc)).toBe(order[Math.min(Math.floor(cc / 8), order.length - 1)]);
    }
  });
});
