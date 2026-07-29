import { describe, expect, it } from "vitest";
import { MultiSlot, PresetSlot } from "./address";
import {
  encodeProgramChange,
  ProgramChangeRangeError,
  resolveProgramChange,
} from "./program-change";

describe("resolveProgramChange", () => {
  it("resolves bank LSB 0 to presets 1.1.1 through 2.8.8 (p.11)", () => {
    expect(resolveProgramChange(0, 0, 0)).toEqual({
      kind: "single",
      slot: new PresetSlot(1, 1, 1),
    });
    expect(resolveProgramChange(0, 0, 127)).toEqual({
      kind: "single",
      slot: new PresetSlot(2, 8, 8),
    });
  });

  it("resolves bank LSB 1 to presets 3.1.1 through 4.8.8, and bank LSB 3 to 8.8.8 at program 127 (p.11)", () => {
    expect(resolveProgramChange(0, 1, 0)).toEqual({
      kind: "single",
      slot: new PresetSlot(3, 1, 1),
    });
    expect(resolveProgramChange(0, 3, 127)).toEqual({
      kind: "single",
      slot: new PresetSlot(8, 8, 8),
    });
  });

  it("resolves Bank MSB 1 to multis 1.1.1 through 2.8.8, ignoring Bank LSB (p.11)", () => {
    expect(resolveProgramChange(1, 0, 0)).toEqual({
      kind: "multi",
      slot: new MultiSlot(1, 1, 1),
    });
    expect(resolveProgramChange(1, 5, 127)).toEqual({
      kind: "multi",
      slot: new MultiSlot(2, 8, 8),
    });
  });

  it("round-trips every single preset slot through encode/resolve", () => {
    for (let bank = 1; bank <= 8; bank++) {
      for (let group = 1; group <= 8; group++) {
        for (let slot = 1; slot <= 8; slot++) {
          const target = { kind: "single", slot: new PresetSlot(bank, group, slot) } as const;
          const message = encodeProgramChange(target);
          expect(resolveProgramChange(message.bankMsb, message.bankLsb, message.program)).toEqual(
            target,
          );
        }
      }
    }
  });

  it("round-trips every multi slot through encode/resolve", () => {
    for (let bank = 1; bank <= 2; bank++) {
      for (let group = 1; group <= 8; group++) {
        for (let slot = 1; slot <= 8; slot++) {
          const target = { kind: "multi", slot: new MultiSlot(bank, group, slot) } as const;
          const message = encodeProgramChange(target);
          expect(resolveProgramChange(message.bankMsb, message.bankLsb, message.program)).toEqual(
            target,
          );
        }
      }
    }
  });

  it("rejects a bank LSB above 3 in single mode with a typed error", () => {
    expect(() => resolveProgramChange(0, 4, 0)).toThrow(ProgramChangeRangeError);
  });

  it("rejects a bank MSB above 1 with a typed error", () => {
    expect(() => resolveProgramChange(2, 0, 0)).toThrow(ProgramChangeRangeError);
  });
});
