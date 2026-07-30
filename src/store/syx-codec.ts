// Parsing of .syx file contents into memory blocks, classified by the addresses they write.
import type { MultiPreset, SinglePreset, SysExCommand } from "../protocol";
import type { LibraryEntryKind } from "./schema";
import {
  MEMORY_REGIONS,
  MULTI_PRESET_BYTES,
  MultiSlot,
  PresetSlot,
  ProtocolError,
  READ_MEMORY_BLOCK_BYTES,
  SINGLE_PRESET_BYTES,
  SYSEX_END,
  SYSEX_START,
  decodeCommand,
  decodeMultiPreset,
  decodeSinglePreset,
} from "../protocol";
import {
  DuplicateMemoryBlockError,
  IncompletePresetError,
  MemoryBlockAlignmentError,
  MemoryBlockLengthError,
  MemoryBlockRangeError,
  SyxFileFramingError,
  SyxFrameDecodeError,
  UnexpectedSysExCommandError,
} from "./errors";

export const MEMORY_BLOCK_BYTES = READ_MEMORY_BLOCK_BYTES;

export const GROUP_PRESETS = 8;
export const BANK_GROUPS = 8;
export const PRESET_BANKS = 8;
export const MULTI_BANKS = 2;
export const BANK_PRESETS = BANK_GROUPS * GROUP_PRESETS;
export const PRESET_SLOTS = PRESET_BANKS * BANK_PRESETS;
export const MULTI_SLOTS = MULTI_BANKS * BANK_PRESETS;

export const SINGLE_PRESET_BLOCKS = SINGLE_PRESET_BYTES / MEMORY_BLOCK_BYTES;
export const MULTI_PRESET_BLOCKS = MULTI_PRESET_BYTES / MEMORY_BLOCK_BYTES;
export const BACKUP_BLOCKS =
  PRESET_SLOTS * SINGLE_PRESET_BLOCKS + MULTI_SLOTS * MULTI_PRESET_BLOCKS;

const PRESET_REGION_START = MEMORY_REGIONS.preset.start;
const PRESET_REGION_END = MEMORY_REGIONS.preset.end;
const MULTI_REGION_START = new MultiSlot(1, 1, 1).byteAddress();

export interface MemoryBlock {
  readonly address: number;
  readonly data: Uint8Array;
}

export interface StoredSingle {
  readonly slot: PresetSlot;
  readonly bytes: Uint8Array;
  readonly preset: SinglePreset;
}

export interface StoredMulti {
  readonly slot: MultiSlot;
  readonly bytes: Uint8Array;
  readonly multi: MultiPreset;
}

type StoredKind<Kind extends LibraryEntryKind> = Kind;

interface SyxContents {
  readonly singles: readonly StoredSingle[];
  readonly multis: readonly StoredMulti[];
}

export interface SyxSingle extends SyxContents {
  readonly kind: StoredKind<"Single">;
  readonly bank: number;
  readonly group: number;
  readonly slot: number;
}

export interface SyxMulti extends SyxContents {
  readonly kind: StoredKind<"Multi">;
  readonly bank: number;
  readonly group: number;
  readonly slot: number;
}

export interface SyxGroup extends SyxContents {
  readonly kind: StoredKind<"Group">;
  readonly bank: number;
  readonly group: number;
}

export interface SyxBank extends SyxContents {
  readonly kind: StoredKind<"Bank">;
  readonly bank: number;
}

export interface SyxBackup extends SyxContents {
  readonly kind: StoredKind<"Backup">;
}

export interface SyxMultiPack extends SyxContents {
  readonly kind: StoredKind<"MultiPack">;
}

export type SyxFile = SyxSingle | SyxMulti | SyxGroup | SyxBank | SyxBackup | SyxMultiPack;

export type SyxFileKind = SyxFile["kind"];

function splitFrames(bytes: Uint8Array): readonly Uint8Array[] {
  const frames: Uint8Array[] = [];
  let offset = 0;
  while (offset < bytes.length) {
    if (bytes[offset] !== SYSEX_START) {
      throw new SyxFileFramingError("stray-byte", offset);
    }
    const end = bytes.indexOf(SYSEX_END, offset + 1);
    if (end === -1) {
      throw new SyxFileFramingError("unterminated-frame", offset);
    }
    frames.push(bytes.subarray(offset, end + 1));
    offset = end + 1;
  }
  if (frames.length === 0) {
    throw new SyxFileFramingError("empty", 0);
  }
  return frames;
}

function blockOf(frame: Uint8Array, index: number): MemoryBlock {
  let command: SysExCommand;
  try {
    command = decodeCommand(frame);
  } catch (reason) {
    if (reason instanceof ProtocolError) {
      throw new SyxFrameDecodeError(index, reason);
    }
    throw reason;
  }
  if (command.kind !== "write-memory") {
    throw new UnexpectedSysExCommandError(index, command.kind);
  }
  const { address, data } = command;
  if (data.length !== MEMORY_BLOCK_BYTES) {
    throw new MemoryBlockLengthError(address, MEMORY_BLOCK_BYTES, data.length);
  }
  if (address < PRESET_REGION_START || address + MEMORY_BLOCK_BYTES - 1 > PRESET_REGION_END) {
    throw new MemoryBlockRangeError(address, PRESET_REGION_START, PRESET_REGION_END);
  }
  if (address % MEMORY_BLOCK_BYTES !== 0) {
    throw new MemoryBlockAlignmentError(address, MEMORY_BLOCK_BYTES);
  }
  return { address, data };
}

