import { describe, expect, it } from "vitest";
import { PresetSlot } from "./address";
import {
  COMMAND_HEADER,
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
  MAX_SYSEX_ADDRESS,
  ManufacturerHeaderError,
  PRESET_LOCKED,
  PRESET_UNLOCKED,
  SysExAddressRangeError,
  type SysExCommand,
  SysExDataByteRangeError,
  SysExFieldRangeError,
  SysExFramingError,
  SysExPayloadLengthError,
  UnknownSysExCommandError,
  unlockPresetCommand,
} from "./sysex";

const OPENING_PAD = Uint8Array.from("Opening   Pad   ", (char) => char.charCodeAt(0));

// biome-ignore format: transcribed verbatim from the spec's example frames
const OPENING_PAD_NIBBLES = [
  0x0f, 0x04, 0x00, 0x07, 0x05, 0x06, 0x0e, 0x06, 0x09, 0x06, 0x0e, 0x06,
  0x07, 0x06, 0x00, 0x02, 0x00, 0x02, 0x00, 0x02, 0x00, 0x05, 0x01, 0x06,
  0x04, 0x06, 0x00, 0x02, 0x00, 0x02, 0x00, 0x02,
];

function frame(...bytes: number[]): Uint8Array {
  return Uint8Array.of(0xf0, ...bytes, 0xf7);
}

function command(...bytes: number[]): Uint8Array {
  return frame(...COMMAND_HEADER, ...bytes);
}

function roundTrips(message: SysExCommand, bytes: Uint8Array): void {
  expect(encodeCommand(message)).toEqual(bytes);
  expect(decodeCommand(bytes)).toEqual(message);
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

describe("commands without a payload", () => {
  it("encodes All LEDs ON (p.12)", () => {
    roundTrips({ kind: "all-leds-on" }, command(0x13));
  });

  it("encodes Read Serial Number (p.13)", () => {
    roundTrips({ kind: "read-serial-number" }, command(0x20));
  });

  it("encodes Factory Reset (p.18)", () => {
    roundTrips({ kind: "factory-reset" }, command(0x14));
  });

  it("encodes Read Configuration (p.19)", () => {
    roundTrips({ kind: "read-configuration" }, command(0x0c));
  });

  it("encodes Initialize preset (p.21)", () => {
    roundTrips({ kind: "initialize-preset" }, command(0x10));
  });

  it("encodes Read Autotuning Status (p.22)", () => {
    roundTrips({ kind: "read-autotuning-status" }, command(0x0a));
  });

  it("rejects a trailing payload on a command that takes none", () => {
    expect(() => decodeCommand(command(0x13, 0x00))).toThrow(SysExPayloadLengthError);
  });
});

describe("Read Memory", () => {
  it("encodes the spec's read from address 0x00 (p.14)", () => {
    roundTrips({ kind: "read-memory", address: 0x000000 }, command(0x0e, 0x00, 0x00, 0x00));
  });

  it("decodes the spec's 16-byte response, which carries no manufacturer header", () => {
    const response = decodeMemoryDataResponse(frame(...OPENING_PAD_NIBBLES));
    expect(response.data).toEqual(OPENING_PAD);
  });

  it("re-encodes that response to the spec's own bytes", () => {
    expect(encodeResponse({ kind: "memory-data", data: OPENING_PAD })).toEqual(
      frame(...OPENING_PAD_NIBBLES),
    );
  });
});

describe("Write Memory", () => {
  it("encodes the spec's write to address 0x00 (p.15)", () => {
    roundTrips(
      { kind: "write-memory", address: 0x000000, data: OPENING_PAD },
      command(0x0f, 0x00, 0x00, 0x00, ...OPENING_PAD_NIBBLES),
    );
  });

  it("decodes the echoed data, which carries no manufacturer header", () => {
    expect(decodeMemoryDataResponse(frame(...OPENING_PAD_NIBBLES)).data).toEqual(OPENING_PAD);
  });
});

describe("Lock Preset and Unlock Preset", () => {
  const preset111 = new PresetSlot(1, 1, 1).byteAddress();

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
    expect(unlockPresetCommand(preset111)).toEqual({
      kind: "write-memory",
      address: 0x7f,
      data: Uint8Array.of(0x00),
    });
  });

  it("unlocks preset 1.1.1 with the frame the spec labels 'Lock preset 1.1.1' (p.16)", () => {
    expect(encodeCommand(unlockPresetCommand(preset111))).toEqual(
      command(0x0f, 0x7f, 0x00, 0x00, 0x00, 0x00),
    );
  });

  it("locks preset 1.1.1 with the frame the spec labels 'Unlock preset 1.1.1' (p.17)", () => {
    expect(encodeCommand(lockPresetCommand(preset111))).toEqual(
      command(0x0f, 0x7f, 0x00, 0x00, 0x01, 0x00),
    );
  });

  it("decodes the two echo responses to the lock byte they carry", () => {
    expect(decodeMemoryDataResponse(frame(0x00, 0x00)).data).toEqual(
      Uint8Array.of(PRESET_UNLOCKED),
    );
    expect(decodeMemoryDataResponse(frame(0x01, 0x00)).data).toEqual(Uint8Array.of(PRESET_LOCKED));
  });
});

describe("Read Serial Number", () => {
  it("decodes the spec's response of serial 73 (p.13)", () => {
    expect(decodeSerialNumberResponse(frame(0x49, 0x00))).toEqual({
      kind: "serial-number",
      serialNumber: 73,
    });
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

describe("Read Configuration", () => {
  it("decodes the spec's 4-byte response (p.19)", () => {
    expect(decodeConfigurationResponse(frame(0x00, 0x00, 0x07, 0x00))).toEqual({
      kind: "configuration",
      rxChannel: 0,
      txChannel: 0,
      filterMode: 7,
      softThruMode: 0,
    });
  });
});

describe("Write Configuration", () => {
  it("encodes the spec's 7-byte example, trailing pad included (p.20)", () => {
    roundTrips(
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
      command(0x0d, 0x00, 0x00, 0x07, 0x00, 0x00, 0x00, 0x00),
    );
  });

  it("rejects a non-zero trailing pad byte on decode", () => {
    expect(() => decodeCommand(command(0x0d, 0x00, 0x00, 0x07, 0x00, 0x00, 0x00, 0x01))).toThrow(
      SysExFieldRangeError,
    );
  });
});

describe("Read Autotuning Status", () => {
  it("decodes the spec's response of 7 finished voices (p.22)", () => {
    expect(
      decodeAutotuningStatusResponse(frame(0x00, 0x0f, 0x0f, 0x0f, 0x0f, 0x0f, 0x0f, 0x0f)),
    ).toEqual({
      kind: "autotuning-status",
      on: false,
      voices: Uint8Array.of(0x0f, 0x0f, 0x0f, 0x0f, 0x0f, 0x0f, 0x0f),
    });
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
