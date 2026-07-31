import type { LibraryDatabase, LibraryEntry } from "./index";
import { firstValueFrom } from "rxjs";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  allEntries,
  createLibraryDatabase,
  entriesByKind,
  entriesInGroup,
  entryById,
  entryCount,
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
  sysex: "8AAhYvc=",
};

const multi: LibraryEntry = {
  id: "0198c0de-0000-4000-8000-000000000002",
  kind: "Multi",
  name: "Split Keys",
  bank: 1,
  group: 3,
  slot: 6,
  capturedAt: "2026-07-30T11:00:00.000Z",
  source: "UserImport",
  tags: [],
  comment: "",
  sha256: "b".repeat(64),
  sysex: "8AAhYvc=",
};

const backup: LibraryEntry = {
  id: "0198c0de-0000-4000-8000-000000000003",
  kind: "Backup",
  name: "Whole instrument",
  capturedAt: "2026-07-30T12:00:00.000Z",
  source: "DeviceDump",
  tags: ["before-factory-reset"],
  comment: "",
  sha256: "c".repeat(64),
  sysex: "8AAhYvc=",
};

function collect(database: LibraryDatabase): {
  seen: (readonly LibraryEntry[])[];
  stop: () => void;
} {
  const seen: (readonly LibraryEntry[])[] = [];
  const subscription = allEntries(database).subscribe((entries) => seen.push(entries));
  return { seen, stop: () => subscription.unsubscribe() };
}

function names(entries: readonly LibraryEntry[]): readonly string[] {
  return entries.map((entry) => entry.name);
}

const SYNTHETIC_ENTRIES = 500;
const SYNTHETIC_BACKUPS = 100;

function syntheticLibrary(): LibraryEntry[] {
  return Array.from({ length: SYNTHETIC_ENTRIES }, (_unused, index) => {
    const isBackup = index % (SYNTHETIC_ENTRIES / SYNTHETIC_BACKUPS) === 0;
    const slot = {
      bank: (index % 8) + 1,
      group: (index % 3) + 1,
      slot: (index % 8) + 1,
    };
    return {
      id: `0198c0de-0000-4000-8000-${String(index).padStart(12, "0")}`,
      kind: isBackup ? "Backup" : "Single",
      name: `Entry ${index}`,
      ...(isBackup ? {} : slot),
      capturedAt: new Date(Date.UTC(2026, 0, 1, 0, 0, index)).toISOString(),
      source: "DeviceDump",
      tags: [],
      comment: "",
      sha256: String(index).padStart(64, "0"),
      sysex: "8AAhYvc=",
    } satisfies LibraryEntry;
  });
}

async function elapsed(run: () => Promise<unknown>): Promise<number> {
  const started = performance.now();
  await run();
  return performance.now() - started;
}

afterEach(async () => {
  while (openDatabases.length > 0) {
    await openDatabases.pop()?.close();
  }
});

describe("allEntries", () => {
  it("emits the library as it stands when a subscriber arrives", async () => {
    const database = await openLibrary("initial");
    await database.entries.bulkInsert([single, backup]);

    expect(names(await firstValueFrom(allEntries(database)))).toEqual([
      "Fat Brass",
      "Whole instrument",
    ]);
  });

  it("re-emits on an insert, an update and a delete without a refresh call", async () => {
    const database = await openLibrary("reactive");
    const { seen, stop } = collect(database);
    await vi.waitFor(() => expect(seen).toHaveLength(1));
    expect(seen[0]).toEqual([]);

    await database.entries.insert(single);
    await vi.waitFor(() => expect(names(seen[seen.length - 1] ?? [])).toEqual(["Fat Brass"]));

    const stored = await database.entries.findOne(single.id).exec();
    await stored?.patch({ name: "Fat Brass II" });
    await vi.waitFor(() => expect(names(seen[seen.length - 1] ?? [])).toEqual(["Fat Brass II"]));

    await (await database.entries.findOne(single.id).exec())?.remove();
    await vi.waitFor(() => expect(seen[seen.length - 1]).toEqual([]));

    stop();
  });

  it("emits plain entries rather than documents, so the UI holds only data", async () => {
    const database = await openLibrary("plain");
    await database.entries.insert(single);

    const [entry] = await firstValueFrom(allEntries(database));

    expect(entry).toEqual(single);
    expect(entry).not.toHaveProperty("collection");
  });

  it("stops emitting once its subscriber leaves", async () => {
    const database = await openLibrary("unsubscribed");
    const { seen, stop } = collect(database);
    await vi.waitFor(() => expect(seen).toHaveLength(1));
    stop();

    await database.entries.insert(single);

    expect(seen).toHaveLength(1);
  });
});

