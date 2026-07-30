import type { SysExCommand, SysExResponse } from "./sysex";
import { describe, expect, it } from "vitest";
import { specBytes } from "../test-hex";
import { PresetSlot } from "./address";
import {
  ManufacturerHeaderError,
  SysExAddressRangeError,
  SysExDataByteRangeError,
  SysExFieldRangeError,
  SysExFramingError,
  SysExPayloadLengthError,
  UnknownSysExCommandError,
} from "./errors";
import {
  COMMAND_HEADER,
  MAX_SYSEX_ADDRESS,
  PRESET_LOCKED,
  PRESET_UNLOCKED,
  decodeAddress,
  decodeAutotuningStatusResponse,
  decodeCommand,
  decodeConfigurationResponse,
  decodeMemoryDataResponse,
  decodeSerialNumberResponse,
  encodeAddress,
  encodeCommand,
  encodeResponse,
  isPresetLocked,
  lockPresetCommand,
  unlockPresetCommand,
} from "./sysex";

const OPENING_PAD = Uint8Array.from("Opening   Pad   ", (char) => char.charCodeAt(0));

const PRESET_111 = new PresetSlot(1, 1, 1).byteAddress();

const MEMORY_DATA_RESPONSE = `
  F0 0F 04 00 07 05 06 0E 06 09 06 0E 06 07 06 00 02 00 02 00 02
  00 05 01 06 04 06 00 02 00 02 00 02 F7`;

const WRITE_MEMORY_COMMAND = `
  F0 00 21 62 01 10 0F 00 00 00 0F 04 00 07 05 06 0E 06 09 06 0E
  06 07 06 00 02 00 02 00 02 00 05 01 06 04 06 00 02 00 02 00 02
  F7`;

function frame(...bytes: number[]): Uint8Array {
  return Uint8Array.of(0xf0, ...bytes, 0xf7);
}

function command(...bytes: number[]): Uint8Array {
  return frame(...COMMAND_HEADER, ...bytes);
}

function roundTripsCommand(message: SysExCommand, printed: string): void {
  const bytes = specBytes(printed);
  expect(encodeCommand(message)).toEqual(bytes);
  expect(decodeCommand(bytes)).toEqual(message);
}

function encodesResponse(response: SysExResponse, printed: string): void {
  expect(encodeResponse(response)).toEqual(specBytes(printed));
}

describe("address encoding", () => {
  it("splits an address into three 7-bit bytes, lowest first", () => {
    expect(encodeAddress(0x000000)).toEqual([0x00, 0x00, 0x00]);
    expect(encodeAddress(0x00007f)).toEqual([0x7f, 0x00, 0x00]);
    expect(encodeAddress(0x01fe00)).toEqual([0x00, 0x7c, 0x07]);
  });

  it("round-trips every region boundary", () => {
    for (const address of [0x000000, 0x00ff80, 0x01fe00, 0x01ffff, 0x020000, 0x030fff]) {
      expect(decodeAddress(Uint8Array.from(encodeAddress(address)))).toBe(address);
    }
  });

  it("rejects an address wider than the three 7-bit bytes can carry", () => {
    expect(() => encodeAddress(MAX_SYSEX_ADDRESS + 1)).toThrow(SysExAddressRangeError);
    expect(() => encodeAddress(-1)).toThrow(SysExAddressRangeError);
    expect(() => encodeAddress(1.5)).toThrow(SysExAddressRangeError);
  });
});

describe("All LEDs ON (p.12)", () => {
  it("round-trips the spec's example frame", () => {
    roundTripsCommand({ kind: "all-leds-on" }, "F0 00 21 62 01 10 13 F7");
  });
});

describe("Read Serial Number (p.13)", () => {
  it("round-trips the spec's example frame", () => {
    roundTripsCommand({ kind: "read-serial-number" }, "F0 00 21 62 01 10 20 F7");
  });

  it("decodes the spec's example response as serial 73", () => {
    expect(decodeSerialNumberResponse(specBytes("F0 49 00 F7"))).toEqual({
      kind: "serial-number",
      serialNumber: 73,
    });
  });

  it("re-encodes that serial to the spec's own response bytes", () => {
    encodesResponse({ kind: "serial-number", serialNumber: 73 }, "F0 49 00 F7");
  });

  it("round-trips a serial that spans both 7-bit halves", () => {
    const encoded = encodeResponse({ kind: "serial-number", serialNumber: 361 });
    expect(encoded).toEqual(frame(0x69, 0x02));
    expect(decodeSerialNumberResponse(encoded).serialNumber).toBe(361);
  });

  it("rejects a response of the wrong length", () => {
    expect(() => decodeSerialNumberResponse(frame(0x49))).toThrow(SysExPayloadLengthError);
  });
});

