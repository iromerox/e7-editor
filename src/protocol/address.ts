// Memory addressing for preset and multi slots.
export const MEMORY_REGIONS = {
  preset: { start: 0x000000, end: 0x01ffff },
  configuration: { start: 0x020000, end: 0x0203ff },
  volatile: { start: 0x030000, end: 0x030fff },
} as const;

export class AddressComponentRangeError extends Error {
  constructor(
    readonly component: "bank" | "group" | "slot",
    readonly value: number,
    readonly min: number,
    readonly max: number,
  ) {
    super(`${component} must be between ${min} and ${max}, got ${value}`);
    this.name = "AddressComponentRangeError";
  }
}

function assertInRange(
  component: "bank" | "group" | "slot",
  value: number,
  min: number,
  max: number,
): void {
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new AddressComponentRangeError(component, value, min, max);
  }
}

export class PresetSlot {
  constructor(
    readonly bank: number,
    readonly group: number,
    readonly slot: number,
  ) {
    assertInRange("bank", bank, 1, 8);
    assertInRange("group", group, 1, 8);
    assertInRange("slot", slot, 1, 8);
  }

  byteAddress(): number {
    return ((this.bank - 1) * 64 + (this.group - 1) * 8 + (this.slot - 1)) * 128;
  }
}

export class MultiSlot {
  constructor(
    readonly bank: number,
    readonly group: number,
    readonly slot: number,
  ) {
    assertInRange("bank", bank, 1, 2);
    assertInRange("group", group, 1, 8);
    assertInRange("slot", slot, 1, 8);
  }

  byteAddress(): number {
    const linear = (this.bank - 1) * 64 + (this.group - 1) * 8 + (this.slot - 1);
    return 0x010000 + linear * 512;
  }
}
