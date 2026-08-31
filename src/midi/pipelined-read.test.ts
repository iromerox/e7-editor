import type { ProgramChangeMessage, SysExCommand } from "../protocol";
import type { CcEvent, Connection } from "./connection";
import { Observable, Subject } from "rxjs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { decodeCommand, encodeCommand, nibble } from "../protocol";
import { specBytes } from "../test-hex";
import { BulkReadCancelledError, BulkReadShortFrameError, BulkReadUnansweredError } from "./errors";
import { READ_MEMORY_RESPONSE_BYTES, READ_WINDOW, readMemoryBlocks } from "./pipelined-read";

const STALE_TAIL = specBytes("F0 0F 04 00 07 05 06 0E 06 09 06 0E F7");

interface Harness {
  readonly connection: Connection;
  readonly requested: number[];
  receive(frame: Uint8Array): void;
  answer(address: number): void;
}

function blockFor(address: number): Uint8Array {
  return Uint8Array.from({ length: 16 }, (_unused, index) => (address + index) & 0x7f);
}

function responseFor(address: number): Uint8Array {
  return Uint8Array.from([0xf0, ...nibble.pack(blockFor(address)), 0xf7]);
}

function harness(): Harness {
  const frames = new Subject<Uint8Array>();
  const requested: number[] = [];

  const send = (bytes: Uint8Array): void => {
    const command = decodeCommand(bytes);
    if (command.kind === "read-memory") {
      requested.push(command.address);
    }
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
    receive: (frame) => frames.next(frame),
    answer: (address) => frames.next(responseFor(address)),
  };
}

function run(count: number): readonly number[] {
  return Array.from({ length: count }, (_unused, index) => index * 16);
}

describe("readMemoryBlocks framing", () => {
  it("agrees with the 34 bytes a whole Read Memory answer takes", () => {
    expect(READ_MEMORY_RESPONSE_BYTES).toBe(34);
    expect(responseFor(0)).toHaveLength(34);
  });
});

describe("readMemoryBlocks windowing", () => {
  it("fills the window before any answer arrives and never exceeds it", async () => {
    const { connection, requested, answer } = harness();
    const addresses = run(12);
    const reading = readMemoryBlocks(connection, addresses);

    expect(requested).toEqual(addresses.slice(0, READ_WINDOW));

    for (const address of addresses) {
      expect(requested.length - addresses.indexOf(address)).toBeLessThanOrEqual(READ_WINDOW);
      answer(address);
    }

    await expect(reading).resolves.toHaveLength(12);
    expect(requested).toEqual(addresses);
  });

  it("sends requests in address order", async () => {
    const { connection, requested, answer } = harness();
    const addresses = run(9);
    const reading = readMemoryBlocks(connection, addresses);
    for (const address of addresses) {
      answer(address);
    }
    await reading;

    expect(requested).toEqual(addresses);
  });

  it("credits each answer to the oldest outstanding request", async () => {
    const { connection, answer } = harness();
    const addresses = run(6);
    const reading = readMemoryBlocks(connection, addresses);
    for (const address of addresses) {
      answer(address);
    }

    await expect(reading).resolves.toEqual(addresses.map(blockFor));
  });

  it("reports each block as it lands rather than only at the end", async () => {
    const { connection, answer } = harness();
    const addresses = run(6);
    const seen: number[] = [];
    const reading = readMemoryBlocks(connection, addresses, {
      onBlock: (index) => seen.push(index),
    });

    answer(addresses[0] ?? 0);
    expect(seen).toEqual([0]);
    answer(addresses[1] ?? 0);
    expect(seen).toEqual([0, 1]);

    for (const address of addresses.slice(2)) {
      answer(address);
    }
    await reading;
    expect(seen).toEqual([0, 1, 2, 3, 4, 5]);
  });

  it("resolves immediately for an empty run without sending anything", async () => {
    const { connection, requested } = harness();

    await expect(readMemoryBlocks(connection, [])).resolves.toEqual([]);
    expect(requested).toEqual([]);
  });
});

describe("readMemoryBlocks lost answers", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("fails the run on a frame that is not a whole answer rather than decoding it", async () => {
    const { connection, answer, receive } = harness();
    const addresses = run(8);
    const reading = readMemoryBlocks(connection, addresses);

    answer(addresses[0] ?? 0);
    receive(STALE_TAIL);

    await expect(reading).rejects.toBeInstanceOf(BulkReadShortFrameError);
  });

  it("reports the blocks already read when a short frame stops the run", async () => {
    const { connection, answer, receive } = harness();
    const addresses = run(8);
    const reading = readMemoryBlocks(connection, addresses);

    answer(addresses[0] ?? 0);
    answer(addresses[1] ?? 0);
    receive(STALE_TAIL);

    await expect(reading).rejects.toMatchObject({ read: 2, total: 8, frameBytes: 13 });
  });

  it("ignores a stale tail arriving before any answer of its own", async () => {
    const { connection, answer, receive } = harness();
    const addresses = run(4);
    const reading = readMemoryBlocks(connection, addresses);

    receive(STALE_TAIL);
    for (const address of addresses) {
      answer(address);
    }

    await expect(reading).resolves.toEqual(addresses.map(blockFor));
  });

  it("fails rather than shifting the pairing when an answer never arrives", async () => {
    const { connection, answer } = harness();
    const addresses = run(8);
    const settled = readMemoryBlocks(connection, addresses, { timeoutMs: 50 }).catch(
      (reason: unknown) => reason,
    );

    answer(addresses[0] ?? 0);
    await vi.advanceTimersByTimeAsync(60);

    const error = await settled;
    expect(error).toBeInstanceOf(BulkReadUnansweredError);
    expect(error).toMatchObject({ address: addresses[1], read: 1, total: 8 });
  });

  it("repeats the outstanding read once when the run goes quiet at its tail", async () => {
    const { connection, requested, answer } = harness();
    const addresses = run(4);
    const reading = readMemoryBlocks(connection, addresses, { timeoutMs: 50 });

    for (const address of addresses.slice(0, 3)) {
      answer(address);
    }
    expect(requested).toEqual(addresses);

    await vi.advanceTimersByTimeAsync(60);
    expect(requested).toEqual([...addresses, addresses[3]]);

    answer(addresses[3] ?? 0);
    await expect(reading).resolves.toHaveLength(4);
  });
});

describe("readMemoryBlocks cancellation", () => {
  it("stops on an aborted signal and reports how far it got", async () => {
    const { connection, answer } = harness();
    const controller = new AbortController();
    const addresses = run(8);
    const settled = readMemoryBlocks(connection, addresses, { signal: controller.signal }).catch(
      (reason: unknown) => reason,
    );

    answer(addresses[0] ?? 0);
    controller.abort();

    const error = await settled;
    expect(error).toBeInstanceOf(BulkReadCancelledError);
    expect(error).toMatchObject({ read: 1, total: 8 });
  });

  it("sends nothing when the signal is already aborted", async () => {
    const { connection, requested } = harness();
    const controller = new AbortController();
    controller.abort();

    await expect(
      readMemoryBlocks(connection, run(4), { signal: controller.signal }),
    ).rejects.toBeInstanceOf(BulkReadCancelledError);
    expect(requested).toEqual([]);
  });
});
