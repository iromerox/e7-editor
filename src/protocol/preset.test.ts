import { describe, expect, it } from "vitest";
import { PresetByteRangeError, PresetLengthError } from "./errors";
import {
  LOCK_BYTE_INDEX,
  MULTI_ONLY_BYTES,
  MULTI_PRESET_BYTES,
  NAME_BYTES,
  PART1_ONLY_BYTES,
  RESERVED_BYTE_INDICES,
  SINGLE_PRESET_BYTES,
  decodeMultiPreset,
  decodeSinglePreset,
  encodeMultiPreset,
  encodeSinglePreset,
} from "./preset";

function fixture(length: number, value: (index: number) => number): Uint8Array {
  return Uint8Array.from({ length }, (_, index) => value(index));
}

describe("SinglePreset", () => {
  it("round-trips every byte position, so each one is claimed by exactly one field", () => {
    const cases = [
      fixture(SINGLE_PRESET_BYTES, (index) => 255 - index),
      fixture(SINGLE_PRESET_BYTES, (index) => index),
      fixture(SINGLE_PRESET_BYTES, () => 0xff),
      fixture(SINGLE_PRESET_BYTES, (index) => (index * 37 + 11) % 256),
    ];
    for (const bytes of cases) {
      expect(encodeSinglePreset(decodeSinglePreset(bytes))).toEqual(bytes);
    }
  });

  it("preserves the bytes the spec leaves unused rather than clobbering them on encode", () => {
    const bytes = new Uint8Array(SINGLE_PRESET_BYTES);
    RESERVED_BYTE_INDICES.forEach((offset, index) => {
      bytes[offset] = 0xa0 + index;
    });
    const preset = decodeSinglePreset(bytes);
    expect([...preset.reserved]).toEqual(RESERVED_BYTE_INDICES.map((_, index) => 0xa0 + index));
    expect(encodeSinglePreset(preset)).toEqual(bytes);
  });

  it("decodes byte 67 as LFO3 aftertouch mod and byte 61 as LFO2's EG1 mod", () => {
    const bytes = new Uint8Array(SINGLE_PRESET_BYTES);
    bytes[61] = 100;
    bytes[67] = 42;
    const preset = decodeSinglePreset(bytes);
    expect(preset.lfo3.aftertouchMod).toBe(42);
    expect(preset.lfo2.eg1Mod).toBe(100);
    expect(preset.lfo1.eg1Mod).toBe(0);
    expect(Object.keys(preset.lfo2)).toEqual(["shape", "rate", "eg1Mod", "mode"]);
  });

  it("reads the name from bytes 0-19 and the lock flag from byte 127", () => {
    const bytes = new Uint8Array(SINGLE_PRESET_BYTES);
    bytes.set(new TextEncoder().encode("Opening Pad         "), 0);
    bytes[LOCK_BYTE_INDEX] = 1;
    const preset = decodeSinglePreset(bytes);
    expect(new TextDecoder().decode(preset.part1Only.name)).toBe("Opening Pad         ");
    expect(preset.part1Only.name).toHaveLength(NAME_BYTES);
    expect(preset.part1Only.lock).toBe(1);
  });

  it("places the amplifier level at byte 108, away from the rest of the amplifier block", () => {
    const bytes = new Uint8Array(SINGLE_PRESET_BYTES);
    bytes[80] = 11;
    bytes[108] = 99;
    const preset = decodeSinglePreset(bytes);
    expect(preset.amp.keyboardTracking).toBe(11);
    expect(preset.amp.level).toBe(99);
  });

  it("reads Mono Voice from byte 106 and Poly Voice from byte 107", () => {
    const bytes = new Uint8Array(SINGLE_PRESET_BYTES);
    bytes[106] = 0x21;
    bytes[107] = 0x37;
    const preset = decodeSinglePreset(bytes);
    expect(preset.monoVoice).toBe(0x21);
    expect(preset.polyVoice).toBe(0x37);
  });

  it("rejects a block that is not exactly 128 bytes", () => {
    expect(() => decodeSinglePreset(new Uint8Array(127))).toThrow(PresetLengthError);
    expect(() => decodeSinglePreset(new Uint8Array(129))).toThrow(PresetLengthError);
  });

  it("rejects encoding a field value that is not a byte", () => {
    const preset = decodeSinglePreset(new Uint8Array(SINGLE_PRESET_BYTES));
    const outOfRange = { ...preset, filter: { ...preset.filter, cutoff: 300 } };
    expect(() => encodeSinglePreset(outOfRange)).toThrow(PresetByteRangeError);
    const fractional = { ...preset, filter: { ...preset.filter, cutoff: 1.5 } };
    expect(() => encodeSinglePreset(fractional)).toThrow(PresetByteRangeError);
  });

  it("rejects encoding a name or reserved block of the wrong length", () => {
    const preset = decodeSinglePreset(new Uint8Array(SINGLE_PRESET_BYTES));
    const shortName = { ...preset, part1Only: { ...preset.part1Only, name: new Uint8Array(19) } };
    expect(() => encodeSinglePreset(shortName)).toThrow(PresetLengthError);
    const shortReserved = { ...preset, reserved: new Uint8Array(1) };
    expect(() => encodeSinglePreset(shortReserved)).toThrow(PresetLengthError);
  });
});

