import { describe, expect, it } from "vitest";
import { PresetSlot, Voices, otherModeFromCc } from "../protocol";
import { unlessReserved } from "./reserved-values";

describe("unlessReserved", () => {
  it("reads a value the spec gives a meaning to", () => {
    expect(unlessReserved(() => otherModeFromCc(64))).toBe("unison-multi-trigger");
    expect(unlessReserved(() => Voices.fromCc(71))?.v1).toBe(4);
  });

  it("reads the reserved range as no value at all, for either kind of table", () => {
    expect(unlessReserved(() => otherModeFromCc(80))).toBeUndefined();
    expect(unlessReserved(() => new Voices(6, 0))).toBeUndefined();
  });

  it("lets every other failure through, so only the reserved range is recovered from", () => {
    expect(() => unlessReserved(() => new PresetSlot(9, 1, 1))).toThrow();
  });
});
