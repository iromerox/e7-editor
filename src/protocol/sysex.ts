// SysEx commands, headed by the manufacturer ID, and the bare-data responses they draw.
import { pack, unpack } from "./nibble";
import { LOCK_BYTE_INDEX } from "./preset";

export const SYSEX_START = 0xf0;
export const SYSEX_END = 0xf7;
export const MANUFACTURER_ID: readonly number[] = [0x00, 0x21, 0x62];
export const DEVICE_ID = 0x01;
export const MODEL_ID = 0x10;
export const COMMAND_HEADER: readonly number[] = [...MANUFACTURER_ID, DEVICE_ID, MODEL_ID];

export const ADDRESS_BYTES = 3;
export const MAX_SYSEX_ADDRESS = 0x1fffff;
export const READ_MEMORY_BLOCK_BYTES = 16;
export const READ_CONFIGURATION_BYTES = 4;
export const WRITE_CONFIGURATION_BYTES = 7;
export const MAX_SERIAL_NUMBER = 0x3fff;
export const AUTOTUNING_VOICES = 7;
export const MAX_AUTOTUNING_PROGRESS = 0x0f;

export const PRESET_UNLOCKED = 0x00;
export const PRESET_LOCKED = 0x01;

export type FramingFault = "truncated" | "missing-start" | "missing-end";

export class SysExFramingError extends Error {
  constructor(
    readonly fault: FramingFault,
    readonly length: number,
  ) {
    super(`SysEx frame of ${length} bytes is ${fault}`);
    this.name = "SysExFramingError";
  }
}

export class ManufacturerHeaderError extends Error {
  constructor(readonly received: readonly number[]) {
    super(`expected manufacturer header ${hex(COMMAND_HEADER)}, got ${hex(received)}`);
    this.name = "ManufacturerHeaderError";
  }
}

export class UnknownSysExCommandError extends Error {
  constructor(readonly id: number) {
    super(`unknown SysEx command 0x${id.toString(16).padStart(2, "0")}`);
    this.name = "UnknownSysExCommandError";
  }
}

export class SysExAddressRangeError extends Error {
  constructor(readonly address: number) {
    super(`address must be an integer between 0 and ${MAX_SYSEX_ADDRESS}, got ${address}`);
    this.name = "SysExAddressRangeError";
  }
}

export class SysExDataByteRangeError extends Error {
  constructor(
    readonly value: number,
    readonly index: number,
  ) {
    super(`data byte ${index} must be an integer between 0 and 127, got ${value}`);
    this.name = "SysExDataByteRangeError";
  }
}

export class SysExPayloadLengthError extends Error {
  constructor(
    readonly kind: string,
    readonly expected: number,
    readonly actual: number,
  ) {
    super(`${kind} payload of ${actual} bytes is invalid, expected ${expected}`);
    this.name = "SysExPayloadLengthError";
  }
}

