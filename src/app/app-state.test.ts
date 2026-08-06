import type { EditorEdit } from "./app-state";
import { createEffect, createRoot } from "solid-js";
import { afterEach, describe, expect, it } from "vitest";
import { createAppState, emptyPreset } from "./app-state";

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

function edit(cc: number, previousValue: number, nextValue: number): EditorEdit {
  return { cc, previousValue, nextValue, at: 0 };
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
    expect(state.editor).toEqual({ source: { kind: "Empty" }, preset: emptyPreset() });
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

    expect(takeUndo()).toBeUndefined();
    expect(takeRedo()).toBeUndefined();

    recordEdit(edit(74, 10, 20));
    recordEdit(edit(74, 20, 30));
    expect(takeUndo()).toEqual(edit(74, 20, 30));
    expect(state.history.undo).toEqual([edit(74, 10, 20)]);
    expect(state.history.redo).toEqual([edit(74, 20, 30)]);

    expect(takeRedo()).toEqual(edit(74, 20, 30));
    expect(state.history.undo).toEqual([edit(74, 10, 20), edit(74, 20, 30)]);
    expect(state.history.redo).toEqual([]);
  });

  it("drops the redo stack once a fresh edit is recorded", () => {
    const { state, recordEdit, takeUndo } = createAppState();

    recordEdit(edit(74, 10, 20));
    takeUndo();
    recordEdit(edit(71, 0, 5));

    expect(state.history.undo).toEqual([edit(71, 0, 5)]);
    expect(state.history.redo).toEqual([]);
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
