import type { Input, Output } from "webmidi";
import type { CcEvent, Connection } from "../midi";
import type { WireEvent } from "./wire-monitor";
import { describe, expect, it } from "vitest";
import { createConnection } from "../midi";
import { FILTER_RESONANCE, ccToField, encodeCommand, encodeResponse } from "../protocol";
import { wireLogFixture } from "../test-wire-log";
import {
  WIRE_LOG_CAPACITY,
  controlChangeEvent,
  emptyWireLog,
  formatWireMonitorReport,
  monitorWire,
  readSysExFrame,
  recorded,
  replies,
  sysExEvent,
} from "./wire-monitor";

const UNMAPPED_CONTROLLER = 2;

const PREVIEW_FRAME = Uint8Array.of(0xf0, 0x0f, 0xf7);

const SERIAL_RESPONSE = encodeResponse({ kind: "serial-number", serialNumber: 361 });

const READ_MEMORY = encodeCommand({ kind: "read-memory", address: 0x000010 });

type PortListener = (event: unknown) => void;

class FakePort {
  private readonly listeners = new Map<string, Set<PortListener>>();

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

  send(): void {}

  close(): Promise<void> {
    return Promise.resolve();
  }
}

class FakeInput extends FakePort {
  readonly name = "GS-e7";

  arrive(frame: Uint8Array): void {
    this.emit("sysex", { message: { rawData: frame } });
  }

  turnKnob(controller: number, value: number, channel = 1): void {
    this.emit("controlchange", {
      message: { channel },
      controller: { number: controller },
      rawValue: value,
      timestamp: 0,
    });
  }
}

class FakeOutput extends FakePort {
  readonly name = "GS-e7";
}

function connect(): { connection: Connection; input: FakeInput } {
  const input = new FakeInput();
  const output = new FakeOutput();
  return {
    connection: createConnection(input as unknown as Input, output as unknown as Output),
    input,
  };
}

function scriptedClock(readings: readonly number[]): () => number {
  let index = 0;
  return () => {
    const reading = readings[index] ?? readings.at(-1) ?? 0;
    index += 1;
    return reading;
  };
}

function ccEvent(controller: number, value: number, channel = 1): CcEvent {
  return { channel, controller, value, timestamp: 0 };
}

describe("recorded", () => {
  it("keeps a mixed sequence in arrival order with each event's own timestamp and bytes", () => {
    const events: readonly WireEvent[] = [
      sysExEvent("outbound", READ_MEMORY, 0),
      sysExEvent("inbound", SERIAL_RESPONSE, 15.7),
      controlChangeEvent("inbound", ccEvent(FILTER_RESONANCE, 64), 402.5),
      sysExEvent("inbound", PREVIEW_FRAME, 900.25),
    ];

    const log = events.reduce(recorded, emptyWireLog());

    expect(log.events.map((event) => event.kind)).toEqual([
      "sysex",
      "sysex",
      "control-change",
      "sysex",
    ]);
    expect(log.events.map((event) => event.direction)).toEqual([
      "outbound",
      "inbound",
      "inbound",
      "inbound",
    ]);
    expect(log.events.map((event) => event.atMs)).toEqual([0, 15.7, 402.5, 900.25]);
    expect(log.events.map((event) => event.bytes)).toEqual([
      READ_MEMORY,
      SERIAL_RESPONSE,
      Uint8Array.of(0xb0, FILTER_RESONANCE, 64),
      PREVIEW_FRAME,
    ]);
    expect(log.dropped).toBe(0);
  });

  it("drops the oldest events past capacity and counts how many it dropped", () => {
    const log = Array.from({ length: 7 }, (_unused, index) =>
      controlChangeEvent("inbound", ccEvent(UNMAPPED_CONTROLLER, index), index),
    ).reduce(recorded, emptyWireLog(3));

    expect(log.events.map((event) => event.atMs)).toEqual([4, 5, 6]);
    expect(log.dropped).toBe(4);
    expect(log.capacity).toBe(3);
  });

  it("bounds a log at a stated maximum by default", () => {
    expect(emptyWireLog().capacity).toBe(WIRE_LOG_CAPACITY);
  });
});

describe("controlChangeEvent", () => {
  it("records a controller the CC map has no field for, with its value and its bytes", () => {
    expect(ccToField(UNMAPPED_CONTROLLER)).toBeUndefined();

    const event = controlChangeEvent("inbound", ccEvent(UNMAPPED_CONTROLLER, 127, 4), 1);

    expect(event.controller).toBe(UNMAPPED_CONTROLLER);
    expect(event.value).toBe(127);
    expect(event.channel).toBe(4);
    expect(event.field).toBeUndefined();
    expect(event.bytes).toEqual(Uint8Array.of(0xb3, UNMAPPED_CONTROLLER, 127));
  });

  it("names the fields a mapped controller drives without replacing the bytes", () => {
    const event = controlChangeEvent("inbound", ccEvent(FILTER_RESONANCE, 64), 1);

    expect(event.field).toBe("filterResonance");
    expect(event.bytes).toEqual(Uint8Array.of(0xb0, FILTER_RESONANCE, 64));
  });
});