export class SysExFieldRangeError extends Error {
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

export interface WriteConfigurationFields {
  readonly rxChannel: number;
  readonly txChannel: number;
  readonly filterMode: number;
  readonly softThruMode: number;
  readonly clockSource: number;
  readonly mpeEnable: number;
}

export interface ReadConfigurationFields {
  readonly rxChannel: number;
  readonly txChannel: number;
  readonly filterMode: number;
  readonly softThruMode: number;
}

export type SysExCommand =
  | { readonly kind: "all-leds-on" }
  | { readonly kind: "read-serial-number" }
  | { readonly kind: "read-memory"; readonly address: number }
  | { readonly kind: "write-memory"; readonly address: number; readonly data: Uint8Array }
  | { readonly kind: "factory-reset" }
  | { readonly kind: "read-configuration" }
  | { readonly kind: "write-configuration"; readonly configuration: WriteConfigurationFields }
  | { readonly kind: "initialize-preset" }
  | { readonly kind: "read-autotuning-status" };

export type SysExCommandKind = SysExCommand["kind"];

export interface SerialNumberResponse {
  readonly kind: "serial-number";
  readonly serialNumber: number;
}

export interface MemoryDataResponse {
  readonly kind: "memory-data";
  readonly data: Uint8Array;
}

export interface ConfigurationResponse extends ReadConfigurationFields {
  readonly kind: "configuration";
}

export interface AutotuningStatusResponse {
  readonly kind: "autotuning-status";
  readonly on: boolean;
  readonly voices: Uint8Array;
}

export type SysExResponse =
  | SerialNumberResponse
  | MemoryDataResponse
  | ConfigurationResponse
  | AutotuningStatusResponse;

export type SysExMessage = SysExCommand | SysExResponse;

export const SYSEX_COMMAND_IDS = {
  "read-autotuning-status": 0x0a,
  "read-configuration": 0x0c,
  "write-configuration": 0x0d,
  "read-memory": 0x0e,
  "write-memory": 0x0f,
  "initialize-preset": 0x10,
  "all-leds-on": 0x13,
  "factory-reset": 0x14,
  "read-serial-number": 0x20,
} as const satisfies Record<SysExCommandKind, number>;

function hex(bytes: readonly number[]): string {
  return bytes.map((byte) => byte.toString(16).padStart(2, "0")).join(" ");
}

function byteAt(bytes: Uint8Array, index: number, kind: string): number {
  const value = bytes[index];
  if (value === undefined) {
    throw new SysExPayloadLengthError(kind, index + 1, bytes.length);
  }
  return value;
}

function assertField(field: string, value: number, min: number, max: number): number {
  if (value < min || value > max) {
    throw new SysExFieldRangeError(field, value, min, max);
  }
  return value;
}

export function encodeAddress(address: number): number[] {
  if (!Number.isInteger(address) || address < 0 || address > MAX_SYSEX_ADDRESS) {
    throw new SysExAddressRangeError(address);
  }
  return [address & 0x7f, (address >> 7) & 0x7f, (address >> 14) & 0x7f];
}

export function decodeAddress(bytes: Uint8Array): number {
  if (bytes.length !== ADDRESS_BYTES) {
    throw new SysExPayloadLengthError("address", ADDRESS_BYTES, bytes.length);
  }
  const lower = byteAt(bytes, 0, "address");
  const middle = byteAt(bytes, 1, "address");
  const higher = byteAt(bytes, 2, "address");
  return lower | (middle << 7) | (higher << 14);
}

function frameOf(data: readonly number[]): Uint8Array {
  for (const [index, value] of data.entries()) {
    if (!Number.isInteger(value) || value < 0 || value > 0x7f) {
      throw new SysExDataByteRangeError(value, index);
    }
  }
  return Uint8Array.from([SYSEX_START, ...data, SYSEX_END]);
}

function frameData(frame: Uint8Array): Uint8Array {
  if (frame.length < 2) {
    throw new SysExFramingError("truncated", frame.length);
  }
  if (frame[0] !== SYSEX_START) {
    throw new SysExFramingError("missing-start", frame.length);
  }
  if (frame[frame.length - 1] !== SYSEX_END) {
    throw new SysExFramingError("missing-end", frame.length);
  }
  return frame.subarray(1, frame.length - 1);
}

function configurationBytes(configuration: WriteConfigurationFields): number[] {
  return [
    configuration.rxChannel,
    configuration.txChannel,
    configuration.filterMode,
    configuration.softThruMode,
    configuration.clockSource,
    configuration.mpeEnable,
    0x00,
  ];
}

function commandBody(command: SysExCommand): number[] {
  const id = SYSEX_COMMAND_IDS[command.kind];
  switch (command.kind) {
    case "read-memory":
      return [id, ...encodeAddress(command.address)];
    case "write-memory":
      return [id, ...encodeAddress(command.address), ...pack(command.data)];
    case "write-configuration":
      return [id, ...configurationBytes(command.configuration)];
    case "all-leds-on":
    case "read-serial-number":
    case "factory-reset":
    case "read-configuration":
    case "initialize-preset":
    case "read-autotuning-status":
      return [id];
  }
}

export function encodeCommand(command: SysExCommand): Uint8Array {
  return frameOf([...COMMAND_HEADER, ...commandBody(command)]);
}

function withoutPayload<Kind extends SysExCommandKind>(
  kind: Kind,
  payload: Uint8Array,
): { readonly kind: Kind } {
  if (payload.length !== 0) {
    throw new SysExPayloadLengthError(kind, 0, payload.length);
  }
  return { kind };
}

function decodeWriteConfiguration(payload: Uint8Array): SysExCommand {
  if (payload.length !== WRITE_CONFIGURATION_BYTES) {
    throw new SysExPayloadLengthError(
      "write-configuration",
      WRITE_CONFIGURATION_BYTES,
      payload.length,
    );
  }
  assertField("configuration pad", byteAt(payload, 6, "write-configuration"), 0, 0);
  return {
    kind: "write-configuration",
    configuration: {
      rxChannel: byteAt(payload, 0, "write-configuration"),
      txChannel: byteAt(payload, 1, "write-configuration"),
      filterMode: byteAt(payload, 2, "write-configuration"),
      softThruMode: byteAt(payload, 3, "write-configuration"),
      clockSource: byteAt(payload, 4, "write-configuration"),
      mpeEnable: byteAt(payload, 5, "write-configuration"),
    },
  };
}

export function decodeCommand(frame: Uint8Array): SysExCommand {
  const data = frameData(frame);
  const header = data.subarray(0, COMMAND_HEADER.length);
  if (!COMMAND_HEADER.every((byte, index) => header[index] === byte)) {
    throw new ManufacturerHeaderError(Array.from(header));
  }
  const body = data.subarray(COMMAND_HEADER.length);
  if (body.length === 0) {
    throw new SysExFramingError("truncated", frame.length);
  }
  const id = byteAt(body, 0, "command");
  const payload = body.subarray(1);
  switch (id) {
    case SYSEX_COMMAND_IDS["all-leds-on"]:
      return withoutPayload("all-leds-on", payload);
    case SYSEX_COMMAND_IDS["read-serial-number"]:
      return withoutPayload("read-serial-number", payload);
    case SYSEX_COMMAND_IDS["factory-reset"]:
      return withoutPayload("factory-reset", payload);
    case SYSEX_COMMAND_IDS["read-configuration"]:
      return withoutPayload("read-configuration", payload);
    case SYSEX_COMMAND_IDS["initialize-preset"]:
      return withoutPayload("initialize-preset", payload);
    case SYSEX_COMMAND_IDS["read-autotuning-status"]:
      return withoutPayload("read-autotuning-status", payload);
    case SYSEX_COMMAND_IDS["read-memory"]:
      return { kind: "read-memory", address: decodeAddress(payload) };
    case SYSEX_COMMAND_IDS["write-memory"]:
      return {
        kind: "write-memory",
        address: decodeAddress(payload.subarray(0, ADDRESS_BYTES)),
        data: unpack(payload.subarray(ADDRESS_BYTES)),
      };
    case SYSEX_COMMAND_IDS["write-configuration"]:
      return decodeWriteConfiguration(payload);
    default:
      throw new UnknownSysExCommandError(id);
  }
}

function responseBody(response: SysExResponse): number[] {
  switch (response.kind) {
    case "serial-number": {
      const serial = assertField("serial number", response.serialNumber, 0, MAX_SERIAL_NUMBER);
      return [serial & 0x7f, serial >> 7];
    }
    case "memory-data":
      return [...pack(response.data)];
    case "configuration":
      return [response.rxChannel, response.txChannel, response.filterMode, response.softThruMode];
    case "autotuning-status":
      return [response.on ? 1 : 0, ...response.voices];
  }
}

export function encodeResponse(response: SysExResponse): Uint8Array {
  return frameOf(responseBody(response));
}

function responseData(frame: Uint8Array, kind: string, expected: number): Uint8Array {
  const data = frameData(frame);
  if (data.length !== expected) {
    throw new SysExPayloadLengthError(kind, expected, data.length);
  }
  return data;
}

export function decodeSerialNumberResponse(frame: Uint8Array): SerialNumberResponse {
  const data = responseData(frame, "serial-number", 2);
  return {
    kind: "serial-number",
    serialNumber: byteAt(data, 0, "serial-number") | (byteAt(data, 1, "serial-number") << 7),
  };
}

export function decodeMemoryDataResponse(frame: Uint8Array): MemoryDataResponse {
  return { kind: "memory-data", data: unpack(frameData(frame)) };
}

export function decodeConfigurationResponse(frame: Uint8Array): ConfigurationResponse {
  const data = responseData(frame, "configuration", READ_CONFIGURATION_BYTES);
  return {
    kind: "configuration",
    rxChannel: byteAt(data, 0, "configuration"),
    txChannel: byteAt(data, 1, "configuration"),
    filterMode: byteAt(data, 2, "configuration"),
    softThruMode: byteAt(data, 3, "configuration"),
  };
}

export function decodeAutotuningStatusResponse(frame: Uint8Array): AutotuningStatusResponse {
  const data = responseData(frame, "autotuning-status", 1 + AUTOTUNING_VOICES);
  const on = assertField("autotuning on/off", byteAt(data, 0, "autotuning-status"), 0, 1) === 1;
  const voices = data.subarray(1);
  for (const [index, progress] of voices.entries()) {
    assertField(`autotuning voice ${index + 1}`, progress, 0, MAX_AUTOTUNING_PROGRESS);
  }
  return { kind: "autotuning-status", on, voices };
}

export function presetLockAddress(presetAddress: number): number {
  return presetAddress + LOCK_BYTE_INDEX;
}

export function lockPresetCommand(presetAddress: number): SysExCommand {
  return {
    kind: "write-memory",
    address: presetLockAddress(presetAddress),
    data: Uint8Array.of(PRESET_LOCKED),
  };
}

export function unlockPresetCommand(presetAddress: number): SysExCommand {
  return {
    kind: "write-memory",
    address: presetLockAddress(presetAddress),
    data: Uint8Array.of(PRESET_UNLOCKED),
  };
}

export function isPresetLocked(lockByte: number): boolean {
  return lockByte === PRESET_LOCKED;
}
