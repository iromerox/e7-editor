// The editor's edit history: what one recorded edit is, how a drag's worth of them collapses into a single step, how deep the history goes, and the keys that walk it.
import type { CcField } from "../protocol";

export interface EditorEdit {
  readonly field: CcField;
  readonly previousValue: number;
  readonly nextValue: number;
  readonly at: number;
}

export interface HistoryState {
  undo: readonly EditorEdit[];
  redo: readonly EditorEdit[];
}

export type HistoryStep = "undo" | "redo";

export interface ShortcutChord {
  readonly key: string;
  readonly ctrlKey: boolean;
  readonly metaKey: boolean;
  readonly shiftKey: boolean;
}

export const COALESCE_WINDOW_MS = 300;

export const HISTORY_DEPTH = 100;

export function emptyHistory(): HistoryState {
  return { undo: [], redo: [] };
}

function continues(last: EditorEdit | undefined, edit: EditorEdit): last is EditorEdit {
  return last !== undefined && last.field === edit.field && edit.at - last.at < COALESCE_WINDOW_MS;
}

export function recorded(history: HistoryState, edit: EditorEdit): HistoryState {
  if (edit.previousValue === edit.nextValue) {
    return history;
  }
  const last = history.undo.at(-1);
  if (continues(last, edit)) {
    const merged = { ...last, nextValue: edit.nextValue, at: edit.at };
    return { undo: [...history.undo.slice(0, -1), merged], redo: [] };
  }
  return { undo: [...history.undo, edit].slice(-HISTORY_DEPTH), redo: [] };
}

export function historyShortcut(chord: ShortcutChord): HistoryStep | undefined {
  if (!(chord.ctrlKey || chord.metaKey)) {
    return undefined;
  }
  switch (chord.key.toLowerCase()) {
    case "z":
      return chord.shiftKey ? "redo" : "undo";
    case "y":
      return chord.shiftKey ? undefined : "redo";
    default:
      return undefined;
  }
}
