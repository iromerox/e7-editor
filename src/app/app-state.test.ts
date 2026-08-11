import type { CcField } from "../protocol";
import type { EditorEdit } from "./edit-history";
import { createEffect, createRoot } from "solid-js";
import { afterEach, describe, expect, it } from "vitest";
import { FULL_MASTER_VOLUME, createAppState, emptyPreset } from "./app-state";
import { COALESCE_WINDOW_MS } from "./edit-history";

let dispose: (() => void) | undefined;

function countRuns(read: () => unknown): () => number {
  let runs = 0;
  createEffect(() => {
    read();
    runs += 1;
  });
  return () => runs;
}

function watching<Counters>(build: () => Counters): Counters {
  return createRoot((disposeRoot) => {
    dispose = disposeRoot;
    return build();
  });
}

function edit(field: CcField, previousValue: number, nextValue: number, at = 0): EditorEdit {
  return { field, previousValue, nextValue, at };
}

afterEach(() => {
  dispose?.();
  dispose = undefined;
});

describe("createAppState", () => {
  it("starts with no MIDI access, an unfiltered library, and the first single slot selected", () => {
    const { state } = createAppState();

    expect(state.connection).toEqual({
      status: "midi-disabled",
      inputName: "",
      outputName: "",
      serialNumber: undefined,
      receiveChannel: undefined,
      notice: "",
    });
    expect(state.ports).toEqual({ inputs: [], outputs: [] });
    expect(state.library).toEqual({ kind: "All kinds", entries: undefined });
    expect(state.device).toEqual({ kind: "Single", bank: 1, group: 1, slots: {} });
    expect(state.editor).toEqual({
      source: { kind: "Empty" },
      preset: emptyPreset(),
      part: undefined,
    });
    expect(state.output).toEqual({ masterVolume: FULL_MASTER_VOLUME });
    expect(state.history).toEqual({ undo: [], redo: [] });
  });

  it("keeps the bank in range when a kind with fewer banks is selected", () => {
    const { state, selectBank, selectSlotKind } = createAppState();

    selectBank(8);
    selectSlotKind("Multi");
    expect(state.device).toMatchObject({ kind: "Multi", bank: 1 });

    selectBank(2);
    selectSlotKind("Single");
    expect(state.device).toMatchObject({ kind: "Single", bank: 2 });
  });

  it("caches each read slot under its own address", () => {
    const { state, setSlotState } = createAppState();
    const address = { kind: "Single", bank: 1, group: 1, slot: 1 } as const;

    setSlotState(address, { status: "reading" });
    expect(state.device.slots["Single 1.1.1"]).toEqual({ status: "reading" });

    setSlotState(address, { status: "read", summary: { name: "Opening Pad", locked: true } });
    setSlotState({ ...address, slot: 2 }, { status: "failed", reason: "no response" });
    expect(state.device.slots["Single 1.1.1"]).toEqual({
      status: "read",
      summary: { name: "Opening Pad", locked: true },
    });
    expect(state.device.slots["Single 1.1.2"]).toEqual({ status: "failed", reason: "no response" });
  });

  it("loads the editor from a device slot or a library entry", () => {
    const { state, loadEditor } = createAppState();
    const address = { kind: "Multi", bank: 2, group: 3, slot: 4 } as const;

    loadEditor(emptyPreset(), { kind: "DeviceSlot", address });
    expect(state.editor.source).toEqual({ kind: "DeviceSlot", address });

    loadEditor(emptyPreset(), { kind: "LibraryEntry", id: "entry-1" });
    expect(state.editor.source).toEqual({ kind: "LibraryEntry", id: "entry-1" });
  });

  it("remembers which part of a multi the preset in hand is, and forgets it for a single", () => {
    const { state, loadEditor } = createAppState();

    loadEditor(emptyPreset(), { kind: "LibraryEntry", id: "multi-1" }, 3);
    expect(state.editor.part).toBe(3);

    loadEditor(emptyPreset(), { kind: "LibraryEntry", id: "entry-1" });
    expect(state.editor.part).toBeUndefined();
  });

  it("keeps the master volume outside the preset the editor holds", () => {
    const { state, setMasterVolume } = createAppState();

    setMasterVolume(40);

    expect(state.output.masterVolume).toBe(40);
    expect(state.editor.preset).toEqual(emptyPreset());
  });

  it("edits one preset field at a time, leaving the rest of the preset as it was", () => {
    const { state, editField } = createAppState();

    editField("mixerOsc1Level", 77);

    expect(state.editor.preset.mixer.osc1Level).toBe(77);
    expect(state.editor.preset.mixer.sub1Level).toBe(0);
    expect(state.editor.source).toEqual({ kind: "Empty" });
  });

  it("starts each app state on a preset of its own, unmarked by any other's edits", () => {
    const first = createAppState();

    first.editField("eg1Attack", 42);

    expect(createAppState().state.editor.preset.eg1.attack).toBe(0);
    expect(emptyPreset().eg1.attack).toBe(0);
  });

  it("moves entries between the undo and redo stacks", () => {
    const { state, recordEdit, takeUndo, takeRedo } = createAppState();
    const first = edit("filterCutoff", 10, 20);
    const second = edit("filterCutoff", 20, 30, COALESCE_WINDOW_MS);

    expect(takeUndo()).toBeUndefined();
    expect(takeRedo()).toBeUndefined();

    recordEdit(first);
    recordEdit(second);
    expect(takeUndo()).toEqual(second);
    expect(state.history.undo).toEqual([first]);
    expect(state.history.redo).toEqual([second]);

    expect(takeRedo()).toEqual(second);
    expect(state.history.undo).toEqual([first, second]);
    expect(state.history.redo).toEqual([]);
  });

  it("drops the redo stack once a fresh edit is recorded", () => {
    const { state, recordEdit, takeUndo } = createAppState();
    const fresh = edit("filterResonance", 0, 5);

    recordEdit(edit("filterCutoff", 10, 20));
    takeUndo();
    recordEdit(fresh);

    expect(state.history.undo).toEqual([fresh]);
    expect(state.history.redo).toEqual([]);
  });

  it("collapses successive edits to one field into a single entry", () => {
    const { state, recordEdit } = createAppState();

    recordEdit(edit("filterCutoff", 10, 20, 1000));
    recordEdit(edit("filterCutoff", 20, 30, 1010));

    expect(state.history.undo).toEqual([edit("filterCutoff", 10, 30, 1010)]);
  });

  it("forgets the history when another preset is loaded into the editor", () => {
    const { state, recordEdit, takeUndo, loadEditor } = createAppState();

    recordEdit(edit("filterCutoff", 10, 20));
    recordEdit(edit("filterResonance", 0, 5, COALESCE_WINDOW_MS));
    takeUndo();
    loadEditor(emptyPreset(), { kind: "LibraryEntry", id: "entry-1" });

    expect(state.history).toEqual({ undo: [], redo: [] });
  });
});

