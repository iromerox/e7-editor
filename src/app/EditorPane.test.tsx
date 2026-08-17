import type { JSX } from "solid-js";
import type { CcEvent, Connection } from "../midi";
import type { LibraryDatabase, LibraryEntry } from "../store";
import type { AppStateControls } from "./app-state";
import { fireEvent, render, screen } from "@solidjs/testing-library";
import { EMPTY, Subject } from "rxjs";
import { unwrap } from "solid-js/store";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  MIXER_OSC1_LEVEL,
  NAME_BYTES,
  NAME_OFFSET,
  OSC1_TRANSPOSE,
  PresetSlot,
  SINGLE_PRESET_BYTES,
  VOLUME,
  decodeSinglePreset,
} from "../protocol";
import {
  createLibraryDatabase,
  deviceDumpPayload,
  entryBytes,
  parseSyxFile,
  syxEntry,
} from "../store";
import { AppStateProvider, useAppState } from "./AppStateProvider";
import { EditorPane } from "./EditorPane";
import { NOTHING_LOADED } from "./editor-save";

function stubConnection(cc: Subject<CcEvent>): Connection {
  return {
    inputName: "GS Music e7 IN",
    outputName: "GS Music e7 OUT",
    sysex: EMPTY,
    sysexMonitor: EMPTY,
    cc,
    isOpen: true,
    reassembly: { pendingBytes: 0, fragmentedFrames: 0, discardedPartials: 0 },
    send: () => {},
    sendCommand: () => {},
    sendControlChange: () => {},
    sendProgramChange: () => {},
    close: () => Promise.resolve(),
  };
}

const openDatabases: LibraryDatabase[] = [];

async function openLibrary(...entries: readonly LibraryEntry[]): Promise<LibraryDatabase> {
  const database = await createLibraryDatabase({
    name: `editor-${Math.random().toString(36).slice(2)}`,
  });
  openDatabases.push(database);
  await database.entries.bulkInsert([...entries]);
  return database;
}