describe("Read Memory (p.14)", () => {
  it("round-trips the spec's read from address 0x00", () => {
    roundTripsCommand(
      { kind: "read-memory", address: 0x000000 },
      "F0 00 21 62 01 10 0E 00 00 00 F7",
    );
  });

  it("decodes the spec's example response, which carries no manufacturer header", () => {
    expect(decodeMemoryDataResponse(specBytes(MEMORY_DATA_RESPONSE)).data).toEqual(OPENING_PAD);
  });

  it("re-encodes that response to the spec's own bytes", () => {
    encodesResponse({ kind: "memory-data", data: OPENING_PAD }, MEMORY_DATA_RESPONSE);
  });
});

describe("Write Memory (p.15)", () => {
  it("round-trips the spec's write to address 0x00", () => {
    roundTripsCommand(
      { kind: "write-memory", address: 0x000000, data: OPENING_PAD },
      WRITE_MEMORY_COMMAND,
    );
  });

  it("decodes the spec's echoed data, which carries no manufacturer header", () => {
    expect(decodeMemoryDataResponse(specBytes(MEMORY_DATA_RESPONSE)).data).toEqual(OPENING_PAD);
  });
});

describe("Unlock Preset (p.16)", () => {
  it("unlocks preset 1.1.1 with the frame the spec labels 'Lock preset 1.1.1'", () => {
    roundTripsCommand(
      { kind: "write-memory", address: 0x7f, data: Uint8Array.of(PRESET_UNLOCKED) },
      "F0 00 21 62 01 10 0F 7F 00 00 00 00 F7",
    );
    expect(encodeCommand(unlockPresetCommand(PRESET_111))).toEqual(
      specBytes("F0 00 21 62 01 10 0F 7F 00 00 00 00 F7"),
    );
  });

  it("decodes the spec's echo response to the unlocked lock byte", () => {
    expect(decodeMemoryDataResponse(specBytes("F0 00 00 F7")).data).toEqual(
      Uint8Array.of(PRESET_UNLOCKED),
    );
  });
});

describe("Lock Preset (p.17)", () => {
  it("locks preset 1.1.1 with the frame the spec labels 'Unlock preset 1.1.1'", () => {
    roundTripsCommand(
      { kind: "write-memory", address: 0x7f, data: Uint8Array.of(PRESET_LOCKED) },
      "F0 00 21 62 01 10 0F 7F 00 00 01 00 F7",
    );
    expect(encodeCommand(lockPresetCommand(PRESET_111))).toEqual(
      specBytes("F0 00 21 62 01 10 0F 7F 00 00 01 00 F7"),
    );
  });

  it("decodes the spec's echo response to the locked lock byte", () => {
    expect(decodeMemoryDataResponse(specBytes("F0 01 00 F7")).data).toEqual(
      Uint8Array.of(PRESET_LOCKED),
    );
  });
});

describe("the preset lock byte", () => {
  it("writes 0 to unlock and 1 to lock, per the byte-map text on p.26", () => {
    expect(PRESET_UNLOCKED).toBe(0x00);
    expect(PRESET_LOCKED).toBe(0x01);
    expect(isPresetLocked(PRESET_LOCKED)).toBe(true);
    expect(isPresetLocked(PRESET_UNLOCKED)).toBe(false);
  });

  it("treats any byte other than 1 as unlocked (p.26)", () => {
    expect(isPresetLocked(0x02)).toBe(false);
    expect(isPresetLocked(0xff)).toBe(false);
  });

  it("addresses the lock byte at the preset address plus 127", () => {
    expect(unlockPresetCommand(PRESET_111)).toEqual({
      kind: "write-memory",
      address: 0x7f,
      data: Uint8Array.of(0x00),
    });
  });
});

describe("Factory Reset (p.18)", () => {
  it("round-trips the spec's example frame", () => {
    roundTripsCommand({ kind: "factory-reset" }, "F0 00 21 62 01 10 14 F7");
  });
});

describe("Read Configuration (p.19)", () => {
  it("round-trips the spec's example frame", () => {
    roundTripsCommand({ kind: "read-configuration" }, "F0 00 21 62 01 10 0C F7");
  });

  it("decodes the spec's example 4-byte response", () => {
    expect(decodeConfigurationResponse(specBytes("F0 00 00 07 00 F7"))).toEqual({
      kind: "configuration",
      rxChannel: 0,
      txChannel: 0,
      filterMode: 7,
      softThruMode: 0,
    });
  });

  it("re-encodes that response to the spec's own bytes", () => {
    encodesResponse(
      { kind: "configuration", rxChannel: 0, txChannel: 0, filterMode: 7, softThruMode: 0 },
      "F0 00 00 07 00 F7",
    );
  });
});

describe("Write Configuration (p.20)", () => {
  it("round-trips the spec's example frame, trailing pad included", () => {
    roundTripsCommand(
      {
        kind: "write-configuration",
        configuration: {
          rxChannel: 0,
          txChannel: 0,
          filterMode: 7,
          softThruMode: 0,
          clockSource: 0,
          mpeEnable: 0,
        },
      },
      "F0 00 21 62 01 10 0D 00 00 07 00 00 00 00 F7",
    );
  });

  it("rejects a non-zero trailing pad byte on decode", () => {
    expect(() => decodeCommand(command(0x0d, 0x00, 0x00, 0x07, 0x00, 0x00, 0x00, 0x01))).toThrow(
      SysExFieldRangeError,
    );
  });
});