export function parseMemoryBlocks(bytes: Uint8Array): readonly MemoryBlock[] {
  return splitFrames(bytes).map(blockOf);
}

function indexBlocks(blocks: readonly MemoryBlock[]): ReadonlyMap<number, Uint8Array> {
  const indexed = new Map<number, Uint8Array>();
  for (const block of blocks) {
    if (indexed.has(block.address)) {
      throw new DuplicateMemoryBlockError(block.address);
    }
    indexed.set(block.address, block.data);
  }
  return indexed;
}

function assemble(
  blocks: ReadonlyMap<number, Uint8Array>,
  start: number,
  length: number,
): Uint8Array {
  const bytes = new Uint8Array(length);
  for (let offset = 0; offset < length; offset += MEMORY_BLOCK_BYTES) {
    const data = blocks.get(start + offset);
    if (data === undefined) {
      throw new IncompletePresetError(start, start + offset);
    }
    bytes.set(data, offset);
  }
  return bytes;
}

function slotComponents(index: number): readonly [number, number, number] {
  return [
    Math.floor(index / BANK_PRESETS) + 1,
    (Math.floor(index / GROUP_PRESETS) % BANK_GROUPS) + 1,
    (index % GROUP_PRESETS) + 1,
  ];
}

function touchedPresets(blocks: ReadonlyMap<number, Uint8Array>): {
  readonly singles: readonly number[];
  readonly multis: readonly number[];
} {
  const singles = new Set<number>();
  const multis = new Set<number>();
  for (const address of blocks.keys()) {
    if (address < MULTI_REGION_START) {
      singles.add(Math.floor(address / SINGLE_PRESET_BYTES));
      continue;
    }
    multis.add(Math.floor((address - MULTI_REGION_START) / MULTI_PRESET_BYTES));
  }
  const ascending = (a: number, b: number): number => a - b;
  return { singles: [...singles].sort(ascending), multis: [...multis].sort(ascending) };
}

function storedSingle(blocks: ReadonlyMap<number, Uint8Array>, index: number): StoredSingle {
  const slot = new PresetSlot(...slotComponents(index));
  const bytes = assemble(blocks, slot.byteAddress(), SINGLE_PRESET_BYTES);
  return { slot, bytes, preset: decodeSinglePreset(bytes) };
}

function storedMulti(blocks: ReadonlyMap<number, Uint8Array>, index: number): StoredMulti {
  const slot = new MultiSlot(...slotComponents(index));
  const bytes = assemble(blocks, slot.byteAddress(), MULTI_PRESET_BYTES);
  return { slot, bytes, multi: decodeMultiPreset(bytes) };
}

function sameBank(singles: readonly StoredSingle[]): boolean {
  return singles.every((single) => single.slot.bank === singles[0]?.slot.bank);
}

function sameGroup(singles: readonly StoredSingle[]): boolean {
  const shared = (single: StoredSingle): boolean => single.slot.group === singles[0]?.slot.group;
  return sameBank(singles) && singles.every(shared);
}

function classify(singles: readonly StoredSingle[], multis: readonly StoredMulti[]): SyxFile {
  const contents = { singles, multis };
  const [single] = singles;
  const [multi] = multis;
  if (singles.length === PRESET_SLOTS && multis.length === MULTI_SLOTS) {
    return { kind: "Backup", ...contents };
  }
  if (single !== undefined && singles.length === 1 && multis.length === 0) {
    const { bank, group, slot } = single.slot;
    return { kind: "Single", bank, group, slot, ...contents };
  }
  if (multi !== undefined && multis.length === 1 && singles.length === 0) {
    const { bank, group, slot } = multi.slot;
    return { kind: "Multi", bank, group, slot, ...contents };
  }
  if (single !== undefined && multis.length === 0) {
    if (singles.length === GROUP_PRESETS && sameGroup(singles)) {
      return { kind: "Group", bank: single.slot.bank, group: single.slot.group, ...contents };
    }
    if (singles.length === BANK_PRESETS && sameBank(singles)) {
      return { kind: "Bank", bank: single.slot.bank, ...contents };
    }
  }
  return { kind: "MultiPack", ...contents };
}

export function classifyMemoryBlocks(blocks: readonly MemoryBlock[]): SyxFile {
  if (blocks.length === 0) {
    throw new SyxFileFramingError("empty", 0);
  }
  const indexed = indexBlocks(blocks);
  const touched = touchedPresets(indexed);
  return classify(
    touched.singles.map((index) => storedSingle(indexed, index)),
    touched.multis.map((index) => storedMulti(indexed, index)),
  );
}

export function parseSyxFile(bytes: Uint8Array): SyxFile {
  return classifyMemoryBlocks(parseMemoryBlocks(bytes));
}
