// Bank Select MSB/LSB + Program Change resolve to a preset or multi slot
// (p.11): Bank MSB 0 selects single mode (Bank LSB 0-3 picks the bank pair),
// Bank MSB 1 selects multi mode (Bank LSB ignored).
import { MultiSlot, PresetSlot } from "./address";

export type ProgramChangeTarget =
  | { readonly kind: "single"; readonly slot: PresetSlot }
  | { readonly kind: "multi"; readonly slot: MultiSlot };

export interface ProgramChangeMessage {
  readonly bankMsb: number;
  readonly bankLsb: number;
  readonly program: number;
}

export class ProgramChangeRangeError extends Error {
  constructor(
    readonly field: "bank-msb" | "bank-lsb" | "program",
    readonly value: number,
    readonly min: number,
    readonly max: number,
  ) {
    super(`${field} must be between ${min} and ${max}, got ${value}`);
    this.name = "ProgramChangeRangeError";
  }
}

function assertRange(
  field: "bank-msb" | "bank-lsb" | "program",
  value: number,
  min: number,
  max: number,
): void {
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new ProgramChangeRangeError(field, value, min, max);
  }
}

function slotFromLinear(linear: number): { bank: number; group: number; slot: number } {
  return {
    bank: Math.floor(linear / 64) + 1,
    group: Math.floor((linear % 64) / 8) + 1,
    slot: (linear % 8) + 1,
  };
}

function linearFromSlot(bank: number, group: number, slot: number): number {
  return (bank - 1) * 64 + (group - 1) * 8 + (slot - 1);
}

export function resolveProgramChange(
  bankMsb: number,
  bankLsb: number,
  program: number,
): ProgramChangeTarget {
  assertRange("bank-msb", bankMsb, 0, 1);
  assertRange("program", program, 0, 127);
  if (bankMsb === 1) {
    const { bank, group, slot } = slotFromLinear(program);
    return { kind: "multi", slot: new MultiSlot(bank, group, slot) };
  }
  assertRange("bank-lsb", bankLsb, 0, 3);
  const { bank, group, slot } = slotFromLinear(bankLsb * 128 + program);
  return { kind: "single", slot: new PresetSlot(bank, group, slot) };
}

export function encodeProgramChange(target: ProgramChangeTarget): ProgramChangeMessage {
  if (target.kind === "multi") {
    const linear = linearFromSlot(target.slot.bank, target.slot.group, target.slot.slot);
    return { bankMsb: 1, bankLsb: 0, program: linear };
  }
  const linear = linearFromSlot(target.slot.bank, target.slot.group, target.slot.slot);
  return { bankMsb: 0, bankLsb: Math.floor(linear / 128), program: linear % 128 };
}
