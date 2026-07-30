// Drives the transport end to end against a real e7 and records what the wire actually carried.
import type { Connection, RespondingCommand, ResponseFor, SysExReassemblyStats } from "../midi";
import { requestResponse } from "../midi";
import {
  NAME_BYTES,
  NAME_OFFSET,
  PresetSlot,
  ProtocolError,
  READ_MEMORY_BLOCK_BYTES,
  SINGLE_PRESET_BYTES,
  decodeMemoryDataResponse,
  decodeSerialNumberResponse,
  encodeCommand,
} from "../protocol";

export const READS_PER_PRESET = SINGLE_PRESET_BYTES / READ_MEMORY_BLOCK_BYTES;

export interface WireFrame {
  readonly atMs: number;
  readonly bytes: Uint8Array;
  readonly parsesAsResponse: boolean;
}

export interface SmokeTestStep {
  readonly label: string;
  readonly request: Uint8Array;
  readonly frames: readonly WireFrame[];
  readonly elapsedMs: number;
}

export interface SmokeTestReport {
  readonly inputName: string;
  readonly outputName: string;
  readonly serialNumber: number;
  readonly slot: PresetSlot;
  readonly presetBytes: Uint8Array;
  readonly presetName: string;
  readonly steps: readonly SmokeTestStep[];
  readonly unparsedFrames: number;
  readonly stepsWithUnparsedFrame: number;
  readonly reassembly: SysExReassemblyStats;
}

interface StepResult<Response> {
  readonly response: Response;
  readonly step: SmokeTestStep;
}

type ResponseDecoder = (frame: Uint8Array) => unknown;

const PRINTABLE_MIN = 0x20;
const PRINTABLE_MAX = 0x7e;
const UNPRINTABLE = "·";

export function readablePresetName(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) =>
    byte >= PRINTABLE_MIN && byte <= PRINTABLE_MAX ? String.fromCharCode(byte) : UNPRINTABLE,
  )
    .join("")
    .trimEnd();
}

export function formatHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).toUpperCase().padStart(2, "0")).join(" ");
}

export function formatSmokeTestReport(report: SmokeTestReport): string {
  const { bank, group, slot } = report.slot;
  const lines = [
    `input            ${report.inputName}`,
    `output           ${report.outputName}`,
    `serial number    ${report.serialNumber}`,
    `preset ${bank}.${group}.${slot}     "${report.presetName}"`,
    "",
    `unparsed frames  ${report.unparsedFrames} across ${report.stepsWithUnparsedFrame} of ${report.steps.length} steps`,
    `fragmented       ${report.reassembly.fragmentedFrames}`,
    `discarded        ${report.reassembly.discardedPartials}`,
    `pending bytes    ${report.reassembly.pendingBytes}`,
    "",
  ];

  for (const step of report.steps) {
    lines.push(`${step.label}  (${step.elapsedMs.toFixed(1)}ms)`);
    lines.push(`  --> ${formatHex(step.request)}`);
    for (const frame of step.frames) {
      const verdict = frame.parsesAsResponse ? "response" : "unparsed";
      lines.push(`  <-- +${frame.atMs.toFixed(1)}ms ${verdict}  ${formatHex(frame.bytes)}`);
    }
  }

  lines.push("");
  lines.push(`preset bytes     ${formatHex(report.presetBytes)}`);
  return lines.join("\n");
}

function parsesAs(decode: ResponseDecoder, frame: Uint8Array): boolean {
  try {
    decode(frame);
    return true;
  } catch (error) {
    if (error instanceof ProtocolError) {
      return false;
    }
    throw error;
  }
}

async function runStep<Command extends RespondingCommand>(
  connection: Connection,
  command: Command,
  label: string,
  decode: ResponseDecoder,
  now: () => number,
): Promise<StepResult<ResponseFor<Command>>> {
  const frames: WireFrame[] = [];
  const startedAt = now();
  const subscription = connection.sysexMonitor.subscribe((bytes) => {
    frames.push({ atMs: now() - startedAt, bytes, parsesAsResponse: parsesAs(decode, bytes) });
  });

  try {
    const response = await requestResponse(connection, command);
    return {
      response,
      step: { label, request: encodeCommand(command), frames, elapsedMs: now() - startedAt },
    };
  } finally {
    subscription.unsubscribe();
  }
}

function addressLabel(address: number): string {
  return `0x${address.toString(16).toUpperCase().padStart(6, "0")}`;
}

export async function runHardwareSmokeTest(
  connection: Connection,
  slot: PresetSlot = new PresetSlot(1, 1, 1),
  now: () => number = () => performance.now(),
): Promise<SmokeTestReport> {
  const steps: SmokeTestStep[] = [];

  const serial = await runStep(
    connection,
    { kind: "read-serial-number" },
    "Read Serial Number",
    decodeSerialNumberResponse,
    now,
  );
  steps.push(serial.step);

  const presetBytes = new Uint8Array(SINGLE_PRESET_BYTES);
  for (let block = 0; block < READS_PER_PRESET; block += 1) {
    const address = slot.byteAddress() + block * READ_MEMORY_BLOCK_BYTES;
    const read = await runStep(
      connection,
      { kind: "read-memory", address },
      `Read Memory ${addressLabel(address)}`,
      decodeMemoryDataResponse,
      now,
    );
    steps.push(read.step);
    if (read.response.data.length !== READ_MEMORY_BLOCK_BYTES) {
      throw new Error(
        `${addressLabel(address)} returned ${read.response.data.length} bytes, expected ${READ_MEMORY_BLOCK_BYTES}`,
      );
    }
    presetBytes.set(read.response.data, block * READ_MEMORY_BLOCK_BYTES);
  }

  const unparsed = steps.map((step) => step.frames.filter((frame) => !frame.parsesAsResponse));

  return {
    inputName: connection.inputName,
    outputName: connection.outputName,
    serialNumber: serial.response.serialNumber,
    slot,
    presetBytes,
    presetName: readablePresetName(presetBytes.subarray(NAME_OFFSET, NAME_OFFSET + NAME_BYTES)),
    steps,
    unparsedFrames: unparsed.reduce((total, frames) => total + frames.length, 0),
    stepsWithUnparsedFrame: unparsed.filter((frames) => frames.length > 0).length,
    reassembly: {
      pendingBytes: connection.reassembly.pendingBytes,
      fragmentedFrames: connection.reassembly.fragmentedFrames,
      discardedPartials: connection.reassembly.discardedPartials,
    },
  };
}
