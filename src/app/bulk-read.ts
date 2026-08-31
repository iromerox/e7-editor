// Reading a whole group, bank or instrument off the device into the library, one stored entry per slot, with progress reported as each slot lands.
import type { Connection } from "../midi";
import type { LibraryDatabase, LibraryEntry } from "../store";
import type { SlotAddress, SlotKind } from "./device-slots";
import { readMemoryBlocks } from "../midi";
import { READ_MEMORY_BLOCK_BYTES } from "../protocol";
import { storeDeviceDump } from "../store";
import {
  BANKS_PER_KIND,
  BLOCKS_PER_SLOT,
  GROUPS_PER_BANK,
  SLOTS_PER_GROUP,
  slotByteAddress,
  slotKey,
} from "./device-slots";
import { describeFailure } from "./transfer";

export type BulkReadScope =
  | {
      readonly kind: "group";
      readonly slotKind: SlotKind;
      readonly bank: number;
      readonly group: number;
    }
  | { readonly kind: "bank"; readonly slotKind: SlotKind; readonly bank: number }
  | { readonly kind: "all"; readonly slotKind: SlotKind };

export interface BulkReadProgress {
  readonly slotsRead: number;
  readonly slotsTotal: number;
  readonly blocksRead: number;
  readonly blocksTotal: number;
  readonly lastSlot: SlotAddress;
}

export interface BulkReadOutcome {
  readonly stored: readonly LibraryEntry[];
  readonly slotsTotal: number;
  readonly reason?: string;
}

export interface BulkReadRun {
  readonly scope: BulkReadScope;
  readonly onProgress?: (progress: BulkReadProgress) => void;
  readonly signal?: AbortSignal;
}

export function scopeSlots(scope: BulkReadScope): readonly SlotAddress[] {
  const { slotKind } = scope;
  const banks =
    scope.kind === "all"
      ? Array.from({ length: BANKS_PER_KIND[slotKind] }, (_unused, index) => index + 1)
      : [scope.bank];
  const groups =
    scope.kind === "group"
      ? [scope.group]
      : Array.from({ length: GROUPS_PER_BANK }, (_unused, index) => index + 1);
  const slots: SlotAddress[] = [];
  for (const bank of banks) {
    for (const group of groups) {
      for (let slot = 1; slot <= SLOTS_PER_GROUP; slot += 1) {
        slots.push({ kind: slotKind, bank, group, slot });
      }
    }
  }
  return slots;
}

export function scopeLabel(scope: BulkReadScope): string {
  switch (scope.kind) {
    case "group":
      return `${scope.slotKind} bank ${scope.bank} group ${scope.group}`;
    case "bank":
      return `${scope.slotKind} bank ${scope.bank}`;
    case "all":
      return `every ${scope.slotKind} slot`;
  }
}

function slotAddresses(slots: readonly SlotAddress[]): readonly number[] {
  const addresses: number[] = [];
  for (const slot of slots) {
    const base = slotByteAddress(slot);
    for (let block = 0; block < BLOCKS_PER_SLOT[slot.kind]; block += 1) {
      addresses.push(base + block * READ_MEMORY_BLOCK_BYTES);
    }
  }
  return addresses;
}

export async function readIntoLibrary(
  connection: Connection,
  database: LibraryDatabase,
  run: BulkReadRun,
): Promise<BulkReadOutcome> {
  const slots = scopeSlots(run.scope);
  const addresses = slotAddresses(slots);
  const blocksPerSlot = BLOCKS_PER_SLOT[run.scope.slotKind];
  const stored: LibraryEntry[] = [];
  const image = new Uint8Array(blocksPerSlot * READ_MEMORY_BLOCK_BYTES);
  let storing: Promise<void> = Promise.resolve();
  let storeFailure: unknown;

  const store = async (slot: SlotAddress, bytes: Uint8Array): Promise<void> => {
    if (storeFailure !== undefined) {
      return;
    }
    try {
      stored.push(
        await storeDeviceDump(database, {
          label: slotKey(slot),
          address: slotByteAddress(slot),
          bytes,
        }),
      );
    } catch (reason) {
      storeFailure = reason;
      return;
    }
    run.onProgress?.({
      slotsRead: stored.length,
      slotsTotal: slots.length,
      blocksRead: stored.length * blocksPerSlot,
      blocksTotal: addresses.length,
      lastSlot: slot,
    });
  };

  const onBlock = (index: number, data: Uint8Array): void => {
    const offset = index % blocksPerSlot;
    image.set(data, offset * READ_MEMORY_BLOCK_BYTES);
    if (offset !== blocksPerSlot - 1) {
      return;
    }
    const slot = slots[Math.floor(index / blocksPerSlot)];
    if (slot === undefined) {
      return;
    }
    const bytes = Uint8Array.from(image);
    storing = storing.then(() => store(slot, bytes));
  };

  let readFailure: unknown;
  try {
    await readMemoryBlocks(connection, addresses, { onBlock, signal: run.signal });
  } catch (reason) {
    readFailure = reason;
  }
  await storing;

  const failure = readFailure ?? storeFailure;
  return failure === undefined
    ? { stored, slotsTotal: slots.length }
    : { stored, slotsTotal: slots.length, reason: describeFailure(failure) };
}
