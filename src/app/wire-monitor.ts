// A running log of every SysEx frame and control change crossing the wire, in arrival order, bounded, keeping what it cannot read, and naming the command a frame arrived after.
import type { Connection, SysExReassemblyStats, WireDirection, WireLogEvent } from "../midi";
import type { CcField, SysExCommandKind, SysExResponse } from "../protocol";
import { DEFAULT_RESPONSE_TIMEOUT_MS } from "../midi";
import {
  ProtocolError,
  ccToField,
  decodeAutotuningStatusResponse,
  decodeCommand,
  decodeConfigurationResponse,
  decodeMemoryDataResponse,
  decodeSerialNumberResponse,
  encodeControlChange,
} from "../protocol";
import { formatHex } from "./hex";

export const WIRE_LOG_CAPACITY = 2000;

export type SysExResponseKind = SysExResponse["kind"];

export type SysExReading =
  | { readonly kind: "command"; readonly command: SysExCommandKind }
  | { readonly kind: "response"; readonly reads: readonly SysExResponseKind[] }
  | { readonly kind: "unparsed" };

export interface SysExWireEvent extends WireLogEvent {
  readonly kind: "sysex";
  readonly reading: SysExReading;
}

export interface ControlChangeMessage {
  readonly channel: number;
  readonly controller: number;
  readonly value: number;
}

export interface ControlChangeWireEvent extends WireLogEvent {
  readonly kind: "control-change";
  readonly channel: number;
  readonly controller: number;
  readonly value: number;
  readonly field: CcField | undefined;
}

export type WireEvent = SysExWireEvent | ControlChangeWireEvent;

export interface WireLog {
  readonly events: readonly WireEvent[];
  readonly dropped: number;
  readonly capacity: number;
}

export interface WireMonitorReport {
  readonly inputName: string;
  readonly outputName: string;
  readonly log: WireLog;
  readonly reassembly: SysExReassemblyStats;
}

export interface WireMonitorSubscription {
  readonly elapsedMs: () => number;
  unsubscribe(): void;
}

export interface WireReply {
  readonly request: SysExWireEvent;
  readonly response: SysExWireEvent;
  readonly elapsedMs: number;
}

type ResponseDecoder = (frame: Uint8Array) => SysExResponse;

const RESPONSE_DECODERS: readonly ResponseDecoder[] = [
  decodeSerialNumberResponse,
  decodeConfigurationResponse,
  decodeAutotuningStatusResponse,
  decodeMemoryDataResponse,
];

const ANNOTATION_WIDTH = 46;

function attempt<Read>(decode: () => Read): Read | undefined {
  try {
    return decode();
  } catch (error) {
    if (error instanceof ProtocolError) {
      return undefined;
    }
    throw error;
  }
}

export function readSysExFrame(bytes: Uint8Array): SysExReading {
  const command = attempt(() => decodeCommand(bytes));
  if (command !== undefined) {
    return { kind: "command", command: command.kind };
  }
  const reads: SysExResponseKind[] = [];
  for (const decode of RESPONSE_DECODERS) {
    const response = attempt(() => decode(bytes));
    if (response !== undefined) {
      reads.push(response.kind);
    }
  }
  return reads.length > 0 ? { kind: "response", reads } : { kind: "unparsed" };
}

export function sysExEvent(
  direction: WireDirection,
  bytes: Uint8Array,
  atMs: number,
): SysExWireEvent {
  return { kind: "sysex", atMs, direction, bytes, reading: readSysExFrame(bytes) };
}

export function controlChangeEvent(
  direction: WireDirection,
  message: ControlChangeMessage,
  atMs: number,
): ControlChangeWireEvent {
  return {
    kind: "control-change",
    atMs,
    direction,
    bytes: encodeControlChange(message.channel, message.controller, message.value),
    channel: message.channel,
    controller: message.controller,
    value: message.value,
    field: ccToField(message.controller),
  };
}

export function emptyWireLog(capacity: number = WIRE_LOG_CAPACITY): WireLog {
  return { events: [], dropped: 0, capacity };
}

export function recorded(log: WireLog, event: WireEvent): WireLog {
  const events = [...log.events, event];
  const overflow = Math.max(0, events.length - log.capacity);
  return {
    events: events.slice(overflow),
    dropped: log.dropped + overflow,
    capacity: log.capacity,
  };
}

export function monitorWire(
  connection: Connection,
  record: (event: WireEvent) => void,
  now: () => number = () => performance.now(),
): WireMonitorSubscription {
  const startedAt = now();
  const elapsedMs = (): number => now() - startedAt;
  const frames = connection.sysexMonitor.subscribe((bytes) => {
    record(sysExEvent("inbound", bytes, elapsedMs()));
  });
  const controlChanges = connection.cc.subscribe((event) => {
    record(controlChangeEvent("inbound", event, elapsedMs()));
  });

  return {
    elapsedMs,
    unsubscribe(): void {
      frames.unsubscribe();
      controlChanges.unsubscribe();
    },
  };
}

export function replies(
  log: WireLog,
  windowMs: number = DEFAULT_RESPONSE_TIMEOUT_MS,
): readonly WireReply[] {
  const answered: WireReply[] = [];
  let request: SysExWireEvent | undefined;

  for (const event of log.events) {
    if (event.kind !== "sysex") {
      continue;
    }
    if (event.direction === "outbound") {
      request = event;
      continue;
    }
    if (request === undefined) {
      continue;
    }
    const elapsedMs = event.atMs - request.atMs;
    if (elapsedMs <= windowMs) {
      answered.push({ request, response: event, elapsedMs });
    }
  }

  return answered;
}

function annotate(event: WireEvent): string {
  if (event.kind === "control-change") {
    return `ch${event.channel} CC ${event.controller} = ${event.value} ${event.field ?? "unmapped"}`;
  }
  switch (event.reading.kind) {
    case "command":
      return `command ${event.reading.command}`;
    case "response":
      return `response ${event.reading.reads.join(" | ")}`;
    case "unparsed":
      return "unparsed";
  }
}

function requestName(request: SysExWireEvent): string {
  return request.reading.kind === "command" ? request.reading.command : "an unparsed frame";
}

function answering(reply: WireReply | undefined): string {
  if (reply === undefined) {
    return "";
  }
  return ` (${reply.elapsedMs.toFixed(1)}ms after ${requestName(reply.request)})`;
}

export function formatWireEvent(event: WireEvent, seq: number, reply?: WireReply): string {
  const arrow = event.direction === "inbound" ? "<--" : "-->";
  const at = `+${event.atMs.toFixed(1)}ms`;
  return [
    seq.toString().padStart(6),
    arrow,
    at.padStart(12),
    `${annotate(event)}${answering(reply)}`.padEnd(ANNOTATION_WIDTH),
    formatHex(event.bytes),
  ].join("  ");
}

export function formatWireMonitorReport(report: WireMonitorReport): string {
  const { log } = report;
  const lines = [
    `input            ${report.inputName}`,
    `output           ${report.outputName}`,
    `events           ${log.events.length} kept of ${log.capacity} max, ${log.dropped} dropped`,
    `fragmented       ${report.reassembly.fragmentedFrames}`,
    `discarded        ${report.reassembly.discardedPartials}`,
    `pending bytes    ${report.reassembly.pendingBytes}`,
    "",
  ];

  const answered = new Map<WireEvent, WireReply>(
    replies(log).map((reply) => [reply.response, reply]),
  );
  for (const [index, event] of log.events.entries()) {
    lines.push(formatWireEvent(event, log.dropped + index + 1, answered.get(event)));
  }

  return lines.join("\n");
}
