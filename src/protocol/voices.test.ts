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

  it("takes the monophonic voice from the low three bits, so a high nibble's 8-15 wrap", () => {
    expect(Voices.fromCc(8)).toEqual(new Voices(0, 0));
    expect(Voices.fromCc(15)).toEqual(new Voices(0, 7));
    expect(Voices.fromCc(24)).toEqual(new Voices(1, 0));
    expect(Voices.fromCc(47)).toEqual(new Voices(2, 7));
  });

  it("holds the polyphonic selection at 7->1 for every value from 80 up", () => {
    for (let cc = 80; cc <= 127; cc++) {
      expect(Voices.fromCc(cc).v1).toBe(4);
    }
    expect(Voices.fromCc(100)).toEqual(new Voices(4, 4));
    expect(Voices.fromCc(127)).toEqual(new Voices(4, 7));
  });

  it("gives every CC value 0-127 a selection, reserving none of them", () => {
    for (let cc = 0; cc <= 127; cc++) {
      const voices = Voices.fromCc(cc);
      expect(voices.v1).toBe(Math.min(4, cc >> 4));
      expect(voices.v2).toBe(cc & 7);
    }
  });

  it("rejects a stored pair the selection tables do not cover", () => {
    expect(() => new Voices(5, 0)).toThrow(ReservedValue);
    expect(() => new Voices(0, 8)).toThrow(ReservedValue);
    expect(() => new Voices(0, 15)).toThrow(ReservedValue);
  });
});
