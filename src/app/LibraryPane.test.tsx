import type { JSX } from "solid-js";
import type { LibraryDatabase, LibraryEntry } from "../store";
import type { AppStateControls } from "./app-state";
import { fireEvent, render, screen } from "@solidjs/testing-library";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  MULTI_PRESET_BYTES,
  MultiSlot,
  NAME_BYTES,
  NAME_OFFSET,
  PresetSlot,
  SINGLE_PRESET_BYTES,
  decodeMultiPreset,
  decodeSinglePreset,
} from "../protocol";
import { createLibraryDatabase, deviceDumpPayload, encodeMemoryImage, syxEntry } from "../store";
import { AppStateProvider, useAppState } from "./AppStateProvider";
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

function renderPane(database: LibraryDatabase): AppStateControls {
  let captured: AppStateControls | undefined;

  function Harness(): JSX.Element {
    captured = useAppState();
    return <LibraryPane database={database} />;
  }

  render(() => (
    <AppStateProvider>
      <Harness />
    </AppStateProvider>
  ));

  if (captured === undefined) {
    throw new Error("the pane never rendered");
  }
  return captured;
}

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

function base64(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes));
}

async function reread(database: LibraryDatabase, id: string): Promise<LibraryEntry | undefined> {
  return (await database.entries.findOne(id).exec())?.toJSON();
}

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
    renderPane(database);

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
    renderPane(database);
    await vi.waitFor(() => expect(listed()).toHaveLength(1));

    await database.entries.insert(multi);

    await vi.waitFor(() => expect(listed()).toHaveLength(2));
    expect(screen.getByText("Split Keys")).toBeInTheDocument();
  });

  it("drops an entry removed after render, without a manual refresh", async () => {
    const database = await openLibrary(single, multi);
    renderPane(database);
    await vi.waitFor(() => expect(listed()).toHaveLength(2));

    await (await database.entries.findOne(single.id).exec())?.remove();

    await vi.waitFor(() => expect(listed()).toHaveLength(1));
    expect(screen.queryByText("Fat Brass")).not.toBeInTheDocument();
  });

  it("narrows to one kind when filtered, and restores the rest afterwards", async () => {
    const database = await openLibrary(single, multi, backup);
    renderPane(database);
    await vi.waitFor(() => expect(listed()).toHaveLength(3));

    await filterBy("Multi");
    await vi.waitFor(() => expect(listed()).toHaveLength(1));
    expect(listed()[0]).toContain("Split Keys");

    await filterBy("All kinds");
    await vi.waitFor(() => expect(listed()).toHaveLength(3));
  });

  it("keeps tracking the store while a kind filter is applied", async () => {
    const database = await openLibrary(single);
    renderPane(database);
    await filterBy("Backup");
    await vi.waitFor(() => expect(screen.queryAllByRole("listitem")).toHaveLength(0));

    await database.entries.insert(backup);

    await vi.waitFor(() => expect(listed()).toHaveLength(1));
    expect(listed()[0]).toContain("Whole instrument");
  });

  it("explains an empty library rather than showing a blank pane", async () => {
    const database = await openLibrary();
    renderPane(database);

    await vi.waitFor(() => expect(screen.getByText(/The library is empty/)).toBeInTheDocument());
    expect(screen.getByText("0 entries")).toBeInTheDocument();
    expect(screen.queryAllByRole("listitem")).toHaveLength(0);
  });

  it("distinguishes a filter that matched nothing from an empty library", async () => {
    const database = await openLibrary(single);
    renderPane(database);
    await vi.waitFor(() => expect(listed()).toHaveLength(1));

    await filterBy("Group");

    await vi.waitFor(() =>
      expect(screen.getByText(/No Group entries in the library/)).toBeInTheDocument(),
    );
    expect(screen.queryByText(/The library is empty/)).not.toBeInTheDocument();
  });
});

