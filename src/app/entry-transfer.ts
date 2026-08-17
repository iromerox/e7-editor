// Moving a stored library entry's preset into the editor: the kinds that hold one preset, the decode of what they stored, and the gate that protects unsaved edits.
import type { SinglePreset } from "../protocol";
import type { LibraryEntry, LibraryEntryKind } from "../store";
import type { AppStateControls, MultiPart } from "./app-state";
import { createStore } from "solid-js/store";
import { entryBytes, parseSyxFile } from "../store";
import { EntryNotOnePresetError } from "./errors";
import { describeFailure } from "./transfer";

export const SINGLE_PRESET_ENTRY_KINDS: readonly LibraryEntryKind[] = ["Single", "Multi"];

export type EntryTransferState =
  | { readonly status: "confirming" }
  | { readonly status: "failed"; readonly reason: string };

export interface EntryTransfers {
  readonly state: (entry: LibraryEntry) => EntryTransferState | undefined;
  readonly unsavedEdits: () => number;
  readonly inEditor: (entry: LibraryEntry) => boolean;
  readonly editorPart: () => MultiPart | undefined;
  readonly load: (entry: LibraryEntry) => void;
  readonly proceed: (entry: LibraryEntry) => void;
  readonly cancel: (entry: LibraryEntry) => void;
}

export interface LoadedEntry {
  readonly preset: SinglePreset;
  readonly part: MultiPart | undefined;
}

export function holdsOnePreset(kind: LibraryEntryKind): boolean {
  return SINGLE_PRESET_ENTRY_KINDS.includes(kind);
}

export function loadNote(kind: LibraryEntryKind): string {
  const loaded =
    kind === "Multi"
      ? "Load puts part 1 of this entry's multi in the editor."
      : "Load puts this entry's preset in the editor.";
  return `${loaded} The entry itself is unchanged, and the device keeps the sound it is playing.`;
}

export function manyPresetsNote(kind: LibraryEntryKind): string {
  return `A ${kind} entry holds more than one preset, so there is nothing single to load. Picking one out of it is a bulk operation.`;
}

export function entryPreset(entry: LibraryEntry): LoadedEntry {
  const file = parseSyxFile(entryBytes(entry));
  const [single] = file.singles;
  const [multi] = file.multis;
  if (file.kind === "Single" && single !== undefined) {
    return { preset: single.preset, part: undefined };
  }
  if (file.kind === "Multi" && multi !== undefined) {
    return { preset: multi.multi.parts[0], part: 1 };
  }
  throw new EntryNotOnePresetError(entry.id, file.kind);
}

export function createEntryTransfers(controls: AppStateControls): EntryTransfers {
  const [transfers, setTransfers] = createStore<Record<string, EntryTransferState | undefined>>({});

  const set = (entry: LibraryEntry, next: EntryTransferState | undefined): void => {
    setTransfers(entry.id, next);
  };

  const intoEditor = (entry: LibraryEntry): void => {
    let loaded: LoadedEntry;
    try {
      loaded = entryPreset(entry);
    } catch (error: unknown) {
      set(entry, { status: "failed", reason: describeFailure(error) });
      return;
    }
    controls.loadEditor(loaded.preset, { kind: "LibraryEntry", id: entry.id }, loaded.part);
    set(entry, undefined);
  };

  return {
    state: (entry) => transfers[entry.id],
    unsavedEdits: () => controls.state.history.undo.length,
    inEditor(entry: LibraryEntry): boolean {
      const { source } = controls.state.editor;
      return source.kind === "LibraryEntry" && source.id === entry.id;
    },
    editorPart: () => controls.state.editor.part,
    load(entry: LibraryEntry): void {
      if (!holdsOnePreset(entry.kind)) {
        return;
      }
      if (controls.state.history.undo.length > 0) {
        set(entry, { status: "confirming" });
        return;
      }
      intoEditor(entry);
    },
    proceed(entry: LibraryEntry): void {
      if (transfers[entry.id]?.status !== "confirming") {
        return;
      }
      intoEditor(entry);
    },
    cancel(entry: LibraryEntry): void {
      set(entry, undefined);
    },
  };
}
