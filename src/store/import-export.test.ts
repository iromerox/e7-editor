import type { LibraryDatabase, LibraryEntry } from "./index";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  MULTI_PRESET_BYTES,
  MultiSlot,
  NAME_BYTES,
  NAME_OFFSET,
  PresetSlot,
  SINGLE_PRESET_BYTES,
  encodeCommand,
} from "../protocol";
import {
  EntryPayloadError,
  MAX_SYX_FILE_BYTES,
  MEMORY_BLOCK_BYTES,
  SyxPayloadError,
  UnexpectedSysExCommandError,
  createLibraryDatabase,
  deviceDumpPayload,
  entryBytes,
  entryFileName,
  exportEntryToDisk,
  importSyxFiles,
  importSyxFromDisk,
  importSyxPayload,
  pickSyxFiles,
  replaceEntryWithEdit,
  storeDeviceDump,
  storeEdit,
  syxEntry,
} from "./index";

const openDatabases: LibraryDatabase[] = [];

async function openLibrary(label: string): Promise<LibraryDatabase> {
  const database = await createLibraryDatabase({
    name: `${label}-${Math.random().toString(36).slice(2)}`,
  });
  openDatabases.push(database);
  return database;
}

function presetBytes(name: string, length = SINGLE_PRESET_BYTES): Uint8Array {
  const bytes = new Uint8Array(length);
  bytes.fill(0x20, NAME_OFFSET, NAME_OFFSET + NAME_BYTES);
  for (const [index, character] of [...name].entries()) {
    bytes[NAME_OFFSET + index] = character.charCodeAt(0);
  }
  for (let index = NAME_BYTES; index < length; index += 1) {
    bytes[index] = (index * 3) % 128;
  }
  return bytes;
}

function concat(parts: readonly Uint8Array[]): Uint8Array {
  const bytes = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    bytes.set(part, offset);
    offset += part.length;
  }
  return bytes;
}

function syxFile(start: number, bytes: Uint8Array): Uint8Array {
  const frames: Uint8Array[] = [];
  for (let offset = 0; offset < bytes.length; offset += MEMORY_BLOCK_BYTES) {
    frames.push(
      encodeCommand({
        kind: "write-memory",
        address: start + offset,
        data: bytes.subarray(offset, offset + MEMORY_BLOCK_BYTES),
      }),
    );
  }
  return concat(frames);
}

function singleFile(slot: PresetSlot, name: string): Uint8Array {
  return syxFile(slot.byteAddress(), presetBytes(name));
}

function groupFile(bank: number, group: number): Uint8Array {
  return concat(
    Array.from({ length: 8 }, (_, index) =>
      singleFile(new PresetSlot(bank, group, index + 1), `Pad ${index + 1}`),
    ),
  );
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", Uint8Array.from(bytes));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function toFile(bytes: Uint8Array, fileName: string): File {
  return new File([Uint8Array.from(bytes)], fileName);
}

function fileInput(): HTMLInputElement {
  const input = document.body.querySelector("input[type=file]");
  if (!(input instanceof HTMLInputElement)) {
    throw new Error("no file input was added to the document");
  }
  return input;
}

function chooseFiles(files: readonly File[]): void {
  const input = fileInput();
  Object.defineProperty(input, "files", { value: files, configurable: true });
  input.dispatchEvent(new Event("change"));
}

async function storedEntry(database: LibraryDatabase, id: string): Promise<unknown> {
  const document = await database.entries.findOne(id).exec();
  return document?.toJSON();
}

afterEach(async () => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  document.body.replaceChildren();
  while (openDatabases.length > 0) {
    await openDatabases.pop()?.close();
  }
});