describe("Initialize preset (p.21)", () => {
  it("round-trips the spec's example frame", () => {
    roundTripsCommand({ kind: "initialize-preset" }, "F0 00 21 62 01 10 10 F7");
  });
});

describe("Read Autotuning Status (p.22)", () => {
  it("round-trips the spec's example frame", () => {
    roundTripsCommand({ kind: "read-autotuning-status" }, "F0 00 21 62 01 10 0A F7");
  });

  it("decodes the spec's example response of 7 finished voices", () => {
    expect(decodeAutotuningStatusResponse(specBytes("F0 00 0F 0F 0F 0F 0F 0F 0F F7"))).toEqual({
      kind: "autotuning-status",
      on: false,
      voices: Uint8Array.of(0x0f, 0x0f, 0x0f, 0x0f, 0x0f, 0x0f, 0x0f),
    });
  });

  it("re-encodes that response to the spec's own bytes", () => {
    encodesResponse(
      {
        kind: "autotuning-status",
        on: false,
        voices: Uint8Array.of(0x0f, 0x0f, 0x0f, 0x0f, 0x0f, 0x0f, 0x0f),
      },
      "F0 00 0F 0F 0F 0F 0F 0F 0F F7",
    );
  });

  it("round-trips an in-progress status with autotuning on", () => {
    const status = {
      kind: "autotuning-status",
      on: true,
      voices: Uint8Array.of(0x0f, 0x0f, 0x08, 0x00, 0x00, 0x00, 0x00),
    } as const;
    expect(decodeAutotuningStatusResponse(encodeResponse(status))).toEqual(status);
  });

  it("rejects a progress value past 0x0F", () => {
    expect(() =>
      decodeAutotuningStatusResponse(frame(0x00, 0x10, 0x0f, 0x0f, 0x0f, 0x0f, 0x0f, 0x0f)),
    ).toThrow(SysExFieldRangeError);
  });

  it("rejects a response covering the wrong number of voices", () => {
    expect(() => decodeAutotuningStatusResponse(frame(0x00, 0x0f, 0x0f))).toThrow(
      SysExPayloadLengthError,
    );
  });
});

describe("framing", () => {
  it("wraps every command in F0 … F7 with the 5-byte manufacturer header", () => {
    expect(COMMAND_HEADER).toEqual([0x00, 0x21, 0x62, 0x01, 0x10]);
    const bytes = encodeCommand({ kind: "all-leds-on" });
    expect(bytes[0]).toBe(0xf0);
    expect(bytes[bytes.length - 1]).toBe(0xf7);
    expect(Array.from(bytes.subarray(1, 6))).toEqual(COMMAND_HEADER);
  });

  it("rejects a trailing payload on a command that takes none", () => {
    expect(() => decodeCommand(command(0x13, 0x00))).toThrow(SysExPayloadLengthError);
  });

  it("rejects a command frame whose header is missing or wrong", () => {
    expect(() => decodeCommand(frame(0x13))).toThrow(ManufacturerHeaderError);
    expect(() => decodeCommand(frame(0x00, 0x21, 0x62, 0x01, 0x11, 0x13))).toThrow(
      ManufacturerHeaderError,
    );
  });

  it("parses responses as bare data, with no header to strip", () => {
    expect(decodeSerialNumberResponse(frame(0x49, 0x00)).serialNumber).toBe(73);
    expect(() => decodeSerialNumberResponse(command(0x49, 0x00))).toThrow(SysExPayloadLengthError);
  });

  it("rejects a frame with no start or end byte", () => {
    expect(() => decodeCommand(Uint8Array.of(0x00, 0x21, 0x62, 0x01, 0x10, 0x13, 0xf7))).toThrow(
      SysExFramingError,
    );
    expect(() => decodeCommand(Uint8Array.of(0xf0, 0x00, 0x21, 0x62, 0x01, 0x10, 0x13))).toThrow(
      SysExFramingError,
    );
    expect(() => decodeCommand(Uint8Array.of(0xf0))).toThrow(SysExFramingError);
  });

  it("rejects an unknown command byte", () => {
    expect(() => decodeCommand(command(0x7f))).toThrow(UnknownSysExCommandError);
  });

  it("rejects a data byte with the high bit set", () => {
    expect(() =>
      encodeCommand({
        kind: "write-configuration",
        configuration: {
          rxChannel: 0x80,
          txChannel: 0,
          filterMode: 0,
          softThruMode: 0,
          clockSource: 0,
          mpeEnable: 0,
        },
      }),
    ).toThrow(SysExDataByteRangeError);
  });
});
