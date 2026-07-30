import type { Input, Output } from "webmidi";
import type { CcEvent, Connection } from "./connection";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createConnection } from "./connection";
import { ConnectionClosedError, SysExStreamBusyError } from "./errors";

type PortListener = (event: unknown) => void;

class FakePort {
  readonly listeners = new Map<string, Set<PortListener>>();
  closeCalls = 0;

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

  listenerCount(): number {
    return [...this.listeners.values()].reduce((total, set) => total + set.size, 0);
  }

  close(): Promise<void> {
    this.closeCalls += 1;
    return Promise.resolve();
  }
}

class FakeInput extends FakePort {
  readonly name = "GS Music e7 IN";

  receiveSysex(...bytes: number[]): void {
    this.emit("sysex", { message: { rawData: Uint8Array.from(bytes) } });
  }

  receiveControlChange(channel: number, controller: number, value: number): void {
    this.emit("controlchange", {
      message: { channel },
      controller: { number: controller },
      rawValue: value,
      timestamp: 1000 + controller,
    });
  }

  receiveValuelessControlChange(): void {
    this.emit("controlchange", {
      message: { channel: 1 },
      controller: { number: 74 },
      timestamp: 0,
    });
  }

  disconnect(): void {
    this.emit("disconnected", { port: this });
  }
}

class FakeOutput extends FakePort {
  readonly name = "GS Music e7 OUT";
  readonly sent: Uint8Array[] = [];

  send(bytes: Uint8Array): void {
    this.sent.push(bytes);
  }
}

interface Harness {
  readonly input: FakeInput;
  readonly output: FakeOutput;
  readonly connection: Connection;
}

function harness(): Harness {
  const input = new FakeInput();
  const output = new FakeOutput();
  const connection = createConnection(input as unknown as Input, output as unknown as Output);
  return { input, output, connection };
}

describe("createConnection streams", () => {
  it("delivers interleaved SysEx frames and CC events to their own stream, in order", () => {
    const { input, connection } = harness();
    const frames: Uint8Array[] = [];
    const ccs: CcEvent[] = [];
    connection.sysex.subscribe((frame) => frames.push(frame));
    connection.cc.subscribe((event) => ccs.push(event));

    input.receiveSysex(0xf0, 0x01, 0xf7);
    input.receiveControlChange(1, 74, 64);
    input.receiveSysex(0xf0, 0x02, 0xf7);
    input.receiveControlChange(2, 71, 127);
    input.receiveSysex(0xf0, 0x03, 0xf7);

    expect(frames).toEqual([
      Uint8Array.of(0xf0, 0x01, 0xf7),
      Uint8Array.of(0xf0, 0x02, 0xf7),
      Uint8Array.of(0xf0, 0x03, 0xf7),
    ]);
    expect(ccs).toEqual([
      { channel: 1, controller: 74, value: 64, timestamp: 1074 },
      { channel: 2, controller: 71, value: 127, timestamp: 1071 },
    ]);
  });

  it("keeps delivering on one stream while the other has no consumer at all", () => {
    const { input, connection } = harness();
    const frames: Uint8Array[] = [];
    connection.sysex.subscribe((frame) => frames.push(frame));

    input.receiveControlChange(1, 74, 64);
    input.receiveSysex(0xf0, 0x01, 0xf7);
    input.receiveControlChange(1, 74, 65);

    expect(frames).toEqual([Uint8Array.of(0xf0, 0x01, 0xf7)]);

    const ccs: CcEvent[] = [];
    connection.cc.subscribe((event) => ccs.push(event));
    input.receiveControlChange(1, 74, 66);

    expect(ccs).toHaveLength(1);
    expect(frames).toHaveLength(1);
  });

  it("admits one consumer at a time on the SysEx stream, so a pending request owns it", () => {
    const { input, connection } = harness();
    const frames: Uint8Array[] = [];
    const pending = connection.sysex.subscribe((frame) => frames.push(frame));

    let rejected: unknown;
    connection.sysex.subscribe({ error: (error: unknown) => (rejected = error) });
    expect(rejected).toBeInstanceOf(SysExStreamBusyError);

    input.receiveSysex(0xf0, 0x01, 0xf7);
    expect(frames).toHaveLength(1);

    pending.unsubscribe();
    const next: Uint8Array[] = [];
    connection.sysex.subscribe((frame) => next.push(frame));
    input.receiveSysex(0xf0, 0x02, 0xf7);

    expect(frames).toHaveLength(1);
    expect(next).toEqual([Uint8Array.of(0xf0, 0x02, 0xf7)]);
  });

  it("fans the CC stream out to every live-forwarding consumer", () => {
    const { input, connection } = harness();
    const editor: CcEvent[] = [];
    const meter: CcEvent[] = [];
    connection.cc.subscribe((event) => editor.push(event));
    connection.cc.subscribe((event) => meter.push(event));

    input.receiveControlChange(1, 74, 64);

    expect(editor).toHaveLength(1);
    expect(meter).toHaveLength(1);
  });

  it("drops a control change carrying no value byte rather than reporting a made-up one", () => {
    const { input, connection } = harness();
    const ccs: CcEvent[] = [];
    connection.cc.subscribe((event) => ccs.push(event));

    input.receiveValuelessControlChange();

    expect(ccs).toEqual([]);
  });
});

