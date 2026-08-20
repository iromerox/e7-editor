import type { Transpose } from "./transpose";
import { describe, expect, it } from "vitest";
import { ReservedValue } from "./errors";
import {
  PRESET_TRANSPOSE_BYTE_MAX,
  PRESET_TRANSPOSE_BYTE_MIN,
  PRESET_TRANSPOSE_MAX,
  PRESET_TRANSPOSE_MIN,
  presetTransposeFromByte,
  presetTransposeToByte,
  transposeFromCc,
  transposeToCc,
} from "./transpose";

const BOUNDARIES: readonly [min: number, max: number, semitones: Transpose][] = [
  [0, 1, -24],
  [2, 3, -23],
  [4, 6, -22],
  [7, 9, -21],
  [10, 11, -20],
  [12, 14, -19],
  [15, 17, -18],
  [18, 19, -17],
  [20, 22, -16],
  [23, 25, -15],
  [26, 27, -14],
  [28, 30, -13],
  [31, 33, -12],
  [34, 35, -11],
  [36, 38, -10],
  [39, 41, -9],
  [42, 43, -8],
  [44, 46, -7],
  [47, 48, -6],
  [49, 51, -5],
  [52, 54, -4],
  [55, 56, -3],
  [57, 59, -2],
  [60, 61, -1],
  [62, 65, 0],
  [66, 67, 1],
  [68, 70, 2],
  [71, 72, 3],
  [73, 75, 4],
  [76, 78, 5],
  [79, 80, 6],
  [81, 83, 7],
  [84, 85, 8],
  [86, 88, 9],
  [89, 91, 10],
  [92, 93, 11],
  [94, 96, 12],
  [97, 99, 13],
  [100, 101, 14],
  [102, 104, 15],
  [105, 107, 16],
  [108, 109, 17],
  [110, 112, 18],
  [113, 115, 19],
  [116, 117, 20],
  [118, 120, 21],
  [121, 123, 22],
  [124, 125, 23],
  [126, 127, 24],
];

describe("Transpose", () => {
  it("round-trips every documented band boundary", () => {
    for (const [min, max, semitones] of BOUNDARIES) {
      expect(transposeFromCc(min)).toBe(semitones);
      expect(transposeFromCc(max)).toBe(semitones);
      expect(transposeFromCc(transposeToCc(semitones))).toBe(semitones);
    }
  });

  it("covers all 128 CC values with no gaps", () => {
    for (let cc = 0; cc <= 127; cc++) {
      expect(() => transposeFromCc(cc)).not.toThrow();
    }
  });

  it("rejects a CC value past the last band", () => {
    expect(() => transposeFromCc(128)).toThrow(ReservedValue);
  });
});

// Every reading taken from serial #361 over USB, byte 105 of the edit buffer read back
// while the Preset Menu displayed the semitone value beside it. The two extremes are the
// menu's own limits, which is what fixes the range at +/-48 rather than the oscillators'
// +/-24 — the manual says the same on p.19 and for a multi part's CH/TRANSP on p.22.
const MEASURED: readonly [semitones: number, byte: number][] = [
  [0, 64],
  [-12, 52],
  [12, 76],
  [-24, 40],
  [24, 88],
  [-36, 28],
  [36, 100],
  [-48, 16],
  [48, 112],
];

describe("preset transpose", () => {
  it("matches every reading taken from the instrument", () => {
    for (const [semitones, byte] of MEASURED) {
      expect(presetTransposeFromByte(byte)).toBe(semitones);
      expect(presetTransposeToByte(semitones)).toBe(byte);
    }
  });

  it("spans the menu's full range one byte per semitone, with no gaps", () => {
    for (let semitones = PRESET_TRANSPOSE_MIN; semitones <= PRESET_TRANSPOSE_MAX; semitones++) {
      expect(presetTransposeFromByte(presetTransposeToByte(semitones))).toBe(semitones);
    }
    expect(presetTransposeToByte(PRESET_TRANSPOSE_MIN)).toBe(PRESET_TRANSPOSE_BYTE_MIN);
    expect(presetTransposeToByte(PRESET_TRANSPOSE_MAX)).toBe(PRESET_TRANSPOSE_BYTE_MAX);
  });

  it("is not the oscillators' 49-band lookup, and disagrees with it almost everywhere", () => {
    const agree = MEASURED.filter(([semitones, byte]) => transposeFromCc(byte) === semitones);
    expect(agree).toEqual([[0, 64]]);
  });

  it("treats a byte outside the menu's range as reserved rather than transposing by it", () => {
    expect(() => presetTransposeFromByte(PRESET_TRANSPOSE_BYTE_MIN - 1)).toThrow(ReservedValue);
    expect(() => presetTransposeFromByte(PRESET_TRANSPOSE_BYTE_MAX + 1)).toThrow(ReservedValue);
    expect(() => presetTransposeFromByte(0)).toThrow(ReservedValue);
    expect(() => presetTransposeFromByte(127)).toThrow(ReservedValue);
  });

  it("refuses to encode a semitone count the instrument has no byte for", () => {
    expect(() => presetTransposeToByte(PRESET_TRANSPOSE_MIN - 1)).toThrow(ReservedValue);
    expect(() => presetTransposeToByte(PRESET_TRANSPOSE_MAX + 1)).toThrow(ReservedValue);
    expect(() => presetTransposeToByte(1.5)).toThrow(ReservedValue);
  });
});