describe("preset fields conditioned on multi membership", () => {
  it("groups the bytes only part 1 of a multi is read for", () => {
    const nameBytes = Array.from({ length: NAME_BYTES }, (_, index) => index);
    expect(PART1_ONLY_BYTES).toEqual([
      ...nameBytes,
      115,
      116,
      117,
      118,
      119,
      120,
      121,
      122,
      123,
      124,
      127,
    ]);
    const preset = decodeSinglePreset(new Uint8Array(SINGLE_PRESET_BYTES));
    expect(Object.keys(preset.part1Only)).toEqual(["name", "delay", "chorus", "stereo", "lock"]);
  });

  it("groups the bytes only used when the preset is part of a multi", () => {
    expect(MULTI_ONLY_BYTES).toEqual([109, 110, 111, 112, 113, 114]);
    const preset = decodeSinglePreset(new Uint8Array(SINGLE_PRESET_BYTES));
    expect(Object.keys(preset.partSettings)).toEqual([
      "keyboardZoneLower",
      "keyboardZoneUpper",
      "velocityZoneLower",
      "velocityZoneUpper",
      "midiChannel",
      "midiFilter",
    ]);
  });

  it("keeps the two groups disjoint from each other and from the unused bytes", () => {
    const overlap = PART1_ONLY_BYTES.filter((byte) => MULTI_ONLY_BYTES.includes(byte));
    expect(overlap).toEqual([]);
    const conditional = [...PART1_ONLY_BYTES, ...MULTI_ONLY_BYTES];
    expect(conditional.filter((byte) => RESERVED_BYTE_INDICES.includes(byte))).toEqual([]);
  });
});

describe("MultiPreset", () => {
  it("splits 512 bytes into four contiguous 128-byte parts, the last ending at byte 511", () => {
    const bytes = new Uint8Array(MULTI_PRESET_BYTES);
    bytes[0] = 0x11;
    bytes[128] = 0x22;
    bytes[256] = 0x33;
    bytes[384] = 0x44;
    bytes[511] = 1;
    const { parts } = decodeMultiPreset(bytes);
    expect(parts.map((part) => part.part1Only.name[0])).toEqual([0x11, 0x22, 0x33, 0x44]);
    expect(parts[3].part1Only.lock).toBe(1);
    expect(parts[0].part1Only.lock).toBe(0);
  });

  it("round-trips a full 512-byte multi byte-for-byte", () => {
    const bytes = fixture(MULTI_PRESET_BYTES, (index) => (index * 29 + 7) % 256);
    expect(encodeMultiPreset(decodeMultiPreset(bytes))).toEqual(bytes);
  });

  it("rejects a block that is not exactly 512 bytes", () => {
    expect(() => decodeMultiPreset(new Uint8Array(511))).toThrow(PresetLengthError);
    expect(() => decodeMultiPreset(new Uint8Array(640))).toThrow(PresetLengthError);
  });
});
