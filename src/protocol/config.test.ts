import { describe, expect, it } from "vitest";
import { intoConfiguration } from "./config";
import { decodeConfigurationResponse, encodeCommand } from "./sysex";

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
