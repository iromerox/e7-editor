// What the console puts on the wire: any control change and any command the protocol layer can encode, refused only where the protocol refuses it, recorded into the same log as what comes back.
import type { Connection } from "../midi";
import type { SysExCommand, SysExCommandKind, WriteConfigurationFields } from "../protocol";
import type {
  ControlChangeMessage,
  ControlChangeWireEvent,
  SysExWireEvent,
  WireEvent,
} from "./wire-monitor";
import {
  FILTER_CUTOFF,
  PresetSlot,
  encodeCommand,
  encodeControlChange,
  lockPresetCommand,
  unlockPresetCommand,
} from "../protocol";
import { HexFieldError } from "./errors";
import { controlChangeEvent, sysExEvent } from "./wire-monitor";

export const NO_UNDO_NOTE =
  "The instrument has no undo: what these send takes effect at once, and nothing here takes it back.";

export type SenderCommandKind = SysExCommandKind | "lock-preset" | "unlock-preset";

export type SenderField = "address" | "data" | "slot" | "configuration";

export interface SenderCommand {
  readonly kind: SenderCommandKind;
  readonly label: string;
  readonly writes: boolean;
  readonly fields: readonly SenderField[];
  readonly note: string;
}

export const SENDER_COMMANDS: readonly SenderCommand[] = [
  {
    kind: "read-serial-number",
    label: "Read Serial Number",
    writes: false,
    fields: [],
    note: "Reads the serial number, which cannot be changed.",
  },
  {
    kind: "read-memory",
    label: "Read Memory",
    writes: false,
    fields: ["address"],
    note: "Reads the 16-byte block starting at the address, returned as two nibbles per byte.",
  },
  {
    kind: "read-configuration",
    label: "Read Configuration",
    writes: false,
    fields: [],
    note: "Reads the four configuration bytes the device reports: Rx and Tx channel, filter mode, soft thru mode.",
  },
  {
    kind: "read-autotuning-status",
    label: "Read Autotuning Status",
    writes: false,
    fields: [],
    note: "Reads whether autotuning is running and how far each of the seven voices has got.",
  },
  {
    kind: "write-memory",
    label: "Write Memory",
    writes: true,
    fields: ["address", "data"],
    note: "Overwrites memory from the address with the bytes given, and the device echoes them back. A preset address overwrites that preset.",
  },
  {
    kind: "write-configuration",
    label: "Write Configuration",
    writes: true,
    fields: ["configuration"],
    note: "Overwrites the device's MIDI configuration, including the channel this app talks on.",
  },
  {
    kind: "lock-preset",
    label: "Lock Preset",
    writes: true,
    fields: ["slot"],
    note: "Writes 1 to the slot's lock byte. The slot stays locked until something unlocks it.",
  },
  {
    kind: "unlock-preset",
    label: "Unlock Preset",
    writes: true,
    fields: ["slot"],
    note: "Writes 0 to the slot's lock byte, leaving the slot open to any write and to a factory reset.",
  },
  {
    kind: "initialize-preset",
    label: "Initialize preset",
    writes: true,
    fields: [],
    note: "Turns off multitimbral mode and resets the preset being played to the default. Preset memory is not affected.",
  },
  {
    kind: "all-leds-on",
    label: "All LEDs ON",
    writes: true,
    fields: [],
    note: "Lights every front-panel LED except the voices LEDs. Sending it again restores normal operation.",
  },
  {
    kind: "factory-reset",
    label: "Factory Reset",
    writes: true,
    fields: [],
    note: "Replaces every unlocked preset with the default one. The device may stop answering for a few seconds.",
  },
];

export interface ConfigurationField {
  readonly name: keyof WriteConfigurationFields;
  readonly label: string;
}

export const CONFIGURATION_FIELDS: readonly ConfigurationField[] = [
  { name: "rxChannel", label: "MIDI Receive Channel" },
  { name: "txChannel", label: "MIDI Transmit Channel" },
  { name: "filterMode", label: "Filter Mode" },
  { name: "softThruMode", label: "Soft Thru Mode" },
  { name: "clockSource", label: "Clock Source" },
  { name: "mpeEnable", label: "MPE Enable" },
];

export interface CommandDraft {
  readonly kind: SenderCommandKind;
  readonly address: string;
  readonly data: string;
  readonly bank: number;
  readonly group: number;
  readonly slot: number;
  readonly configuration: WriteConfigurationFields;
}

export const INITIAL_DRAFT: CommandDraft = {
  kind: "read-memory",
  address: "000000",
  data: "",
  bank: 1,
  group: 1,
  slot: 1,
  configuration: {
    rxChannel: 0,
    txChannel: 0,
    filterMode: 7,
    softThruMode: 0,
    clockSource: 0,
    mpeEnable: 0,
  },
};

export const INITIAL_CONTROL_CHANGE: ControlChangeMessage = {
  channel: 1,
  controller: FILTER_CUTOFF,
  value: 64,
};

export type RecordWireEvent = (event: WireEvent) => void;

const ADDRESS_PATTERN = /^(?:0x)?[0-9a-f]{1,6}$/i;

const BYTE_PATTERN = /^[0-9a-f]{1,2}$/i;

export function commandNamed(kind: SenderCommandKind): SenderCommand {
  const found = SENDER_COMMANDS.find((command) => command.kind === kind);
  if (found === undefined) {
    throw new Error(`no console command named ${kind}`);
  }
  return found;
}

export function parseAddress(text: string): number {
  const trimmed = text.trim();
  if (!ADDRESS_PATTERN.test(trimmed)) {
    throw new HexFieldError("address", text);
  }
  return Number.parseInt(trimmed.replace(/^0x/i, ""), 16);
}

export function parseBytes(text: string): Uint8Array {
  const tokens = text
    .trim()
    .split(/[\s,]+/)
    .filter((token) => token !== "");
  for (const token of tokens) {
    if (!BYTE_PATTERN.test(token)) {
      throw new HexFieldError("every data byte", token);
    }
  }
  return Uint8Array.from(tokens, (token) => Number.parseInt(token, 16));
}

export function buildCommand(draft: CommandDraft): SysExCommand {
  switch (draft.kind) {
    case "read-memory":
      return { kind: "read-memory", address: parseAddress(draft.address) };
    case "write-memory":
      return {
        kind: "write-memory",
        address: parseAddress(draft.address),
        data: parseBytes(draft.data),
      };
    case "write-configuration":
      return { kind: "write-configuration", configuration: draft.configuration };
    case "lock-preset":
      return lockPresetCommand(new PresetSlot(draft.bank, draft.group, draft.slot).byteAddress());
    case "unlock-preset":
      return unlockPresetCommand(new PresetSlot(draft.bank, draft.group, draft.slot).byteAddress());
    case "all-leds-on":
    case "read-serial-number":
    case "read-configuration":
    case "read-autotuning-status":
    case "initialize-preset":
    case "factory-reset":
      return { kind: draft.kind };
  }
}

export function sendCommand(
  connection: Connection,
  command: SysExCommand,
  record: RecordWireEvent,
  elapsedMs: () => number,
): SysExWireEvent {
  const bytes = encodeCommand(command);
  connection.send(bytes);
  const event = sysExEvent("outbound", bytes, elapsedMs());
  record(event);
  return event;
}

export function sendControlChange(
  connection: Connection,
  message: ControlChangeMessage,
  record: RecordWireEvent,
  elapsedMs: () => number,
): ControlChangeWireEvent {
  connection.send(encodeControlChange(message.channel, message.controller, message.value));
  const event = controlChangeEvent("outbound", message, elapsedMs());
  record(event);
  return event;
}