describe("entriesByKind", () => {
  it("narrows the library to one kind and tracks later inserts of it", async () => {
    const database = await openLibrary("by-kind");
    await database.entries.bulkInsert([single, backup]);
    const seen: (readonly LibraryEntry[])[] = [];
    const subscription = entriesByKind(database, "Single").subscribe((entries) =>
      seen.push(entries),
    );

    await vi.waitFor(() => expect(names(seen[seen.length - 1] ?? [])).toEqual(["Fat Brass"]));

    await database.entries.insert(multi);
    await database.entries.insert({
      ...single,
      id: "later",
      capturedAt: "2026-07-30T13:00:00.000Z",
    });
    await vi.waitFor(() =>
      expect(names(seen[seen.length - 1] ?? [])).toEqual(["Fat Brass", "Fat Brass"]),
    );

    subscription.unsubscribe();
  });

  it("resolves through the declared kind index rather than a scan", async () => {
    const database = await openLibrary("kind-index");

    const plan = database.entries
      .find({ selector: { kind: "Single" }, sort: [{ kind: "asc" }, { capturedAt: "asc" }] })
      .getPreparedQuery().queryPlan;

    expect(plan.index).toContain("kind");
    expect(plan.index).toContain("capturedAt");
  });

  it("answers faster than reading the whole library and filtering it", async () => {
    const database = await openLibrary("kind-timing");
    await database.entries.bulkInsert(syntheticLibrary());

    await firstValueFrom(entriesByKind(database, "Multi"));
    await firstValueFrom(entriesInGroup(database, 7, 2));

    const indexed = await elapsed(async () => {
      const found = await firstValueFrom(entriesByKind(database, "Backup"));
      expect(found).toHaveLength(SYNTHETIC_BACKUPS);
    });
    const scanned = await elapsed(async () => {
      const all = await firstValueFrom(allEntries(database));
      expect(all.filter((entry) => entry.kind === "Backup")).toHaveLength(SYNTHETIC_BACKUPS);
    });

    expect(indexed * 2).toBeLessThan(scanned);
  }, 30000);
});

describe("entriesInGroup", () => {
  it("returns only the entries captured from that bank and group", async () => {
    const database = await openLibrary("in-group");
    await database.entries.bulkInsert([
      single,
      multi,
      backup,
      { ...single, id: "other-group", group: 4 },
    ]);

    const found = await firstValueFrom(entriesInGroup(database, 1, 3));

    expect(names(found)).toEqual(["Fat Brass", "Split Keys"]);
  });

  it("holds no entry that was never captured from a slot", async () => {
    const database = await openLibrary("slotless");
    await database.entries.insert(backup);

    expect(await firstValueFrom(entriesInGroup(database, 1, 1))).toEqual([]);
  });
});

describe("entryById", () => {
  it("follows one entry through an edit and reports its removal", async () => {
    const database = await openLibrary("by-id");
    await database.entries.insert(single);
    const seen: (LibraryEntry | undefined)[] = [];
    const subscription = entryById(database, single.id).subscribe((entry) => seen.push(entry));

    await vi.waitFor(() => expect(seen[seen.length - 1]?.name).toBe("Fat Brass"));

    await (await database.entries.findOne(single.id).exec())?.patch({ comment: "reworked" });
    await vi.waitFor(() => expect(seen[seen.length - 1]?.comment).toBe("reworked"));

    const beforeRemoval = seen.length;
    await (await database.entries.findOne(single.id).exec())?.remove();
    await vi.waitFor(() => {
      expect(seen.length).toBeGreaterThan(beforeRemoval);
      expect(seen[seen.length - 1]).toBeUndefined();
    });

    subscription.unsubscribe();
  });
});

describe("entryCount", () => {
  it("tracks how many entries the library holds", async () => {
    const database = await openLibrary("count");
    const seen: number[] = [];
    const subscription = entryCount(database).subscribe((count) => seen.push(count));

    await vi.waitFor(() => expect(seen[seen.length - 1]).toBe(0));

    await database.entries.bulkInsert([single, multi]);
    await vi.waitFor(() => expect(seen[seen.length - 1]).toBe(2));

    subscription.unsubscribe();
  });
});
