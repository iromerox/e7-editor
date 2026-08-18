// Bringing .syx files from disk into the library: the picker the library pane starts, and the account it gives afterwards of what was stored, what was already there, and what could not be read.
import type { LibraryDatabase, SyxImportFailure, SyxImportReport, SyxImportSkip } from "../store";
import { createSignal } from "solid-js";
import { importSyxFromDisk } from "../store";
import { describeFailure } from "./transfer";

export const IMPORT_NOTE =
  "Import reads .syx files from disk and stores each one as a library entry. A file whose bytes are already in the library is skipped rather than stored twice, and a file that cannot be read is named with the reason, leaving the rest of the selection imported.";

export const NOTHING_PICKED = "No files were picked, so nothing was imported.";

export type LibraryImportState =
  | { readonly status: "importing" }
  | { readonly status: "done"; readonly report: SyxImportReport }
  | { readonly status: "failed"; readonly reason: string };

export interface LibraryImport {
  readonly state: () => LibraryImportState | undefined;
  readonly start: () => void;
  readonly dismiss: () => void;
}

function counted(files: number): string {
  return files === 1 ? "1 file" : `${files} files`;
}

export function importedNote(report: SyxImportReport): string {
  const read = report.imported.length + report.skipped.length + report.failed.length;
  if (read === 0) {
    return NOTHING_PICKED;
  }
  if (report.imported.length === 0) {
    return `Nothing was imported out of the ${counted(read)} picked.`;
  }
  return `Imported ${counted(report.imported.length)} of the ${counted(read)} picked.`;
}

export function skippedNote(skip: SyxImportSkip): string {
  return `${skip.fileName} holds the same bytes as “${skip.stored.name}”, already in the library, so it was skipped.`;
}

export function failedNote(failure: SyxImportFailure): string {
  return `${failure.fileName} was not imported: ${failure.reason}`;
}

export function createLibraryImport(database: LibraryDatabase): LibraryImport {
  const [state, setState] = createSignal<LibraryImportState | undefined>();

  return {
    state,
    start(): void {
      if (state()?.status === "importing") {
        return;
      }
      setState({ status: "importing" });
      void importSyxFromDisk(database).then(
        (report) => setState({ status: "done", report }),
        (error: unknown) => setState({ status: "failed", reason: describeFailure(error) }),
      );
    },
    dismiss(): void {
      setState(undefined);
    },
  };
}
