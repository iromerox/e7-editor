import type { LibraryDatabase, LibraryEntry } from "./index";
import { afterEach, describe, expect, it } from "vitest";
import { EntryMissingError, createLibraryDatabase, deleteEntry } from "./index";

const openDatabases: LibraryDatabase[] = [];

async function openLibrary(...entries: readonly LibraryEntry[]): Promise<LibraryDatabase> {
  const database = await createLibraryDatabase({
    name: `removal-${Math.random().toString(36).slice(2)}`,
  });
  openDatabases.push(database);
  await database.entries.bulkInsert([...entries]);
  return database;
}

function stored(id: string, name: string): LibraryEntry {
  return {
    id,
    kind: "Single",
    name,
    bank: 1,
    group: 2,
    slot: 3,
    capturedAt: "2026-08-05T09:00:00.000Z",
    source: "DeviceDump",
    tags: ["kept"],
    comment: "Left on the entry.",
    sha256: id.slice(0, 1).repeat(64),
    sysex: "8AAhYvc=",
  };
}

async function reread(database: LibraryDatabase, id: string): Promise<LibraryEntry | undefined> {
  return (await database.entries.findOne(id).exec())?.toJSON();
}

afterEach(async () => {
  while (openDatabases.length > 0) {
    await openDatabases.pop()?.close();
  }
});

describe("deleteEntry", () => {
  it("removes the entry it names and leaves every other one stored", async () => {
    const database = await openLibrary(stored("a", "Fat Brass"), stored("b", "Split Keys"));

    await deleteEntry(database, "a");

    expect(await reread(database, "a")).toBeUndefined();
    expect(await reread(database, "b")).toEqual(stored("b", "Split Keys"));
    expect(await database.entries.count().exec()).toBe(1);
  });

  it("hands back what it deleted, so the entry can still be named afterwards", async () => {
    const database = await openLibrary(stored("a", "Fat Brass"));

    expect(await deleteEntry(database, "a")).toEqual(stored("a", "Fat Brass"));
  });

  it("refuses an entry that is no longer in the library rather than deleting nothing quietly", async () => {
    const database = await openLibrary(stored("a", "Fat Brass"));
    await deleteEntry(database, "a");

    await expect(deleteEntry(database, "a")).rejects.toThrow(EntryMissingError);
  });

  it("empties the library when the last entry goes", async () => {
    const database = await openLibrary(stored("a", "Only One"));

    await deleteEntry(database, "a");

    expect(await database.entries.count().exec()).toBe(0);
  });
});