describe("createConnection sending", () => {
  it("sends raw bytes and encoded commands through the output port", () => {
    const { output, connection } = harness();

    connection.send(Uint8Array.of(0xb0, 0x4a, 0x40));
    connection.sendCommand({ kind: "read-serial-number" });

    expect(output.sent).toEqual([
      Uint8Array.of(0xb0, 0x4a, 0x40),
      Uint8Array.of(0xf0, 0x00, 0x21, 0x62, 0x01, 0x10, 0x20, 0xf7),
    ]);
  });

  it("reports the port names it is bound to", () => {
    const { connection } = harness();
    expect(connection.inputName).toBe("GS Music e7 IN");
    expect(connection.outputName).toBe("GS Music e7 OUT");
  });
});

describe("createConnection outbound control changes", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("encodes the control change on its own channel and rate limits the burst", async () => {
    vi.useFakeTimers();
    const { output, connection } = harness();

    for (let value = 60; value <= 70; value += 1) {
      connection.sendControlChange(3, 74, value);
    }
    connection.sendControlChange(3, 20, 5);
    await vi.advanceTimersByTimeAsync(50);

    expect(output.sent).toEqual([Uint8Array.of(0xb2, 74, 70), Uint8Array.of(0xb2, 20, 5)]);
  });

  it("rejects a control change after close and never writes a held-back value", async () => {
    vi.useFakeTimers();
    const { output, connection } = harness();

    connection.sendControlChange(1, 74, 64);
    await vi.advanceTimersByTimeAsync(0);
    connection.sendControlChange(1, 74, 65);
    await connection.close();
    await vi.advanceTimersByTimeAsync(50);

    expect(output.sent).toEqual([Uint8Array.of(0xb0, 74, 64)]);
    expect(() => connection.sendControlChange(1, 74, 66)).toThrow(ConnectionClosedError);
    expect(output.sent).toHaveLength(1);
  });
});

describe("createConnection teardown", () => {
  it("completes both streams, unhooks the ports, and closes them", async () => {
    const { input, output, connection } = harness();
    let sysexCompleted = false;
    let ccCompleted = false;
    connection.sysex.subscribe({ complete: () => (sysexCompleted = true) });
    connection.cc.subscribe({ complete: () => (ccCompleted = true) });

    await connection.close();

    expect(sysexCompleted).toBe(true);
    expect(ccCompleted).toBe(true);
    expect(input.listenerCount()).toBe(0);
    expect(output.listenerCount()).toBe(0);
    expect(input.closeCalls).toBe(1);
    expect(output.closeCalls).toBe(1);
    expect(connection.isOpen).toBe(false);
  });

  it("stops delivering on both streams once closed", async () => {
    const { input, connection } = harness();
    const frames: Uint8Array[] = [];
    const ccs: CcEvent[] = [];
    connection.sysex.subscribe((frame) => frames.push(frame));
    connection.cc.subscribe((event) => ccs.push(event));

    await connection.close();
    input.receiveSysex(0xf0, 0x01, 0xf7);
    input.receiveControlChange(1, 74, 64);

    expect(frames).toEqual([]);
    expect(ccs).toEqual([]);
  });

  it("rejects sends after close with a typed error instead of writing to a dead port", async () => {
    const { output, connection } = harness();

    await connection.close();

    expect(() => connection.send(Uint8Array.of(0xb0, 0x4a, 0x40))).toThrow(ConnectionClosedError);
    expect(() => connection.sendCommand({ kind: "read-serial-number" })).toThrow(
      ConnectionClosedError,
    );
    expect(output.sent).toEqual([]);
  });

  it("tears down the same way when the device disconnects on its own", () => {
    const { input, connection } = harness();
    let sysexCompleted = false;
    let ccCompleted = false;
    connection.sysex.subscribe({ complete: () => (sysexCompleted = true) });
    connection.cc.subscribe({ complete: () => (ccCompleted = true) });

    input.disconnect();

    expect(sysexCompleted).toBe(true);
    expect(ccCompleted).toBe(true);
    expect(connection.isOpen).toBe(false);
    expect(input.listenerCount()).toBe(0);
    expect(() => connection.send(Uint8Array.of(0xf0, 0xf7))).toThrow(ConnectionClosedError);
  });

  it("closes idempotently, leaving the ports closed exactly once", async () => {
    const { input, output, connection } = harness();

    await connection.close();
    await connection.close();

    expect(input.closeCalls).toBe(1);
    expect(output.closeCalls).toBe(1);
    expect(connection.isOpen).toBe(false);
  });
});
