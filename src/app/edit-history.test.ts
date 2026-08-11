import type { CcField } from "../protocol";
import type { EditorEdit, HistoryState, ShortcutChord } from "./edit-history";
import { describe, expect, it } from "vitest";
import {
  COALESCE_WINDOW_MS,
  HISTORY_DEPTH,
  emptyHistory,
  historyShortcut,
  recorded,
} from "./edit-history";

function edit(field: CcField, previousValue: number, nextValue: number, at: number): EditorEdit {
  return { field, previousValue, nextValue, at };
}

function chord(key: string, held: Partial<ShortcutChord> = {}): ShortcutChord {
  return { key, ctrlKey: false, metaKey: false, shiftKey: false, ...held };
}

function dragged(from: number, to: number, over: number): HistoryState {
  const steps = to - from;
  return Array.from({ length: steps }).reduce<HistoryState>(
    (history, _step, index) =>
      recorded(
        history,
        edit("filterCutoff", from + index, from + index + 1, ((index + 1) * over) / steps),
      ),
    emptyHistory(),
  );
}

describe("recorded", () => {
  it("collapses a drag's worth of changes to one field into a single step", () => {
    const history = dragged(50, 70, COALESCE_WINDOW_MS - 10);

    expect(history.undo).toEqual([edit("filterCutoff", 50, 70, COALESCE_WINDOW_MS - 10)]);
  });

  it("starts a new step once the field has been left alone for the coalescing window", () => {
    const first = recorded(emptyHistory(), edit("filterCutoff", 50, 51, 1000));
    const second = recorded(first, edit("filterCutoff", 51, 52, 1000 + COALESCE_WINDOW_MS));

    expect(second.undo).toEqual([
      edit("filterCutoff", 50, 51, 1000),
      edit("filterCutoff", 51, 52, 1000 + COALESCE_WINDOW_MS),
    ]);
  });

  it("keeps a step per field, however close together the two edits are", () => {
    const first = recorded(emptyHistory(), edit("filterCutoff", 50, 51, 1000));
    const second = recorded(first, edit("filterEg1Mod", 0, 5, 1001));

    expect(second.undo).toEqual([
      edit("filterCutoff", 50, 51, 1000),
      edit("filterEg1Mod", 0, 5, 1001),
    ]);
  });

  it("drops the oldest step once the history is full", () => {
    const full = Array.from({ length: HISTORY_DEPTH + 5 }).reduce<HistoryState>(
      (history, _step, index) =>
        recorded(history, edit("filterCutoff", index, index + 1, index * COALESCE_WINDOW_MS)),
      emptyHistory(),
    );

    expect(full.undo).toHaveLength(HISTORY_DEPTH);
    expect(full.undo.at(0)?.previousValue).toBe(5);
    expect(full.undo.at(-1)?.nextValue).toBe(HISTORY_DEPTH + 5);
  });

  it("ignores an edit that leaves the value where it was", () => {
    const history = recorded(emptyHistory(), edit("filterCutoff", 50, 50, 1000));

    expect(history).toEqual(emptyHistory());
  });

  it("drops the redo stack on a fresh edit, and on a drag continuing one", () => {
    const undone: HistoryState = {
      undo: [edit("filterCutoff", 50, 51, 1000)],
      redo: [edit("filterEg1Mod", 0, 5, 900)],
    };

    expect(recorded(undone, edit("filterCutoff", 51, 52, 1100)).redo).toEqual([]);
    expect(recorded(undone, edit("chorusMix", 0, 9, 5000)).redo).toEqual([]);
  });
});

describe("historyShortcut", () => {
  it("reads the undo and redo chords on either modifier key", () => {
    expect(historyShortcut(chord("z", { ctrlKey: true }))).toBe("undo");
    expect(historyShortcut(chord("Z", { metaKey: true }))).toBe("undo");
    expect(historyShortcut(chord("z", { ctrlKey: true, shiftKey: true }))).toBe("redo");
    expect(historyShortcut(chord("Z", { metaKey: true, shiftKey: true }))).toBe("redo");
    expect(historyShortcut(chord("y", { ctrlKey: true }))).toBe("redo");
  });

  it("leaves every other chord to whatever else is listening", () => {
    expect(historyShortcut(chord("z"))).toBeUndefined();
    expect(historyShortcut(chord("a", { ctrlKey: true }))).toBeUndefined();
    expect(historyShortcut(chord("y", { ctrlKey: true, shiftKey: true }))).toBeUndefined();
  });
});