describe("importSyxPayload", () => {
  it("stores a single preset file with the slot and name its bytes carry", async () => {
    const database = await openLibrary("import-single");
    const bytes = singleFile(new PresetSlot(3, 5, 2), "Fat Brass");

    const entry = await importSyxPayload(database, { fileName: "whatever.syx", bytes });

    expect(entry).toMatchObject({
      kind: "Single",
      name: "Fat Brass",
      bank: 3,
      group: 5,
      slot: 2,
      source: "UserImport",
      tags: [],
      comment: "",
      sha256: await sha256Hex(bytes),
    });
    expect(entry.snapshot).toBeDefined();
    expect(await storedEntry(database, entry.id)).toMatchObject({
      id: entry.id,
      name: "Fat Brass",
    });
  });

  it("stores a multi preset file under the name held by its first part", async () => {
    const database = await openLibrary("import-multi");
    const bytes = syxFile(
      new MultiSlot(2, 8, 8).byteAddress(),
      presetBytes("Split Keys", MULTI_PRESET_BYTES),
    );

    const entry = await importSyxPayload(database, { fileName: "split.syx", bytes });

    expect(entry).toMatchObject({ kind: "Multi", name: "Split Keys", bank: 2, group: 8, slot: 8 });
  });

  it("names a multi-preset file after the file it came from, and carries no slot", async () => {
    const database = await openLibrary("import-group");

    const entry = await importSyxPayload(database, {
      fileName: "Warm Pads.syx",
      bytes: groupFile(4, 6),
    });

    expect(entry).toMatchObject({ kind: "Group", name: "Warm Pads", bank: 4, group: 6 });
    expect(entry.slot).toBeUndefined();
  });

  it("keeps the imported bytes retrievable unchanged from the stored entry", async () => {
    const database = await openLibrary("import-bytes");
    const bytes = singleFile(new PresetSlot(1, 1, 1), "Round Trip");

    const entry = await importSyxPayload(database, { fileName: "round.syx", bytes });

    expect(entryBytes(entry)).toEqual(bytes);
  });
});

describe("importSyxPayload rejections", () => {
  it("rejects a file that is not SysEx at all, leaving the library empty", async () => {
    const database = await openLibrary("reject-text");
    const bytes = Uint8Array.from(
      new TextEncoder().encode("this is a text file pretending to be a patch dump"),
    );

    const rejection = importSyxPayload(database, { fileName: "notes.syx", bytes });

    await expect(rejection).rejects.toBeInstanceOf(SyxPayloadError);
    await expect(rejection).rejects.toMatchObject({
      code: "syx-payload",
      faults: expect.arrayContaining(["it does not open with an F0 status byte"]),
    });
    expect(await database.entries.count().exec()).toBe(0);
  });

  it("rejects a file larger than a whole-instrument backup before parsing it", async () => {
    const database = await openLibrary("reject-large");
    const bytes = singleFile(new PresetSlot(1, 1, 1), "Too Big");
    const oversized = new Uint8Array(MAX_SYX_FILE_BYTES + 1);
    oversized.set(bytes.subarray(0, bytes.length - 1));
    oversized[oversized.length - 1] = 0xf7;

    await expect(
      importSyxPayload(database, { fileName: "huge.syx", bytes: oversized }),
    ).rejects.toMatchObject({ code: "syx-payload" });
    expect(await database.entries.count().exec()).toBe(0);
  });

  it("rejects SysEx that frames correctly but writes nothing to preset memory", async () => {
    const database = await openLibrary("reject-command");
    const command = encodeCommand({ kind: "read-memory", address: 0 });
    const bytes = concat(Array.from({ length: 8 }, () => command));

    await expect(
      importSyxPayload(database, { fileName: "read.syx", bytes }),
    ).rejects.toBeInstanceOf(UnexpectedSysExCommandError);
    expect(await database.entries.count().exec()).toBe(0);
  });
});

