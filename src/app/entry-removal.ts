// Deleting a library entry from the library pane: the confirmation a row holds until it is answered, and the account the pane gives afterwards of an entry that is no longer there to report at.
import type { LibraryDatabase, LibraryEntry } from "../store";
import type { AppStateControls } from "./app-state";
import { createSignal } from "solid-js";
import { createStore } from "solid-js/store";
import { deleteEntry } from "../store";
import { entryLabel } from "./entry-metadata";
import { describeFailure } from "./transfer";

export const DELETE_NOTE =
  "Delete removes this entry from the library for good, with the SysEx it holds. Nothing is written to disk first, and the device keeps the sound it is playing.";

export const KEEP_ENTRY = "Keep it";

export const EDITOR_KEPT =
  "The editor keeps the preset it holds, which no longer comes from an entry.";

export function deleteQuestion(label: string): string {
  return `Deleting “${label}” removes it from the library for good. Export it first if what it stores is worth keeping.`;
}

export function deletedNote(label: string, fromEditor: boolean): string {
  return `Deleted “${label}” from the library.${fromEditor ? ` ${EDITOR_KEPT}` : ""}`;
}

export type EntryRemovalState = { readonly status: "confirming" } | { readonly status: "deleting" };

export type RemovalOutcome =
  | { readonly status: "done"; readonly note: string }
  | { readonly status: "failed"; readonly reason: string };

export interface EntryRemovals {
  readonly state: (entry: LibraryEntry) => EntryRemovalState | undefined;
  readonly outcome: () => RemovalOutcome | undefined;
  readonly ask: (entry: LibraryEntry) => void;
  readonly proceed: (entry: LibraryEntry) => void;
  readonly cancel: (entry: LibraryEntry) => void;
}

export function createEntryRemovals(
  controls: AppStateControls,
  database: LibraryDatabase,
): EntryRemovals {
  const [removals, setRemovals] = createStore<Record<string, EntryRemovalState | undefined>>({});
  const [outcome, setOutcome] = createSignal<RemovalOutcome | undefined>();

  const inEditor = (entry: LibraryEntry): boolean => {
    const { source } = controls.state.editor;
    return source.kind === "LibraryEntry" && source.id === entry.id;
  };

  return {
    state: (entry) => removals[entry.id],
    outcome,
    ask(entry: LibraryEntry): void {
      setOutcome(undefined);
      setRemovals(entry.id, { status: "confirming" });
    },
    proceed(entry: LibraryEntry): void {
      if (removals[entry.id]?.status !== "confirming") {
        return;
      }
      const fromEditor = inEditor(entry);
      setRemovals(entry.id, { status: "deleting" });
      void deleteEntry(database, entry.id).then(
        (deleted) => {
          setRemovals(entry.id, undefined);
          if (fromEditor) {
            controls.clearEditorSource();
          }
          setOutcome({ status: "done", note: deletedNote(entryLabel(deleted), fromEditor) });
        },
        (error: unknown) => {
          setRemovals(entry.id, undefined);
          setOutcome({ status: "failed", reason: describeFailure(error) });
        },
      );
    },
    cancel(entry: LibraryEntry): void {
      setRemovals(entry.id, undefined);
    },
  };
}
