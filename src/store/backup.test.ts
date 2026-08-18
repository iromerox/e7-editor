import type { SinglePreset } from "../protocol";
import type { LibraryDatabase, LibraryEntry, PresetSnapshot } from "./index";
import { afterEach, describe, expect, it, vi } from "vitest";
import { decodeSinglePreset } from "../protocol";
import {
  IncompatibleBackupError,
  LIBRARY_BACKUP_FORMAT,
  LIBRARY_BACKUP_FORMAT_VERSION,
  LIBRARY_BACKUP_MEDIA_TYPE,
  LIBRARY_ENTRY_SCHEMA_VERSION,
  LibraryNotEmptyError,
  MalformedBackupError,
  backupLibraryToDisk,
  createLibraryDatabase,
  exportLibrary,
  importLibrary,
  libraryBackupFileName,
  restoreLibraryFromDisk,
} from "./index";

const openDatabases: LibraryDatabase[] = [];

function uniqueName(label: string): string {
  return `${label}-${Math.random().toString(36).slice(2)}`;
}

async function openLibrary(label: string): Promise<LibraryDatabase> {
  const database = await createLibraryDatabase({ name: uniqueName(label) });
  openDatabases.push(database);
  return database;
}

function toSnapshot(preset: SinglePreset): PresetSnapshot {
  const json = JSON.stringify(preset, (_key, value: unknown) =>
    value instanceof Uint8Array ? Array.from(value) : value,
  );
  return JSON.parse(json) as PresetSnapshot;
}

function base64(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes));
}

const single: LibraryEntry = {
  id: "0198c0de-0000-4000-8000-000000000001",
  kind: "Single",
  name: "Fat Brass",
  bank: 1,
  group: 3,
  slot: 5,
  capturedAt: "2026-07-30T10:00:00.000Z",
  source: "DeviceDump",
  tags: ["brass", "layered"],
  comment: "captured before the filter tweak",
  sha256: "a".repeat(64),
  sysex: base64(Uint8Array.from([0xf0, 0x00, 0x21, 0x62, 0x7f, 0xff, 0x00, 0xf7])),
};

const bank: LibraryEntry = {
  id: "0198c0de-0000-4000-8000-000000000002",
  kind: "Bank",
  name: "Bank 2",
  capturedAt: "2026-07-30T11:30:00.000Z",
  source: "UserImport",
  tags: [],
  comment: "",
  sha256: "b".repeat(64),
  sysex: base64(Uint8Array.from([0xf0, 0x00, 0x21, 0x62, 0x00, 0x80, 0x7f, 0xf7])),
};

function roundTripped(backup: unknown): unknown {
  return JSON.parse(JSON.stringify(backup));
}

async function storedEntries(database: LibraryDatabase): Promise<readonly unknown[]> {
  const documents = await database.entries.find({ sort: [{ id: "asc" }] }).exec();
  return documents.map((document) => document.toJSON());
}

function captureSave(): readonly Uint8Array[] {
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
  return written;
}

function savedText(written: readonly Uint8Array[]): string {
  return new TextDecoder().decode(written[0] ?? new Uint8Array());
}

function offerFile(text: string, fileName: string): void {
  const file = new File([text], fileName, { type: LIBRARY_BACKUP_MEDIA_TYPE });
  vi.stubGlobal(
    "showOpenFilePicker",
    vi.fn(async () => [{ getFile: async () => file }]),
  );
}

afterEach(async () => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  while (openDatabases.length > 0) {
    await openDatabases.pop()?.close();
  }
});

describe("exportLibrary", () => {
  it("stamps the dump with the format and schema version markers", async () => {
    const database = await openLibrary("markers");

    const backup = await exportLibrary(database);

    expect(backup.format).toBe(LIBRARY_BACKUP_FORMAT);
    expect(backup.formatVersion).toBe(LIBRARY_BACKUP_FORMAT_VERSION);
    expect(backup.schemaVersion).toBe(LIBRARY_ENTRY_SCHEMA_VERSION);
    expect(Date.parse(backup.createdAt)).not.toBeNaN();
    expect(backup.dump.collections.map((collection) => collection.name)).toEqual(["entries"]);
  });
});

