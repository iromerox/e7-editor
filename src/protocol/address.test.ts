import { describe, expect, it } from "vitest";
import { MEMORY_REGIONS, MultiSlot, PresetSlot } from "./address";
import { AddressComponentRangeError } from "./errors";

describe("PresetSlot", () => {
  it("resolves preset 1.1.1 to the start of preset memory", () => {
    expect(new PresetSlot(1, 1, 1).byteAddress()).toBe(0x000000);
  });

  it("resolves preset 1.1.2 to the second 128-byte slot", () => {
    expect(new PresetSlot(1, 1, 2).byteAddress()).toBe(0x000080);
  });

  it("resolves preset 8.8.8 to the last single-preset slot", () => {
    expect(new PresetSlot(8, 8, 8).byteAddress()).toBe(0x00ff80);
  });

  it("rejects an out-of-range bank with a typed error", () => {
    expect(() => new PresetSlot(9, 1, 1)).toThrow(AddressComponentRangeError);
  });

  it("rejects an out-of-range group with a typed error", () => {
    expect(() => new PresetSlot(1, 0, 1)).toThrow(AddressComponentRangeError);
  });

  it("rejects an out-of-range slot with a typed error", () => {
    expect(() => new PresetSlot(1, 1, 9)).toThrow(AddressComponentRangeError);
  });
});

describe("MultiSlot", () => {
  it("resolves multi 1.1.1 to the start of multi memory", () => {
    expect(new MultiSlot(1, 1, 1).byteAddress()).toBe(0x010000);
  });

  it("resolves multi 1.1.2 to the second 512-byte slot", () => {
    expect(new MultiSlot(1, 1, 2).byteAddress()).toBe(0x010200);
  });

  it("resolves multi 2.8.8 to 0x01FE00, not the spec table's 0x01FD00 (see protocol-quirks.md #4)", () => {
    expect(new MultiSlot(2, 8, 8).byteAddress()).toBe(0x01fe00);
  });

  it("rejects a bank outside 1-2 with a typed error", () => {
    expect(() => new MultiSlot(3, 1, 1)).toThrow(AddressComponentRangeError);
  });
});

describe("MEMORY_REGIONS", () => {
  it("defines the preset, configuration, and volatile regions from p.24", () => {
    expect(MEMORY_REGIONS.preset).toEqual({ start: 0x000000, end: 0x01ffff });
    expect(MEMORY_REGIONS.configuration).toEqual({ start: 0x020000, end: 0x0203ff });
    expect(MEMORY_REGIONS.volatile).toEqual({ start: 0x030000, end: 0x030fff });
  });
});
