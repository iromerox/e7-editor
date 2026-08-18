import { describe, expect, it } from "vitest";
import { wireLogFixture } from "../test-wire-log";
import { WireLogFormatError, parseWireLog } from "./wire-log";

const HEADER = [
  "e7 wire log v1",
  "device   GS Music e7, serial 361",
  "input    e7 MIDI 1",
  "output   e7 MIDI 1",
  "date     2026-08-18",
  "session  Reading preset 1.1.1 back a block at a time",
  "",
  "",
].join("\n");

function capture(...events: string[]): string {
  return `${HEADER}${events.join("\n")}\n`;
}

function refusal(text: string): WireLogFormatError {
  try {
    parseWireLog("capture.wire", text);
  } catch (error) {
    if (error instanceof WireLogFormatError) {
      return error;
    }
    throw error;
  }
  throw new Error("the capture was accepted");
}

function bytes(...values: number[]): Uint8Array {
  return Uint8Array.from(values);
}

describe("parseWireLog", () => {
  it("reads the session the header describes", () => {
    const parsed = parseWireLog("capture.wire", capture("+0.0ms  -->  F0 F7"));

    expect(parsed.header).toEqual({
      device: "GS Music e7, serial 361",
      input: "e7 MIDI 1",
      output: "e7 MIDI 1",
      date: "2026-08-18",
      session: "Reading preset 1.1.1 back a block at a time",
    });
  });

  it("reads the direction, the elapsed time and the bytes of every event", () => {
    const parsed = parseWireLog(
      "capture.wire",
      capture("   +0.0ms  -->  F0 00 21 62 01 10 0C F7", " +16.1ms  <--  F0 01 01 00 00 F7"),
    );

    expect(parsed.events).toEqual([
      {
        atMs: 0,
        direction: "outbound",
        bytes: bytes(0xf0, 0x00, 0x21, 0x62, 0x01, 0x10, 0x0c, 0xf7),
      },
      { atMs: 16.1, direction: "inbound", bytes: bytes(0xf0, 0x01, 0x01, 0x00, 0x00, 0xf7) },
    ]);
  });

  it("skips comments and blank lines between events", () => {
    const parsed = parseWireLog(
      "capture.wire",
      capture("# the knob was turned here", "", "+2.0ms  <--  B0 4A 60", "# and released"),
    );

    expect(parsed.events).toEqual([
      { atMs: 2, direction: "inbound", bytes: bytes(0xb0, 0x4a, 0x60) },
    ]);
  });

  it("takes hex in either case, since a capture gets hand-edited", () => {
    const parsed = parseWireLog("capture.wire", capture("+0.0ms  <--  f0 0f f7"));

    expect(parsed.events.map((event) => event.bytes)).toEqual([bytes(0xf0, 0x0f, 0xf7)]);
  });

  it("keeps a frame split across events as the events it arrived in", () => {
    const { events } = wireLogFixture("fragmented-frame");

    expect(events).toEqual([
      { atMs: 0, direction: "inbound", bytes: bytes(0xf0, 0x00, 0x21) },
      { atMs: 1.2, direction: "inbound", bytes: bytes(0x62, 0x01) },
      { atMs: 2.5, direction: "inbound", bytes: bytes(0x10, 0x20, 0xf7) },
    ]);
  });

  it("keeps a frame no decoder accepts, beside the command it followed", () => {
    const { events } = wireLogFixture("preview-frame");

    expect(
      events.map((event) => `${event.direction} +${event.atMs}ms ${event.bytes.length}`),
    ).toEqual(["outbound +0ms 11", "inbound +14.6ms 3", "inbound +16.1ms 34"]);
  });

  it("refuses a file that does not open with the format's own name", () => {
    const error = refusal("device  GS Music e7\n\n+0.0ms  <--  F0 F7\n");

    expect(error.fileName).toBe("capture.wire");
    expect(error.line).toBe(1);
    expect(error.fault).toBe('the first line is not "e7 wire log v1"');
  });

  it("refuses a header field the format does not define", () => {
    expect(refusal(capture("+0.0ms  <--  F0 F7").replace("input ", "port  ")).fault).toBe(
      'unknown header field "port"',
    );
  });

  it("refuses a header field given twice", () => {
    const error = refusal(
      capture("+0.0ms  <--  F0 F7").replace("output   e7 MIDI 1", "input    e7 MIDI 2"),
    );

    expect(error.line).toBe(4);
    expect(error.fault).toBe('duplicate header field "input"');
  });

  it("refuses a header field left blank", () => {
    expect(refusal(capture("+0.0ms  <--  F0 F7").replace("e7 MIDI 1\n", "\n")).fault).toBe(
      'header field "input" has no value',
    );
  });

  it("names the header field a capture leaves out", () => {
    const error = refusal(capture("+0.0ms  <--  F0 F7").replace(/^date.*\n/m, ""));

    expect(error.line).toBe(5);
    expect(error.fault).toBe("the header names no date");
  });

  it("refuses a date that is not one", () => {
    expect(refusal(capture("+0.0ms  <--  F0 F7").replace("2026-08-18", "2026-02-30")).fault).toBe(
      'date is not a calendar date as YYYY-MM-DD: "2026-02-30"',
    );
  });

  it("refuses a line that does not open with an elapsed time", () => {
    const error = refusal(capture("0.0  <--  F0 F7"));

    expect(error.line).toBe(8);
    expect(error.fault).toBe('the line opens with "0.0" rather than a time like +14.6ms');
  });

  it("refuses a capture whose times run backwards", () => {
    expect(refusal(capture("+16.1ms  <--  F0 F7", "+14.6ms  <--  F0 F7")).fault).toBe(
      "+14.6ms is earlier than the +16.1ms above it",
    );
  });

  it("refuses a line that does not say which way the bytes went", () => {
    expect(refusal(capture("+0.0ms  F0 F7")).fault).toBe(
      'the time is followed by "F0" rather than --> or <--',
    );
  });

  it("refuses a line with a direction and nothing after it", () => {
    expect(refusal(capture("+0.0ms  <--")).fault).toBe("the line carries no bytes");
  });

  it("refuses a byte truncated mid-write", () => {
    expect(refusal(capture("+0.0ms  <--  F0 00 21 6")).fault).toBe(
      '"6" is not a two-digit hex byte',
    );
  });

  it("refuses a header with no events under it", () => {
    const error = refusal(HEADER);

    expect(error.line).toBe(8);
    expect(error.fault).toBe("the capture holds no events");
  });

  it("returns nothing at all rather than the events read before the fault", () => {
    expect(() =>
      parseWireLog("capture.wire", capture("+0.0ms  <--  F0 F7", "+1.0ms  <--  ZZ")),
    ).toThrow(WireLogFormatError);
  });
});
