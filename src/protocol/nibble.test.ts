import { describe, expect, it } from "vitest";
import { NibbleRangeError, OddNibbleCountError, pack, unpack } from "./nibble";

describe("pack", () => {
  it("emits the lower nibble before the higher one", () => {
    expect(pack(Uint8Array.of(0x4f))).toEqual(Uint8Array.of(0x0f, 0x04));
  });

  it("packs the spec's 'Opening Pad' read response payload (p.14)", () => {
    const name = Uint8Array.from("Opening   Pad   ", (char) => char.charCodeAt(0));
    expect(pack(name)).toEqual(
      // biome-ignore format: transcribed verbatim from the spec's example response
      Uint8Array.of(
        0x0f, 0x04, 0x00, 0x07, 0x05, 0x06, 0x0e, 0x06, 0x09, 0x06, 0x0e, 0x06,
        0x07, 0x06, 0x00, 0x02, 0x00, 0x02, 0x00, 0x02, 0x00, 0x05, 0x01, 0x06,
        0x04, 0x06, 0x00, 0x02, 0x00, 0x02, 0x00, 0x02,
      ),
    );
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
