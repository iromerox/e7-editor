import type { LibraryDatabase, LibraryEntry } from "../store";
import { fireEvent, render, screen } from "@solidjs/testing-library";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createLibraryDatabase } from "../store";
import { LibraryPane } from "./LibraryPane";

const openDatabases: LibraryDatabase[] = [];

async function openLibrary(...entries: readonly LibraryEntry[]): Promise<LibraryDatabase> {
  const database = await createLibraryDatabase({
    name: `pane-${Math.random().toString(36).slice(2)}`,
  });
  openDatabases.push(database);
  await database.entries.bulkInsert([...entries]);
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
  comment: "",
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

function listed(): string[] {
  return screen.getAllByRole("listitem").map((item) => item.textContent ?? "");
}

async function filterBy(kind: string): Promise<void> {
  await fireEvent.change(screen.getByLabelText("Kind"), { target: { value: kind } });
}

afterEach(async () => {
  while (openDatabases.length > 0) {
    await openDatabases.pop()?.close();
  }
});

describe("LibraryPane", () => {
  it("lists each entry with its name, kind, tags and captured slot", async () => {
    const database = await openLibrary(single, backup);
    render(() => <LibraryPane database={database} />);

    await vi.waitFor(() => expect(listed()).toHaveLength(2));
    expect(listed()[0]).toContain("Fat Brass");
    expect(listed()[0]).toContain("Single");
    expect(listed()[0]).toContain("brass");
    expect(listed()[0]).toContain("layered");
    expect(listed()[0]).toContain("Bank 1 · Group 3 · Slot 5");
    expect(listed()[1]).toContain("Whole instrument");
    expect(screen.getByText("2 entries")).toBeInTheDocument();
  });

  it("picks up an entry added after render, without a manual refresh", async () => {
    const database = await openLibrary(single);
    render(() => <LibraryPane database={database} />);
    await vi.waitFor(() => expect(listed()).toHaveLength(1));

    await database.entries.insert(multi);

    await vi.waitFor(() => expect(listed()).toHaveLength(2));
    expect(screen.getByText("Split Keys")).toBeInTheDocument();
  });

  it("drops an entry removed after render, without a manual refresh", async () => {
    const database = await openLibrary(single, multi);
    render(() => <LibraryPane database={database} />);
    await vi.waitFor(() => expect(listed()).toHaveLength(2));

    await (await database.entries.findOne(single.id).exec())?.remove();

    await vi.waitFor(() => expect(listed()).toHaveLength(1));
    expect(screen.queryByText("Fat Brass")).not.toBeInTheDocument();
  });

  it("narrows to one kind when filtered, and restores the rest afterwards", async () => {
    const database = await openLibrary(single, multi, backup);
    render(() => <LibraryPane database={database} />);
    await vi.waitFor(() => expect(listed()).toHaveLength(3));

    await filterBy("Multi");
    await vi.waitFor(() => expect(listed()).toHaveLength(1));
    expect(listed()[0]).toContain("Split Keys");

    await filterBy("All kinds");
    await vi.waitFor(() => expect(listed()).toHaveLength(3));
  });

  it("keeps tracking the store while a kind filter is applied", async () => {
    const database = await openLibrary(single);
    render(() => <LibraryPane database={database} />);
    await filterBy("Backup");
    await vi.waitFor(() => expect(screen.queryAllByRole("listitem")).toHaveLength(0));

    await database.entries.insert(backup);

    await vi.waitFor(() => expect(listed()).toHaveLength(1));
    expect(listed()[0]).toContain("Whole instrument");
  });

  it("explains an empty library rather than showing a blank pane", async () => {
    const database = await openLibrary();
    render(() => <LibraryPane database={database} />);

    await vi.waitFor(() => expect(screen.getByText(/The library is empty/)).toBeInTheDocument());
    expect(screen.getByText("0 entries")).toBeInTheDocument();
    expect(screen.queryAllByRole("listitem")).toHaveLength(0);
  });

  it("distinguishes a filter that matched nothing from an empty library", async () => {
    const database = await openLibrary(single);
    render(() => <LibraryPane database={database} />);
    await vi.waitFor(() => expect(listed()).toHaveLength(1));

    await filterBy("Group");

    await vi.waitFor(() =>
      expect(screen.getByText(/No Group entries in the library/)).toBeInTheDocument(),
    );
    expect(screen.queryByText(/The library is empty/)).not.toBeInTheDocument();
  });
});
