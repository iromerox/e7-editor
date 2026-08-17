// Central application state: connection, ports, library results, device slot cache, editor, and edit history.
import type { PortInfo, PortLists } from "../midi";
import type { CcField, ReceiveChannel, SinglePreset } from "../protocol";
import type { LibraryEntry, LibraryEntryKind } from "../store";
import type { SlotAddress, SlotKind, SlotSummary } from "./device-slots";
import type { EditorEdit, HistoryState } from "./edit-history";
import { createStore, unwrap } from "solid-js/store";
import { SINGLE_PRESET_BYTES, decodeSinglePreset, writeField } from "../protocol";
import { BANKS_PER_KIND, slotKey } from "./device-slots";
import { emptyHistory, recorded } from "./edit-history";

export type ConnectionStatus = "midi-disabled" | "disconnected" | "connecting" | "connected";

export interface ConnectionState {
  status: ConnectionStatus;
  inputName: string;
  outputName: string;
  serialNumber: number | undefined;
  receiveChannel: ReceiveChannel | undefined;
  notice: string;
}

export interface PortsState {
  inputs: readonly PortInfo[];
  outputs: readonly PortInfo[];
}

export const EVERY_KIND = "All kinds";

export type LibraryKindFilter = LibraryEntryKind | typeof EVERY_KIND;

export interface LibraryState {
  kind: LibraryKindFilter;
  entries: readonly LibraryEntry[] | undefined;
}

export type DeviceSlotState =
  | { readonly status: "reading" }
  | { readonly status: "read"; readonly summary: SlotSummary }
  | { readonly status: "failed"; readonly reason: string };

export interface DeviceState {
  kind: SlotKind;
  bank: number;
  group: number;
  slots: Record<string, DeviceSlotState>;
}

export type EditorSource =
  | { readonly kind: "Empty" }
  | { readonly kind: "DeviceSlot"; readonly address: SlotAddress }
  | { readonly kind: "LibraryEntry"; readonly id: string };

export type MultiPart = 1 | 2 | 3 | 4;

export interface EditorState {
  source: EditorSource;
  preset: SinglePreset;
  part: MultiPart | undefined;
}

export interface OutputState {
  masterVolume: number;
}

export interface AppState {
  connection: ConnectionState;
  ports: PortsState;
  library: LibraryState;
  device: DeviceState;
  editor: EditorState;
  output: OutputState;
  history: HistoryState;
}

export interface AppStateControls {
  readonly state: AppState;
  setPorts(ports: PortLists): void;
  selectInputPort(name: string): void;
  selectOutputPort(name: string): void;
  setConnectionStatus(status: ConnectionStatus): void;
  setSerialNumber(serialNumber: number | undefined): void;
  setReceiveChannel(receiveChannel: ReceiveChannel | undefined): void;
  setNotice(notice: string): void;
  selectLibraryKind(kind: LibraryKindFilter): void;
  setLibraryEntries(entries: readonly LibraryEntry[] | undefined): void;
  selectSlotKind(kind: SlotKind): void;
  selectBank(bank: number): void;
  selectGroup(group: number): void;
  setSlotState(address: SlotAddress, slot: DeviceSlotState): void;
  loadEditor(preset: SinglePreset, source: EditorSource, part?: MultiPart): void;
  editField(field: CcField, value: number): void;
  setMasterVolume(value: number): void;
  recordEdit(edit: EditorEdit): void;
  clearHistory(): void;
  takeUndo(): EditorEdit | undefined;
  takeRedo(): EditorEdit | undefined;
}

export const FULL_MASTER_VOLUME = 127;

export function emptyPreset(): SinglePreset {
  return decodeSinglePreset(new Uint8Array(SINGLE_PRESET_BYTES));
}

export function initialAppState(): AppState {
  return {
    connection: {
      status: "midi-disabled",
      inputName: "",
      outputName: "",
      serialNumber: undefined,
      receiveChannel: undefined,
      notice: "",
    },
    ports: { inputs: [], outputs: [] },
    library: { kind: EVERY_KIND, entries: undefined },
    device: { kind: "Single", bank: 1, group: 1, slots: {} },
    editor: { source: { kind: "Empty" }, preset: emptyPreset(), part: undefined },
    output: { masterVolume: FULL_MASTER_VOLUME },
    history: emptyHistory(),
  };
}

export function createAppState(): AppStateControls {
  const [state, setState] = createStore<AppState>(initialAppState());

  return {
    state,
    setPorts(ports: PortLists): void {
      setState("ports", { inputs: ports.inputs, outputs: ports.outputs });
    },
    selectInputPort(name: string): void {
      setState("connection", "inputName", name);
    },
    selectOutputPort(name: string): void {
      setState("connection", "outputName", name);
    },
    setConnectionStatus(status: ConnectionStatus): void {
      setState("connection", "status", status);
    },
    setSerialNumber(serialNumber: number | undefined): void {
      setState("connection", "serialNumber", serialNumber);
    },
    setReceiveChannel(receiveChannel: ReceiveChannel | undefined): void {
      setState("connection", "receiveChannel", receiveChannel);
    },
    setNotice(notice: string): void {
      setState("connection", "notice", notice);
    },
    selectLibraryKind(kind: LibraryKindFilter): void {
      setState("library", "kind", kind);
    },
    setLibraryEntries(entries: readonly LibraryEntry[] | undefined): void {
      setState("library", "entries", entries);
    },
    selectSlotKind(kind: SlotKind): void {
      setState("device", (device) => ({
        kind,
        bank: device.bank > BANKS_PER_KIND[kind] ? 1 : device.bank,
      }));
    },
    selectBank(bank: number): void {
      setState("device", "bank", bank);
    },
    selectGroup(group: number): void {
      setState("device", "group", group);
    },
    setSlotState(address: SlotAddress, slot: DeviceSlotState): void {
      setState("device", "slots", slotKey(address), slot);
    },
    loadEditor(preset: SinglePreset, source: EditorSource, part?: MultiPart): void {
      setState("editor", { preset, source, part });
      setState("history", emptyHistory());
    },
    editField(field: CcField, value: number): void {
      setState("editor", "preset", (preset) => writeField(unwrap(preset), field, value));
    },
    setMasterVolume(value: number): void {
      setState("output", "masterVolume", value);
    },
    recordEdit(edit: EditorEdit): void {
      setState("history", recorded(unwrap(state).history, edit));
    },
    clearHistory(): void {
      setState("history", emptyHistory());
    },
    takeUndo(): EditorEdit | undefined {
      const { undo, redo } = unwrap(state).history;
      const entry = undo.at(-1);
      if (entry === undefined) {
        return undefined;
      }
      setState("history", { undo: undo.slice(0, -1), redo: [...redo, entry] });
      return entry;
    },
    takeRedo(): EditorEdit | undefined {
      const { undo, redo } = unwrap(state).history;
      const entry = redo.at(-1);
      if (entry === undefined) {
        return undefined;
      }
      setState("history", { undo: [...undo, entry], redo: redo.slice(0, -1) });
      return entry;
    },
  };
}
