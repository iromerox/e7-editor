// Typed error hierarchy for every protocol encode/decode failure mode.
export type ProtocolErrorCode =
  | "sysex-framing"
  | "manufacturer-header"
  | "unknown-sysex-command"
  | "sysex-address-range"
  | "sysex-data-byte-range"
  | "sysex-field-range"
  | "sysex-payload-length"
  | "odd-nibble-payload"
  | "nibble-range"
  | "address-component-range"
  | "reserved-value"
  | "mcm-channel-count-range"
  | "mcm-template"
  | "preset-length"
  | "preset-byte-range"
  | "program-change-range";

export abstract class ProtocolError extends Error {
  abstract readonly code: ProtocolErrorCode;
}

function hex(bytes: readonly number[]): string {
  return bytes.map((byte) => byte.toString(16).padStart(2, "0")).join(" ");
}

export type FramingFault = "truncated" | "missing-start" | "missing-end";

export class SysExFramingError extends ProtocolError {
  readonly code = "sysex-framing" as const;

  constructor(
    readonly fault: FramingFault,
    readonly length: number,
  ) {
    super(`SysEx frame of ${length} bytes is ${fault}`);
    this.name = "SysExFramingError";
  }
}

export class ManufacturerHeaderError extends ProtocolError {
  readonly code = "manufacturer-header" as const;

  constructor(
    readonly expected: readonly number[],
    readonly received: readonly number[],
  ) {
    super(`expected manufacturer header ${hex(expected)}, got ${hex(received)}`);
    this.name = "ManufacturerHeaderError";
  }
}

export class UnknownSysExCommandError extends ProtocolError {
  readonly code = "unknown-sysex-command" as const;

  constructor(readonly id: number) {
    super(`unknown SysEx command 0x${id.toString(16).padStart(2, "0")}`);
    this.name = "UnknownSysExCommandError";
  }
}

export class SysExAddressRangeError extends ProtocolError {
  readonly code = "sysex-address-range" as const;

  constructor(
    readonly address: number,
    readonly min: number,
    readonly max: number,
  ) {
    super(`address must be an integer between ${min} and ${max}, got ${address}`);
    this.name = "SysExAddressRangeError";
  }
}

export class SysExDataByteRangeError extends ProtocolError {
  readonly code = "sysex-data-byte-range" as const;

  constructor(
    readonly value: number,
    readonly index: number,
  ) {
    super(`data byte ${index} must be an integer between 0 and 127, got ${value}`);
    this.name = "SysExDataByteRangeError";
  }
}

export class SysExFieldRangeError extends ProtocolError {
  readonly code = "sysex-field-range" as const;

  constructor(
    readonly field: string,
    readonly value: number,
    readonly min: number,
    readonly max: number,
  ) {
    super(`${field} must be between ${min} and ${max}, got ${value}`);
    this.name = "SysExFieldRangeError";
  }
}

export class SysExPayloadLengthError extends ProtocolError {
  readonly code = "sysex-payload-length" as const;

  constructor(
    readonly kind: string,
    readonly expected: number,
    readonly actual: number,
  ) {
    super(`${kind} payload of ${actual} bytes is invalid, expected ${expected}`);
    this.name = "SysExPayloadLengthError";
  }
}

export class OddNibbleCountError extends ProtocolError {
  readonly code = "odd-nibble-payload" as const;

  constructor(readonly count: number) {
    super(`a nibble payload must have an even length, got ${count}`);
    this.name = "OddNibbleCountError";
  }
}

export class NibbleRangeError extends ProtocolError {
  readonly code = "nibble-range" as const;

  constructor(
    readonly value: number,
    readonly index: number,
  ) {
    super(`nibble ${index} must be between 0 and 15, got ${value}`);
    this.name = "NibbleRangeError";
  }
}

export type AddressComponent = "bank" | "group" | "slot";

export class AddressComponentRangeError extends ProtocolError {
  readonly code = "address-component-range" as const;

  constructor(
    readonly component: AddressComponent,
    readonly value: number,
    readonly min: number,
    readonly max: number,
  ) {
    super(`${component} must be between ${min} and ${max}, got ${value}`);
    this.name = "AddressComponentRangeError";
  }
}

export class ReservedValue extends ProtocolError {
  readonly code = "reserved-value" as const;

  constructor(
    readonly value: number,
    readonly lastMax: number,
  ) {
    super(`CC value ${value} is reserved (past the last zone's max of ${lastMax})`);
    this.name = "ReservedValue";
  }
}

export class McmChannelCountRangeError extends ProtocolError {
  readonly code = "mcm-channel-count-range" as const;

  constructor(readonly channels: number) {
    super(`MCM channel count must be between 0 and 15, got ${channels}`);
    this.name = "McmChannelCountRangeError";
  }
}

export class McmTemplateError extends ProtocolError {
  readonly code = "mcm-template" as const;

  constructor(readonly bytes: Uint8Array) {
    super(`bytes do not match the MCM template: ${hex(Array.from(bytes))}`);
    this.name = "McmTemplateError";
  }
}

export class PresetLengthError extends ProtocolError {
  readonly code = "preset-length" as const;

  constructor(
    readonly field: string,
    readonly expected: number,
    readonly actual: number,
  ) {
    super(`${field} must be ${expected} bytes, got ${actual}`);
    this.name = "PresetLengthError";
  }
}

export class PresetByteRangeError extends ProtocolError {
  readonly code = "preset-byte-range" as const;

  constructor(
    readonly field: string,
    readonly value: number | undefined,
  ) {
    super(`${field} must be an integer between 0 and 255, got ${value}`);
    this.name = "PresetByteRangeError";
  }
}

export type ProgramChangeField = "bank-msb" | "bank-lsb" | "program";

export class ProgramChangeRangeError extends ProtocolError {
  readonly code = "program-change-range" as const;

  constructor(
    readonly field: ProgramChangeField,
    readonly value: number,
    readonly min: number,
    readonly max: number,
  ) {
    super(`${field} must be between ${min} and ${max}, got ${value}`);
    this.name = "ProgramChangeRangeError";
  }
}
