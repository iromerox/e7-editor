import type { Observable } from "rxjs";
import type { CcEvent, Connection } from "../midi";
import type { SlotAddress } from "./device-slots";
import { EMPTY } from "rxjs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { requestResponse } from "../midi";
import {
  LOCK_BYTE_INDEX,
  MULTI_PRESET_BYTES,
  MULTI_PRESET_PARTS,
  NAME_OFFSET,
  RESERVED_BYTE_INDICES,
  SINGLE_PRESET_BYTES,
  decodeMultiPreset,
  decodeSinglePreset,
  encodeSinglePreset,
} from "../protocol";
import {
  BANKS_PER_KIND,
  createSlotReader,
  readSlotContents,
  readSlotSummary,
  slotByteAddress,
  slotKey,
  slotLabel,
} from "./device-slots";
import { SlotBlockLengthError, SlotBlockUnansweredError } from "./errors";

vi.mock("../midi", () => ({ requestResponse: vi.fn() }));

const NO_EVENTS: Observable<CcEvent> = EMPTY;

const connection: Connection = {
  inputName: "GS Music e7 IN",
  outputName: "GS Music e7 OUT",
  sysex: EMPTY,
  sysexMonitor: EMPTY,
  cc: NO_EVENTS,
  isOpen: true,
  reassembly: { pendingBytes: 0, fragmentedFrames: 0, discardedPartials: 0 },
  send: () => {},
  sendCommand: () => {},
  sendControlChange: () => {},
  sendProgramChange: () => {},
  close: () => Promise.resolve(),
};

const READ_BLOCK_BYTES = 16;

function presetImage(name: string, lockByte: number): Uint8Array {
  const bytes = new Uint8Array(SINGLE_PRESET_BYTES);
  for (const [index, character] of [...name].entries()) {
    bytes[NAME_OFFSET + index] = character.charCodeAt(0);
  }
  bytes[LOCK_BYTE_INDEX] = lockByte;
  return bytes;
}

function memoryImage(length: number): Uint8Array {
  return Uint8Array.from({ length }, (_, index) => (index * 37 + 11) % 256);
}

function presetFixture(length: number): Uint8Array {
  const bytes = memoryImage(length);
  for (let part = 0; part < length; part += SINGLE_PRESET_BYTES) {
    for (const index of RESERVED_BYTE_INDICES) {
      bytes[part + index] = 0xff;
    }
  }
  return bytes;
}

function blockAddresses(base: number, blocks: number): number[] {
  return Array.from({ length: blocks }, (_, index) => base + index * READ_BLOCK_BYTES);
}

function serveMemory(base: number, image: Uint8Array): number[] {
  const requested: number[] = [];
  vi.mocked(requestResponse).mockImplementation((_connection, command) => {
    if (command.kind !== "read-memory") {
      throw new Error(`unexpected command ${command.kind}`);
    }
    requested.push(command.address);
    const offset = command.address - base;
    return Promise.resolve({
      kind: "memory-data",
      data: image.slice(offset, offset + READ_BLOCK_BYTES),
    });
  });
  return requested;
}

beforeEach(() => {
  vi.mocked(requestResponse).mockReset();
});

describe("slot addressing", () => {
  it("places single slots where the memory map says they start", () => {
    expect(slotByteAddress({ kind: "Single", bank: 1, group: 1, slot: 1 })).toBe(0x000000);
    expect(slotByteAddress({ kind: "Single", bank: 1, group: 1, slot: 2 })).toBe(0x000080);
    expect(slotByteAddress({ kind: "Single", bank: 8, group: 8, slot: 8 })).toBe(0x00ff80);
  });

  it("places multi slots in the second half of preset memory", () => {
    expect(slotByteAddress({ kind: "Multi", bank: 1, group: 1, slot: 1 })).toBe(0x010000);
    expect(slotByteAddress({ kind: "Multi", bank: 1, group: 1, slot: 2 })).toBe(0x010200);
    expect(slotByteAddress({ kind: "Multi", bank: 2, group: 8, slot: 8 })).toBe(0x01fe00);
  });

  it("offers eight single banks and the two the multi range reaches", () => {
    expect(BANKS_PER_KIND).toEqual({ Single: 8, Multi: 2 });
  });

  it("labels a slot by its address, and keys the two kinds apart", () => {
    expect(slotLabel({ kind: "Single", bank: 1, group: 3, slot: 5 })).toBe("1.3.5");
    expect(slotKey({ kind: "Single", bank: 1, group: 3, slot: 5 })).toBe("Single 1.3.5");
    expect(slotKey({ kind: "Multi", bank: 1, group: 3, slot: 5 })).toBe("Multi 1.3.5");
  });
});

