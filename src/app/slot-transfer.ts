// Moving a preset between a device slot and the rest of the app: a slot read into the editor or into the library as a device dump, and the editor's preset written back to a slot, with the per-slot progress and the gates that protect unsaved edits and the instrument's memory.
import type { LibraryDatabase } from "../store";
import type { AppStateControls, MultiPart } from "./app-state";
import type { SlotAccess, SlotAddress, SlotContents } from "./device-slots";
import { createStore } from "solid-js/store";
import { storeDeviceDump } from "../store";
import { isFactorySlot, slotByteAddress, slotKey, unlockedPresetImage } from "./device-slots";
import { describeFailure, savedNote, writtenNote } from "./transfer";

export type SlotTransferTask = "load" | "save" | "write";

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
  readonly write: (address: SlotAddress) => void;
  readonly proceed: (address: SlotAddress) => void;
  readonly cancel: (address: SlotAddress) => void;
}

export const LOAD_NOTE =
  "Load reads the whole slot and puts its preset in the editor. The library keeps the entries it has.";

export const SAVE_NOTE =
  "Save to library stores this slot's preset as a new library entry. The editor keeps the preset it has.";

export const WRITE_NOTE =
  "Write sends the preset in the editor to this slot, replacing what the instrument holds there. The library keeps the entries it has.";

export function factorySlotRefusal(slot: string): string {
  return `${slot} is a factory preset, and the instrument keeps those. Slots from 1.8.1 on are the ones a preset can be written to.`;
}

export function multiSlotRefusal(slot: string): string {
  return `${slot} holds four presets and the editor holds one, so a write here would leave the other three unaddressed. Write to a single slot.`;
}

export function lockedSlotRefusal(slot: string): string {
  return `${slot} is locked on the instrument, so nothing was written to it. A locked slot has to be unlocked before anything can replace what it holds.`;
}

export function writeRefusal(address: SlotAddress): string | undefined {
  if (address.kind === "Multi") {
    return multiSlotRefusal(slotKey(address));
  }
  return isFactorySlot(address) ? factorySlotRefusal(slotKey(address)) : undefined;
}

export function createSlotTransfers(
  controls: AppStateControls,
  access: () => SlotAccess | undefined,
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

  const resummarize = async (address: SlotAddress, slots: SlotAccess): Promise<void> => {
    await slots.read(address).then(
      (summary) => controls.setSlotState(address, { status: "read", summary }),
      (error: unknown) =>
        controls.setSlotState(address, { status: "failed", reason: describeFailure(error) }),
    );
  };

  const ontoDevice = async (
    address: SlotAddress,
    slots: SlotAccess,
  ): Promise<SlotTransferState> => {
    if (await slots.readLocked(address)) {
      return { status: "failed", task: "write", reason: lockedSlotRefusal(slotKey(address)) };
    }
    await slots.write(address, unlockedPresetImage(controls.state.editor.preset));
    await resummarize(address, slots);
    return { status: "done", task: "write", note: writtenNote(slotKey(address)) };
  };

  const run = async (
    task: SlotTransferTask,
    address: SlotAddress,
    slots: SlotAccess,
  ): Promise<SlotTransferState | undefined> => {
    if (task === "write") {
      return ontoDevice(address, slots);
    }
    const contents = await slots.readContents(address);
    if (task === "load") {
      intoEditor(address, contents);
      return undefined;
    }
    return { status: "done", task, note: await intoLibrary(address, contents) };
  };

  const start = (task: SlotTransferTask, address: SlotAddress): void => {
    const slots = access();
    if (slots === undefined) {
      return;
    }
    set(address, { status: "running", task });
    void run(task, address, slots).then(
      (next) => set(address, next),
      (error: unknown) => set(address, { status: "failed", task, reason: describeFailure(error) }),
    );
  };

  return {
    reachable: () => access() !== undefined,
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
    write(address: SlotAddress): void {
      const refusal = writeRefusal(address);
      if (refusal !== undefined) {
        set(address, { status: "failed", task: "write", reason: refusal });
        return;
      }
      set(address, { status: "confirming", task: "write" });
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
