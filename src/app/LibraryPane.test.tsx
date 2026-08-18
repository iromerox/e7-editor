import type { JSX } from "solid-js";
import type { LibraryDatabase, LibraryEntry } from "../store";
import type { AppStateControls } from "./app-state";
import { cleanup, fireEvent, render, screen } from "@solidjs/testing-library";
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
import {
  ENTRY_COMMENT_MAX_LENGTH,
  createLibraryDatabase,
  deviceDumpPayload,
  encodeMemoryImage,
  syxEntry,
} from "../store";
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

function syxBytes(name: string, address: number, length = SINGLE_PRESET_BYTES): Uint8Array {
  return encodeMemoryImage(address, presetImage(name, length));
}

function toFile(bytes: Uint8Array, fileName: string): File {
  return new File([Uint8Array.from(bytes)], fileName);
}

function chooseFiles(files: readonly File[]): void {
  const input = document.body.querySelector("input[type=file]");
  if (!(input instanceof HTMLInputElement)) {
    throw new Error("no file input was added to the document");
  }
  Object.defineProperty(input, "files", { value: files, configurable: true });
  input.dispatchEvent(new Event("change"));
}

async function importFiles(label: string, files: readonly File[]): Promise<void> {
  await fireEvent.click(screen.getByRole("button", { name: label }));
  chooseFiles(files);
}

function alerts(): string[] {
  return screen.queryAllByRole("alert").map((item) => item.textContent ?? "");
}

const IMPORT = "Import .syx files into the library";
const IMPORT_WHEN_EMPTY = "Import .syx files into the empty library";

async function filterBy(kind: string): Promise<void> {
  await fireEvent.change(screen.getByLabelText("Kind"), { target: { value: kind } });
}