async function renderPane(
  connection: Connection | undefined,
  database?: LibraryDatabase,
): Promise<AppStateControls> {
  const library = database ?? (await openLibrary());
  let captured: AppStateControls | undefined;

  function Harness(): JSX.Element {
    captured = useAppState();
    return <EditorPane connection={connection} database={library} />;
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

function presetImage(name: string): Uint8Array {
  const bytes = Uint8Array.from(
    { length: SINGLE_PRESET_BYTES },
    (_, index) => (index * 5 + 3) % 128,
  );
  bytes.fill(0x20, NAME_OFFSET, NAME_OFFSET + NAME_BYTES);
  for (const [index, character] of [...name].entries()) {
    bytes[NAME_OFFSET + index] = character.charCodeAt(0);
  }
  return bytes;
}

function storedEntry(name: string, slot: PresetSlot, image: Uint8Array): Promise<LibraryEntry> {
  return syxEntry(
    deviceDumpPayload({ label: name, address: slot.byteAddress(), bytes: image }),
    "UserImport",
  );
}

async function reread(database: LibraryDatabase, id: string): Promise<LibraryEntry | undefined> {
  return (await database.entries.findOne(id).exec())?.toJSON();
}

async function loadedEditor(
  name: string,
): Promise<{ controls: AppStateControls; database: LibraryDatabase; entry: LibraryEntry }> {
  const image = presetImage(name);
  const entry = await storedEntry(name, new PresetSlot(2, 4, 6), image);
  const database = await openLibrary(entry);
  const controls = await renderPane(undefined, database);
  controls.loadEditor(decodeSinglePreset(image), { kind: "LibraryEntry", id: entry.id });
  await vi.waitFor(() => expect(screen.getByText(`Matches “${name}”`)).toBeInTheDocument());
  return { controls, database, entry };
}

function storedPreset(entry: LibraryEntry): ReturnType<typeof decodeSinglePreset> {
  const [single] = parseSyxFile(entryBytes(entry)).singles;
  if (single === undefined) {
    throw new Error("the entry stores no single preset");
  }
  return single.preset;
}

function knob(name: string): string {
  return screen.getByRole("slider", { name }).getAttribute("aria-valuenow") ?? "";
}

function nudge(name: string, key: string): void {
  fireEvent.keyDown(screen.getByRole("slider", { name }), { key });
}

function step(button: string): HTMLElement {
  return screen.getByRole("button", { name: button });
}

afterEach(async () => {
  while (openDatabases.length > 0) {
    await openDatabases.pop()?.close();
  }
});

describe("EditorPane", () => {
  it("follows a control change the device sends", async () => {
    const cc = new Subject<CcEvent>();
    await renderPane(stubConnection(cc));

    cc.next({ channel: 1, controller: MIXER_OSC1_LEVEL, value: 99, timestamp: 0 });

    expect(knob("OSC1")).toBe("99");
  });

  it("leaves a control change that names more than one field where it is", async () => {
    const cc = new Subject<CcEvent>();
    await renderPane(stubConnection(cc));

    cc.next({ channel: 1, controller: OSC1_TRANSPOSE, value: 120, timestamp: 0 });

    expect(screen.getAllByRole("slider", { name: "Tune" })[0]?.getAttribute("aria-valuenow")).toBe(
      "0",
    );
  });

  it("follows the master volume the device reports, which no preset field holds", async () => {
    const cc = new Subject<CcEvent>();
    await renderPane(stubConnection(cc));

    cc.next({ channel: 1, controller: VOLUME, value: 12, timestamp: 0 });

    expect(knob("Master Volume")).toBe("12");
  });

  it("says edits reach the editor only while nothing is connected", async () => {
    await renderPane(undefined);

    expect(screen.getByText(/edits change the preset in the editor only/)).toBeInTheDocument();
  });

  it("says so when the device never reported a channel to send on", async () => {
    await renderPane(stubConnection(new Subject<CcEvent>()));

    expect(screen.getByRole("status")).toHaveTextContent("never reported a receive channel");
  });

  it("walks the editor's history from the header buttons", async () => {
    await renderPane(stubConnection(new Subject<CcEvent>()));

    expect(step("Undo")).toBeDisabled();
    expect(step("Redo")).toBeDisabled();

    nudge("OSC1", "PageUp");
    expect(knob("OSC1")).toBe("10");

    fireEvent.click(step("Undo"));
    expect(knob("OSC1")).toBe("0");
    expect(step("Undo")).toBeDisabled();

    fireEvent.click(step("Redo"));
    expect(knob("OSC1")).toBe("10");
    expect(step("Redo")).toBeDisabled();
  });

  it("walks it from the keyboard as well", async () => {
    await renderPane(stubConnection(new Subject<CcEvent>()));
    nudge("OSC1", "PageUp");

    fireEvent.keyDown(window, { key: "z", ctrlKey: true });
    expect(knob("OSC1")).toBe("0");

    fireEvent.keyDown(window, { key: "z", ctrlKey: true, shiftKey: true });
    expect(knob("OSC1")).toBe("10");
  });

  it("leaves the shortcut to a field being typed into", async () => {
    await renderPane(stubConnection(new Subject<CcEvent>()));
    nudge("OSC1", "PageUp");
    const typed = document.createElement("input");
    document.body.append(typed);

    fireEvent.keyDown(typed, { key: "z", ctrlKey: true });

    expect(knob("OSC1")).toBe("10");
    typed.remove();
  });

  it("has nothing to undo for a control change the device sends", async () => {
    const cc = new Subject<CcEvent>();
    await renderPane(stubConnection(cc));

    cc.next({ channel: 1, controller: MIXER_OSC1_LEVEL, value: 99, timestamp: 0 });

    expect(step("Undo")).toBeDisabled();
  });
});

describe("EditorPane saving to the library", () => {
  it("says whether what it holds still matches what its entry stores", async () => {
    await loadedEditor("Fat Brass");

    expect(step("Save over Fat Brass in the library")).toBeDisabled();

    nudge("OSC1", "PageUp");

    expect(screen.getByText("Differs from “Fat Brass”")).toBeInTheDocument();
    expect(step("Save over Fat Brass in the library")).toBeEnabled();
  });

  it("replaces the bytes of the entry it came from, keeping its id, name and tags", async () => {
    const image = presetImage("Fat Brass");
    const source: LibraryEntry = {
      ...(await storedEntry("Fat Brass", new PresetSlot(2, 4, 6), image)),
      tags: ["brass", "layered"],
      comment: "warm",
    };
    const other = await storedEntry("Split Keys", new PresetSlot(2, 4, 7), presetImage("Split"));
    const database = await openLibrary(source, other);
    const controls = await renderPane(undefined, database);
    controls.loadEditor(decodeSinglePreset(image), { kind: "LibraryEntry", id: source.id });
    await vi.waitFor(() => expect(screen.getByText("Matches “Fat Brass”")).toBeInTheDocument());

    nudge("OSC1", "PageUp");
    fireEvent.click(step("Save over Fat Brass in the library"));
    fireEvent.click(step("Save over Fat Brass anyway"));

    await vi.waitFor(() => expect(screen.getByText("Saved over “Fat Brass”.")).toBeInTheDocument());
    const saved = await reread(database, source.id);
    expect(saved).toMatchObject({
      id: source.id,
      name: "Fat Brass",
      tags: ["brass", "layered"],
      comment: "warm",
      kind: "Single",
      bank: 2,
      group: 4,
      slot: 6,
      source: "Edit",
    });
    expect(saved?.sha256).not.toBe(source.sha256);
    expect((await reread(database, other.id))?.sha256).toBe(other.sha256);
  });

  it("stores what the editor holds, unused bytes included", async () => {
    const { controls, database, entry } = await loadedEditor("Fat Brass");

    nudge("OSC1", "PageUp");
    nudge("Cutoff", "PageDown");
    fireEvent.click(step("Save over Fat Brass in the library"));
    fireEvent.click(step("Save over Fat Brass anyway"));

    await vi.waitFor(() => expect(screen.getByText("Saved over “Fat Brass”.")).toBeInTheDocument());
    const saved = await reread(database, entry.id);
    expect(saved).toBeDefined();
    expect(storedPreset(saved as LibraryEntry)).toEqual(unwrap(controls.state.editor.preset));
    expect(screen.getByText("Matches “Fat Brass”")).toBeInTheDocument();
  });

  it("stores a new entry when saving as new, leaving the one it came from alone", async () => {
    const { database, entry } = await loadedEditor("Fat Brass");

    nudge("OSC1", "PageUp");
    fireEvent.click(step("Save as a new library entry"));
    await fireEvent.input(screen.getByLabelText("Name"), { target: { value: "Fat Brass Bright" } });
    fireEvent.click(step("Save the new library entry"));

    await vi.waitFor(() =>
      expect(screen.getByText("Saved to the library as “Fat Brass Bright”.")).toBeInTheDocument(),
    );
    expect((await reread(database, entry.id))?.sha256).toBe(entry.sha256);
    const stored = (await database.entries.find().exec()).map((document) => document.toJSON());
    expect(stored).toHaveLength(2);
    expect(stored.find((found) => found.id !== entry.id)).toMatchObject({
      name: "Fat Brass Bright",
      source: "Edit",
      kind: "Single",
      bank: 2,
      group: 4,
      slot: 6,
    });
  });

  it("leaves the entry alone while the editor is only edited", async () => {
    const { database, entry } = await loadedEditor("Fat Brass");

    nudge("OSC1", "PageUp");
    nudge("Cutoff", "PageDown");
    nudge("Sub1", "PageUp");
    await vi.waitFor(() =>
      expect(screen.getByText("Differs from “Fat Brass”")).toBeInTheDocument(),
    );

    expect((await reread(database, entry.id))?.sha256).toBe(entry.sha256);
  });

  it("offers only a new entry for a preset read off a device slot", async () => {
    const controls = await renderPane(undefined);
    controls.loadEditor(decodeSinglePreset(presetImage("Fat Brass")), {
      kind: "DeviceSlot",
      address: { kind: "Single", bank: 1, group: 2, slot: 3 },
    });

    expect(screen.getByText(/Loaded from Single 1\.2\.3/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Save over/ })).not.toBeInTheDocument();

    fireEvent.click(step("Save as a new library entry"));
    fireEvent.click(step("Save the new library entry"));

    await vi.waitFor(() =>
      expect(screen.getByText("Saved to the library as “1.2.3”.")).toBeInTheDocument(),
    );
  });

  it("has nowhere to put a preset that came from neither the device nor the library", async () => {
    await renderPane(undefined);

    expect(screen.getByText(NOTHING_LOADED)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Save/ })).not.toBeInTheDocument();
  });
});
