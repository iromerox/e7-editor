import { describe, expect, it } from "vitest";
import { ReservedValue } from "./errors";
import { Voices } from "./voices";

describe("Voices", () => {
  it("round-trips every legal V1/V2 combination through the packed CC", () => {
    for (let v1 = 0; v1 <= 4; v1++) {
      for (let v2 = 0; v2 <= 7; v2++) {
        const cc = 16 * v1 + v2;
        const voices = new Voices(v1, v2);
        expect(voices.toCc()).toBe(cc);
        expect(Voices.fromCc(cc)).toEqual(voices);
      }
    }
  });

  it("matches the documented endpoints", () => {
    expect(Voices.fromCc(0)).toEqual(new Voices(0, 0));
    expect(Voices.fromCc(71)).toEqual(new Voices(4, 7));
  });

  it("rejects CC values 72-127 as reserved", () => {
    for (let cc = 72; cc <= 127; cc++) {
      expect(() => Voices.fromCc(cc)).toThrow(ReservedValue);
    }
  });

  it("rejects a low-range CC whose V2 nibble is reserved", () => {
    expect(() => Voices.fromCc(15)).toThrow(ReservedValue);
    expect(() => new Voices(0, 15)).toThrow(ReservedValue);
  });

  it("exercises the full decode/encode path for every CC value 0-127, not just the boundaries", () => {
    for (let cc = 0; cc <= 127; cc++) {
      const v1 = Math.floor(cc / 16);
      const v2 = cc % 16;
      const legal = v1 <= 4 && v2 <= 7;
      if (legal) {
        const voices = Voices.fromCc(cc);
        expect(voices.v1).toBe(v1);
        expect(voices.v2).toBe(v2);
        expect(voices.toCc()).toBe(cc);
      } else {
        expect(() => Voices.fromCc(cc)).toThrow(ReservedValue);
      }
    }
  });
});
