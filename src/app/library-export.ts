// Sending a stored library entry back out to disk: the save the library pane starts for one entry, and the account it gives afterwards of the file written, the dialog dismissed, or the payload that could not be read back.
import type { LibraryEntry } from "../store";
import { createStore } from "solid-js/store";
import { entryFileName, exportEntryToDisk } from "../store";
import { describeFailure } from "./transfer";

export const EXPORT_NOTE =
  "Export writes this entry's stored SysEx to a .syx file byte for byte, to share, archive, or read with other e7 tooling. The entry itself is unchanged, and the device keeps the sound it is playing.";

export const NOTHING_SAVED = "The save was dismissed, so no file was written.";

export function savedFileNote(fileName: string): string {
  return `Exported as ${fileName}.`;
}

export type LibraryExportState =
  | { readonly status: "saving" }
  | { readonly status: "done"; readonly note: string }
  | { readonly status: "failed"; readonly reason: string };

export interface LibraryExports {
  readonly state: (entry: LibraryEntry) => LibraryExportState | undefined;
  readonly save: (entry: LibraryEntry) => void;
}

export function createLibraryExports(): LibraryExports {
  const [saves, setSaves] = createStore<Record<string, LibraryExportState | undefined>>({});

  return {
    state: (entry) => saves[entry.id],
    save(entry: LibraryEntry): void {
      if (saves[entry.id]?.status === "saving") {
        return;
      }
      const fileName = entryFileName(entry);
      setSaves(entry.id, { status: "saving" });
      void exportEntryToDisk(entry).then(
        (written) =>
          setSaves(entry.id, {
            status: "done",
            note: written ? savedFileNote(fileName) : NOTHING_SAVED,
          }),
        (error: unknown) =>
          setSaves(entry.id, { status: "failed", reason: describeFailure(error) }),
      );
    },
  };
}
