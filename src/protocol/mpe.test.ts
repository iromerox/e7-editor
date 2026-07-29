import { describe, expect, it } from "vitest";
import { specBytes } from "../test-hex";
import { McmChannelCountRangeError, McmTemplateError } from "./errors";
import { decodeMcm, encodeMcm } from "./mpe";

describe("MPE Configuration Message (p.23)", () => {
  it("round-trips the spec's example enabling MPE with 15 channels", () => {
    const bytes = specBytes("B0 65 00 B0 64 06 B0 06 0F");
    expect(encodeMcm({ channels: 15 })).toEqual(bytes);
    expect(decodeMcm(bytes)).toEqual({ channels: 15 });
  });

  it("round-trips the spec's example disabling MPE", () => {
    const bytes = specBytes("B0 65 00 B0 64 06 B0 06 00");
    expect(encodeMcm({ channels: 0 })).toEqual(bytes);
    expect(decodeMcm(bytes)).toEqual({ channels: 0 });
  });

  it("round-trips every legal channel count 0-15", () => {
    for (let channels = 0; channels <= 15; channels++) {
      expect(decodeMcm(encodeMcm({ channels }))).toEqual({ channels });
    }
  });

  it("rejects a channel count above 15 with a typed error", () => {
    expect(() => encodeMcm({ channels: 16 })).toThrow(McmChannelCountRangeError);
  });

  it("rejects bytes that don't match the fixed CC/RPN template", () => {
    const bytes = Uint8Array.of(0xb1, 0x65, 0x00, 0xb0, 0x64, 0x06, 0xb0, 0x06, 0x00);
    expect(() => decodeMcm(bytes)).toThrow(McmTemplateError);
  });

  it("rejects the wrong byte length", () => {
    expect(() => decodeMcm(Uint8Array.of(0xb0, 0x65, 0x00))).toThrow(McmTemplateError);
  });
});
