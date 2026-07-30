import type { SysExCommand } from "../protocol";
import type { CcEvent, Connection } from "./connection";
import { Observable, Subject } from "rxjs";
import { describe, expect, it } from "vitest";
import { encodeCommand } from "../protocol";
import { specBytes } from "../test-hex";
import {
  ConnectionClosedError,
  NoResponseExpectedError,
  ResponseTimeoutError,
  SysExStreamBusyError,
} from "./errors";
import { drawsResponse, requestResponse } from "./request-response";

const SERIAL_NUMBER_RESPONSE = specBytes("F0 49 00 F7");

const MEMORY_RESPONSE = specBytes(`
  F0 0F 04 00 07 05 06 0E 06 09 06 0E 06 07 06 00 02 00 02 00 02
  00 05 01 06 04 06 00 02 00 02 00 02 F7
`);

const CONFIGURATION_RESPONSE = specBytes("F0 00 00 07 00 F7");

const LOCK_ECHO_RESPONSE = specBytes("F0 01 00 F7");

const PREVIEW_FRAME = specBytes("F0 0F 04 00 07 05 06 0E 06 09 06 0E F7");

interface Harness {
  readonly connection: Connection;
  readonly sent: Uint8Array[];
  receive(frame: Uint8Array): void;
  disconnect(): void;
  respondWhenSent(frame: Uint8Array): void;
  hasSysexConsumer(): boolean;
}

function harness(): Harness {
  const frames = new Subject<Uint8Array>();
  const sent: Uint8Array[] = [];
  let open = true;
  let onSend: ((frame: Uint8Array) => void) | undefined;
  let consumed = false;

  const send = (bytes: Uint8Array): void => {
    if (!open) {
      throw new ConnectionClosedError("e7 IN", "e7 OUT");
    }
    sent.push(bytes);
    onSend?.(bytes);
  };

  const connection: Connection = {
    inputName: "e7 IN",
    outputName: "e7 OUT",
    sysex: new Observable<Uint8Array>((subscriber) => {
      if (consumed) {
        subscriber.error(new SysExStreamBusyError("SysEx frame"));
        return;
      }
      consumed = true;
      const subscription = frames.subscribe(subscriber);
      return () => {
        consumed = false;
        subscription.unsubscribe();
      };
    }),
    cc: new Subject<CcEvent>().asObservable(),
    get isOpen() {
      return open;
    },
    reassembly: { pendingBytes: 0, fragmentedFrames: 0, discardedPartials: 0 },
    send,
    sendCommand(command: SysExCommand): void {
      send(encodeCommand(command));
    },
    sendControlChange(channel: number, controller: number, value: number): void {
      send(Uint8Array.of(0xb0 | (channel - 1), controller, value));
    },
    close(): Promise<void> {
      open = false;
      frames.complete();
      return Promise.resolve();
    },
  };

  return {
    connection,
    sent,
    receive: (frame) => frames.next(frame),
    disconnect: () => {
      open = false;
      frames.complete();
    },
    respondWhenSent: (frame) => {
      onSend = () => frames.next(frame);
    },
    hasSysexConsumer: () => consumed,
  };
}

describe("requestResponse preview-frame tolerance", () => {
  it("keeps waiting through the device's malformed preview frame and resolves with the real response", async () => {
    const { connection, receive } = harness();
    const response = requestResponse(connection, { kind: "read-memory", address: 0x00 });

    receive(PREVIEW_FRAME);
    receive(MEMORY_RESPONSE);

    await expect(response).resolves.toEqual({
      kind: "memory-data",
      data: Uint8Array.from("Opening   Pad   ", (character) => character.charCodeAt(0)),
    });
  });

  it("keeps waiting through a frame shaped like some other command's response", async () => {
    const { connection, receive } = harness();
    const response = requestResponse(connection, { kind: "read-configuration" });

    receive(SERIAL_NUMBER_RESPONSE);
    receive(CONFIGURATION_RESPONSE);

    await expect(response).resolves.toEqual({
      kind: "configuration",
      rxChannel: 0,
      txChannel: 0,
      filterMode: 7,
      softThruMode: 0,
    });
  });

  it("reports how many frames it had to ignore when none of them ever parsed", async () => {
    const { connection, receive } = harness();
    const response = requestResponse(connection, { kind: "read-memory", address: 0x00 }, 20);

    receive(PREVIEW_FRAME);
    receive(PREVIEW_FRAME);

    await expect(response).rejects.toMatchObject({
      code: "response-timeout",
      command: "read-memory",
      timeoutMs: 20,
      unparsedFrames: 2,
    });
  });
});

