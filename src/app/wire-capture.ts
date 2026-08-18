// Getting a session out of the browser: the provenance an operator fills in while the instrument is still plugged in, the name the file is suggested under, and the account the console gives of a save that wrote nothing.
import type { WireLogCapture, WireLogHeader } from "../midi";
import type { FilePickerType } from "../store";
import type { WireLog } from "./wire-monitor";
import { WIRE_LOG_HEADER_FIELDS, formatWireLog, wireLogTime } from "../midi";
import { saveFile } from "../store";

export const WIRE_LOG_FILE_EXTENSION = ".wire";
export const WIRE_LOG_MEDIA_TYPE = "text/plain";

export const CAPTURE_NOTE =
  "Save writes the log below to a .wire file the test suite can load: this header, then one line per event. Fill it in before the instrument is unplugged — what the session was doing is the part nobody can reconstruct from the bytes afterwards.";

export const NOTHING_WRITTEN = "The save was dismissed, so no file was written.";

export const EMPTY_LOG_REFUSAL = "The log holds no events, so there is nothing to save.";

export function blankHeaderRefusal(fields: readonly string[]): string {
  return `The capture names no ${fields.join(" and no ")}, and a committed one is only worth reading with all five.`;
}

export function savedCaptureNote(fileName: string, events: number): string {
  return `Saved ${events === 1 ? "1 event" : `${events} events`} as ${fileName}.`;
}

export function droppedCaptureNote(kept: number, dropped: number): string {
  return `the console kept the most recent ${kept} events and dropped ${dropped} older ones before this was saved`;
}

export type CaptureSave =
  | { readonly status: "written"; readonly fileName: string; readonly events: number }
  | { readonly status: "dismissed" }
  | { readonly status: "refused"; readonly reason: string };

const DATE_PART_WIDTH = 2;

export function captureDate(now: Date = new Date()): string {
  const part = (value: number): string => value.toString().padStart(DATE_PART_WIDTH, "0");
  return `${now.getFullYear()}-${part(now.getMonth() + 1)}-${part(now.getDate())}`;
}

export function emptyCaptureHeader(date: string = captureDate()): WireLogHeader {
  return { device: "", input: "", output: "", date, session: "" };
}

export function captureHeader(draft: WireLogHeader): WireLogHeader {
  return {
    device: draft.device.trim(),
    input: draft.input.trim(),
    output: draft.output.trim(),
    date: draft.date.trim(),
    session: draft.session.trim(),
  };
}

export function blankHeaderFields(header: WireLogHeader): readonly string[] {
  return WIRE_LOG_HEADER_FIELDS.filter((field) => header[field] === "");
}

export function wireCapture(log: WireLog, header: WireLogHeader): WireLogCapture {
  return {
    header,
    events: log.events.map((event) => ({
      atMs: wireLogTime(event.atMs),
      direction: event.direction,
      bytes: event.bytes,
    })),
  };
}

const SLUG_MAX_LENGTH = 48;
const UNSLUGGABLE = /[^a-z0-9]+/g;
const EDGE_HYPHENS = /^-+|-+$/g;

export function captureFileName(header: WireLogHeader): string {
  const slug = header.session
    .toLowerCase()
    .replace(UNSLUGGABLE, "-")
    .slice(0, SLUG_MAX_LENGTH)
    .replace(EDGE_HYPHENS, "");
  return `${header.date}-${slug === "" ? "capture" : slug}${WIRE_LOG_FILE_EXTENSION}`;
}

const CAPTURE_PICKER_TYPES: readonly FilePickerType[] = [
  {
    description: "e7 wire log",
    accept: { [WIRE_LOG_MEDIA_TYPE]: [WIRE_LOG_FILE_EXTENSION] },
  },
];

export async function saveWireCapture(log: WireLog, draft: WireLogHeader): Promise<CaptureSave> {
  if (log.events.length === 0) {
    return { status: "refused", reason: EMPTY_LOG_REFUSAL };
  }
  const header = captureHeader(draft);
  const blank = blankHeaderFields(header);
  if (blank.length > 0) {
    return { status: "refused", reason: blankHeaderRefusal(blank) };
  }

  const capture = wireCapture(log, header);
  const fileName = captureFileName(header);
  const notes = log.dropped === 0 ? [] : [droppedCaptureNote(log.capacity, log.dropped)];
  const written = await saveFile(new TextEncoder().encode(formatWireLog(capture, notes)), {
    fileName,
    mediaType: WIRE_LOG_MEDIA_TYPE,
    types: CAPTURE_PICKER_TYPES,
  });

  return written
    ? { status: "written", fileName, events: capture.events.length }
    : { status: "dismissed" };
}
