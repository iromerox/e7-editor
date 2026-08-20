import type { Input, Output } from "webmidi";
import type { Connection } from "../midi";
import type { WireEvent } from "./wire-monitor";
import type { CommandDraft } from "./wire-sender";
import { describe, expect, it } from "vitest";
import { createConnection } from "../midi";
import {
  AddressComponentRangeError,
  ControlChangeRangeError,
  FILTER_RESONANCE,
  SYSEX_COMMAND_IDS,
  SysExAddressRangeError,
  SysExDataByteRangeError,
  encodeResponse,
} from "../protocol";
import { HexFieldError } from "./errors";
import {
  emptyWireLog,
  formatWireMonitorReport,
  monitorWire,
  recorded,
  replies,
} from "./wire-monitor";
import {
  INITIAL_DRAFT,
  SENDER_COMMANDS,
  buildCommand,
  commandNamed,
  parseAddress,
  parseBytes,
  sendCommand,
  sendControlChange,
} from "./wire-sender";

const SERIAL_RESPONSE = encodeResponse({ kind: "serial-number", serialNumber: 361 });

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
}

interface Bench {
  readonly connection: Connection;
  readonly input: FakeInput;
  readonly output: FakeOutput;
}

function bench(): Bench {
  const input = new FakeInput();
  const output = new FakeOutput();
  return {
    connection: createConnection(input as unknown as Input, output as unknown as Output),
    input,
    output,
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

function drafted(overrides: Partial<CommandDraft>): CommandDraft {
  return { ...INITIAL_DRAFT, ...overrides };
}

function bytesOf(draft: Partial<CommandDraft>): Uint8Array {
  const { output, connection } = bench();
  sendCommand(
    connection,
    buildCommand(drafted(draft)),
    () => {},
    () => 0,
  );
  const sent = output.sent[0];
  if (sent === undefined) {
    expect.unreachable();
  }
  return sent;
}

function hex(...bytes: number[]): Uint8Array {
  return Uint8Array.from(bytes);
}

describe("sendControlChange", () => {
  it("sends any controller at all, on the operator's channel and value", () => {
    const { connection, output } = bench();
    const events: WireEvent[] = [];

    sendControlChange(
      connection,
      { channel: 4, controller: FILTER_RESONANCE, value: 127 },
      (event) => events.push(event),
      () => 12,
    );

    expect(output.sent).toEqual([hex(0xb3, FILTER_RESONANCE, 127)]);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      kind: "control-change",
      direction: "outbound",
      atMs: 12,
      channel: 4,
      controller: FILTER_RESONANCE,
      value: 127,
    });
  });

  it("refuses a channel, controller or value outside its range without sending anything", () => {
    const { connection, output } = bench();
    const send = (channel: number, controller: number, value: number): void => {
      sendControlChange(
        connection,
        { channel, controller, value },
        () => {},
        () => 0,
      );
    };

    expect(() => send(0, 74, 0)).toThrow(ControlChangeRangeError);
    expect(() => send(1, 128, 0)).toThrow(ControlChangeRangeError);
    expect(() => send(1, 74, 200)).toThrow(ControlChangeRangeError);
    expect(output.sent).toEqual([]);
  });
});

describe("SENDER_COMMANDS", () => {
  it("offers every command the protocol layer can encode, plus lock and unlock", () => {
    const offered = SENDER_COMMANDS.map((command) => command.kind);

    expect([...offered].sort()).toEqual(
      [...Object.keys(SYSEX_COMMAND_IDS), "lock-preset", "unlock-preset"].sort(),
    );
  });

  it("carries a note for every command, so the page can say what one does before it is sent", () => {
    expect(SENDER_COMMANDS.every((command) => command.note !== "")).toBe(true);
    expect(commandNamed("factory-reset").writes).toBe(true);
    expect(commandNamed("read-memory").fields).toEqual(["address"]);
  });

  it("marks the ones that change the instrument apart from the ones that only read it", () => {
    const writes = SENDER_COMMANDS.filter((command) => command.writes).map((one) => one.kind);
    const reads = SENDER_COMMANDS.filter((command) => !command.writes).map((one) => one.kind);

    expect([...reads].sort()).toEqual([
      "read-autotuning-status",
      "read-configuration",
      "read-memory",
      "read-serial-number",
    ]);
    expect([...writes].sort()).toEqual([
      "all-leds-on",
      "factory-reset",
      "initialize-preset",
      "lock-preset",
      "unlock-preset",
      "write-configuration",
      "write-memory",
    ]);
  });
});

