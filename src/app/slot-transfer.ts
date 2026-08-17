// Moving a device slot's preset off the instrument: into the editor, or into the library as a device dump, with the per-slot progress and the gate that protects unsaved edits.
import type { LibraryDatabase } from "../store";
import type { AppStateControls, MultiPart } from "./app-state";
import type { SlotAddress, SlotContents, SlotReader } from "./device-slots";
import { createStore } from "solid-js/store";
import { storeDeviceDump } from "../store";
import { slotByteAddress, slotKey } from "./device-slots";
import { describeFailure, savedNote } from "./transfer";

export type SlotTransferTask = "load" | "save";

export type SlotTransferState =
  | { readonly status: "confirming"; readonly task: SlotTransferTask }
  | { readonly status: "running"; readonly task: SlotTransferTask }
  | { readonly status: "done"; readonly task: SlotTransferTask; readonly note: string }
  | { readonly status: "failed"; readonly task: SlotTransferTask; readonly reason: string };

export interface SlotTransfers {
  readonly reachable: () => boolean;
  readonly state: (address: SlotAddress) => SlotTransferState | undefined;
  readonly unsavedEdits: () => number;
  readonly inEditor: (address: SlotAddress) => boolean;
  readonly editorPart: () => MultiPart | undefined;
  readonly load: (address: SlotAddress) => void;
  readonly save: (address: SlotAddress) => void;
  readonly proceed: (address: SlotAddress) => void;
  readonly cancel: (address: SlotAddress) => void;
}

export const LOAD_NOTE =
  "Load reads the whole slot and puts its preset in the editor. The library keeps the entries it has.";

export const SAVE_NOTE =
  "Save to library stores this slot's preset as a new library entry. The editor keeps the preset it has.";

export function createSlotTransfers(
  controls: AppStateControls,
  reader: () => SlotReader | undefined,
  database: LibraryDatabase,
): SlotTransfers {
  const [transfers, setTransfers] = createStore<Record<string, SlotTransferState | undefined>>({});

  const set = (address: SlotAddress, next: SlotTransferState | undefined): void => {
    setTransfers(slotKey(address), next);
  };

  const intoEditor = (address: SlotAddress, contents: SlotContents): void => {
    const preset = contents.kind === "Single" ? contents.preset : contents.multi.parts[0];
    const part: MultiPart | undefined = contents.kind === "Single" ? undefined : 1;
    controls.loadEditor(preset, { kind: "DeviceSlot", address }, part);
  };

  const intoLibrary = async (address: SlotAddress, contents: SlotContents): Promise<string> => {
    const entry = await storeDeviceDump(database, {
      label: slotKey(address),
      address: slotByteAddress(address),
      bytes: contents.bytes,
    });
    return savedNote(entry.name);
  };

  const run = async (
    task: SlotTransferTask,
    address: SlotAddress,
    reading: SlotReader,
  ): Promise<SlotTransferState | undefined> => {
    const contents = await reading.readContents(address);
    if (task === "load") {
      intoEditor(address, contents);
      return undefined;
    }
    return { status: "done", task, note: await intoLibrary(address, contents) };
  };

  const start = (task: SlotTransferTask, address: SlotAddress): void => {
    const reading = reader();
    if (reading === undefined) {
      return;
    }
    set(address, { status: "running", task });
    void run(task, address, reading).then(
      (next) => set(address, next),
      (error: unknown) => set(address, { status: "failed", task, reason: describeFailure(error) }),
    );
  };

  return {
    reachable: () => reader() !== undefined,
    state: (address) => transfers[slotKey(address)],
    unsavedEdits: () => controls.state.history.undo.length,
    inEditor(address: SlotAddress): boolean {
      const { source } = controls.state.editor;
      return source.kind === "DeviceSlot" && slotKey(source.address) === slotKey(address);
    },
    editorPart: () => controls.state.editor.part,
    load(address: SlotAddress): void {
      if (controls.state.history.undo.length > 0) {
        set(address, { status: "confirming", task: "load" });
        return;
      }
      start("load", address);
    },
    save(address: SlotAddress): void {
      start("save", address);
    },
    proceed(address: SlotAddress): void {
      const pending = transfers[slotKey(address)];
      if (pending?.status !== "confirming") {
        return;
      }
      start(pending.task, address);
    },
    cancel(address: SlotAddress): void {
      set(address, undefined);
    },
  };
}