describe("storeDeviceDump", () => {
  it("stores a slot read off the instrument as a device dump of that slot", async () => {
    const database = await openLibrary("dump-single");
    const slot = new PresetSlot(3, 5, 2);
    const image = presetBytes("Fat Brass");

    const entry = await storeDeviceDump(database, {
      label: "Single 3.5.2",
      address: slot.byteAddress(),
      bytes: image,
    });

    expect(entry).toMatchObject({
      kind: "Single",
      name: "Fat Brass",
      bank: 3,
      group: 5,
      slot: 2,
      source: "DeviceDump",
      tags: [],
      comment: "",
    });
    expect(await database.entries.count().exec()).toBe(1);
    expect(await storedEntry(database, entry.id)).toMatchObject({ source: "DeviceDump" });
  });

  it("keeps the read bytes retrievable, and exportable as the file the instrument wrote", async () => {
    const database = await openLibrary("dump-bytes");
    const slot = new PresetSlot(1, 1, 1);
    const image = presetBytes("Round Trip");

    const entry = await storeDeviceDump(database, {
      label: "Single 1.1.1",
      address: slot.byteAddress(),
      bytes: image,
    });

    expect(entryBytes(entry)).toEqual(syxFile(slot.byteAddress(), image));
  });

  it("stores a multi slot's four parts under the first part's name", async () => {
    const database = await openLibrary("dump-multi");
    const slot = new MultiSlot(2, 8, 8);

    const entry = await storeDeviceDump(database, {
      label: "Multi 2.8.8",
      address: slot.byteAddress(),
      bytes: presetBytes("Split Keys", MULTI_PRESET_BYTES),
    });

    expect(entry).toMatchObject({ kind: "Multi", name: "Split Keys", bank: 2, group: 8, slot: 8 });
  });

  it("names a dump after the slot it came from when the preset carries no name", async () => {
    const database = await openLibrary("dump-unnamed");
    const image = presetBytes("");

    const entry = await storeDeviceDump(database, {
      label: "Single 4.4.4",
      address: new PresetSlot(4, 4, 4).byteAddress(),
      bytes: image,
    });

    expect(entry.name).toBe("Single 4.4.4");
  });
});

describe("storeEdit", () => {
  it("stores the editor's preset as an edit under the name it was given", async () => {
    const database = await openLibrary("edit-new");
    const slot = new PresetSlot(2, 4, 6);
    const image = presetBytes("Fat Brass");

    const entry = await storeEdit(database, "Fat Brass Bright", {
      address: slot.byteAddress(),
      bytes: image,
    });

    expect(entry).toMatchObject({
      kind: "Single",
      name: "Fat Brass Bright",
      bank: 2,
      group: 4,
      slot: 6,
      source: "Edit",
      tags: [],
    });
    expect(entryBytes(entry)).toEqual(syxFile(slot.byteAddress(), image));
    expect(await storedEntry(database, entry.id)).toMatchObject({ name: "Fat Brass Bright" });
  });

  it("falls back to the name the preset carries when it is given none", async () => {
    const database = await openLibrary("edit-unnamed");

    const entry = await storeEdit(database, "   ", {
      address: new PresetSlot(1, 1, 1).byteAddress(),
      bytes: presetBytes("Fat Brass"),
    });

    expect(entry.name).toBe("Fat Brass");
  });
});

describe("replaceEntryWithEdit", () => {
  it("replaces an entry's bytes and hash while keeping what names it", async () => {
    const database = await openLibrary("edit-over");
    const slot = new PresetSlot(2, 4, 6);
    const stored = await syxEntry(
      deviceDumpPayload({
        label: "Single 2.4.6",
        address: slot.byteAddress(),
        bytes: presetBytes("Fat Brass"),
      }),
      "UserImport",
    );
    const kept = { ...stored, tags: ["brass"], comment: "warm" };
    await database.entries.insert(kept);
    const edited = presetBytes("Fat Brass");
    edited[70] = 91;

    const next = await replaceEntryWithEdit(database, kept, {
      address: slot.byteAddress(),
      bytes: edited,
    });

    expect(next).toMatchObject({
      id: kept.id,
      name: "Fat Brass",
      tags: ["brass"],
      comment: "warm",
      source: "Edit",
      bank: 2,
      group: 4,
      slot: 6,
    });
    expect(next.sha256).not.toBe(kept.sha256);
    expect(await database.entries.count().exec()).toBe(1);
    expect(entryBytes(next)).toEqual(syxFile(slot.byteAddress(), edited));
    expect(await storedEntry(database, kept.id)).toMatchObject({
      sysex: next.sysex,
      sha256: next.sha256,
    });
  });
});

