import type { Observable } from "rxjs";
import type { CcEvent, Connection } from "../midi";
import { EMPTY } from "rxjs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { requestResponse } from "../midi";
import { LOCK_BYTE_INDEX, NAME_OFFSET, SINGLE_PRESET_BYTES } from "../protocol";
import {
  BANKS_PER_KIND,
  createSlotReader,
  readSlotSummary,
  slotByteAddress,
  slotKey,
  slotLabel,
} from "./device-slots";

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
