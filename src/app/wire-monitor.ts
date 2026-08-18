// A running log of every SysEx frame and control change crossing the wire, in arrival order, bounded, and keeping what it cannot read.
import type { CcEvent, Connection, SysExReassemblyStats } from "../midi";
import type { CcField, SysExCommandKind, SysExResponse } from "../protocol";
import {
  ProtocolError,
  ccToFields,
  decodeAutotuningStatusResponse,
  decodeCommand,
  decodeConfigurationResponse,
  decodeMemoryDataResponse,
  decodeSerialNumberResponse,
} from "../protocol";
import { formatHex } from "./hex";

export const WIRE_LOG_CAPACITY = 2000;

export type WireDirection = "inbound" | "outbound";

export type SysExResponseKind = SysExResponse["kind"];

export type SysExReading =
  | { readonly kind: "command"; readonly command: SysExCommandKind }
  | { readonly kind: "response"; readonly reads: readonly SysExResponseKind[] }
  | { readonly kind: "unparsed" };

interface WireEventFields {
  readonly atMs: number;
  readonly direction: WireDirection;
  readonly bytes: Uint8Array;
}

export interface SysExWireEvent extends WireEventFields {
  readonly kind: "sysex";
  readonly reading: SysExReading;
}

export interface ControlChangeWireEvent extends WireEventFields {
  readonly kind: "control-change";
  readonly channel: number;
  readonly controller: number;
  readonly value: number;
  readonly fields: readonly CcField[];
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
  unsubscribe(): void;
}

type ResponseDecoder = (frame: Uint8Array) => SysExResponse;

const RESPONSE_DECODERS: readonly ResponseDecoder[] = [
  decodeSerialNumberResponse,
  decodeConfigurationResponse,
  decodeAutotuningStatusResponse,
  decodeMemoryDataResponse,
];

const CONTROL_CHANGE_STATUS = 0xb0;

const ANNOTATION_WIDTH = 32;

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
  event: CcEvent,
  atMs: number,
): ControlChangeWireEvent {
  return {
    kind: "control-change",
    atMs,
    direction,
    bytes: Uint8Array.of(
      CONTROL_CHANGE_STATUS | (event.channel - 1),
      event.controller,
      event.value,
    ),
    channel: event.channel,
    controller: event.controller,
    value: event.value,
    fields: ccToFields(event.controller),
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
  const frames = connection.sysexMonitor.subscribe((bytes) => {
    record(sysExEvent("inbound", bytes, now() - startedAt));
  });
  const controlChanges = connection.cc.subscribe((event) => {
    record(controlChangeEvent("inbound", event, now() - startedAt));
  });

  return {
    unsubscribe(): void {
      frames.unsubscribe();
      controlChanges.unsubscribe();
    },
  };
}

function annotate(event: WireEvent): string {
  if (event.kind === "control-change") {
    const fields = event.fields.length === 0 ? "unmapped" : event.fields.join(" ");
    return `ch${event.channel} CC ${event.controller} = ${event.value} ${fields}`;
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

export function formatWireEvent(event: WireEvent, seq: number): string {
  const arrow = event.direction === "inbound" ? "<--" : "-->";
  const at = `+${event.atMs.toFixed(1)}ms`;
  return [
    seq.toString().padStart(6),
    arrow,
    at.padStart(12),
    annotate(event).padEnd(ANNOTATION_WIDTH),
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

  for (const [index, event] of log.events.entries()) {
    lines.push(formatWireEvent(event, log.dropped + index + 1));
  }

  return lines.join("\n");
}