describe("pickSyxFiles", () => {
  it("uses the file picker when the browser has one", async () => {
    const file = toFile(singleFile(new PresetSlot(1, 1, 1), "Picked"), "picked.syx");
    const showOpenFilePicker = vi.fn(async () => [{ getFile: async () => file }]);
    vi.stubGlobal("showOpenFilePicker", showOpenFilePicker);

    expect(await pickSyxFiles()).toEqual([file]);
    expect(showOpenFilePicker).toHaveBeenCalledWith(expect.objectContaining({ multiple: true }));
    expect(document.body.querySelector("input[type=file]")).toBeNull();
  });

  it("returns nothing when the file picker is dismissed", async () => {
    vi.stubGlobal(
      "showOpenFilePicker",
      vi.fn(() => Promise.reject(new DOMException("dismissed", "AbortError"))),
    );

    expect(await pickSyxFiles()).toEqual([]);
  });

  it("falls back to a file input when the browser has no picker", async () => {
    const file = toFile(singleFile(new PresetSlot(1, 1, 1), "Fallback"), "fallback.syx");
    const picked = pickSyxFiles();

    expect(fileInput().accept).toContain(".syx");
    chooseFiles([file]);

    expect(await picked).toEqual([file]);
    expect(document.body.querySelector("input[type=file]")).toBeNull();
  });

  it("returns nothing when the file input is dismissed", async () => {
    const picked = pickSyxFiles();

    fileInput().dispatchEvent(new Event("cancel"));

    expect(await picked).toEqual([]);
  });
});

describe("importSyxFiles", () => {
  it("keeps the readable files of a selection when one of them is unreadable", async () => {
    const database = await openLibrary("batch-mixed");
    const good = toFile(singleFile(new PresetSlot(1, 1, 1), "Kept"), "kept.syx");
    const bad = toFile(
      new TextEncoder().encode("not a patch dump at all, however long"),
      "bad.syx",
    );
    const other = toFile(singleFile(new PresetSlot(2, 2, 2), "Also Kept"), "also-kept.syx");

    const report = await importSyxFiles(database, [good, bad, other]);

    expect(report.imported.map((entry) => entry.name)).toEqual(["Kept", "Also Kept"]);
    expect(report.failed).toHaveLength(1);
    expect(report.failed[0]?.fileName).toBe("bad.syx");
    expect(report.failed[0]?.reason).toContain("F0 status byte");
    expect(await database.entries.count().exec()).toBe(2);
  });

  it("names every unreadable file in a selection, with its own reason", async () => {
    const database = await openLibrary("batch-failures");
    const short = toFile(Uint8Array.from([0xf0, 0xf7]), "short.syx");
    const read = toFile(
      concat(Array.from({ length: 8 }, () => encodeCommand({ kind: "read-memory", address: 0 }))),
      "read.syx",
    );

    const report = await importSyxFiles(database, [short, read]);

    expect(report.imported).toEqual([]);
    expect(report.failed.map((failure) => failure.fileName)).toEqual(["short.syx", "read.syx"]);
    expect(report.failed[0]?.reason).toContain("shorter than");
    expect(report.failed[1]?.reason).toContain("read-memory");
    expect(await database.entries.count().exec()).toBe(0);
  });

  it("skips a file whose bytes are already stored, naming the entry holding them", async () => {
    const database = await openLibrary("batch-duplicate");
    const bytes = singleFile(new PresetSlot(3, 3, 3), "Only Once");
    const stored = await importSyxPayload(database, { fileName: "first.syx", bytes });

    const report = await importSyxFiles(database, [toFile(bytes, "again.syx")]);

    expect(report.imported).toEqual([]);
    expect(report.skipped).toHaveLength(1);
    expect(report.skipped[0]?.fileName).toBe("again.syx");
    expect(report.skipped[0]?.stored.id).toBe(stored.id);
    expect(await database.entries.count().exec()).toBe(1);
  });

  it("skips the second of two identical files picked in one selection", async () => {
    const database = await openLibrary("batch-duplicate-selection");
    const bytes = singleFile(new PresetSlot(4, 4, 4), "Twice Picked");

    const report = await importSyxFiles(database, [
      toFile(bytes, "one.syx"),
      toFile(bytes, "copy-of-one.syx"),
    ]);

    expect(report.imported).toHaveLength(1);
    expect(report.skipped.map((skip) => skip.fileName)).toEqual(["copy-of-one.syx"]);
    expect(await database.entries.count().exec()).toBe(1);
  });

  it("stores a file whose bytes differ from an entry it otherwise resembles", async () => {
    const database = await openLibrary("batch-near-duplicate");
    const bytes = singleFile(new PresetSlot(5, 5, 5), "Near");
    await importSyxPayload(database, { fileName: "near.syx", bytes });
    const edited = singleFile(new PresetSlot(5, 5, 5), "Near");
    edited[edited.length - 2] = (edited[edited.length - 2] ?? 0) ^ 0x01;

    const report = await importSyxFiles(database, [toFile(edited, "near-edited.syx")]);

    expect(report.skipped).toEqual([]);
    expect(report.imported).toHaveLength(1);
    expect(await database.entries.count().exec()).toBe(2);
  });

  it("reports nothing read when no files were picked", async () => {
    const database = await openLibrary("batch-empty");

    expect(await importSyxFiles(database, [])).toEqual({ imported: [], skipped: [], failed: [] });
  });
});

