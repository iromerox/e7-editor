import { describe, expect, it } from "vitest";
import { ReservedValue } from "./errors";
import { Tune } from "./tune";

describe("Tune", () => {
  it("decodes both CC 63 and CC 64 to 0 millisemitones", () => {
    expect(Tune.fromCc(63).millisemitones).toBe(0);
    expect(Tune.fromCc(64).millisemitones).toBe(0);
  });

  it("canonically encodes 0 millisemitones back to CC 63", () => {
    expect(Tune.fromCc(63).toCc()).toBe(63);
    expect(Tune.fromCc(64).toCc()).toBe(63);
  });

  it("matches the documented endpoints", () => {
    expect(Tune.fromCc(0).millisemitones).toBe(-500);
    expect(Tune.fromCc(127).millisemitones).toBe(500);
  });

  it("exposes a floating-point semitones view", () => {
    expect(Tune.fromCc(0).semitones()).toBeCloseTo(-0.5);
    expect(Tune.fromCc(127).semitones()).toBeCloseTo(0.5);
  });

  it("round-trips every unique CC value", () => {
    for (let cc = 0; cc <= 127; cc++) {
      const tune = Tune.fromCc(cc);
      const expected = cc === 64 ? 63 : cc;
      expect(tune.toCc()).toBe(expected);
    }
  });

  it("rejects CC values outside 0..=127", () => {
    expect(() => Tune.fromCc(128)).toThrow(ReservedValue);
    expect(() => Tune.fromCc(-1)).toThrow(ReservedValue);
  });
});
