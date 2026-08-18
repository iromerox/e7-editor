// Editing what the library stores about an entry from the library pane: the draft a row holds while its form is open, and the account it gives afterwards of the save or the refusal.
import type { LibraryDatabase, LibraryEntry } from "../store";
import { createStore } from "solid-js/store";
import { entryMetadata, formatTags, parseTags, updateEntryMetadata } from "../store";
import { describeFailure } from "./transfer";

export const EDIT_NOTE =
  "Edit changes only what the library stores about this entry — the name it is listed under, its tags and its comment. The SysEx it holds is written back untouched, and the name inside the preset's own bytes is a different field this does not reach.";

export interface MetadataDraft {
  readonly name: string;
  readonly tags: string;
  readonly comment: string;
}

export type MetadataField = keyof MetadataDraft;

export type EntryMetadataState =
  | { readonly status: "editing"; readonly draft: MetadataDraft }
  | { readonly status: "saving" }
  | { readonly status: "done"; readonly note: string }
  | { readonly status: "failed"; readonly reason: string; readonly draft: MetadataDraft };

export function savedMetadataNote(name: string): string {
  return `Saved what the library stores about “${name}”, leaving its SysEx as it was.`;
}

export function draftOf(entry: LibraryEntry): MetadataDraft {
  const { name, tags, comment } = entryMetadata(entry);
  return { name, tags: formatTags(tags), comment };
}

export interface EntryMetadataEdits {
  readonly state: (entry: LibraryEntry) => EntryMetadataState | undefined;
  readonly draft: (entry: LibraryEntry) => MetadataDraft | undefined;
  readonly start: (entry: LibraryEntry) => void;
  readonly edit: (entry: LibraryEntry, field: MetadataField, value: string) => void;
  readonly save: (entry: LibraryEntry) => void;
  readonly cancel: (entry: LibraryEntry) => void;
}

export function createEntryMetadataEdits(database: LibraryDatabase): EntryMetadataEdits {
  const [edits, setEdits] = createStore<Record<string, EntryMetadataState | undefined>>({});

  const held = (entry: LibraryEntry): MetadataDraft | undefined => {
    const pending = edits[entry.id];
    return pending?.status === "editing" || pending?.status === "failed"
      ? pending.draft
      : undefined;
  };

  return {
    state: (entry) => edits[entry.id],
    draft: held,
    start(entry: LibraryEntry): void {
      setEdits(entry.id, { status: "editing", draft: draftOf(entry) });
    },
    edit(entry: LibraryEntry, field: MetadataField, value: string): void {
      const draft = held(entry);
      if (draft === undefined) {
        return;
      }
      setEdits(entry.id, { status: "editing", draft: { ...draft, [field]: value } });
    },
    save(entry: LibraryEntry): void {
      const draft = held(entry);
      if (draft === undefined) {
        return;
      }
      setEdits(entry.id, { status: "saving" });
      void updateEntryMetadata(database, entry.id, {
        name: draft.name,
        tags: parseTags(draft.tags),
        comment: draft.comment,
      }).then(
        (saved) => setEdits(entry.id, { status: "done", note: savedMetadataNote(saved.name) }),
        (error: unknown) =>
          setEdits(entry.id, { status: "failed", reason: describeFailure(error), draft }),
      );
    },
    cancel(entry: LibraryEntry): void {
      setEdits(entry.id, undefined);
    },
  };
}
