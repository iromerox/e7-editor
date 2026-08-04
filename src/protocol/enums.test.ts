import type {
  ChorusType,
  DelayType,
  Lfo3Shape,
  LfoMode,
  LfoShape,
  OscShape,
  OscSync,
  OtherMode,
} from "./enums";
import { describe, expect, it } from "vitest";
import {
  chorusTypeFromCc,
  chorusTypeToCc,
  delayTypeFromCc,
  delayTypeToCc,
  lfo3ShapeFromCc,
  lfo3ShapeToCc,
  lfoModeFromCc,
  lfoModeToCc,
  lfoShapeFromCc,
  lfoShapeToCc,
  oscShapeFromCc,
  oscShapeFromParts,
  oscShapeParts,
  oscShapeToCc,
  oscSyncFromCc,
  oscSyncToCc,
  otherModeFromCc,
  otherModeToCc,
} from "./enums";
import { ReservedValue } from "./errors";

function checkBoundaries<Variant>(
  boundaries: readonly [min: number, max: number, variant: Variant][],
  fromCc: (value: number) => Variant,
  toCc: (variant: Variant) => number,
): void {
  for (const [min, max, variant] of boundaries) {
    expect(fromCc(min)).toBe(variant);
    expect(fromCc(max)).toBe(variant);
    expect(fromCc(toCc(variant))).toBe(variant);
  }
}

describe("OscShape", () => {
  it("round-trips every zone boundary", () => {
    const boundaries: [number, number, OscShape][] = [
      [0, 15, "triangle"],
      [16, 31, "saw-tri"],
      [32, 47, "sawtooth"],
      [48, 63, "off"],
      [64, 79, "triangle+pulse"],
      [80, 95, "saw-tri+pulse"],
      [96, 111, "sawtooth+pulse"],
      [112, 127, "pulse"],
    ];
    checkBoundaries(boundaries, oscShapeFromCc, oscShapeToCc);
  });

  it("splits into the waveform selector and the pulse generator the panel drives separately", () => {
    expect(oscShapeParts("triangle")).toEqual({ waveform: "triangle", pulse: false });
    expect(oscShapeParts("sawtooth+pulse")).toEqual({ waveform: "sawtooth", pulse: true });
    expect(oscShapeParts("off")).toEqual({ waveform: "none", pulse: false });
    expect(oscShapeParts("pulse")).toEqual({ waveform: "none", pulse: true });
  });

  it("rejoins every waveform and pulse combination into the shape that encodes it", () => {
    const shapes: readonly OscShape[] = [
      "triangle",
      "saw-tri",
      "sawtooth",
      "off",
      "triangle+pulse",
      "saw-tri+pulse",
      "sawtooth+pulse",
      "pulse",
    ];
    for (const shape of shapes) {
      expect(oscShapeFromParts(oscShapeParts(shape))).toBe(shape);
    }
  });

  it("keeps the waveform when the pulse generator is switched, and the reverse", () => {
    expect(oscShapeFromParts({ waveform: "saw-tri", pulse: true })).toBe("saw-tri+pulse");
    expect(oscShapeFromParts({ waveform: "saw-tri", pulse: false })).toBe("saw-tri");
    expect(oscShapeFromParts({ waveform: "none", pulse: true })).toBe("pulse");
  });
});

describe("OscSync", () => {
  it("round-trips every zone boundary", () => {
    const boundaries: [number, number, OscSync][] = [
      [0, 63, "off"],
      [64, 127, "on"],
    ];
    checkBoundaries(boundaries, oscSyncFromCc, oscSyncToCc);
  });
});

describe("LfoShape", () => {
  it("round-trips every zone boundary", () => {
    const boundaries: [number, number, LfoShape][] = [
      [0, 15, "triangle"],
      [16, 31, "ramp-up"],
      [32, 47, "ramp-down"],
      [48, 63, "square"],
      [64, 79, "noise-sample-hold"],
      [80, 127, "noise-sample-hold-led-off"],
    ];
    checkBoundaries(boundaries, lfoShapeFromCc, lfoShapeToCc);
  });
});

describe("Lfo3Shape", () => {
  it("round-trips every zone boundary", () => {
    const boundaries: [number, number, Lfo3Shape][] = [
      [0, 31, "triangle"],
      [32, 63, "ramp-up"],
      [64, 95, "ramp-down"],
      [96, 127, "square"],
    ];
    checkBoundaries(boundaries, lfo3ShapeFromCc, lfo3ShapeToCc);
  });
});

describe("LfoMode", () => {
  it("round-trips every zone boundary", () => {
    const boundaries: [number, number, LfoMode][] = [
      [0, 15, "monophonic"],
      [16, 31, "polyphonic"],
      [32, 47, "keyboard-tracking"],
      [48, 63, "keyboard-sync"],
      [64, 79, "clock-sync"],
      [80, 127, "keyboard-clock-sync"],
    ];
    checkBoundaries(boundaries, lfoModeFromCc, lfoModeToCc);
  });
});

describe("DelayType", () => {
  it("round-trips every zone boundary", () => {
    const boundaries: [number, number, DelayType][] = [
      [0, 31, "stereo"],
      [32, 63, "ping-pong"],
      [64, 95, "stereo-sync"],
      [96, 127, "ping-pong-sync"],
    ];
    checkBoundaries(boundaries, delayTypeFromCc, delayTypeToCc);
  });
});

describe("ChorusType", () => {
  it("round-trips every zone boundary", () => {
    const boundaries: [number, number, ChorusType][] = [
      [0, 63, "basic"],
      [64, 127, "ensemble"],
    ];
    checkBoundaries(boundaries, chorusTypeFromCc, chorusTypeToCc);
  });
});

describe("OtherMode", () => {
  it("round-trips every zone boundary", () => {
    const boundaries: [number, number, OtherMode][] = [
      [0, 15, "polyphonic"],
      [16, 31, "monophonic-single-trigger"],
      [32, 47, "monophonic-multi-trigger"],
      [48, 63, "unison-single-trigger"],
      [64, 79, "unison-multi-trigger"],
    ];
    checkBoundaries(boundaries, otherModeFromCc, otherModeToCc);
  });

  it("rejects the reserved 80-127 range with a typed error", () => {
    expect(() => otherModeFromCc(80)).toThrow(ReservedValue);
    expect(() => otherModeFromCc(127)).toThrow(ReservedValue);
  });
});
