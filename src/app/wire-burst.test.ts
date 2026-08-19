import type { Input, Output } from "webmidi";
import type { Connection } from "../midi";
import type { SysExCommand } from "../protocol";
import type { BurstClock, BurstReport, BurstSend } from "./wire-burst";
import type { WireEvent } from "./wire-monitor";
import { describe, expect, it } from "vitest";
import { MIN_CC_INTERVAL_MS, createConnection } from "../midi";
import {
  FILTER_CUTOFF,
  MAX_SYSEX_ADDRESS,
  SysExAddressRangeError,
  decodeCommand,
  encodeResponse,
} from "../protocol";
import {
  commandBurst,
  controlChangeBurst,
  expectedAnswer,
  formatBurstReport,
  runBurst,
} from "./wire-burst";

type PortListener = (event: unknown) => void;

class FakePort {
  private readonly listeners = new Map<string, Set<PortListener>>();

  readonly sent: Uint8Array[] = [];

  addListener(type: string, listener: PortListener): void {
    const registered = this.listeners.get(type) ?? new Set<PortListener>();
    registered.add(listener);
    this.listeners.set(type, registered);
  }

  removeListener(type: string, listener: PortListener): void {
    this.listeners.get(type)?.delete(listener);
  }

  emit(type: string, event: unknown): void {
    for (const listener of [...(this.listeners.get(type) ?? [])]) {
      listener(event);
    }
  }

  send(bytes: Uint8Array): void {
    this.sent.push(bytes);
  }

  close(): Promise<void> {
    return Promise.resolve();
  }
}

class FakeInput extends FakePort {
  readonly name = "GS-e7";

  arrive(frame: Uint8Array): void {
    this.emit("sysex", { message: { rawData: frame } });
  }
}

class FakeOutput extends FakePort {
  readonly name = "GS-e7";

  onSend: ((bytes: Uint8Array) => void) | undefined = undefined;

  override send(bytes: Uint8Array): void {
    super.send(bytes);
    this.onSend?.(bytes);
  }
}

interface Answer {
  readonly frame: Uint8Array;
  readonly atMs: number;
}

interface Rig {
  readonly connection: Connection;
  readonly input: FakeInput;
  readonly output: FakeOutput;
  readonly clock: BurstClock;
  readonly log: WireEvent[];
  readonly waits: number[];
  record(event: WireEvent): void;
  answer(frame: Uint8Array, atMs: number): void;
}

function rig(): Rig {
  const input = new FakeInput();
  const output = new FakeOutput();
  const queued: Answer[] = [];
  const log: WireEvent[] = [];
  const waits: number[] = [];
  let now = 0;

  const clock: BurstClock = {
    elapsedMs: () => now,
    delay: (ms: number) => {
      waits.push(ms);
      if (queued.length === 0) {
        now += ms;
      }
      for (const answer of queued.splice(0)) {
        now = answer.atMs;
        input.arrive(answer.frame);
      }
      return Promise.resolve();
    },
  };

  return {
    connection: createConnection(input as unknown as Input, output as unknown as Output),
    input,
    output,
    clock,
    log,
    waits,
    record(event: WireEvent): void {
      log.push(event);
    },
    answer(frame: Uint8Array, atMs: number): void {
      queued.push({ frame, atMs });
    },
  };
}

const MEMORY_BLOCK = Uint8Array.from({ length: 16 }, (_, index) => index);

const MEMORY_RESPONSE = encodeResponse({ kind: "memory-data", data: MEMORY_BLOCK });

const PREVIEW_FRAME = Uint8Array.of(0xf0, 0x0f, 0xf7);

const SWEEP = { channel: 1, controller: FILTER_CUTOFF, value: 64 } as const;

function writeSends(count: number): readonly BurstSend[] {
  return Array.from({ length: count }, (_, index): BurstSend => {
    const command: SysExCommand = {
      kind: "write-memory",
      address: index * 16,
      data: Uint8Array.of(index + 1),
    };
    return { kind: "command", command, expects: expectedAnswer(command) };
  });
}

function echoOf(index: number): Uint8Array {
  return encodeResponse({ kind: "memory-data", data: Uint8Array.of(index + 1) });
}

function reads(repeats: number): readonly BurstSend[] {
  return commandBurst({ kind: "read-memory", address: 0 }, repeats);
}

function statuses(report: BurstReport): readonly string[] {
  return report.replies.map((reply) => reply.status);
}