describe("importSyxFromDisk", () => {
  it("imports through the file input fallback, end to end", async () => {
    const database = await openLibrary("disk-fallback");
    const bytes = singleFile(new PresetSlot(6, 2, 4), "From Disk");
    const importing = importSyxFromDisk(database);

    chooseFiles([toFile(bytes, "from-disk.syx")]);

    const report = await importing;
    expect(report.imported).toHaveLength(1);
    expect(report.imported[0]).toMatchObject({
      kind: "Single",
      name: "From Disk",
      bank: 6,
      group: 2,
      slot: 4,
    });
    expect(await database.entries.count().exec()).toBe(1);
  });

  it("imports through the file picker when the browser has one, end to end", async () => {
    const database = await openLibrary("disk-picker");
    const file = toFile(singleFile(new PresetSlot(6, 2, 5), "Picked Off Disk"), "picked.syx");
    vi.stubGlobal(
      "showOpenFilePicker",
      vi.fn(async () => [{ getFile: async () => file }]),
    );

    const report = await importSyxFromDisk(database);

    expect(report.imported).toHaveLength(1);
    expect(report.imported[0]).toMatchObject({ kind: "Single", name: "Picked Off Disk" });
    expect(document.body.querySelector("input[type=file]")).toBeNull();
    expect(await database.entries.count().exec()).toBe(1);
  });

  it("imports nothing when the picker is dismissed", async () => {
    const database = await openLibrary("disk-dismissed");
    vi.stubGlobal(
      "showOpenFilePicker",
      vi.fn(() => Promise.reject(new DOMException("dismissed", "AbortError"))),
    );

    expect(await importSyxFromDisk(database)).toEqual({
      imported: [],
      skipped: [],
      failed: [],
    });
    expect(await database.entries.count().exec()).toBe(0);
  });
});

