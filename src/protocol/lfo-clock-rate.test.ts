import { describe, expect, it } from "vitest";
import { ReservedValue } from "./cc";
import { type LfoClockRate, lfoClockRateFromCc, lfoClockRateToCc } from "./lfo-clock-rate";

const BOUNDARIES: readonly [min: number, max: number, rate: LfoClockRate][] = [
  [0, 0, "whole"],
  [1, 8, "dotted-half"],
  [9, 16, "whole-triplet"],
  [17, 23, "half"],
  [24, 32, "dotted-quarter"],
  [33, 40, "half-triplet"],
  [41, 48, "quarter"],
  [49, 55, "dotted-eighth"],
  [56, 64, "quarter-triplet"],
  [65, 71, "eighth"],
  [72, 80, "dotted-sixteenth"],
  [81, 87, "eighth-triplet"],
  [88, 96, "sixteenth"],
  [97, 103, "sixteenth-triplet"],
  [104, 127, "thirty-second"],
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
});