describe("readSysExFrame", () => {
  it("keeps a frame that decodes as no known response, marked unparsed", () => {
    expect(readSysExFrame(PREVIEW_FRAME)).toEqual({ kind: "unparsed" });
  });

  it("names every response a bare-data frame could be, since responses carry no header", () => {
    const reading = readSysExFrame(SERIAL_RESPONSE);

    expect(reading.kind).toBe("response");
    expect(reading.kind === "response" ? reading.reads : []).toContain("serial-number");
  });

  it("reads a frame carrying the manufacturer header as the command it is", () => {
    expect(readSysExFrame(READ_MEMORY)).toEqual({ kind: "command", command: "read-memory" });
  });

  it("reads a committed capture the same way it reads what arrives live", () => {
    const capture = wireLogFixture("preview-frame");

    expect(capture.events.map((event) => readSysExFrame(event.bytes))).toEqual([
      { kind: "command", command: "read-memory" },
      { kind: "unparsed" },
      { kind: "response", reads: ["memory-data"] },
    ]);
  });

  it("finds nothing unparsed in a capture of the instrument answering Read Memory", () => {
    const inbound = wireLogFixture("read-memory-clean").events.filter(
      (event) => event.direction === "inbound",
    );

    expect(inbound).toHaveLength(8);
    expect(inbound.map((event) => readSysExFrame(event.bytes))).toEqual(
      inbound.map(() => ({ kind: "response", reads: ["memory-data"] })),
    );
  });

  it("reads the two-frame shape a stale session start produces, from hardware", () => {
    const capture = wireLogFixture("stale-frame-tail");

    expect(capture.events.map((event) => readSysExFrame(event.bytes))).toEqual([
      { kind: "command", command: "read-memory" },
      { kind: "unparsed" },
      { kind: "command", command: "read-memory" },
      { kind: "response", reads: ["memory-data"] },
    ]);
  });
});

describe("replies", () => {
  it("attributes both frames of a committed capture to the command they followed", () => {
    const log = wireLogFixture("preview-frame")
      .events.map((event) => sysExEvent(event.direction, event.bytes, event.atMs))
      .reduce(recorded, emptyWireLog());

    expect(replies(log).map((reply) => reply.elapsedMs)).toEqual([14.6, 16.1]);
  });
});

describe("monitorWire", () => {
  it("logs inbound frames and control changes as they arrive, in one order", () => {
    const { connection, input } = connect();
    const events: WireEvent[] = [];
    const subscription = monitorWire(
      connection,
      (event) => events.push(event),
      scriptedClock([0, 4, 20, 33]),
    );

    input.arrive(PREVIEW_FRAME);
    input.turnKnob(UNMAPPED_CONTROLLER, 99);
    input.arrive(SERIAL_RESPONSE);
    subscription.unsubscribe();
    input.arrive(SERIAL_RESPONSE);

    expect(events.map((event) => event.atMs)).toEqual([4, 20, 33]);
    expect(events.map((event) => event.kind)).toEqual(["sysex", "control-change", "sysex"]);
    expect(events[1]).toMatchObject({
      controller: UNMAPPED_CONTROLLER,
      value: 99,
      field: undefined,
    });
  });
});

describe("formatWireMonitorReport", () => {
  it("shows the reassembler's counts, the drop count, and every event's bytes beside its reading", () => {
    const { connection, input } = connect();
    let log = emptyWireLog(2);
    const subscription = monitorWire(
      connection,
      (event) => {
        log = recorded(log, event);
      },
      scriptedClock([0, 1, 2, 3]),
    );

    input.arrive(SERIAL_RESPONSE);
    input.turnKnob(UNMAPPED_CONTROLLER, 99);
    input.arrive(PREVIEW_FRAME);
    subscription.unsubscribe();

    const text = formatWireMonitorReport({
      inputName: connection.inputName,
      outputName: connection.outputName,
      log,
      reassembly: connection.reassembly,
    });

    expect(text).toContain("events           2 kept of 2 max, 1 dropped");
    expect(text).toContain("fragmented       0");
    expect(text).toContain("pending bytes    0");
    expect(text).toContain("ch1 CC 2 = 99 unmapped");
    expect(text).toContain("B0 02 63");
    expect(text).toContain("unparsed");
    expect(text).toContain("F0 0F F7");
    expect(text).not.toContain("serial-number");
  });
});
