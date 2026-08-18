import { describe, expect, it } from "vitest";
import { wireLogFixture } from "../test-wire-log";
import { createSysExReassembler } from "./reassembly";

function bytes(...values: number[]): Uint8Array {
  return Uint8Array.from(values);
}

describe("createSysExReassembler", () => {
  it("passes a complete single-event frame through unchanged", () => {
    const reassembler = createSysExReassembler();

    const frames = reassembler.push(bytes(0xf0, 0x00, 0x21, 0x62, 0x01, 0x10, 0x20, 0xf7));

    expect(frames).toEqual([bytes(0xf0, 0x00, 0x21, 0x62, 0x01, 0x10, 0x20, 0xf7)]);
    expect(reassembler.fragmentedFrames).toBe(0);
    expect(reassembler.pendingBytes).toBe(0);
  });

  it("delivers both frames when one event carries two", () => {
    const reassembler = createSysExReassembler();

    const frames = reassembler.push(bytes(0xf0, 0x01, 0xf7, 0xf0, 0x02, 0x03, 0xf7));

    expect(frames).toEqual([bytes(0xf0, 0x01, 0xf7), bytes(0xf0, 0x02, 0x03, 0xf7)]);
    expect(reassembler.fragmentedFrames).toBe(0);
  });

  it("reassembles a frame a fragmenting driver split across events", () => {
    const reassembler = createSysExReassembler();

    const steps = wireLogFixture("fragmented-frame").events.map((event) => ({
      frames: reassembler.push(event.bytes),
      pendingBytes: reassembler.pendingBytes,
    }));

    expect(steps).toEqual([
      { frames: [], pendingBytes: 3 },
      { frames: [], pendingBytes: 5 },
      { frames: [bytes(0xf0, 0x00, 0x21, 0x62, 0x01, 0x10, 0x20, 0xf7)], pendingBytes: 0 },
    ]);
    expect(reassembler.fragmentedFrames).toBe(1);
    expect(reassembler.discardedPartials).toBe(0);
  });

  it("delivers a fragmented frame and the whole frame behind it in one event", () => {
    const reassembler = createSysExReassembler();

    reassembler.push(bytes(0xf0, 0x01, 0x02));
    const frames = reassembler.push(bytes(0x03, 0xf7, 0xf0, 0x04, 0xf7));

    expect(frames).toEqual([bytes(0xf0, 0x01, 0x02, 0x03, 0xf7), bytes(0xf0, 0x04, 0xf7)]);
    expect(reassembler.fragmentedFrames).toBe(1);
  });

  it("discards the partial buffer when a second F0 arrives before the frame closes", () => {
    const reassembler = createSysExReassembler();

    reassembler.push(bytes(0xf0, 0x01, 0x02));
    const frames = reassembler.push(bytes(0xf0, 0x04, 0x05, 0xf7));

    expect(frames).toEqual([bytes(0xf0, 0x04, 0x05, 0xf7)]);
    expect(reassembler.discardedPartials).toBe(1);
    expect(reassembler.fragmentedFrames).toBe(0);
  });

  it("restarts the same way when both F0s arrive in one event", () => {
    const reassembler = createSysExReassembler();

    const frames = reassembler.push(bytes(0xf0, 0x01, 0xf0, 0x02, 0xf7));

    expect(frames).toEqual([bytes(0xf0, 0x02, 0xf7)]);
    expect(reassembler.discardedPartials).toBe(1);
  });

  it("ignores bytes arriving outside any frame", () => {
    const reassembler = createSysExReassembler();

    const frames = reassembler.push(bytes(0x7f, 0xf7, 0x01, 0xf0, 0x02, 0xf7, 0x03));

    expect(frames).toEqual([bytes(0xf0, 0x02, 0xf7)]);
    expect(reassembler.pendingBytes).toBe(0);
    expect(reassembler.discardedPartials).toBe(0);
  });

  it("drops an open partial on reset instead of prefixing it to the next frame", () => {
    const reassembler = createSysExReassembler();

    reassembler.push(bytes(0xf0, 0x01, 0x02));
    reassembler.reset();

    expect(reassembler.pendingBytes).toBe(0);
    expect(reassembler.push(bytes(0xf0, 0x03, 0xf7))).toEqual([bytes(0xf0, 0x03, 0xf7)]);
  });

  it("keeps delivered frames untouched by later traffic", () => {
    const reassembler = createSysExReassembler();

    const [first] = reassembler.push(bytes(0xf0, 0x01, 0xf7));
    reassembler.push(bytes(0xf0, 0x02, 0x03, 0x04, 0xf7));

    expect(first).toEqual(bytes(0xf0, 0x01, 0xf7));
  });
});
