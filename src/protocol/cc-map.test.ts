import type { CcField } from "./cc-map";
import { describe, expect, it } from "vitest";
import {
  AMPLIFIER_LEVEL,
  EXPRESSION,
  HOLD,
  LFO2_EG1_MOD,
  MOD_WHEEL,
  OSC1_TRANSPOSE,
  OTHER_VOICES,
  VOLUME,
} from "./cc";
import {
  CC_FIELDS,
  applyCc,
  ccToField,
  fieldToCc,
  isPart1OnlyField,
  readField,
  writeField,
} from "./cc-map";
import { ReservedValue } from "./errors";
import { SINGLE_PRESET_BYTES, decodeSinglePreset, encodeSinglePreset } from "./preset";

function blankPreset() {
  return decodeSinglePreset(new Uint8Array(SINGLE_PRESET_BYTES));
}

function changedByteIndices(field: CcField, value: number): readonly number[] {
  const before = encodeSinglePreset(blankPreset());
  const after = encodeSinglePreset(writeField(blankPreset(), field, value));
  return [...after].flatMap((byte, index) => (byte === before[index] ? [] : [index]));
}

describe("cc-map", () => {
  it("maps every field to a CC that resolves back to it", () => {
    for (const field of CC_FIELDS) {
      expect(ccToField(fieldToCc(field))).toBe(field);
    }
  });

  it("gives every CC at most one field, so no controller needs disambiguating", () => {
    const claimed = new Map<number, CcField>();
    for (const field of CC_FIELDS) {
      const cc = fieldToCc(field);
      const owner = claimed.get(cc);
      expect(owner, `CC ${cc} claimed by both ${owner} and ${field}`).toBeUndefined();
      claimed.set(cc, field);
    }
  });

  it("round-trips applyCc into readField for every field", () => {
    for (const field of CC_FIELDS) {
      const cc = fieldToCc(field);
      for (const value of [0, 1, 66]) {
        const applied = applyCc(blankPreset(), cc, value);
        expect(applied).toMatchObject({ kind: "applied", field });
        if (applied.kind !== "applied") {
          continue;
        }
        expect(readField(applied.preset, field)).toBe(value);
      }
    }
  });

  it("writes a real preset byte for every field, with no stubbed accessors", () => {
    for (const field of CC_FIELDS) {
      const changed = changedByteIndices(field, 66);
      expect(changed.length, `${field} wrote no preset byte`).toBeGreaterThan(0);
      expect(readField(writeField(blankPreset(), field, 66), field)).toBe(66);
    }
  });

  it("gives each field its own preset byte, sharing only the packed Voices pair", () => {
    const owners = new Map<number, CcField>();
    for (const field of CC_FIELDS) {
      for (const index of changedByteIndices(field, 66)) {
        const owner = owners.get(index);
        expect(owner, `byte ${index} claimed by both ${owner} and ${field}`).toBeUndefined();
        owners.set(index, field);
      }
    }
  });

  it("leaves the source preset untouched when writing", () => {
    const preset = blankPreset();
    const updated = writeField(preset, "filterCutoff", 96);
    expect(readField(preset, "filterCutoff")).toBe(0);
    expect(readField(updated, "filterCutoff")).toBe(96);
  });

  it("drives OSC 1's transpose from CC 3, leaving the preset's own transpose alone", () => {
    const applied = applyCc(blankPreset(), OSC1_TRANSPOSE, 66);
    expect(applied).toMatchObject({ kind: "applied", field: "osc1Transpose" });
    if (applied.kind !== "applied") {
      return;
    }
    expect(applied.preset.osc1.transpose).toBe(66);
    expect(applied.preset.transpose).toBe(0);
  });

  it("reports performance-only CCs as unmapped", () => {
    for (const cc of [MOD_WHEEL, VOLUME, HOLD]) {
      expect(applyCc(blankPreset(), cc, 64)).toEqual({ kind: "unmapped" });
    }
  });

  it("maps Expression to Amplifier Level, the preset byte it drives", () => {
    expect(EXPRESSION).toBe(AMPLIFIER_LEVEL);
    expect(ccToField(EXPRESSION)).toBe("amplifierLevel");
  });

  it("marks the fields a multi takes from part 1 alone, and only those", () => {
    expect(CC_FIELDS.filter(isPart1OnlyField)).toEqual([
      "stereoSpread",
      "stereoMotion",
      "chorusType",
      "chorusRate",
      "chorusDepth",
      "chorusMix",
      "delayType",
      "delayTime",
      "delayFeedback",
      "delayMix",
    ]);
  });

  it("resolves LFO2 EG1 Mod to byte 61, which the byte map prints as reserved", () => {
    expect(ccToField(LFO2_EG1_MOD)).toBe("lfo2Eg1Mod");
    const applied = applyCc(blankPreset(), LFO2_EG1_MOD, 100);
    expect(applied).toMatchObject({ kind: "applied", field: "lfo2Eg1Mod" });
    if (applied.kind !== "applied") {
      return;
    }
    expect(applied.preset.lfo2.eg1Mod).toBe(100);
    expect(applied.preset.lfo1.eg1Mod).toBe(0);
  });

  it("unpacks Voices into the Poly Voice and Mono Voice bytes", () => {
    const applied = applyCc(blankPreset(), OTHER_VOICES, 71);
    expect(applied).toMatchObject({ kind: "applied", field: "voices" });
    if (applied.kind !== "applied") {
      return;
    }
    expect(applied.preset.polyVoice).toBe(4);
    expect(applied.preset.monoVoice).toBe(7);
    expect(readField(applied.preset, "voices")).toBe(71);
    expect(changedByteIndices("voices", 71)).toEqual([106, 107]);
  });

  it("rejects a reserved Voices CC value rather than storing it", () => {
    expect(() => applyCc(blankPreset(), OTHER_VOICES, 72)).toThrow(ReservedValue);
    expect(() => applyCc(blankPreset(), OTHER_VOICES, 15)).toThrow(ReservedValue);
  });
});