describe("importLibrary", () => {
  it("reproduces every entry in a fresh database, raw SysEx included", async () => {
    const source = await openLibrary("export");
    const snapshot = toSnapshot(decodeSinglePreset(new Uint8Array(128)));
    await source.entries.bulkInsert([{ ...single, snapshot }, bank]);

    const backup = await exportLibrary(source);
    const target = await openLibrary("import");
    await importLibrary(target, roundTripped(backup));

    expect(await storedEntries(target)).toEqual(await storedEntries(source));
    const restored = await target.entries.findOne(single.id).exec();
    expect(restored?.get("sysex")).toBe(single.sysex);
    expect(restored?.get("snapshot")).toEqual(snapshot);
  });

  it("restores an empty library as an empty library", async () => {
    const source = await openLibrary("empty-export");
    const target = await openLibrary("empty-import");

    await importLibrary(target, roundTripped(await exportLibrary(source)));

    expect(await target.entries.count().exec()).toBe(0);
  });

  it("rejects a backup into a library that already holds entries, changing nothing", async () => {
    const source = await openLibrary("occupied-export");
    await source.entries.insert(single);
    const backup = roundTripped(await exportLibrary(source));

    const target = await openLibrary("occupied-import");
    await target.entries.insert(bank);

    await expect(importLibrary(target, backup)).rejects.toThrow(LibraryNotEmptyError);
    expect(await storedEntries(target)).toEqual([expect.objectContaining({ id: bank.id })]);
  });

  it("rejects a dump written against a newer entry schema", async () => {
    const source = await openLibrary("future-schema");
    const backup = { ...(await exportLibrary(source)), schemaVersion: 99 };
    const target = await openLibrary("future-schema-import");

    const failure = importLibrary(target, roundTripped(backup));

    await expect(failure).rejects.toThrow(IncompatibleBackupError);
    await expect(failure).rejects.toThrow(/schemaVersion is 99/);
  });

  it("rejects a dump written in a newer backup format", async () => {
    const source = await openLibrary("future-format");
    const backup = { ...(await exportLibrary(source)), formatVersion: 2 };
    const target = await openLibrary("future-format-import");

    await expect(importLibrary(target, roundTripped(backup))).rejects.toThrow(
      IncompatibleBackupError,
    );
  });

  it.each([
    ["a non-object", 42],
    ["another application's JSON", { format: "some-other-tool", formatVersion: 1 }],
    [
      "a backup with no dump",
      {
        format: LIBRARY_BACKUP_FORMAT,
        formatVersion: LIBRARY_BACKUP_FORMAT_VERSION,
        schemaVersion: LIBRARY_ENTRY_SCHEMA_VERSION,
        createdAt: "2026-07-30T12:00:00.000Z",
      },
    ],
  ])("rejects %s", async (_label, value) => {
    const target = await openLibrary("malformed");

    await expect(importLibrary(target, value)).rejects.toThrow(MalformedBackupError);
    expect(await target.entries.count().exec()).toBe(0);
  });

  it("rejects a dump holding an entry that is not a library entry", async () => {
    const source = await openLibrary("corrupt-export");
    await source.entries.insert(single);
    const backup = await exportLibrary(source);
    const [collection] = backup.dump.collections;
    expect(collection).toBeDefined();
    const corrupted = {
      ...backup,
      dump: {
        ...backup.dump,
        collections: [{ ...collection, docs: [{ ...single, sha256: "not-a-hash" }] }],
      },
    };

    const target = await openLibrary("corrupt-import");

    await expect(importLibrary(target, roundTripped(corrupted))).rejects.toThrow(
      MalformedBackupError,
    );
    expect(await target.entries.count().exec()).toBe(0);
  });
});

describe("libraryBackupFileName", () => {
  it("names the file after the day the backup was taken", () => {
    expect(libraryBackupFileName("2026-08-18T09:41:07.318Z")).toBe("e7-library-2026-08-18.json");
  });
});

describe("backupLibraryToDisk", () => {
  it("writes a JSON file carrying the markers a restore checks", async () => {
    const database = await openLibrary("save-markers");
    await database.entries.bulkInsert([single, bank]);
    const written = captureSave();

    const saved = await backupLibraryToDisk(database);

    expect(saved).toEqual({ fileName: expect.stringMatching(/^e7-library-.+\.json$/), entries: 2 });
    const backup = JSON.parse(savedText(written)) as Record<string, unknown>;
    expect(backup).toMatchObject({
      format: LIBRARY_BACKUP_FORMAT,
      formatVersion: LIBRARY_BACKUP_FORMAT_VERSION,
      schemaVersion: LIBRARY_ENTRY_SCHEMA_VERSION,
    });
    expect(Date.parse(String(backup.createdAt))).not.toBeNaN();
  });

  it("reports a dismissed save dialog instead of writing anything", async () => {
    const database = await openLibrary("save-dismissed");
    await database.entries.insert(single);
    vi.stubGlobal(
      "showSaveFilePicker",
      vi.fn(() => Promise.reject(new DOMException("dismissed", "AbortError"))),
    );

    expect(await backupLibraryToDisk(database)).toBeUndefined();
  });
});