describe("requestResponse exchange", () => {
  it("resolves each responding command with its own decoded response type", async () => {
    const serial = harness();
    serial.respondWhenSent(SERIAL_NUMBER_RESPONSE);
    await expect(
      requestResponse(serial.connection, { kind: "read-serial-number" }),
    ).resolves.toEqual({ kind: "serial-number", serialNumber: 73 });

    const autotuning = harness();
    autotuning.respondWhenSent(specBytes("F0 00 0F 0F 0F 0F 0F 0F 0F F7"));
    await expect(
      requestResponse(autotuning.connection, { kind: "read-autotuning-status" }),
    ).resolves.toEqual({
      kind: "autotuning-status",
      on: false,
      voices: Uint8Array.of(0x0f, 0x0f, 0x0f, 0x0f, 0x0f, 0x0f, 0x0f),
    });

    const lock = harness();
    lock.respondWhenSent(LOCK_ECHO_RESPONSE);
    await expect(
      requestResponse(lock.connection, {
        kind: "write-memory",
        address: 0x7f,
        data: Uint8Array.of(0x01),
      }),
    ).resolves.toEqual({ kind: "memory-data", data: Uint8Array.of(0x01) });
  });

  it("sends the command only once it is already listening, so an instant response is not missed", async () => {
    const { connection, sent, respondWhenSent } = harness();
    respondWhenSent(SERIAL_NUMBER_RESPONSE);

    const serialNumber: number = (await requestResponse(connection, { kind: "read-serial-number" }))
      .serialNumber;

    expect(serialNumber).toBe(73);
    expect(sent).toEqual([encodeCommand({ kind: "read-serial-number" })]);
  });

  it("narrows the resolved response to the one the sent command draws", async () => {
    const { connection, respondWhenSent } = harness();
    respondWhenSent(MEMORY_RESPONSE);

    const data: Uint8Array = (
      await requestResponse(connection, { kind: "read-memory", address: 0x00 })
    ).data;

    expect(data).toHaveLength(16);
  });

  it("ignores frames that arrived before the request was made", async () => {
    const { connection, receive } = harness();

    receive(SERIAL_NUMBER_RESPONSE);
    const response = requestResponse(connection, { kind: "read-serial-number" }, 20);

    await expect(response).rejects.toBeInstanceOf(ResponseTimeoutError);
  });

  it("releases the SysEx stream once the exchange settles, so the next request can own it", async () => {
    const { connection, receive, hasSysexConsumer } = harness();

    const resolved = requestResponse(connection, { kind: "read-serial-number" });
    expect(hasSysexConsumer()).toBe(true);
    receive(SERIAL_NUMBER_RESPONSE);
    await resolved;
    expect(hasSysexConsumer()).toBe(false);

    await expect(
      requestResponse(connection, { kind: "read-serial-number" }, 20),
    ).rejects.toBeInstanceOf(ResponseTimeoutError);
    expect(hasSysexConsumer()).toBe(false);
  });
});

describe("requestResponse failure modes", () => {
  it("rejects with a typed timeout rather than hanging when the device stays silent", async () => {
    const { connection } = harness();

    await expect(
      requestResponse(connection, { kind: "read-memory", address: 0x00 }, 20),
    ).rejects.toBeInstanceOf(ResponseTimeoutError);
  });

  it("rejects with a closed-connection error when the device goes away mid-exchange", async () => {
    const { connection, disconnect } = harness();
    const response = requestResponse(connection, { kind: "read-serial-number" });

    disconnect();

    await expect(response).rejects.toBeInstanceOf(ConnectionClosedError);
  });

  it("rejects when the connection is already closed instead of waiting out the timeout", async () => {
    const { connection } = harness();
    await connection.close();

    await expect(
      requestResponse(connection, { kind: "read-serial-number" }),
    ).rejects.toBeInstanceOf(ConnectionClosedError);
  });

  it("rejects when another consumer already owns the SysEx stream", async () => {
    const { connection } = harness();
    connection.sysex.subscribe(() => {});

    await expect(
      requestResponse(connection, { kind: "read-serial-number" }),
    ).rejects.toBeInstanceOf(SysExStreamBusyError);
  });
});

describe("requestResponse command eligibility", () => {
  it("classifies every command by whether the device documents a response for it", () => {
    expect(
      (
        [
          "read-serial-number",
          "read-memory",
          "write-memory",
          "read-configuration",
          "read-autotuning-status",
        ] as const
      ).every(drawsResponse),
    ).toBe(true);
    expect(
      (["all-leds-on", "factory-reset", "initialize-preset", "write-configuration"] as const).some(
        drawsResponse,
      ),
    ).toBe(false);
  });

  it("throws a programmer error for a command with no documented response, rather than timing out", () => {
    const { connection, sent } = harness();
    const commands: SysExCommand[] = [
      { kind: "all-leds-on" },
      { kind: "factory-reset" },
      { kind: "initialize-preset" },
      {
        kind: "write-configuration",
        configuration: {
          rxChannel: 0,
          txChannel: 0,
          filterMode: 7,
          softThruMode: 0,
          clockSource: 0,
          mpeEnable: 0,
        },
      },
    ];

    for (const command of commands) {
      expect(() =>
        requestResponse(connection, command as Parameters<typeof requestResponse>[1]),
      ).toThrow(NoResponseExpectedError);
    }
    expect(sent).toEqual([]);
  });
});
