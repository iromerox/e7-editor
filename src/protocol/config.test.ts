import { describe, expect, it } from "vitest";
import { OMNI_RECEIVE_CHANNEL, intoConfiguration, receiveChannel } from "./config";
import { decodeConfigurationResponse, encodeCommand } from "./sysex";

describe("receiveChannel", () => {
  it("reads the configuration byte as a one-based channel (p.27)", () => {
    expect(receiveChannel(0)).toEqual({ kind: "channel", channel: 1 });
    expect(receiveChannel(4)).toEqual({ kind: "channel", channel: 5 });
    expect(receiveChannel(15)).toEqual({ kind: "channel", channel: 16 });
  });

  it("reports Omni as itself rather than as a channel number", () => {
    expect(receiveChannel(OMNI_RECEIVE_CHANNEL)).toEqual({ kind: "omni" });
  });

  it("reports the values the spec calls invalid, carrying what it read", () => {
    expect(receiveChannel(17)).toEqual({ kind: "invalid", value: 17 });
    expect(receiveChannel(255)).toEqual({ kind: "invalid", value: 255 });
    expect(receiveChannel(-1)).toEqual({ kind: "invalid", value: -1 });
    expect(receiveChannel(1.5)).toEqual({ kind: "invalid", value: 1.5 });
  });
});

describe("intoConfiguration", () => {
  it("bridges the spec's Read Configuration example into the Write Configuration payload (p.19, p.20)", () => {
    const response = decodeConfigurationResponse(Uint8Array.of(0xf0, 0x00, 0x00, 0x07, 0x00, 0xf7));
    const configuration = intoConfiguration(response, 0, 0);
    expect(encodeCommand({ kind: "write-configuration", configuration })).toEqual(
      Uint8Array.of(
        0xf0,
        0x00,
        0x21,
        0x62,
        0x01,
        0x10,
        0x0d,
        0x00,
        0x00,
        0x07,
        0x00,
        0x00,
        0x00,
        0x00,
        0xf7,
      ),
    );
  });

  it("fills in the two fields the read response never returns", () => {
    const payload = { rxChannel: 3, txChannel: 5, filterMode: 7, softThruMode: 12 };
    expect(intoConfiguration(payload, 1, 1)).toEqual({
      rxChannel: 3,
      txChannel: 5,
      filterMode: 7,
      softThruMode: 12,
      clockSource: 1,
      mpeEnable: 1,
    });
  });
});