describe("restoreLibraryFromDisk", () => {
  async function savedLibrary(label: string): Promise<string> {
    const source = await openLibrary(label);
    const snapshot = toSnapshot(decodeSinglePreset(new Uint8Array(128)));
    await source.entries.bulkInsert([{ ...single, snapshot }, bank]);
    const written = captureSave();
    await backupLibraryToDisk(source);
    vi.unstubAllGlobals();
    return savedText(written);
  }

  it("reproduces every entry of the file it reads, raw SysEx included", async () => {
    const text = await savedLibrary("round-trip-source");
    const target = await openLibrary("round-trip-target");
    offerFile(text, "e7-library-2026-08-18.json");

    expect(await restoreLibraryFromDisk(target)).toEqual({
      fileName: "e7-library-2026-08-18.json",
      entries: 2,
    });

    const restored = await storedEntries(target);
    expect(restored).toHaveLength(2);
    expect(restored).toContainEqual(expect.objectContaining({ id: bank.id, sysex: bank.sysex }));
    const found = await target.entries.findOne(single.id).exec();
    expect(found?.get("sysex")).toBe(single.sysex);
    expect(found?.get("sha256")).toBe(single.sha256);
    expect(found?.get("snapshot")).toEqual(toSnapshot(decodeSinglePreset(new Uint8Array(128))));
  });

  it("reports a dismissed file dialog instead of restoring anything", async () => {
    const target = await openLibrary("open-dismissed");
    vi.stubGlobal(
      "showOpenFilePicker",
      vi.fn(() => Promise.reject(new DOMException("dismissed", "AbortError"))),
    );

    expect(await restoreLibraryFromDisk(target)).toBeUndefined();
    expect(await target.entries.count().exec()).toBe(0);
  });

  it("refuses a library that already holds entries, opening no dialog and changing nothing", async () => {
    const text = await savedLibrary("occupied-source");
    const target = await openLibrary("occupied-target");
    await target.entries.bulkInsert([{ ...bank, id: "0198c0de-0000-4000-8000-00000000000f" }]);
    const showOpenFilePicker = vi.fn();
    vi.stubGlobal("showOpenFilePicker", showOpenFilePicker);

    const refusal = restoreLibraryFromDisk(target);

    await expect(refusal).rejects.toThrow(LibraryNotEmptyError);
    await expect(refusal).rejects.toThrow(/holds 1 entry$/);
    expect(showOpenFilePicker).not.toHaveBeenCalled();
    expect(text).toContain(LIBRARY_BACKUP_FORMAT);
    expect(await storedEntries(target)).toEqual([
      expect.objectContaining({ id: "0198c0de-0000-4000-8000-00000000000f" }),
    ]);
  });

  it("refuses a file that is not readable JSON, naming what it is not", async () => {
    const target = await openLibrary("not-json");
    offerFile("this is a text file wearing a .json extension", "notes.json");

    const refusal = restoreLibraryFromDisk(target);

    await expect(refusal).rejects.toThrow(MalformedBackupError);
    await expect(refusal).rejects.toThrow(/this is not a library backup: it does not hold/);
    expect(await target.entries.count().exec()).toBe(0);
  });

  it("refuses another application's JSON, naming what it is not", async () => {
    const target = await openLibrary("other-json");
    offerFile(JSON.stringify({ format: "some-other-tool", formatVersion: 1 }), "other.json");

    await expect(restoreLibraryFromDisk(target)).rejects.toThrow(MalformedBackupError);
    expect(await target.entries.count().exec()).toBe(0);
  });

  it("refuses a backup written against another entry schema", async () => {
    const source = await openLibrary("other-schema-source");
    const backup = { ...(await exportLibrary(source)), schemaVersion: 99 };
    const target = await openLibrary("other-schema-target");
    offerFile(JSON.stringify(backup), "e7-library-2026-08-18.json");

    const refusal = restoreLibraryFromDisk(target);

    await expect(refusal).rejects.toThrow(IncompatibleBackupError);
    await expect(refusal).rejects.toThrow(/schemaVersion is 99/);
    expect(await target.entries.count().exec()).toBe(0);
  });
});
