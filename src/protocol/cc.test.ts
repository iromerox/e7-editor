import type { Zone } from "./cc";
import { describe, expect, it } from "vitest";
import { FILTER_RESONANCE, LFO1_RATE, ccDirection, decodeZoned, encodeControlChange } from "./cc";
import { ControlChangeRangeError, ReservedValue } from "./errors";

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

describe("encodeControlChange", () => {
  it("puts the channel in the status byte's low nibble", () => {
    expect(encodeControlChange(1, LFO1_RATE, 64)).toEqual(Uint8Array.of(0xb0, 76, 64));
    expect(encodeControlChange(16, LFO1_RATE, 0)).toEqual(Uint8Array.of(0xbf, 76, 0));
  });

  it("encodes a controller the CC map calls inbound-only just as any other", () => {
    expect(encodeControlChange(1, FILTER_RESONANCE, 127)).toEqual(Uint8Array.of(0xb0, 71, 127));
  });

  it("refuses a channel outside 1-16", () => {
    expect(() => encodeControlChange(0, LFO1_RATE, 0)).toThrow(ControlChangeRangeError);
    expect(() => encodeControlChange(17, LFO1_RATE, 0)).toThrow(ControlChangeRangeError);
  });

  it("refuses a controller or a value outside a 7-bit data byte", () => {
    expect(() => encodeControlChange(1, 128, 0)).toThrow(ControlChangeRangeError);
    expect(() => encodeControlChange(1, LFO1_RATE, 128)).toThrow(ControlChangeRangeError);
    expect(() => encodeControlChange(1, LFO1_RATE, -1)).toThrow(ControlChangeRangeError);
  });

  it("names the field it refused and the bounds it wanted", () => {
    try {
      encodeControlChange(1, LFO1_RATE, 200);
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(ControlChangeRangeError);
      expect((error as ControlChangeRangeError).field).toBe("value");
      expect((error as ControlChangeRangeError).value).toBe(200);
      expect((error as ControlChangeRangeError).max).toBe(127);
    }
  });
});

describe("ccDirection", () => {
  it("treats every CC as bidirectional, Filter Resonance included", () => {
    expect(ccDirection(FILTER_RESONANCE)).toBe("bidirectional");
    expect(ccDirection(LFO1_RATE)).toBe("bidirectional");
  });
});