describe("exportEntryToDisk", () => {
  async function importedEntry(label: string, name: string): Promise<[LibraryEntry, Uint8Array]> {
    const database = await openLibrary(label);
    const bytes = singleFile(new PresetSlot(2, 2, 2), name);
    return [await importSyxPayload(database, { fileName: "source.syx", bytes }), bytes];
  }

  it("writes the imported bytes back out unchanged through the file picker", async () => {
    const [entry, bytes] = await importedEntry("export-picker", "Save Me");
    const written: Uint8Array[] = [];
    const showSaveFilePicker = vi.fn(async () => ({
      createWritable: async () => ({
        write: async (chunk: Uint8Array) => {
          written.push(chunk);
        },
        close: async () => undefined,
      }),
    }));
    vi.stubGlobal("showSaveFilePicker", showSaveFilePicker);

    expect(await exportEntryToDisk(entry)).toBe(true);
    expect(written).toHaveLength(1);
    expect(written[0]).toEqual(bytes);
    expect(showSaveFilePicker).toHaveBeenCalledWith(
      expect.objectContaining({ suggestedName: "Save Me.syx" }),
    );
  });

  it("writes a file the library reads back as the same bytes it exported", async () => {
    const [entry] = await importedEntry("export-round-trip", "There And Back");
    const written: Uint8Array[] = [];
    vi.stubGlobal(
      "showSaveFilePicker",
      vi.fn(async () => ({
        createWritable: async () => ({
          write: async (chunk: Uint8Array) => {
            written.push(chunk);
          },
          close: async () => undefined,
        }),
      })),
    );
    expect(await exportEntryToDisk(entry)).toBe(true);

    const reimported = await importSyxPayload(await openLibrary("export-reimport"), {
      fileName: entryFileName(entry),
      bytes: written[0] ?? new Uint8Array(),
    });

    expect(reimported.sha256).toBe(entry.sha256);
    expect(entryBytes(reimported)).toEqual(entryBytes(entry));
  });

  it("reports a dismissed save dialog instead of writing anything", async () => {
    const [entry] = await importedEntry("export-cancel", "Not Saved");
    vi.stubGlobal(
      "showSaveFilePicker",
      vi.fn(() => Promise.reject(new DOMException("dismissed", "AbortError"))),
    );

    expect(await exportEntryToDisk(entry)).toBe(false);
  });

  it("downloads the imported bytes unchanged when the browser has no save picker", async () => {
    const [entry, bytes] = await importedEntry("export-download", "Downloaded");
    const blobs: Blob[] = [];
    vi.stubGlobal("URL", {
      createObjectURL: (blob: Blob) => {
        blobs.push(blob);
        return "blob:e7";
      },
      revokeObjectURL: () => undefined,
    });
    const clicked: (string | null)[] = [];
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      clicked.push(this.getAttribute("download"));
    });

    expect(await exportEntryToDisk(entry)).toBe(true);
    expect(clicked).toEqual(["Downloaded.syx"]);
    expect(blobs).toHaveLength(1);
    expect(new Uint8Array((await blobs[0]?.arrayBuffer()) ?? new ArrayBuffer(0))).toEqual(bytes);
    expect(document.body.querySelector("a")).toBeNull();
  });

  it("refuses an entry whose stored bytes are no longer readable, opening no dialog", async () => {
    const [entry] = await importedEntry("export-corrupt", "Damaged");
    const showSaveFilePicker = vi.fn();
    vi.stubGlobal("showSaveFilePicker", showSaveFilePicker);

    await expect(exportEntryToDisk({ ...entry, sysex: "not base64 at all!" })).rejects.toThrow(
      EntryPayloadError,
    );
    await expect(
      exportEntryToDisk({ ...entry, sysex: btoa("a text file wearing a .syx extension") }),
    ).rejects.toThrow(/does not open with an F0 status byte/);
    expect(showSaveFilePicker).not.toHaveBeenCalled();
  });
});

describe("entryFileName", () => {
  it("names the file after the entry, keeping it filesystem-safe", async () => {
    const database = await openLibrary("file-name");
    const entry = await importSyxPayload(database, {
      fileName: "source.syx",
      bytes: singleFile(new PresetSlot(1, 1, 1), "Lead/Bass #1"),
    });

    expect(entryFileName(entry)).toBe("Lead-Bass -1.syx");
  });

  it("falls back to the entry's kind when its name leaves nothing to name a file after", async () => {
    const database = await openLibrary("file-name-empty");
    const entry = await importSyxPayload(database, {
      fileName: "source.syx",
      bytes: singleFile(new PresetSlot(1, 1, 2), "Named"),
    });

    expect(entryFileName({ ...entry, name: "" })).toBe("Single.syx");
    expect(entryFileName({ ...entry, name: "   " })).toBe("Single.syx");
    expect(entryFileName({ ...entry, name: "///" })).toBe("Single.syx");
    expect(entryFileName({ ...entry, name: ".hidden " })).toBe("hidden.syx");
  });
});
