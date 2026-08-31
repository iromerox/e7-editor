import type { CcEvent, Connection } from "../midi";
import type { ProgramChangeMessage, SysExCommand } from "../protocol";
import type { LibraryDatabase } from "../store";
import type { BulkReadProgress } from "./bulk-read";
import { Observable, Subject } from "rxjs";
import { afterEach, describe, expect, it } from "vitest";
import { decodeCommand, encodeCommand, nibble } from "../protocol";
import { createLibraryDatabase } from "../store";
import { readIntoLibrary, scopeSlots } from "./bulk-read";

const openDatabases: LibraryDatabase[] = [];

async function openLibrary(label: string): Promise<LibraryDatabase> {
  const database = await createLibraryDatabase({
    name: `${label}-${Math.random().toString(36).slice(2)}`,
  });
  openDatabases.push(database);
  return database;
}

afterEach(async () => {
  await Promise.all(openDatabases.splice(0).map((database) => database.close()));
});

interface Device {
  readonly connection: Connection;
  readonly requested: number[];
  answerAll(): void;
  answerUpTo(count: number): void;
}

function blockAt(address: number): Uint8Array {
  return Uint8Array.from({ length: 16 }, (_unused, index) => (address + index) & 0x7f);
}

function device(): Device {
  const frames = new Subject<Uint8Array>();
  const requested: number[] = [];
  const pending: number[] = [];

  const send = (bytes: Uint8Array): void => {
    const command = decodeCommand(bytes);
    if (command.kind === "read-memory") {
      requested.push(command.address);
      pending.push(command.address);
    }
  };

  const answer = (): void => {
    const address = pending.shift();
    if (address === undefined) {
      return;
    }
    frames.next(Uint8Array.from([0xf0, ...nibble.pack(blockAt(address)), 0xf7]));
  };

  const connection: Connection = {
    inputName: "e7 IN",
    outputName: "e7 OUT",
    sysex: new Observable<Uint8Array>((subscriber) => frames.subscribe(subscriber)),
    sysexMonitor: frames.asObservable(),
    cc: new Subject<CcEvent>().asObservable(),
    isOpen: true,
    reassembly: { pendingBytes: 0, fragmentedFrames: 0, discardedPartials: 0 },
    send,
    sendCommand(command: SysExCommand): void {
      send(encodeCommand(command));
    },
    sendControlChange(): void {},
    sendProgramChange(_channel: number, _message: ProgramChangeMessage): void {},
    close: () => Promise.resolve(),
  };

  return {
    connection,
    requested,
    answerAll(): void {
      while (pending.length > 0) {
        answer();
      }
    },
    answerUpTo(count: number): void {
      for (let index = 0; index < count; index += 1) {
        answer();
      }
    },
  };
}

describe("scopeSlots", () => {
  it("covers the 8 slots of one group", () => {
    const slots = scopeSlots({ kind: "group", slotKind: "Single", bank: 2, group: 3 });

    expect(slots).toHaveLength(8);
    expect(slots.every((slot) => slot.bank === 2 && slot.group === 3)).toBe(true);
    expect(slots.map((slot) => slot.slot)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });

  it("covers the 64 slots of one bank", () => {
    const slots = scopeSlots({ kind: "bank", slotKind: "Single", bank: 5 });

    expect(slots).toHaveLength(64);
    expect(new Set(slots.map((slot) => slot.group)).size).toBe(8);
  });

  it("covers every preset slot on the instrument", () => {
    expect(scopeSlots({ kind: "all", slotKind: "Single" })).toHaveLength(512);
    expect(scopeSlots({ kind: "all", slotKind: "Multi" })).toHaveLength(128);
  });
});

describe("readIntoLibrary", () => {
  it("stores 8 entries for a group, each classified as the single it holds", async () => {
    const database = await openLibrary("bulk-group");
    const { connection, answerAll } = device();

    const outcome = readIntoLibrary(connection, database, {
      scope: { kind: "group", slotKind: "Single", bank: 2, group: 3 },
    });
    answerAll();
    const { stored, reason } = await outcome;

    expect(reason).toBeUndefined();
    expect(stored).toHaveLength(8);
    expect(stored.every((entry) => entry.kind === "Single")).toBe(true);
    expect(stored.map((entry) => entry.slot)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(stored.every((entry) => entry.bank === 2 && entry.group === 3)).toBe(true);
    expect(stored.every((entry) => entry.source === "DeviceDump")).toBe(true);
  });

  it("stores 64 entries for a bank, one per slot across its 8 groups", async () => {
    const database = await openLibrary("bulk-bank");
    const { connection, answerAll } = device();

    const outcome = readIntoLibrary(connection, database, {
      scope: { kind: "bank", slotKind: "Single", bank: 4 },
    });
    answerAll();
    const { stored, reason } = await outcome;

    expect(reason).toBeUndefined();
    expect(stored).toHaveLength(64);
    expect(stored.every((entry) => entry.kind === "Single" && entry.bank === 4)).toBe(true);
    expect(new Set(stored.map((entry) => `${entry.group}.${entry.slot}`)).size).toBe(64);
    expect(await database.entries.count().exec()).toBe(64);
  });

  it("reports progress as each slot lands rather than once at the end", async () => {
    const database = await openLibrary("bulk-progress");
    const { connection, answerAll } = device();
    const progress: BulkReadProgress[] = [];

    const outcome = readIntoLibrary(connection, database, {
      scope: { kind: "group", slotKind: "Single", bank: 2, group: 1 },
      onProgress: (update) => progress.push(update),
    });
    answerAll();
    await outcome;

    expect(progress).toHaveLength(8);
    expect(progress.map((update) => update.slotsRead)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(progress.every((update) => update.slotsTotal === 8)).toBe(true);
    expect(progress.at(-1)).toMatchObject({ blocksRead: 64, blocksTotal: 64 });
    expect(progress.at(0)?.lastSlot).toMatchObject({ bank: 2, group: 1, slot: 1 });
  });

  it("keeps the slots already read when the device stops answering mid-operation", async () => {
    const database = await openLibrary("bulk-partial");
    const { connection, answerUpTo } = device();
    const progress: BulkReadProgress[] = [];

    const outcome = readIntoLibrary(connection, database, {
      scope: { kind: "group", slotKind: "Single", bank: 2, group: 1 },
      onProgress: (update) => progress.push(update),
    });
    answerUpTo(24);
    const { stored, reason, slotsTotal } = await outcome;

    expect(reason).toContain("BulkReadUnansweredError");
    expect(stored).toHaveLength(3);
    expect(slotsTotal).toBe(8);
    expect(progress).toHaveLength(3);
    expect(await database.entries.count().exec()).toBe(3);
  });

  it("surfaces a cancellation while keeping what it had already stored", async () => {
    const database = await openLibrary("bulk-cancel");
    const { connection, answerUpTo } = device();
    const controller = new AbortController();

    const outcome = readIntoLibrary(connection, database, {
      scope: { kind: "bank", slotKind: "Single", bank: 3 },
      signal: controller.signal,
    });
    answerUpTo(16);
    controller.abort();
    const { stored, reason } = await outcome;

    expect(reason).toContain("BulkReadCancelledError");
    expect(stored).toHaveLength(2);
    expect(await database.entries.count().exec()).toBe(2);
  });
});