describe("buildCommand", () => {
  it("encodes Read Memory at the typed address", () => {
    expect(bytesOf({ kind: "read-memory", address: "0x000010" })).toEqual(
      hex(0xf0, 0x00, 0x21, 0x62, 0x01, 0x10, 0x0e, 0x10, 0x00, 0x00, 0xf7),
    );
  });

  it("encodes Write Memory with the typed bytes split into nibbles", () => {
    expect(bytesOf({ kind: "write-memory", address: "000000", data: "4F 10" })).toEqual(
      hex(0xf0, 0x00, 0x21, 0x62, 0x01, 0x10, 0x0f, 0x00, 0x00, 0x00, 0x0f, 0x04, 0x00, 0x01, 0xf7),
    );
  });

  it("encodes Lock Preset as a 1 written to the chosen slot's lock byte", () => {
    expect(bytesOf({ kind: "lock-preset", bank: 1, group: 1, slot: 1 })).toEqual(
      hex(0xf0, 0x00, 0x21, 0x62, 0x01, 0x10, 0x0f, 0x7f, 0x00, 0x00, 0x01, 0x00, 0xf7),
    );
  });

  it("encodes Unlock Preset as a 0 written to the chosen slot's lock byte", () => {
    expect(bytesOf({ kind: "unlock-preset", bank: 2, group: 1, slot: 1 })).toEqual(
      hex(0xf0, 0x00, 0x21, 0x62, 0x01, 0x10, 0x0f, 0x7f, 0x40, 0x00, 0x00, 0x00, 0xf7),
    );
  });

  it("encodes Write Configuration with the six fields and the mandatory pad", () => {
    expect(bytesOf({ kind: "write-configuration" })).toEqual(
      hex(0xf0, 0x00, 0x21, 0x62, 0x01, 0x10, 0x0d, 0x00, 0x00, 0x07, 0x00, 0x00, 0x00, 0x00, 0xf7),
    );
  });

  it("encodes each command that carries no payload as its own command byte", () => {
    expect(bytesOf({ kind: "read-serial-number" })).toEqual(
      hex(0xf0, 0x00, 0x21, 0x62, 0x01, 0x10, 0x20, 0xf7),
    );
    expect(bytesOf({ kind: "read-configuration" })).toEqual(
      hex(0xf0, 0x00, 0x21, 0x62, 0x01, 0x10, 0x0c, 0xf7),
    );
    expect(bytesOf({ kind: "read-autotuning-status" })).toEqual(
      hex(0xf0, 0x00, 0x21, 0x62, 0x01, 0x10, 0x0a, 0xf7),
    );
    expect(bytesOf({ kind: "initialize-preset" })).toEqual(
      hex(0xf0, 0x00, 0x21, 0x62, 0x01, 0x10, 0x10, 0xf7),
    );
    expect(bytesOf({ kind: "all-leds-on" })).toEqual(
      hex(0xf0, 0x00, 0x21, 0x62, 0x01, 0x10, 0x13, 0xf7),
    );
    expect(bytesOf({ kind: "factory-reset" })).toEqual(
      hex(0xf0, 0x00, 0x21, 0x62, 0x01, 0x10, 0x14, 0xf7),
    );
  });
});

describe("refusing what the protocol refuses", () => {
  const refused = (draft: Partial<CommandDraft>): (() => void) => {
    const { connection, output } = bench();
    return () => {
      try {
        sendCommand(
          connection,
          buildCommand(drafted(draft)),
          () => {},
          () => 0,
        );
      } finally {
        expect(output.sent).toEqual([]);
      }
    };
  };

  it("refuses an address past the top of the 21-bit space with the protocol's own error", () => {
    expect(refused({ kind: "read-memory", address: "200000" })).toThrow(SysExAddressRangeError);
  });

  it("refuses a preset slot outside the instrument's eight banks and groups", () => {
    expect(refused({ kind: "lock-preset", bank: 9 })).toThrow(AddressComponentRangeError);
  });

  it("refuses a configuration byte past a 7-bit data byte", () => {
    const configuration = { ...INITIAL_DRAFT.configuration, rxChannel: 200 };

    expect(refused({ kind: "write-configuration", configuration })).toThrow(
      SysExDataByteRangeError,
    );
  });

  it("refuses text that is not hexadecimal rather than sending part of it", () => {
    expect(refused({ kind: "read-memory", address: "nowhere" })).toThrow(HexFieldError);
    expect(refused({ kind: "write-memory", data: "4F zz" })).toThrow(HexFieldError);
    expect(() => parseAddress("nowhere")).toThrow(HexFieldError);
    expect(() => parseBytes("4F zz")).toThrow(HexFieldError);
  });
});

describe("what a send leaves in the log", () => {
  it("records the send as an outbound event and the frame that follows it against that send", () => {
    const { connection, input, output } = bench();
    let log = emptyWireLog();
    const record = (event: WireEvent): void => {
      log = recorded(log, event);
    };
    const monitor = monitorWire(connection, record, scriptedClock([0, 15.7]));

    sendCommand(
      connection,
      buildCommand(drafted({ kind: "read-memory", address: "000000" })),
      record,
      () => 0,
    );
    input.arrive(SERIAL_RESPONSE);
    monitor.unsubscribe();

    expect(log.events.map((event) => event.direction)).toEqual(["outbound", "inbound"]);
    expect(log.events[0]?.bytes).toEqual(output.sent[0]);
    expect(replies(log)).toEqual([
      { request: log.events[0], response: log.events[1], elapsedMs: 15.7 },
    ]);
  });

  it("names the command a response arrived after, and how long it took", () => {
    const { connection, input } = bench();
    let log = emptyWireLog();
    const record = (event: WireEvent): void => {
      log = recorded(log, event);
    };
    const monitor = monitorWire(connection, record, scriptedClock([0, 15.7]));

    sendCommand(connection, buildCommand(drafted({ kind: "read-memory" })), record, () => 0);
    input.arrive(SERIAL_RESPONSE);
    monitor.unsubscribe();

    const text = formatWireMonitorReport({
      inputName: connection.inputName,
      outputName: connection.outputName,
      log,
      reassembly: connection.reassembly,
    });

    const sent = text.split("\n").find((line) => line.includes("command read-memory")) ?? "";

    expect(sent).toContain("-->");
    expect(sent).toContain("+0.0ms");
    expect(text).toContain("(15.7ms after read-memory)");
  });

  it("leaves a frame that arrives long after the last send unattributed", () => {
    const { connection, input } = bench();
    let log = emptyWireLog();
    const record = (event: WireEvent): void => {
      log = recorded(log, event);
    };
    const monitor = monitorWire(connection, record, scriptedClock([0, 5000]));

    sendCommand(connection, buildCommand(drafted({ kind: "read-memory" })), record, () => 0);
    input.arrive(SERIAL_RESPONSE);
    monitor.unsubscribe();

    expect(replies(log)).toEqual([]);
  });
});