describe("expectedAnswer", () => {
  it("expects a write to be echoed back as the very bytes it wrote", () => {
    expect(expectedAnswer({ kind: "write-memory", address: 0, data: Uint8Array.of(0x4f) })).toEqual(
      {
        kind: "echo",
        bytes: encodeResponse({ kind: "memory-data", data: Uint8Array.of(0x4f) }),
      },
    );
  });

  it("expects a read to be answered by the response kind the spec gives it", () => {
    expect(expectedAnswer({ kind: "read-memory", address: 0 })).toEqual({
      kind: "response",
      reads: "memory-data",
    });
    expect(expectedAnswer({ kind: "read-serial-number" })).toEqual({
      kind: "response",
      reads: "serial-number",
    });
  });

  it("expects nothing back from a command the device does not answer", () => {
    expect(expectedAnswer({ kind: "all-leds-on" })).toEqual({ kind: "silence" });
    expect(expectedAnswer({ kind: "factory-reset" })).toEqual({ kind: "silence" });
  });
});

describe("walking the address across a repeat", () => {
  const addresses = (sends: readonly BurstSend[]): readonly number[] =>
    sends.map((send) =>
      send.kind === "command" && send.command.kind === "read-memory" ? send.command.address : -1,
    );

  it("sends the same address every time when the step is zero", () => {
    expect(addresses(commandBurst({ kind: "read-memory", address: 0x100 }, 3))).toEqual([
      0x100, 0x100, 0x100,
    ]);
  });

  it("walks consecutive blocks when stepped by a block", () => {
    expect(addresses(commandBurst({ kind: "read-memory", address: 0x100 }, 4, 16))).toEqual([
      0x100, 0x110, 0x120, 0x130,
    ]);
  });

  it("refuses a walk that would leave the 21-bit space, before anything is sent", () => {
    expect(() =>
      commandBurst({ kind: "read-memory", address: MAX_SYSEX_ADDRESS - 16 }, 4, 16),
    ).toThrow(SysExAddressRangeError);
  });

  it("ignores a step for a command that carries no address", () => {
    const sends = commandBurst({ kind: "read-serial-number" }, 3, 16);

    expect(
      sends.every((send) => send.kind === "command" && send.command.kind === "read-serial-number"),
    ).toBe(true);
  });

  it("puts the walked addresses on the wire in order", async () => {
    const bench = rig();
    bench.answer(MEMORY_RESPONSE, 16);
    bench.answer(MEMORY_RESPONSE, 32);

    await runBurst(
      bench.connection,
      { sends: commandBurst({ kind: "read-memory", address: 0 }, 2, 16), intervalMs: 0 },
      bench.record,
      bench.clock,
    ).report;

    expect(bench.output.sent.map((frame) => decodeCommand(frame))).toEqual([
      { kind: "read-memory", address: 0 },
      { kind: "read-memory", address: 16 },
    ]);
  });
});

describe("repeating a send", () => {
  it("repeats it as many times as asked, waiting the stated interval between sends", async () => {
    const bench = rig();

    const report = await runBurst(
      bench.connection,
      { sends: controlChangeBurst(SWEEP, 5), intervalMs: 5 },
      bench.record,
      bench.clock,
    ).report;

    expect(bench.output.sent).toHaveLength(5);
    expect(bench.waits).toEqual([5, 5, 5, 5]);
    expect(report.sent).toBe(5);
    expect(bench.log.map((event) => event.direction)).toEqual(Array(5).fill("outbound"));
  });

  it("puts every request on the wire before any answer when the interval is zero", async () => {
    const bench = rig();
    let sentWhenFirstAnswered = 0;
    bench.input.addListener("sysex", () => {
      if (sentWhenFirstAnswered === 0) {
        sentWhenFirstAnswered = bench.output.sent.length;
      }
    });
    for (let index = 0; index < 4; index += 1) {
      bench.answer(MEMORY_RESPONSE, 16 + index);
    }

    const report = await runBurst(
      bench.connection,
      { sends: reads(4), intervalMs: 0 },
      bench.record,
      bench.clock,
    ).report;

    expect(sentWhenFirstAnswered).toBe(4);
    expect(report.received).toBe(4);
    expect(report.intervalMs).toBe(0);
  });
});