describe("app state reactivity", () => {
  it("leaves readers of other slices alone when one slice changes", () => {
    const { state, setNotice, selectLibraryKind, selectGroup } = createAppState();

    const counters = watching(() => ({
      connection: countRuns(() => state.connection.notice),
      library: countRuns(() => state.library.kind),
      device: countRuns(() => state.device.group),
    }));
    const runs = (): readonly number[] => [
      counters.connection(),
      counters.library(),
      counters.device(),
    ];

    expect(runs()).toEqual([1, 1, 1]);

    setNotice("No longer available: GS Music e7 IN.");
    expect(runs()).toEqual([2, 1, 1]);

    selectLibraryKind("Multi");
    expect(runs()).toEqual([2, 2, 1]);

    selectGroup(4);
    expect(runs()).toEqual([2, 2, 2]);
  });

  it("leaves a reader of one field alone when a sibling field in its slice changes", () => {
    const { state, setNotice, setConnectionStatus } = createAppState();

    const status = watching(() => countRuns(() => state.connection.status));
    expect(status()).toBe(1);

    setNotice("Connecting…");
    expect(status()).toBe(1);

    setConnectionStatus("connecting");
    expect(status()).toBe(2);
  });

  it("leaves a reader of one cached slot alone when another slot is read", () => {
    const { state, setSlotState } = createAppState();
    const first = { kind: "Single", bank: 1, group: 1, slot: 1 } as const;

    const slot = watching(() => countRuns(() => state.device.slots["Single 1.1.1"]));
    expect(slot()).toBe(1);

    setSlotState({ ...first, slot: 2 }, { status: "reading" });
    expect(slot()).toBe(1);

    setSlotState(first, { status: "reading" });
    expect(slot()).toBe(2);
  });
});
