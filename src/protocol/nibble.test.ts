import { describe, expect, it } from "vitest";
import { specBytes } from "../test-hex";
import { NibbleRangeError, OddNibbleCountError } from "./errors";
import { pack, unpack } from "./nibble";

const OPENING_PAD = Uint8Array.from("Opening   Pad   ", (char) => char.charCodeAt(0));

const OPENING_PAD_NIBBLES = `
  0F 04 00 07 05 06 0E 06 09 06 0E 06 07 06 00 02 00 02 00 02
  00 05 01 06 04 06 00 02 00 02 00 02`;

describe("pack", () => {
  it("emits the lower nibble before the higher one", () => {
    expect(pack(Uint8Array.of(0x4f))).toEqual(Uint8Array.of(0x0f, 0x04));
  });

  it("packs the spec's 'Opening Pad' read response payload (p.14)", () => {
    expect(pack(OPENING_PAD)).toEqual(specBytes(OPENING_PAD_NIBBLES));
  });

  it("packs an empty payload to an empty payload", () => {
    expect(pack(new Uint8Array(0))).toEqual(new Uint8Array(0));
  });
});

describe("unpack", () => {
  it("round-trips every byte value", () => {
    const bytes = Uint8Array.from({ length: 256 }, (_, index) => index);
    expect(unpack(pack(bytes))).toEqual(bytes);
  });

  it("unpacks the spec's 'Opening Pad' read response payload (p.14)", () => {
    expect(unpack(specBytes(OPENING_PAD_NIBBLES))).toEqual(OPENING_PAD);
  });

  it("round-trips a 16-byte memory block", () => {
    const block = Uint8Array.from({ length: 16 }, (_, index) => (index * 37) % 256);
    expect(unpack(pack(block))).toEqual(block);
  });

  it("keeps every packed nibble 7-bit clean", () => {
    const bytes = Uint8Array.from({ length: 256 }, (_, index) => index);
    expect(pack(bytes).every((nibble) => nibble <= 0x7f)).toBe(true);
  });

  it("rejects an odd-length payload with a typed error", () => {
    expect(() => unpack(Uint8Array.of(0x0f, 0x04, 0x00))).toThrow(OddNibbleCountError);
  });

  it("reports the offending length on an odd-length payload", () => {
    try {
      unpack(Uint8Array.of(0x00));
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(OddNibbleCountError);
      expect((error as OddNibbleCountError).count).toBe(1);
    }
  });

  it("rejects a nibble with high bits set, in either position", () => {
    expect(() => unpack(Uint8Array.of(0x10, 0x00))).toThrow(NibbleRangeError);
    expect(() => unpack(Uint8Array.of(0x00, 0x7f))).toThrow(NibbleRangeError);
  });

  it("reports the offending nibble and its index", () => {
    try {
      unpack(Uint8Array.of(0x00, 0x00, 0x00, 0x40));
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(NibbleRangeError);
      expect((error as NibbleRangeError).value).toBe(0x40);
      expect((error as NibbleRangeError).index).toBe(3);
    }
  });
});