describe("readSlotSummary", () => {
  it("reads only the name and lock blocks of a single slot", async () => {
    const base = slotByteAddress({ kind: "Single", bank: 1, group: 3, slot: 5 });
    const requested = serveMemory(base, presetImage("Opening Pad", 1));

    const summary = await readSlotSummary(connection, {
      kind: "Single",
      bank: 1,
      group: 3,
      slot: 5,
    });

    expect(summary).toEqual({ name: "Opening Pad", locked: true });
    expect(requested).toEqual([base, base + 16, base + 112]);
  });

  it("reports a slot whose lock byte is clear as unlocked", async () => {
    serveMemory(0x010000, presetImage("Split Keys", 0));

    const summary = await readSlotSummary(connection, {
      kind: "Multi",
      bank: 1,
      group: 1,
      slot: 1,
    });

    expect(summary).toEqual({ name: "Split Keys", locked: false });
  });

  it("drops the padding an unnamed slot leaves in the name bytes", async () => {
    serveMemory(0, presetImage("", 0));

    const summary = await readSlotSummary(connection, {
      kind: "Single",
      bank: 1,
      group: 1,
      slot: 1,
    });

    expect(summary.name).toBe("");
  });

  it("refuses a short memory block rather than reading a name out of it", async () => {
    vi.mocked(requestResponse).mockResolvedValue({
      kind: "memory-data",
      data: new Uint8Array(4),
    });

    await expect(
      readSlotSummary(connection, { kind: "Single", bank: 1, group: 1, slot: 1 }),
    ).rejects.toThrow("returned 4 bytes");
  });
});

describe("readSlotContents", () => {
  const single: SlotAddress = { kind: "Single", bank: 1, group: 3, slot: 5 };
  const multi: SlotAddress = { kind: "Multi", bank: 1, group: 2, slot: 4 };

  it("covers a single slot with eight consecutive block reads", async () => {
    const base = slotByteAddress(single);
    const requested = serveMemory(base, presetFixture(SINGLE_PRESET_BYTES));

    const contents = await readSlotContents(connection, single);

    expect(requested).toEqual(blockAddresses(base, 8));
    expect(contents.kind).toBe("Single");
  });

  it("covers a multi slot with thirty-two consecutive block reads", async () => {
    const base = slotByteAddress(multi);
    const fixture = presetFixture(MULTI_PRESET_BYTES);
    const requested = serveMemory(base, fixture);

    const contents = await readSlotContents(connection, multi);

    expect(requested).toEqual(blockAddresses(base, 32));
    expect(contents).toEqual({ kind: "Multi", bytes: fixture, multi: decodeMultiPreset(fixture) });
  });

  it("lands each of a multi's four parts in the quarter of the read it came from", async () => {
    const fixture = presetFixture(MULTI_PRESET_BYTES);
    const marks = [0x11, 0x22, 0x33, 0x44];
    marks.forEach((mark, part) => {
      fixture[part * SINGLE_PRESET_BYTES + NAME_OFFSET] = mark;
      fixture[part * SINGLE_PRESET_BYTES + LOCK_BYTE_INDEX] = part;
    });
    serveMemory(slotByteAddress(multi), fixture);

    const contents = await readSlotContents(connection, multi);

    if (contents.kind !== "Multi") {
      throw new Error(`read a ${contents.kind} out of a multi slot`);
    }
    const { parts } = contents.multi;
    expect(parts).toHaveLength(MULTI_PRESET_PARTS);
    expect(parts.map((part) => part.part1Only.name[0])).toEqual(marks);
    expect(parts.map((part) => part.part1Only.lock)).toEqual([0, 1, 2, 3]);
    expect(parts.map((part) => encodeSinglePreset(part))).toEqual(
      marks.map((_, part) =>
        fixture.slice(part * SINGLE_PRESET_BYTES, (part + 1) * SINGLE_PRESET_BYTES),
      ),
    );
  });

  it("returns the preset the device holds, down to the bytes the layout leaves unused", async () => {
    const fixture = presetFixture(SINGLE_PRESET_BYTES);
    serveMemory(slotByteAddress(single), fixture);

    const contents = await readSlotContents(connection, single);

    expect(contents).toEqual({
      kind: "Single",
      bytes: fixture,
      preset: decodeSinglePreset(fixture),
    });
    if (contents.kind !== "Single") {
      throw new Error(`read a ${contents.kind} out of a single slot`);
    }
    expect(contents.preset.reserved).toEqual(
      new Uint8Array(RESERVED_BYTE_INDICES.length).fill(0xff),
    );
    expect(encodeSinglePreset(contents.preset)).toEqual(fixture);
  });

  it("refuses a short block rather than padding the preset out with zeros", async () => {
    const base = slotByteAddress(single);
    vi.mocked(requestResponse)
      .mockResolvedValueOnce({ kind: "memory-data", data: new Uint8Array(READ_BLOCK_BYTES) })
      .mockResolvedValue({ kind: "memory-data", data: new Uint8Array(4) });

    const failure = await readSlotContents(connection, single).catch((reason: unknown) => reason);

    expect(failure).toBeInstanceOf(SlotBlockLengthError);
    expect(failure).toMatchObject({
      code: "slot-block-length",
      address: base + READ_BLOCK_BYTES,
      expected: READ_BLOCK_BYTES,
      actual: 4,
    });
    expect(String(failure)).toContain("0x000A10");
  });

  it("names the address of a block the device never answered", async () => {
    const base = slotByteAddress(single);
    vi.mocked(requestResponse)
      .mockResolvedValueOnce({ kind: "memory-data", data: new Uint8Array(READ_BLOCK_BYTES) })
      .mockResolvedValueOnce({ kind: "memory-data", data: new Uint8Array(READ_BLOCK_BYTES) })
      .mockRejectedValue(new Error("no read-memory response parsed within 1000ms"));

    const failure = await readSlotContents(connection, single).catch((reason: unknown) => reason);

    expect(failure).toBeInstanceOf(SlotBlockUnansweredError);
    expect(failure).toMatchObject({
      code: "slot-block-unanswered",
      address: base + 2 * READ_BLOCK_BYTES,
    });
    expect(String(failure)).toContain("no read-memory response parsed within 1000ms");
  });
});

