import type { LibraryDatabase, LibraryEntry } from "./index";
import { afterEach, describe, expect, it } from "vitest";
import {
  ENTRY_COMMENT_MAX_LENGTH,
  EntryMetadataError,
  EntryMissingError,
  createLibraryDatabase,
  entryMetadata,
  formatTags,
  normalizeTags,
  parseTags,
  updateEntryMetadata,
  validateEntryMetadata,
} from "./index";

const openDatabases: LibraryDatabase[] = [];

async function openLibrary(...entries: readonly LibraryEntry[]): Promise<LibraryDatabase> {
  const database = await createLibraryDatabase({
    name: `metadata-${Math.random().toString(36).slice(2)}`,
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
    capturedAt: "2026-08-01T09:00:00.000Z",
    source: "DeviceDump",
    tags: [],
    comment: "",
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

describe("tag text", () => {
  it("drops blank tags, trims the rest and keeps each one once", () => {
    expect(parseTags(" brass ,, layered,brass, ")).toEqual(["brass", "layered"]);
  });

  it("reads back the text it wrote for a set of tags", () => {
    expect(parseTags(formatTags(["brass", "layered"]))).toEqual(["brass", "layered"]);
  });

  it("leaves a tag holding a space alone rather than splitting it", () => {
    expect(parseTags("string machine, brass")).toEqual(["string machine", "brass"]);
  });

  it("normalizes an array the same way the text is normalized", () => {
    expect(normalizeTags(["  pad ", "", "pad", "lead"])).toEqual(["pad", "lead"]);
  });
});

describe("validateEntryMetadata", () => {
  it("returns the name trimmed and the tags normalized", () => {
    expect(
      validateEntryMetadata("a", {
        name: "  Fat Brass ",
        tags: [" pad ", "pad"],
        comment: " note",
      }),
    ).toEqual({ name: "Fat Brass", tags: ["pad"], comment: " note" });
  });

  it("refuses a name that is blank once trimmed", () => {
    expect(() => validateEntryMetadata("a", { name: "   ", tags: [], comment: "" })).toThrowError(
      EntryMetadataError,
    );
  });

  it("names every fault it found rather than only the first", () => {
    try {
      validateEntryMetadata("a", {
        name: "",
        tags: ["t".repeat(65)],
        comment: "c".repeat(ENTRY_COMMENT_MAX_LENGTH + 1),
      });
      expect.unreachable("the metadata was accepted");
    } catch (reason) {
      expect(reason).toBeInstanceOf(EntryMetadataError);
      const faults = (reason as EntryMetadataError).faults;
      expect(faults).toHaveLength(3);
      expect(faults.join("; ")).toContain("needs a name");
      expect(faults.join("; ")).toContain("a tag is at most");
      expect(faults.join("; ")).toContain("a comment is at most");
    }
  });
});

describe("updateEntryMetadata", () => {
  it("writes the name, tags and comment, leaving the stored SysEx and its hash alone", async () => {
    const entry = stored("0198c0de-0000-4000-8000-00000000000a", "Fat Brass");
    const database = await openLibrary(entry);

    const saved = await updateEntryMetadata(database, entry.id, {
      name: "Fatter Brass",
      tags: ["brass", "layered"],
      comment: "Both oscillators detuned.",
    });

    expect(saved.name).toBe("Fatter Brass");
    expect(saved.tags).toEqual(["brass", "layered"]);
    expect(saved.comment).toBe("Both oscillators detuned.");
    expect(saved.sysex).toBe(entry.sysex);
    expect(saved.sha256).toBe(entry.sha256);
    expect(await reread(database, entry.id)).toEqual({
      ...entry,
      name: "Fatter Brass",
      tags: ["brass", "layered"],
      comment: "Both oscillators detuned.",
    });
  });

  it("keeps a comment of several hundred characters intact", async () => {
    const entry = stored("0198c0de-0000-4000-8000-00000000000b", "Long Note");
    const database = await openLibrary(entry);
    const comment = "Recorded on the second pass. ".repeat(20);

    await updateEntryMetadata(database, entry.id, { ...entryMetadata(entry), comment });

    expect(comment.length).toBeGreaterThan(400);
    expect((await reread(database, entry.id))?.comment).toBe(comment);
  });

  it("removes every tag when the tags are cleared", async () => {
    const entry = { ...stored("0198c0de-0000-4000-8000-00000000000c", "Tagged"), tags: ["pad"] };
    const database = await openLibrary(entry);

    const saved = await updateEntryMetadata(database, entry.id, {
      ...entryMetadata(entry),
      tags: [],
    });

    expect(saved.tags).toEqual([]);
    expect((await reread(database, entry.id))?.tags).toEqual([]);
  });

  it("leaves every other entry as it was", async () => {
    const edited = stored("0198c0de-0000-4000-8000-00000000000d", "Edited");
    const untouched = stored("0198c0de-0000-4000-8000-00000000000e", "Untouched");
    const database = await openLibrary(edited, untouched);

    await updateEntryMetadata(database, edited.id, {
      name: "Renamed",
      tags: ["pad"],
      comment: "changed",
    });

    expect(await reread(database, untouched.id)).toEqual(untouched);
  });

  it("writes nothing when the metadata is refused", async () => {
    const entry = stored("0198c0de-0000-4000-8000-00000000000f", "Kept");
    const database = await openLibrary(entry);

    await expect(
      updateEntryMetadata(database, entry.id, { name: " ", tags: [], comment: "" }),
    ).rejects.toBeInstanceOf(EntryMetadataError);

    expect(await reread(database, entry.id)).toEqual(entry);
  });

  it("says so when the entry is no longer in the library", async () => {
    const database = await openLibrary();

    await expect(
      updateEntryMetadata(database, "0198c0de-0000-4000-8000-000000000010", {
        name: "Gone",
        tags: [],
        comment: "",
      }),
    ).rejects.toBeInstanceOf(EntryMissingError);
  });
});
