import type { Input, Output } from "webmidi";
import type { Connection } from "../midi";
import { describe, expect, it } from "vitest";
import { createConnection } from "../midi";
import { PresetSlot, SINGLE_PRESET_BYTES, decodeCommand, encodeResponse } from "../protocol";
import {
  READS_PER_PRESET,
  formatSmokeTestReport,
  readablePresetName,
  runHardwareSmokeTest,
} from "./hardware-smoke-test";

type PortListener = (event: unknown) => void;

const SERIAL_NUMBER = 361;
const PRESET_NAME = "Opening   Pad";
const PREVIEW_FRAME = Uint8Array.of(0xf0, 0x0f, 0xf7);

function presetMemory(): Uint8Array {
  const bytes = new Uint8Array(SINGLE_PRESET_BYTES).fill(0x20);
  for (const [index, character] of [...PRESET_NAME].entries()) {
    bytes[index] = character.charCodeAt(0);
  }
  bytes[64] = 0x7f;
  return bytes;
}

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

  close(): Promise<void> {
    return Promise.resolve();
  }
}

class FakeInput extends FakePort {
  readonly name = "GS-e7";
}

class FakeOutput extends FakePort {
  readonly name = "GS-e7";

  constructor(
    private readonly input: FakeInput,
    private readonly memory: Uint8Array,
    private readonly baseAddress: number,
    private readonly sendsPreviewFrame: boolean,
  ) {
    super();
  }

  send(bytes: Uint8Array): void {
    const command = decodeCommand(bytes);
    if (command.kind === "read-serial-number") {
      this.reply(encodeResponse({ kind: "serial-number", serialNumber: SERIAL_NUMBER }));
      return;
    }
    if (command.kind === "read-memory") {
      if (this.sendsPreviewFrame) {
        this.reply(PREVIEW_FRAME);
      }
      const offset = command.address - this.baseAddress;
      const data = this.memory.slice(offset, offset + 16);
      this.reply(encodeResponse({ kind: "memory-data", data }));
    }
  }

  private reply(frame: Uint8Array): void {
    this.input.emit("sysex", { message: { rawData: frame } });
  }
}

function connect(sendsPreviewFrame: boolean, slot = new PresetSlot(1, 1, 1)): Connection {
  const input = new FakeInput();
  const output = new FakeOutput(input, presetMemory(), slot.byteAddress(), sendsPreviewFrame);
  return createConnection(input as unknown as Input, output as unknown as Output);
}

function steadyClock(): () => number {
  let tick = 0;
  return () => {
    tick += 1;
    return tick;
  };
}

describe("runHardwareSmokeTest", () => {
  it("reads the serial number and a whole preset in 16-byte blocks", async () => {
    const report = await runHardwareSmokeTest(
      connect(false),
      new PresetSlot(1, 1, 1),
      steadyClock(),
    );

    expect(report.serialNumber).toBe(SERIAL_NUMBER);
    expect(report.presetBytes).toEqual(presetMemory());
    expect(report.presetName).toBe(PRESET_NAME);
    expect(report.steps).toHaveLength(1 + READS_PER_PRESET);
    expect(report.steps.slice(1).map((step) => step.label)).toEqual([
      "Read Memory 0x000000",
      "Read Memory 0x000010",
      "Read Memory 0x000020",
      "Read Memory 0x000030",
      "Read Memory 0x000040",
      "Read Memory 0x000050",
      "Read Memory 0x000060",
      "Read Memory 0x000070",
    ]);
  });

  it("reads the addresses of the requested slot, not always the first preset", async () => {
    const slot = new PresetSlot(2, 3, 4);
    const report = await runHardwareSmokeTest(connect(false, slot), slot, steadyClock());

    expect(slot.byteAddress()).toBe(0x2980);
    expect(report.steps[1]?.label).toBe("Read Memory 0x002980");
    expect(report.steps.at(-1)?.label).toBe("Read Memory 0x0029F0");
    expect(report.presetName).toBe(PRESET_NAME);
  });

  it("records the preview frame that precedes each Read Memory response", async () => {
    const report = await runHardwareSmokeTest(
      connect(true),
      new PresetSlot(1, 1, 1),
      steadyClock(),
    );

    expect(report.serialNumber).toBe(SERIAL_NUMBER);
    expect(report.presetName).toBe(PRESET_NAME);
    expect(report.unparsedFrames).toBe(READS_PER_PRESET);
    expect(report.stepsWithUnparsedFrame).toBe(READS_PER_PRESET);

    const firstRead = report.steps[1];
    expect(firstRead?.frames.map((frame) => frame.parsesAsResponse)).toEqual([false, true]);
    expect(firstRead?.frames[0]?.bytes).toEqual(PREVIEW_FRAME);
  });

  it("reports a clean run as having seen no unparsed frames at all", async () => {
    const report = await runHardwareSmokeTest(
      connect(false),
      new PresetSlot(1, 1, 1),
      steadyClock(),
    );

    expect(report.unparsedFrames).toBe(0);
    expect(report.stepsWithUnparsedFrame).toBe(0);
    expect(report.reassembly).toEqual({
      pendingBytes: 0,
      fragmentedFrames: 0,
      discardedPartials: 0,
    });
  });
});

describe("readablePresetName", () => {
  it("trims the space padding the device stores names with", () => {
    expect(readablePresetName(Uint8Array.from([0x50, 0x61, 0x64, 0x20, 0x20]))).toBe("Pad");
  });

  it("shows a byte outside printable ASCII rather than emitting a control character", () => {
    expect(readablePresetName(Uint8Array.from([0x50, 0x00, 0xff, 0x64]))).toBe("P··d");
  });
});

describe("formatSmokeTestReport", () => {
  it("writes every frame as pasteable hex, marking which one parsed", async () => {
    const report = await runHardwareSmokeTest(
      connect(true),
      new PresetSlot(1, 1, 1),
      steadyClock(),
    );
    const log = formatSmokeTestReport(report);

    expect(log).toContain(`serial number    ${SERIAL_NUMBER}`);
    expect(log).toContain(`preset 1.1.1     "${PRESET_NAME}"`);
    expect(log).toContain("--> F0 00 21 62 01 10 20 F7");
    expect(log).toContain("unparsed  F0 0F F7");
    expect(log).toContain(`unparsed frames  ${READS_PER_PRESET} across ${READS_PER_PRESET} of 9`);
  });
});
