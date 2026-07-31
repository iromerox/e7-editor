// Slot addressing for the device browser, and the reads that fill in a slot's name and lock state.
import type { Connection } from "../midi";
import { requestResponse } from "../midi";
import {
  LOCK_BYTE_INDEX,
  MultiSlot,
  NAME_BYTES,
  NAME_OFFSET,
  PresetSlot,
  READ_MEMORY_BLOCK_BYTES,
  isPresetLocked,
} from "../protocol";

export type SlotKind = "Single" | "Multi";

export const SLOT_KINDS: readonly SlotKind[] = ["Single", "Multi"];

export const BANKS_PER_KIND: Readonly<Record<SlotKind, number>> = { Single: 8, Multi: 2 };

export const GROUPS_PER_BANK = 8;

export const SLOTS_PER_GROUP = 8;

export interface SlotAddress {
  readonly kind: SlotKind;
  readonly bank: number;
  readonly group: number;
  readonly slot: number;
}

export interface SlotSummary {
  readonly name: string;
  readonly locked: boolean;
}

export interface SlotReader {
  read(address: SlotAddress): Promise<SlotSummary>;
}

const NAME_BLOCKS = Math.ceil((NAME_OFFSET + NAME_BYTES) / READ_MEMORY_BLOCK_BYTES);

const LOCK_BLOCK_OFFSET = LOCK_BYTE_INDEX - (LOCK_BYTE_INDEX % READ_MEMORY_BLOCK_BYTES);

const PRINTABLE_MIN = 0x20;

const PRINTABLE_MAX = 0x7e;

export function slotByteAddress(address: SlotAddress): number {
  const { bank, group, slot } = address;
  return address.kind === "Single"
    ? new PresetSlot(bank, group, slot).byteAddress()
    : new MultiSlot(bank, group, slot).byteAddress();
}

export function slotLabel(address: SlotAddress): string {
  return `${address.bank}.${address.group}.${address.slot}`;
}

export function slotKey(address: SlotAddress): string {
  return `${address.kind} ${slotLabel(address)}`;
}

function readableName(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) =>
    byte >= PRINTABLE_MIN && byte <= PRINTABLE_MAX ? String.fromCharCode(byte) : "",
  )
    .join("")
    .trim();
}

function byteAt(bytes: Uint8Array, index: number): number {
  const value = bytes[index];
  if (value === undefined) {
    throw new RangeError(`offset ${index} is outside a ${bytes.length}-byte block`);
  }
  return value;
}

async function readBlock(connection: Connection, address: number): Promise<Uint8Array> {
  const response = await requestResponse(connection, { kind: "read-memory", address });
  if (response.data.length !== READ_MEMORY_BLOCK_BYTES) {
    throw new RangeError(
      `read of 0x${address.toString(16).toUpperCase().padStart(6, "0")} returned ${response.data.length} bytes, expected ${READ_MEMORY_BLOCK_BYTES}`,
    );
  }
  return response.data;
}

export async function readSlotSummary(
  connection: Connection,
  address: SlotAddress,
): Promise<SlotSummary> {
  const base = slotByteAddress(address);
  const header = new Uint8Array(NAME_BLOCKS * READ_MEMORY_BLOCK_BYTES);
  for (let block = 0; block < NAME_BLOCKS; block += 1) {
    const offset = block * READ_MEMORY_BLOCK_BYTES;
    header.set(await readBlock(connection, base + offset), offset);
  }
  const lockBlock = await readBlock(connection, base + LOCK_BLOCK_OFFSET);
  return {
    name: readableName(header.subarray(NAME_OFFSET, NAME_OFFSET + NAME_BYTES)),
    locked: isPresetLocked(byteAt(lockBlock, LOCK_BYTE_INDEX - LOCK_BLOCK_OFFSET)),
  };
}

export function createSlotReader(connection: Connection): SlotReader {
  let queue: Promise<unknown> = Promise.resolve();
  return {
    read(address: SlotAddress): Promise<SlotSummary> {
      const summary = queue.then(() => readSlotSummary(connection, address));
      queue = summary.catch(() => undefined);
      return summary;
    },
  };
}
