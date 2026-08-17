import type { LibraryEntry } from "../store";
import { describe, expect, it } from "vitest";
import {
  MULTI_PRESET_BYTES,
  MultiSlot,
  NAME_BYTES,
  NAME_OFFSET,
  PresetSlot,
  SINGLE_PRESET_BYTES,
  decodeSinglePreset,
} from "../protocol";
import { deviceDumpPayload, syxEntry } from "../store";
import { differsFromStored, editedImage, entryImage } from "./editor-save";
import { EntryNotOnePresetError } from "./errors";

const FILTER_CUTOFF_OFFSET = 70;

function presetImage(name: string, length = SINGLE_PRESET_BYTES): Uint8Array {
  const bytes = Uint8Array.from({ length }, (_, index) => (index * 37 + 11) % 256);
  for (let part = 0; part < length; part += SINGLE_PRESET_BYTES) {
    bytes.fill(0x20, part + NAME_OFFSET, part + NAME_OFFSET + NAME_BYTES);
    for (const [index, character] of [...name].entries()) {
      bytes[part + NAME_OFFSET + index] = character.charCodeAt(0);
    }
  }
  return bytes;
}

function storedEntry(name: string, address: number, image: Uint8Array): Promise<LibraryEntry> {
  return syxEntry(deviceDumpPayload({ label: name, address, bytes: image }), "UserImport");
}

function singleEntry(): Promise<LibraryEntry> {
  return storedEntry("Fat Brass", new PresetSlot(2, 4, 6).byteAddress(), presetImage("Fat Brass"));
}

function multiEntry(): Promise<LibraryEntry> {
  return storedEntry(
    "Split Keys",
    new MultiSlot(1, 2, 3).byteAddress(),
    presetImage("Split Keys", MULTI_PRESET_BYTES),
  );
}

function groupEntry(): Promise<LibraryEntry> {
  const image = new Uint8Array(SINGLE_PRESET_BYTES * 8);
  for (let part = 0; part < image.length; part += SINGLE_PRESET_BYTES) {
    image.set(presetImage(`Pad ${part / SINGLE_PRESET_BYTES + 1}`), part);
  }
  return storedEntry("Pads", new PresetSlot(3, 1, 1).byteAddress(), image);
}

describe("entryImage", () => {
  it("points at the whole preset a Single entry stores", async () => {
    const entry = await singleEntry();

    const image = entryImage(entry, undefined);

    expect(image.address).toBe(new PresetSlot(2, 4, 6).byteAddress());
    expect(image.offset).toBe(0);
    expect(image.bytes).toEqual(presetImage("Fat Brass"));
  });

  it("points at the part of a Multi entry the editor holds", async () => {
    const entry = await multiEntry();

    const image = entryImage(entry, 3);

    expect(image.address).toBe(new MultiSlot(1, 2, 3).byteAddress());
    expect(image.offset).toBe(2 * SINGLE_PRESET_BYTES);
    expect(image.bytes).toHaveLength(MULTI_PRESET_BYTES);
  });

  it("reads a Multi entry as its first part when the editor says no part", async () => {
    expect(entryImage(await multiEntry(), undefined).offset).toBe(0);
  });

  it("refuses an entry holding more than one preset", async () => {
    const entry = await groupEntry();

    expect(() => entryImage(entry, undefined)).toThrow(EntryNotOnePresetError);
  });
});

describe("editedImage", () => {
  it("re-decodes to exactly the edited preset, unused bytes included", async () => {
    const image = entryImage(await singleEntry(), undefined);
    const stored = decodeSinglePreset(presetImage("Fat Brass"));
    const edited = { ...stored, filter: { ...stored.filter, cutoff: 91 } };

    const written = editedImage(image, edited);

    expect(decodeSinglePreset(written.bytes)).toEqual(edited);
    const onlyCutoffMoved = presetImage("Fat Brass");
    onlyCutoffMoved[FILTER_CUTOFF_OFFSET] = 91;
    expect(written.bytes).toEqual(onlyCutoffMoved);
  });

  it("writes into the part it came from, leaving the other three byte-identical", async () => {
    const stored = presetImage("Split Keys", MULTI_PRESET_BYTES);
    const image = entryImage(await multiEntry(), 3);
    const part = decodeSinglePreset(stored.slice(image.offset, image.offset + SINGLE_PRESET_BYTES));

    const written = editedImage(image, { ...part, osc2Sync: 1 });

    expect(written.bytes.subarray(0, image.offset)).toEqual(stored.subarray(0, image.offset));
    expect(written.bytes.subarray(image.offset + SINGLE_PRESET_BYTES)).toEqual(
      stored.subarray(image.offset + SINGLE_PRESET_BYTES),
    );
    expect(
      decodeSinglePreset(written.bytes.slice(image.offset, image.offset + SINGLE_PRESET_BYTES))
        .osc2Sync,
    ).toBe(1);
  });

  it("leaves the stored bytes it was built from alone", async () => {
    const image = entryImage(await singleEntry(), undefined);
    const stored = decodeSinglePreset(presetImage("Fat Brass"));

    editedImage(image, { ...stored, transpose: 7 });

    expect(image.bytes).toEqual(presetImage("Fat Brass"));
  });
});

describe("differsFromStored", () => {
  it("holds a preset apart from what the entry stores field by field", async () => {
    const image = entryImage(await singleEntry(), undefined);
    const stored = decodeSinglePreset(presetImage("Fat Brass"));

    expect(differsFromStored(image, stored)).toBe(false);
    expect(differsFromStored(image, { ...stored, transpose: stored.transpose ^ 1 })).toBe(true);
  });

  it("reads a part put back the way it was as matching again", async () => {
    const image = entryImage(await multiEntry(), 2);
    const stored = decodeSinglePreset(
      presetImage("Split Keys", MULTI_PRESET_BYTES).slice(
        image.offset,
        image.offset + SINGLE_PRESET_BYTES,
      ),
    );

    expect(differsFromStored(image, { ...stored, osc1: { ...stored.osc1, shape: 3 } })).toBe(true);
    expect(differsFromStored(image, stored)).toBe(false);
  });
});
