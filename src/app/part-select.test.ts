import type { EditorMulti, MultiPart } from "./app-state";
import { describe, expect, it } from "vitest";
import { MULTI_PRESET_BYTES, SINGLE_PRESET_BYTES, decodeMultiPreset } from "../protocol";
import { MULTI_PARTS, editedMulti, partOffset } from "./part-select";

const FILTER_CUTOFF_OFFSET = 70;

function multiImage(): Uint8Array {
  const bytes = Uint8Array.from(
    { length: MULTI_PRESET_BYTES },
    (_, index) => (index * 37 + 11) % 128,
  );
  for (const part of MULTI_PARTS) {
    bytes[partOffset(part) + FILTER_CUTOFF_OFFSET] = part * 10;
  }
  return bytes;
}

function held(part: MultiPart, bytes: Uint8Array): EditorMulti {
  return { part, preset: decodeMultiPreset(bytes) };
}

describe("partOffset", () => {
  it("counts the four parts off in whole presets", () => {
    expect(MULTI_PARTS.map(partOffset)).toEqual([0, 128, 256, 384]);
  });
});

describe("editedMulti", () => {
  it("writes the edited part back where it came from, leaving the other three byte-identical", () => {
    const stored = multiImage();
    const multi = held(3, stored);

    const written = editedMulti(multi, { ...multi.preset.parts[2], osc2Sync: 1 });

    const offset = partOffset(3);
    expect(written.subarray(0, offset)).toEqual(stored.subarray(0, offset));
    expect(written.subarray(offset + SINGLE_PRESET_BYTES)).toEqual(
      stored.subarray(offset + SINGLE_PRESET_BYTES),
    );
    expect(decodeMultiPreset(written).parts[2].osc2Sync).toBe(1);
  });

  it("reproduces the multi it was read from when the part in hand is unedited", () => {
    const stored = multiImage();
    const multi = held(2, stored);

    expect(editedMulti(multi, multi.preset.parts[1])).toEqual(stored);
  });
});
