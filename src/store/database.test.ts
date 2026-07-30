import type { SinglePreset } from "../protocol";
import type { LibraryDatabase, LibraryEntry, PresetSnapshot } from "./index";
import { createRxDatabase } from "rxdb";
import { getRxStorageDexie } from "rxdb/plugins/storage-dexie";
import { afterEach, describe, expect, it } from "vitest";
import { decodeSinglePreset } from "../protocol";
import { LIBRARY_ENTRY_SCHEMA, createLibraryDatabase } from "./index";

const openDatabases: LibraryDatabase[] = [];

function uniqueName(label: string): string {
  return `${label}-${Math.random().toString(36).slice(2)}`;
}

async function openLibrary(name: string): Promise<LibraryDatabase> {
  const database = await createLibraryDatabase({ name });
  openDatabases.push(database);
  return database;
}

function toSnapshot(preset: SinglePreset): PresetSnapshot {
  const json = JSON.stringify(preset, (_key, value: unknown) =>
    value instanceof Uint8Array ? Array.from(value) : value,
  );
  return JSON.parse(json) as PresetSnapshot;
}

const entry: LibraryEntry = {
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
  sysex: "8AAhYvc=",
};

afterEach(async () => {
  while (openDatabases.length > 0) {
    await openDatabases.pop()?.close();
  }
});

describe("createLibraryDatabase", () => {
  it("initializes the entries collection on IndexedDB storage", async () => {
    const database = await openLibrary(uniqueName("init"));

    expect(database.storage.name).toBe("dexie");
    expect(database.entries.name).toBe("entries");
    expect(database.entries.schema.version).toBe(LIBRARY_ENTRY_SCHEMA.version);
  });

  it("stores and reads back an entry with its raw SysEx and decoded snapshot", async () => {
    const database = await openLibrary(uniqueName("roundtrip"));
    const snapshot = toSnapshot(decodeSinglePreset(new Uint8Array(128)));

    await database.entries.insert({ ...entry, snapshot });
    const stored = await database.entries.findOne(entry.id).exec();

    expect(stored?.toJSON()).toMatchObject({ ...entry, snapshot });
  });

  it("persists entries across a close and reopen of the same database name", async () => {
    const name = uniqueName("reopen");
    const first = await openLibrary(name);
    await first.entries.insert(entry);
    await openDatabases.pop()?.close();

    const second = await openLibrary(name);

    expect(await second.entries.count().exec()).toBe(1);
  });

  it("queries by kind and capture time through the declared index", async () => {
    const database = await openLibrary(uniqueName("query"));
    await database.entries.bulkInsert([
      entry,
      { ...entry, id: "second", kind: "Bank", capturedAt: "2026-07-30T11:00:00.000Z" },
    ]);

    const singles = await database.entries.find({ selector: { kind: "Single" } }).exec();

    expect(singles.map((document) => document.id)).toEqual([entry.id]);
  });
});

describe("library entry migration", () => {
  it("migrates a version 0 document into the current schema on open", async () => {
    const name = uniqueName("migration");
    const { tags: _tags, ...entryV0 } = entry;
    const { tags: _tagsProperty, ...propertiesV0 } = LIBRARY_ENTRY_SCHEMA.properties;
    const schemaV0 = {
      ...LIBRARY_ENTRY_SCHEMA,
      version: 0,
      properties: propertiesV0,
      required: ["id", "kind", "name", "capturedAt", "source", "comment", "sha256", "sysex"],
    };

    const legacy = await createRxDatabase({ name, storage: getRxStorageDexie() });
    const legacyCollections = await legacy.addCollections({ entries: { schema: schemaV0 } });
    await legacyCollections.entries.insert(entryV0);
    await legacy.close();

    const migrated = await openLibrary(name);
    const stored = await migrated.entries.findOne(entry.id).exec();

    expect(stored?.toJSON()).toMatchObject({ ...entryV0, tags: [] });
  });
});
