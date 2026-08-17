// Typed error hierarchy for the memory-block reads that assemble a device slot.

export type DeviceReadErrorCode = "slot-block-length" | "slot-block-unanswered";

export abstract class DeviceReadError extends Error {
  abstract readonly code: DeviceReadErrorCode;
}

function hexAddress(address: number): string {
  return `0x${address.toString(16).toUpperCase().padStart(6, "0")}`;
}

function describeReason(reason: unknown): string {
  return reason instanceof Error ? reason.message : String(reason);
}

export class SlotBlockLengthError extends DeviceReadError {
  readonly code = "slot-block-length" as const;

  constructor(
    readonly address: number,
    readonly expected: number,
    readonly actual: number,
  ) {
    super(`read of ${hexAddress(address)} returned ${actual} bytes, expected ${expected}`);
    this.name = "SlotBlockLengthError";
  }
}

export class SlotBlockUnansweredError extends DeviceReadError {
  readonly code = "slot-block-unanswered" as const;

  constructor(
    readonly address: number,
    readonly reason: unknown,
  ) {
    super(`read of ${hexAddress(address)} was not answered: ${describeReason(reason)}`, {
      cause: reason,
    });
    this.name = "SlotBlockUnansweredError";
  }
}
