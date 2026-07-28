import { describe, expect, it } from "vitest";
import { decodeZoned, ReservedValue, type Zone } from "./cc";

const evenZones: Zone<string>[] = [
  { max: 15, variant: "triangle" },
  { max: 31, variant: "saw-tri" },
  { max: 47, variant: "sawtooth" },
  { max: 63, variant: "off" },
  { max: 79, variant: "triangle+pulse" },
  { max: 95, variant: "saw-tri+pulse" },
  { max: 111, variant: "sawtooth+pulse" },
  { max: 127, variant: "pulse" },
];

const irregularZones: Zone<string>[] = [
  { max: 15, variant: "triangle" },
  { max: 31, variant: "ramp-up" },
  { max: 47, variant: "ramp-down" },
  { max: 63, variant: "square" },
  { max: 79, variant: "noise" },
  { max: 127, variant: "noise-led-off" },
];

describe("decodeZoned", () => {
  it("decodes the first zone in an evenly-spaced table", () => {
    expect(decodeZoned(0, evenZones)).toBe("triangle");
  });

  it("decodes a zone boundary in an evenly-spaced table", () => {
    expect(decodeZoned(31, evenZones)).toBe("saw-tri");
    expect(decodeZoned(32, evenZones)).toBe("sawtooth");
  });

  it("decodes the last zone in an evenly-spaced table", () => {
    expect(decodeZoned(127, evenZones)).toBe("pulse");
  });

  it("decodes zones of differing width in an irregular table", () => {
    expect(decodeZoned(70, irregularZones)).toBe("noise");
    expect(decodeZoned(80, irregularZones)).toBe("noise-led-off");
    expect(decodeZoned(127, irregularZones)).toBe("noise-led-off");
  });

  it("throws a typed ReservedValue past the last zone's max instead of returning it", () => {
    const zones: Zone<string>[] = [
      { max: 63, variant: "a" },
      { max: 71, variant: "b" },
    ];
    expect(() => decodeZoned(72, zones)).toThrow(ReservedValue);
  });

  it("includes the offending value and the last zone's max on the thrown error", () => {
    const zones: Zone<string>[] = [{ max: 71, variant: "b" }];
    try {
      decodeZoned(100, zones);
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(ReservedValue);
      expect((error as ReservedValue).value).toBe(100);
      expect((error as ReservedValue).lastMax).toBe(71);
    }
  });
});