afterEach(async () => {
  vi.unstubAllGlobals();
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

describe("LibraryPane importing", () => {
  it("stores a picked file and lists it without a manual refresh", async () => {
    const database = await openLibrary();
    renderPane(database);
    await vi.waitFor(() => expect(screen.getByText(/The library is empty/)).toBeInTheDocument());

    await importFiles(IMPORT, [
      toFile(syxBytes("From Disk", new PresetSlot(6, 2, 4).byteAddress()), "from-disk.syx"),
    ]);

    await vi.waitFor(() => expect(listed()).toHaveLength(1));
    expect(listed()[0]).toContain("From Disk");
    expect(listed()[0]).toContain("Single");
    expect(listed()[0]).toContain("Bank 6 · Group 2 · Slot 4");
    expect(screen.getByText("Imported 1 file of the 1 file picked.")).toBeInTheDocument();
  });

  it("is reachable from the empty state itself, and through the browser's own picker", async () => {
    const database = await openLibrary();
    const file = toFile(
      syxBytes("Picked Off Disk", new PresetSlot(2, 1, 1).byteAddress()),
      "picked.syx",
    );
    vi.stubGlobal(
      "showOpenFilePicker",
      vi.fn(async () => [{ getFile: async () => file }]),
    );
    renderPane(database);
    await vi.waitFor(() => expect(screen.getByText(/The library is empty/)).toBeInTheDocument());

    await fireEvent.click(screen.getByRole("button", { name: IMPORT_WHEN_EMPTY }));

    await vi.waitFor(() => expect(listed()).toHaveLength(1));
    expect(listed()[0]).toContain("Picked Off Disk");
    expect(screen.queryByRole("button", { name: IMPORT_WHEN_EMPTY })).toBeNull();
  });

  it("imports the readable files of a selection and names the one that failed", async () => {
    const database = await openLibrary();
    renderPane(database);
    await vi.waitFor(() => expect(screen.getByText(/The library is empty/)).toBeInTheDocument());

    await importFiles(IMPORT, [
      toFile(syxBytes("Kept", new PresetSlot(2, 2, 2).byteAddress()), "kept.syx"),
      toFile(new TextEncoder().encode("a text file wearing a .syx extension"), "notes.syx"),
      toFile(syxBytes("Also Kept", new PresetSlot(3, 3, 3).byteAddress()), "also-kept.syx"),
    ]);

    await vi.waitFor(() => expect(listed()).toHaveLength(2));
    expect(screen.getByText("Imported 2 files of the 3 files picked.")).toBeInTheDocument();
    expect(alerts()).toHaveLength(1);
    expect(alerts()[0]).toContain("notes.syx was not imported");
    expect(alerts()[0]).toContain("F0 status byte");
  });

  it("skips a file already in the library and says which entry holds its bytes", async () => {
    const address = new PresetSlot(1, 3, 5).byteAddress();
    const image = presetImage("Fat Brass");
    const database = await openLibrary(await storedEntry("Fat Brass", address, image));
    renderPane(database);
    await vi.waitFor(() => expect(listed()).toHaveLength(1));

    await importFiles(IMPORT, [toFile(encodeMemoryImage(address, image), "fat-brass-again.syx")]);

    await vi.waitFor(() =>
      expect(
        screen.getByText("Nothing was imported out of the 1 file picked."),
      ).toBeInTheDocument(),
    );
    expect(alerts()[0]).toContain("fat-brass-again.syx holds the same bytes as “Fat Brass”");
    expect(alerts()[0]).toContain("skipped");
    expect(listed()).toHaveLength(1);
  });

  it("clears what an import reported when it is dismissed", async () => {
    const database = await openLibrary();
    renderPane(database);
    await vi.waitFor(() => expect(screen.getByText(/The library is empty/)).toBeInTheDocument());
    await importFiles(IMPORT, [
      toFile(syxBytes("Dismissed", new PresetSlot(4, 4, 4).byteAddress()), "dismissed.syx"),
    ]);
    await vi.waitFor(() => expect(listed()).toHaveLength(1));

    await fireEvent.click(screen.getByRole("button", { name: "Dismiss what the import reported" }));

    expect(screen.queryByText(/Imported 1 file/)).toBeNull();
    expect(listed()).toHaveLength(1);
  });

  it("reports a picker that failed outright, leaving the library as it was", async () => {
    const database = await openLibrary(single);
    vi.stubGlobal(
      "showOpenFilePicker",
      vi.fn(() => Promise.reject(new Error("the file system is unreachable"))),
    );
    renderPane(database);
    await vi.waitFor(() => expect(listed()).toHaveLength(1));

    await fireEvent.click(screen.getByRole("button", { name: IMPORT }));

    await vi.waitFor(() => expect(alerts()[0]).toContain("the file system is unreachable"));
    expect(listed()).toHaveLength(1);
  });
});

describe("LibraryPane exporting", () => {
  function captureSaves(written: Uint8Array[]): ReturnType<typeof vi.fn> {
    const showSaveFilePicker = vi.fn(async () => ({
      createWritable: async () => ({
        write: async (chunk: Uint8Array) => {
          written.push(chunk);
        },
        close: async () => undefined,
      }),
    }));
    vi.stubGlobal("showSaveFilePicker", showSaveFilePicker);
    return showSaveFilePicker;
  }

  it("writes an entry's stored bytes out under a name taken from the entry", async () => {
    const address = new PresetSlot(1, 3, 5).byteAddress();
    const image = presetImage("Fat Brass");
    const database = await openLibrary(await storedEntry("Fat Brass", address, image));
    const written: Uint8Array[] = [];
    const showSaveFilePicker = captureSaves(written);
    renderPane(database);
    await vi.waitFor(() => expect(listed()).toHaveLength(1));

    await fireEvent.click(screen.getByRole("button", { name: "Export Fat Brass to a .syx file" }));

    await vi.waitFor(() => expect(written).toHaveLength(1));
    expect(written[0]).toEqual(encodeMemoryImage(address, image));
    expect(showSaveFilePicker).toHaveBeenCalledWith(
      expect.objectContaining({ suggestedName: "Fat Brass.syx" }),
    );
    await vi.waitFor(() =>
      expect(screen.getByText("Exported as Fat Brass.syx.")).toBeInTheDocument(),
    );
    expect(alerts()).toHaveLength(0);
  });

  it("exports an entry holding many presets, which has no load of its own", async () => {
    const address = new PresetSlot(1, 1, 1).byteAddress();
    const image = presetImage("Whole Group", SINGLE_PRESET_BYTES * 8);
    const database = await openLibrary(await storedEntry("Whole Group", address, image));
    const written: Uint8Array[] = [];
    captureSaves(written);
    renderPane(database);
    await vi.waitFor(() => expect(listed()).toHaveLength(1));
    expect(screen.queryByRole("button", { name: /into the editor/ })).toBeNull();

    await fireEvent.click(
      screen.getByRole("button", { name: "Export Whole Group to a .syx file" }),
    );

    await vi.waitFor(() => expect(written).toHaveLength(1));
    expect(written[0]).toEqual(encodeMemoryImage(address, image));
  });

  it("says nothing was written when the save dialog is dismissed, and reports no error", async () => {
    const database = await openLibrary(
      await storedEntry(
        "Not Saved",
        new PresetSlot(2, 2, 2).byteAddress(),
        presetImage("Not Saved"),
      ),
    );
    vi.stubGlobal(
      "showSaveFilePicker",
      vi.fn(() => Promise.reject(new DOMException("dismissed", "AbortError"))),
    );
    renderPane(database);
    await vi.waitFor(() => expect(listed()).toHaveLength(1));

    await fireEvent.click(screen.getByRole("button", { name: "Export Not Saved to a .syx file" }));

    await vi.waitFor(() =>
      expect(
        screen.getByText("The save was dismissed, so no file was written."),
      ).toBeInTheDocument(),
    );
    expect(alerts()).toHaveLength(0);
  });

  it("reports an entry whose stored bytes no longer decode at that entry, writing nothing", async () => {
    const half = presetImage("Half Written").subarray(0, SINGLE_PRESET_BYTES / 2);
    const database = await openLibrary(
      await storedEntry(
        "Fat Brass",
        new PresetSlot(1, 3, 5).byteAddress(),
        presetImage("Fat Brass"),
      ),
      {
        ...single,
        name: "Damaged",
        sysex: base64(encodeMemoryImage(new PresetSlot(1, 3, 5).byteAddress(), half)),
      },
    );
    const written: Uint8Array[] = [];
    const showSaveFilePicker = captureSaves(written);
    renderPane(database);
    await vi.waitFor(() => expect(listed()).toHaveLength(2));

    await fireEvent.click(screen.getByRole("button", { name: "Export Damaged to a .syx file" }));

    await vi.waitFor(() => expect(alerts()).toHaveLength(1));
    expect(alerts()[0]).toContain("cannot be read back");
    expect(alerts()[0]).toContain("partially written");
    expect(showSaveFilePicker).not.toHaveBeenCalled();
    expect(written).toHaveLength(0);
  });
});

describe("LibraryPane editing what the library stores", () => {
  async function openEditor(name: string): Promise<void> {
    await fireEvent.click(
      screen.getByRole("button", { name: `Edit what the library stores about ${name}` }),
    );
  }

  async function type(label: string, value: string): Promise<void> {
    await fireEvent.input(screen.getByLabelText(label), { target: { value } });
  }

  async function saveEdits(name: string): Promise<void> {
    await fireEvent.click(
      screen.getByRole("button", { name: `Save what the library stores about ${name}` }),
    );
  }

  it("renames an entry in place, without a manual refresh and without rewriting its bytes", async () => {
    const entry = await storedEntry(
      "Fat Brass",
      new PresetSlot(1, 3, 5).byteAddress(),
      presetImage("Fat Brass"),
    );
    const database = await openLibrary(entry);
    renderPane(database);
    await vi.waitFor(() => expect(listed()).toHaveLength(1));

    await openEditor("Fat Brass");
    await type("Name of Fat Brass", "Fatter Brass");
    await saveEdits("Fat Brass");

    await vi.waitFor(() => expect(screen.getByText("Fatter Brass")).toBeInTheDocument());
    expect(screen.queryByText("Fat Brass")).toBeNull();
    const after = await reread(database, entry.id);
    expect(after?.sysex).toBe(entry.sysex);
    expect(after?.sha256).toBe(entry.sha256);
    expect(after).toEqual({ ...entry, name: "Fatter Brass" });
    expect(alerts()).toHaveLength(0);
  });

  it("adds and removes tags, and keeps them through a reload of the pane", async () => {
    const database = await openLibrary(multi);
    renderPane(database);
    await vi.waitFor(() => expect(listed()).toHaveLength(1));

    await openEditor("Split Keys");
    await type("Tags of Split Keys, separated by commas", "split, keys, split");
    await saveEdits("Split Keys");
    await vi.waitFor(() => expect(listed()[0]).toContain("split"));

    cleanup();
    renderPane(database);
    await vi.waitFor(() => expect(listed()).toHaveLength(1));
    expect(await reread(database, multi.id)).toEqual({ ...multi, tags: ["split", "keys"] });

    await openEditor("Split Keys");
    await type("Tags of Split Keys, separated by commas", "keys");
    await saveEdits("Split Keys");

    await vi.waitFor(async () =>
      expect((await reread(database, multi.id))?.tags).toEqual(["keys"]),
    );
  });

  it("filters by kind alongside the tags an entry was given", async () => {
    const database = await openLibrary(single, multi);
    renderPane(database);
    await vi.waitFor(() => expect(listed()).toHaveLength(2));

    await openEditor("Split Keys");
    await type("Tags of Split Keys, separated by commas", "split");
    await saveEdits("Split Keys");
    await vi.waitFor(() => expect(listed()[1]).toContain("split"));

    await filterBy("Multi");

    await vi.waitFor(() => expect(listed()).toHaveLength(1));
    expect(listed()[0]).toContain("Split Keys");
    expect(listed()[0]).toContain("split");
  });

  it("keeps a comment of several hundred characters intact and shows it on the row", async () => {
    const comment = "Cutoff tracks the keyboard, and the second oscillator is a fifth up. ".repeat(
      8,
    );
    const database = await openLibrary(single);
    renderPane(database);
    await vi.waitFor(() => expect(listed()).toHaveLength(1));

    await openEditor("Fat Brass");
    await type("Comment on Fat Brass", comment);
    await saveEdits("Fat Brass");

    await vi.waitFor(async () =>
      expect((await reread(database, single.id))?.comment).toBe(comment),
    );
    expect(comment.length).toBeGreaterThan(400);
    expect(listed()[0]).toContain(comment);
  });

  it("leaves every other entry exactly as it was", async () => {
    const database = await openLibrary(single, multi, backup);
    renderPane(database);
    await vi.waitFor(() => expect(listed()).toHaveLength(3));

    await openEditor("Fat Brass");
    await type("Name of Fat Brass", "Renamed");
    await type("Tags of Fat Brass, separated by commas", "renamed");
    await type("Comment on Fat Brass", "Edited from the pane.");
    await saveEdits("Fat Brass");

    await vi.waitFor(() => expect(screen.getByText("Renamed")).toBeInTheDocument());
    expect(await reread(database, multi.id)).toEqual(multi);
    expect(await reread(database, backup.id)).toEqual(backup);
  });

  it("discards the draft when the edit is cancelled, storing nothing", async () => {
    const database = await openLibrary(single);
    renderPane(database);
    await vi.waitFor(() => expect(listed()).toHaveLength(1));

    await openEditor("Fat Brass");
    await type("Name of Fat Brass", "Never Saved");
    await fireEvent.click(
      screen.getByRole("button", {
        name: "Stop editing Fat Brass, keeping what the library stores",
      }),
    );

    expect(screen.queryByLabelText("Name of Fat Brass")).toBeNull();
    expect(await reread(database, single.id)).toEqual(single);
  });

  it("refuses to save a name that is blank once trimmed", async () => {
    const database = await openLibrary(single);
    renderPane(database);
    await vi.waitFor(() => expect(listed()).toHaveLength(1));

    await openEditor("Fat Brass");
    await type("Name of Fat Brass", "   ");

    expect(
      screen.getByRole("button", { name: "Save what the library stores about Fat Brass" }),
    ).toBeDisabled();
    expect(await reread(database, single.id)).toEqual(single);
  });

  it("reports a refused edit at the entry, keeping what was typed and storing nothing", async () => {
    const database = await openLibrary(single);
    renderPane(database);
    await vi.waitFor(() => expect(listed()).toHaveLength(1));

    await openEditor("Fat Brass");
    await type("Name of Fat Brass", "Too Long A Note");
    await type("Comment on Fat Brass", "c".repeat(ENTRY_COMMENT_MAX_LENGTH + 1));
    await saveEdits("Fat Brass");

    await vi.waitFor(() => expect(alerts()[0]).toContain("a comment is at most"));
    expect(screen.getByLabelText("Name of Fat Brass")).toHaveValue("Too Long A Note");
    expect(await reread(database, single.id)).toEqual(single);
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
