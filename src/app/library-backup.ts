// Writing the whole library out to a JSON file and reading one back in: the two actions the library pane starts, and the account it gives afterwards of the file written, the dialog dismissed, or the backup it would not restore.
import type { LibraryDatabase } from "../store";
import { createSignal } from "solid-js";
import { backupLibraryToDisk, restoreLibraryFromDisk } from "../store";
import { describeFailure } from "./transfer";

export const BACKUP_NOTE =
  "Back up writes the whole library to one JSON file — every entry with the SysEx it holds — so the collection survives a browser clearing what this site stored. The library is unchanged and nothing is sent to the device.";

export const RESTORE_NOTE =
  "Restore reads a library backup file back in, entry for entry. It fills an empty library only: nothing already stored is merged with, replaced or removed.";

export const NOTHING_WRITTEN = "The save was dismissed, so no file was written.";

export const NOTHING_READ = "No file was picked, so nothing was restored.";

function counted(entries: number): string {
  return entries === 1 ? "1 entry" : `${entries} entries`;
}

export function backedUpNote(file: string, entries: number): string {
  return `Backed the library's ${counted(entries)} up as ${file}.`;
}

export function restoredNote(file: string, entries: number): string {
  return `Restored ${counted(entries)} from ${file}.`;
}

export type LibraryBackupState =
  | { readonly status: "backing-up" }
  | { readonly status: "restoring" }
  | { readonly status: "done"; readonly note: string }
  | { readonly status: "failed"; readonly reason: string };

export interface LibraryBackups {
  readonly state: () => LibraryBackupState | undefined;
  readonly running: () => boolean;
  readonly backUp: () => void;
  readonly restore: () => void;
  readonly dismiss: () => void;
}

export function createLibraryBackups(database: LibraryDatabase): LibraryBackups {
  const [state, setState] = createSignal<LibraryBackupState | undefined>();

  const running = (): boolean => {
    const pending = state()?.status;
    return pending === "backing-up" || pending === "restoring";
  };

  const refuse = (error: unknown): void => {
    setState({ status: "failed", reason: describeFailure(error) });
  };

  return {
    state,
    running,
    backUp(): void {
      if (running()) {
        return;
      }
      setState({ status: "backing-up" });
      void backupLibraryToDisk(database).then(
        (written) =>
          setState({
            status: "done",
            note:
              written === undefined
                ? NOTHING_WRITTEN
                : backedUpNote(written.fileName, written.entries),
          }),
        refuse,
      );
    },
    restore(): void {
      if (running()) {
        return;
      }
      setState({ status: "restoring" });
      void restoreLibraryFromDisk(database).then(
        (read) =>
          setState({
            status: "done",
            note: read === undefined ? NOTHING_READ : restoredNote(read.fileName, read.entries),
          }),
        refuse,
      );
    },
    dismiss(): void {
      setState(undefined);
    },
  };
}
