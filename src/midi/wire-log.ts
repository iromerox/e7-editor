// The committed form of a captured session: a provenance header, one line per event, a parse that refuses everything else, and the write that produces one.
export type WireDirection = "inbound" | "outbound";

export interface WireLogEvent {
  readonly atMs: number;
  readonly direction: WireDirection;
  readonly bytes: Uint8Array;
}

export interface WireLogHeader {
  readonly device: string;
  readonly input: string;
  readonly output: string;
  readonly date: string;
  readonly session: string;
}

export interface WireLogCapture {
  readonly header: WireLogHeader;
  readonly events: readonly WireLogEvent[];
}

export type WireLogErrorCode = "wire-log-format";

export abstract class WireLogError extends Error {
  abstract readonly code: WireLogErrorCode;
}

export class WireLogFormatError extends WireLogError {
  readonly code = "wire-log-format" as const;

  constructor(
    readonly fileName: string,
    readonly line: number,
    readonly fault: string,
  ) {
    super(`${fileName}:${line}: ${fault}`);
    this.name = "WireLogFormatError";
  }
}

export const WIRE_LOG_MAGIC = "e7 wire log v1";
export const OUTBOUND_ARROW = "-->";
export const INBOUND_ARROW = "<--";

export const WIRE_LOG_HEADER_FIELDS = ["device", "input", "output", "date", "session"] as const;

export const WIRE_LOG_TIME_DECIMALS = 1;

type HeaderField = (typeof WIRE_LOG_HEADER_FIELDS)[number];

const ARROWS = new Map<string, WireDirection>([
  [INBOUND_ARROW, "inbound"],
  [OUTBOUND_ARROW, "outbound"],
]);

const TIMESTAMP = /^\+(\d+(?:\.\d+)?)ms$/;
const HEX_BYTE = /^[0-9A-Fa-f]{2}$/;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const COMMENT = "#";

interface SourceLine {
  readonly number: number;
  readonly text: string;
}

interface HeaderValue {
  readonly line: number;
  readonly value: string;
}

type Fault = (line: number, fault: string) => WireLogFormatError;

function isHeaderField(key: string): key is HeaderField {
  return (WIRE_LOG_HEADER_FIELDS as readonly string[]).includes(key);
}

function isCalendarDate(value: string): boolean {
  if (!ISO_DATE.test(value)) {
    return false;
  }
  const parsed = Date.parse(value);
  return !Number.isNaN(parsed) && new Date(parsed).toISOString().startsWith(value);
}

function carriesContent(line: SourceLine): boolean {
  return line.text !== "" && !line.text.startsWith(COMMENT);
}

function readHeader(lines: readonly SourceLine[], from: number, faulty: Fault): WireLogHeader {
  const values = new Map<HeaderField, HeaderValue>();

  for (const line of lines) {
    const keyEnd = line.text.search(/\s/);
    const key = keyEnd === -1 ? line.text : line.text.slice(0, keyEnd);
    const value = keyEnd === -1 ? "" : line.text.slice(keyEnd).trim();
    if (!isHeaderField(key)) {
      throw faulty(line.number, `unknown header field "${key}"`);
    }
    if (values.has(key)) {
      throw faulty(line.number, `duplicate header field "${key}"`);
    }
    if (value === "") {
      throw faulty(line.number, `header field "${key}" has no value`);
    }
    values.set(key, { line: line.number, value });
  }

  const end = lines.at(-1)?.number ?? from;
  const field = (name: HeaderField): HeaderValue => {
    const held = values.get(name);
    if (held === undefined) {
      throw faulty(end, `the header names no ${name}`);
    }
    return held;
  };

  const date = field("date");
  if (!isCalendarDate(date.value)) {
    throw faulty(date.line, `date is not a calendar date as YYYY-MM-DD: "${date.value}"`);
  }

  return {
    device: field("device").value,
    input: field("input").value,
    output: field("output").value,
    date: date.value,
    session: field("session").value,
  };
}

function readEvent(line: SourceLine, after: number, faulty: Fault): WireLogEvent {
  const [stamp, arrow, ...hex] = line.text.split(/\s+/);

  const elapsed = stamp === undefined ? undefined : TIMESTAMP.exec(stamp)?.[1];
  if (elapsed === undefined) {
    throw faulty(
      line.number,
      `the line opens with "${stamp ?? ""}" rather than a time like +14.6ms`,
    );
  }
  const atMs = Number.parseFloat(elapsed);
  if (atMs < after) {
    throw faulty(line.number, `+${elapsed}ms is earlier than the +${after}ms above it`);
  }

  const direction = ARROWS.get(arrow ?? "");
  if (direction === undefined) {
    throw faulty(
      line.number,
      `the time is followed by "${arrow ?? ""}" rather than ${OUTBOUND_ARROW} or ${INBOUND_ARROW}`,
    );
  }

  if (hex.length === 0) {
    throw faulty(line.number, "the line carries no bytes");
  }
  const bytes = Uint8Array.from(hex, (token) => {
    if (!HEX_BYTE.test(token)) {
      throw faulty(line.number, `"${token}" is not a two-digit hex byte`);
    }
    return Number.parseInt(token, 16);
  });

  return { atMs, direction, bytes };
}

export function parseWireLog(fileName: string, text: string): WireLogCapture {
  const faulty: Fault = (line, fault) => new WireLogFormatError(fileName, line, fault);
  const lines: readonly SourceLine[] = text
    .split("\n")
    .map((raw, index) => ({ number: index + 1, text: raw.trim() }));

  const [magic, ...rest] = lines;
  if (magic === undefined || magic.text !== WIRE_LOG_MAGIC) {
    throw faulty(1, `the first line is not "${WIRE_LOG_MAGIC}"`);
  }

  const blank = rest.findIndex((line) => line.text === "");
  const header = readHeader(
    (blank === -1 ? rest : rest.slice(0, blank)).filter(carriesContent),
    magic.number,
    faulty,
  );

  const events: WireLogEvent[] = [];
  for (const line of (blank === -1 ? [] : rest.slice(blank + 1)).filter(carriesContent)) {
    events.push(readEvent(line, events.at(-1)?.atMs ?? 0, faulty));
  }
  if (events.length === 0) {
    throw faulty(lines.length, "the capture holds no events");
  }

  return { header, events };
}

const HEADER_KEY_WIDTH = 9;
const TIME_WIDTH = 10;
const HEX_RADIX = 16;
const HEX_BYTE_WIDTH = 2;

export function wireLogTime(atMs: number): number {
  return Number.parseFloat(atMs.toFixed(WIRE_LOG_TIME_DECIMALS));
}

function writeEvent(event: WireLogEvent): string {
  const at = `+${event.atMs.toFixed(WIRE_LOG_TIME_DECIMALS)}ms`.padStart(TIME_WIDTH);
  const arrow = event.direction === "inbound" ? INBOUND_ARROW : OUTBOUND_ARROW;
  const hex = Array.from(event.bytes, (byte) =>
    byte.toString(HEX_RADIX).toUpperCase().padStart(HEX_BYTE_WIDTH, "0"),
  ).join(" ");
  return `${at}  ${arrow}  ${hex}`;
}

export function formatWireLog(capture: WireLogCapture, notes: readonly string[] = []): string {
  return [
    WIRE_LOG_MAGIC,
    ...WIRE_LOG_HEADER_FIELDS.map(
      (field) => `${field.padEnd(HEADER_KEY_WIDTH)}${capture.header[field]}`,
    ),
    "",
    ...notes.map((note) => `${COMMENT} ${note}`),
    ...capture.events.map(writeEvent),
    "",
  ].join("\n");
}