describe("createSlotReader", () => {
  it("runs queued reads one at a time, since the SysEx stream takes one consumer", async () => {
    let inFlight = 0;
    let overlapped = false;
    vi.mocked(requestResponse).mockImplementation(() => {
      inFlight += 1;
      overlapped = overlapped || inFlight > 1;
      return Promise.resolve().then(() => {
        inFlight -= 1;
        return { kind: "memory-data", data: new Uint8Array(READ_BLOCK_BYTES) };
      });
    });
    const reader = createSlotReader(connection);

    await Promise.all([
      reader.read({ kind: "Single", bank: 1, group: 1, slot: 1 }),
      reader.read({ kind: "Single", bank: 1, group: 1, slot: 2 }),
      reader.read({ kind: "Single", bank: 1, group: 1, slot: 3 }),
    ]);

    expect(overlapped).toBe(false);
    expect(requestResponse).toHaveBeenCalledTimes(9);
  });

  it("keeps a full read and a summary read off each other's wire time", async () => {
    const whole: SlotAddress = { kind: "Single", bank: 1, group: 1, slot: 1 };
    const next: SlotAddress = { kind: "Single", bank: 1, group: 1, slot: 2 };
    const summarised = slotByteAddress(next);
    const requested = serveMemory(0, presetFixture(SINGLE_PRESET_BYTES * 2));
    const reader = createSlotReader(connection);

    await Promise.all([reader.readContents(whole), reader.read(next)]);

    expect(requested).toEqual([
      ...blockAddresses(slotByteAddress(whole), 8),
      summarised,
      summarised + READ_BLOCK_BYTES,
      summarised + 112,
    ]);
  });

  it("keeps serving later reads after one of them fails", async () => {
    vi.mocked(requestResponse)
      .mockRejectedValueOnce(new Error("no response"))
      .mockResolvedValue({ kind: "memory-data", data: new Uint8Array(READ_BLOCK_BYTES) });
    const reader = createSlotReader(connection);

    const failed = reader.read({ kind: "Single", bank: 1, group: 1, slot: 1 });
    const next = reader.read({ kind: "Single", bank: 1, group: 1, slot: 2 });

    await expect(failed).rejects.toThrow("no response");
    await expect(next).resolves.toEqual({ name: "", locked: false });
  });
});
