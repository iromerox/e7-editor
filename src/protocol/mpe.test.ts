import { describe, expect, it } from "vitest";
import { McmChannelCountRangeError, McmTemplateError } from "./errors";
import { decodeMcm, encodeMcm } from "./mpe";

describe("MPE Configuration Message", () => {
  it("encodes enabling MPE with 15 channels on channel 1 (p.23)", () => {
    expect(encodeMcm({ channels: 15 })).toEqual(
      Uint8Array.of(0xb0, 0x65, 0x00, 0xb0, 0x64, 0x06, 0xb0, 0x06, 0x0f),
    );
  });

  it("encodes disabling MPE (p.23)", () => {
    expect(encodeMcm({ channels: 0 })).toEqual(
      Uint8Array.of(0xb0, 0x65, 0x00, 0xb0, 0x64, 0x06, 0xb0, 0x06, 0x00),
    );
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