describe("LibraryPane loading", () => {
  it("puts a Single entry's preset in the editor, leaving the entry untouched", async () => {
    const image = presetImage("Fat Brass");
    const entry = await storedEntry("Fat Brass", new PresetSlot(1, 3, 5).byteAddress(), image);
    const database = await openLibrary(entry);
    const controls = renderPane(database);
    await vi.waitFor(() => expect(listed()).toHaveLength(1));

    await fireEvent.click(screen.getByRole("button", { name: "Load Fat Brass into the editor" }));

    expect(controls.state.editor.source).toEqual({ kind: "LibraryEntry", id: entry.id });
    expect(controls.state.editor.preset).toEqual(decodeSinglePreset(image));
    expect(controls.state.editor.multi).toBeUndefined();
    expect(listed()[0]).toContain("In the editor");
    expect(await reread(database, entry.id)).toEqual(entry);
  });

  it("loads part 1 of a Multi entry and says which part the editor holds", async () => {
    const image = presetImage("Split Keys", MULTI_PRESET_BYTES);
    const entry = await storedEntry("Split Keys", new MultiSlot(1, 1, 2).byteAddress(), image);
    const database = await openLibrary(entry);
    const controls = renderPane(database);
    await vi.waitFor(() => expect(listed()).toHaveLength(1));

    await fireEvent.click(screen.getByRole("button", { name: "Load Split Keys into the editor" }));

    expect(controls.state.editor.multi?.part).toBe(1);
    expect(controls.state.editor.preset).toEqual(decodeMultiPreset(image).parts[0]);
    expect(listed()[0]).toContain("Part 1 in the editor");
  });

  it("offers no load for an entry holding many presets, and says why not", async () => {
    const database = await openLibrary(backup);
    renderPane(database);
    await vi.waitFor(() => expect(listed()).toHaveLength(1));

    expect(screen.queryByRole("button", { name: /into the editor/ })).toBeNull();
    expect(listed()[0]).toContain("A Backup entry holds more than one preset");
  });

  it("reports an entry whose stored bytes no longer decode, and keeps the editor as it was", async () => {
    const half = presetImage("Half Written").subarray(0, SINGLE_PRESET_BYTES / 2);
    const database = await openLibrary({
      ...single,
      sysex: base64(encodeMemoryImage(new PresetSlot(1, 3, 5).byteAddress(), half)),
    });
    const controls = renderPane(database);
    await vi.waitFor(() => expect(listed()).toHaveLength(1));
    const before = controls.state.editor.preset;

    await fireEvent.click(screen.getByRole("button", { name: "Load Fat Brass into the editor" }));

    expect(screen.getByRole("alert")).toHaveTextContent("partially written");
    expect(controls.state.editor.source).toEqual({ kind: "Empty" });
    expect(controls.state.editor.preset).toEqual(before);
  });

  it("asks before replacing unsaved edits, and loads only once told to", async () => {
    const entry = await storedEntry(
      "Metal Flies",
      new PresetSlot(2, 1, 1).byteAddress(),
      presetImage("Metal Flies"),
    );
    const database = await openLibrary(entry);
    const controls = renderPane(database);
    await vi.waitFor(() => expect(listed()).toHaveLength(1));
    controls.editField("filterCutoff", 42);
    controls.recordEdit({ field: "filterCutoff", previousValue: 0, nextValue: 42, at: Date.now() });

    await fireEvent.click(screen.getByRole("button", { name: "Load Metal Flies into the editor" }));

    expect(screen.getByRole("alert")).toHaveTextContent("discarding 1 edit");
    expect(controls.state.editor.source).toEqual({ kind: "Empty" });

    await fireEvent.click(
      screen.getByRole("button", { name: "Keep editing, leaving Metal Flies where it is" }),
    );

    expect(screen.queryByRole("alert")).toBeNull();
    expect(controls.state.editor.preset.filter.cutoff).toBe(42);

    await fireEvent.click(screen.getByRole("button", { name: "Load Metal Flies into the editor" }));
    await fireEvent.click(screen.getByRole("button", { name: "Load Metal Flies anyway" }));

    expect(controls.state.editor.source).toEqual({ kind: "LibraryEntry", id: entry.id });
    expect(controls.state.history.undo).toEqual([]);
  });
});