describe("matching answers to requests", () => {
  it("pairs every answer with the request whose bytes it carries", async () => {
    const bench = rig();
    for (const index of [0, 1, 2]) {
      bench.answer(echoOf(index), 16 * (index + 1));
    }

    const report = await runBurst(
      bench.connection,
      { sends: writeSends(3), intervalMs: 0 },
      bench.record,
      bench.clock,
    ).report;

    expect(statuses(report)).toEqual(["received", "received", "received"]);
    expect(report).toMatchObject({
      sent: 3,
      received: 3,
      missing: 0,
      outOfOrder: 0,
      identified: 3,
    });
  });

  it("reports the request the device never answered as missing", async () => {
    const bench = rig();
    bench.answer(echoOf(0), 16);
    bench.answer(echoOf(2), 32);

    const report = await runBurst(
      bench.connection,
      { sends: writeSends(3), intervalMs: 0 },
      bench.record,
      bench.clock,
    ).report;

    expect(statuses(report)).toEqual(["received", "missing", "received"]);
    expect(report).toMatchObject({ received: 2, missing: 1, outOfOrder: 0 });
  });

  it("reports an answer that overtook the one before it as out of order", async () => {
    const bench = rig();
    bench.answer(echoOf(1), 16);
    bench.answer(echoOf(0), 24);
    bench.answer(echoOf(2), 32);

    const report = await runBurst(
      bench.connection,
      { sends: writeSends(3), intervalMs: 0 },
      bench.record,
      bench.clock,
    ).report;

    expect(statuses(report)).toEqual(["received", "out-of-order", "received"]);
    expect(report).toMatchObject({ received: 3, missing: 0, outOfOrder: 1 });
  });

  it("counts a frame that answers nothing outstanding rather than attributing it", async () => {
    const bench = rig();
    bench.answer(PREVIEW_FRAME, 14);
    bench.answer(MEMORY_RESPONSE, 16);

    const report = await runBurst(
      bench.connection,
      { sends: reads(1), intervalMs: 0 },
      bench.record,
      bench.clock,
    ).report;

    expect(report).toMatchObject({ received: 1, unmatched: 1, missing: 0 });
    expect(report.replies[0]?.roundTripMs).toBe(16);
  });

  it("pairs answers that name no request in arrival order, and says it did", async () => {
    const bench = rig();
    bench.answer(MEMORY_RESPONSE, 16);
    bench.answer(MEMORY_RESPONSE, 32);

    const report = await runBurst(
      bench.connection,
      { sends: reads(2), intervalMs: 0 },
      bench.record,
      bench.clock,
    ).report;

    expect(report).toMatchObject({ received: 2, identified: 0, outOfOrder: 0 });
    expect(formatBurstReport(report)).toContain("2 paired in arrival order");
  });

  it("does not claim a repeat of one write was named by its bytes, since every echo is the same", async () => {
    const bench = rig();
    const command: SysExCommand = { kind: "write-memory", address: 0, data: Uint8Array.of(1) };
    bench.answer(echoOf(0), 16);
    bench.answer(echoOf(0), 32);

    const report = await runBurst(
      bench.connection,
      { sends: commandBurst(command, 2), intervalMs: 0 },
      bench.record,
      bench.clock,
    ).report;

    expect(report).toMatchObject({ received: 2, identified: 0 });
  });
});

describe("what a run reports", () => {
  it("reports the round trips as a spread rather than as one figure", async () => {
    const bench = rig();
    bench.answer(echoOf(0), 15.7);
    bench.answer(echoOf(1), 16);
    bench.answer(echoOf(2), 31.4);

    const report = await runBurst(
      bench.connection,
      { sends: writeSends(3), intervalMs: 0 },
      bench.record,
      bench.clock,
    ).report;

    expect(report.timings).toEqual({ minMs: 15.7, medianMs: 16, maxMs: 31.4 });
    expect(formatBurstReport(report)).toContain("min 15.7ms   median 16.0ms   max 31.4ms");
  });

  it("keeps what it measured when the run is stopped part-way", async () => {
    const bench = rig();
    let started: { stop(): void } | undefined;
    bench.output.onSend = () => {
      if (bench.output.sent.length === 3) {
        started?.stop();
      }
    };

    const run = runBurst(
      bench.connection,
      { sends: controlChangeBurst(SWEEP, 10), intervalMs: 5 },
      bench.record,
      bench.clock,
    );
    started = run;
    const report = await run.report;

    expect(report).toMatchObject({ planned: 10, sent: 3, stopped: true });
    expect(statuses(report)).toEqual(["sent", "sent", "sent", ...Array<string>(7).fill("unsent")]);
    expect(formatBurstReport(report)).toContain("stopped part-way");
  });

  it("says on every report that the outbound rate limiter did not apply", async () => {
    const bench = rig();

    const report = await runBurst(
      bench.connection,
      { sends: controlChangeBurst(SWEEP, 4), intervalMs: 1 },
      bench.record,
      bench.clock,
    ).report;

    expect(1).toBeLessThan(MIN_CC_INTERVAL_MS);
    expect(bench.output.sent).toHaveLength(4);
    expect(formatBurstReport(report)).toContain(`MIN_CC_INTERVAL_MS (${MIN_CC_INTERVAL_MS}ms)`);
  });

  it("keeps the measurements taken before the connection failed under it", async () => {
    const bench = rig();
    bench.answer(echoOf(0), 16);
    bench.output.onSend = () => {
      if (bench.output.sent.length === 2) {
        throw new Error("port went away");
      }
    };

    const report = await runBurst(
      bench.connection,
      { sends: writeSends(3), intervalMs: 0 },
      bench.record,
      bench.clock,
    ).report;

    expect(report.sent).toBe(1);
    expect(report.fault).toContain("port went away");
    expect(formatBurstReport(report)).toContain("port went away");
  });
});
