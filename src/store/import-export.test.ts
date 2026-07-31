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
  MAX_SYX_FILE_BYTES,
  MEMORY_BLOCK_BYTES,
  SyxPayloadError,
  UnexpectedSysExCommandError,
  createLibraryDatabase,
  entryBytes,
  entryFileName,
  exportEntryToDisk,
  importSyxFromDisk,
  importSyxPayload,
  pickSyxFiles,
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

describe("importSyxFromDisk", () => {
  it("imports through the file input fallback, end to end", async () => {
    const database = await openLibrary("disk-fallback");
    const bytes = singleFile(new PresetSlot(6, 2, 4), "From Disk");
    const importing = importSyxFromDisk(database);

    chooseFiles([toFile(bytes, "from-disk.syx")]);

    const entries = await importing;
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      kind: "Single",
      name: "From Disk",
      bank: 6,
      group: 2,
      slot: 4,
    });
    expect(await database.entries.count().exec()).toBe(1);
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
});
