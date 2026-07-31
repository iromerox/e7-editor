// Typed error hierarchy for every library-side parsing and classification failure mode.
import type { ProtocolError, SysExCommandKind } from "../protocol";

export type StoreErrorCode =
  | "syx-file-framing"
  | "syx-frame-decode"
  | "unexpected-sysex-command"
  | "memory-block-length"
  | "memory-block-alignment"
  | "memory-block-range"
  | "duplicate-memory-block"
  | "incomplete-preset"
  | "malformed-backup"
  | "incompatible-backup"
  | "library-not-empty";

export abstract class StoreError extends Error {
  abstract readonly code: StoreErrorCode;
}

function hexAddress(address: number): string {
  return `0x${address.toString(16).padStart(6, "0")}`;
}

export type SyxFileFault = "empty" | "stray-byte" | "unterminated-frame";

export class SyxFileFramingError extends StoreError {
  readonly code = "syx-file-framing" as const;

  constructor(
    readonly fault: SyxFileFault,
    readonly offset: number,
  ) {
    super(`SysEx file is ${fault} at byte ${offset}`);
    this.name = "SyxFileFramingError";
  }
}

export class SyxFrameDecodeError extends StoreError {
  readonly code = "syx-frame-decode" as const;

  constructor(
    readonly frame: number,
    readonly reason: ProtocolError,
  ) {
    super(`frame ${frame} is not a readable SysEx command: ${reason.message}`, { cause: reason });
    this.name = "SyxFrameDecodeError";
  }
}

export class UnexpectedSysExCommandError extends StoreError {
  readonly code = "unexpected-sysex-command" as const;

  constructor(
    readonly frame: number,
    readonly kind: SysExCommandKind,
  ) {
    super(`frame ${frame} is a ${kind} command, but a library file holds only write-memory`);
    this.name = "UnexpectedSysExCommandError";
  }
}

export class MemoryBlockLengthError extends StoreError {
  readonly code = "memory-block-length" as const;

  constructor(
    readonly address: number,
    readonly expected: number,
    readonly actual: number,
  ) {
    super(`the block written to ${hexAddress(address)} is ${actual} bytes, expected ${expected}`);
    this.name = "MemoryBlockLengthError";
  }
}

export class MemoryBlockAlignmentError extends StoreError {
  readonly code = "memory-block-alignment" as const;

  constructor(
    readonly address: number,
    readonly blockBytes: number,
  ) {
    super(`${hexAddress(address)} is not a multiple of the ${blockBytes}-byte memory block`);
    this.name = "MemoryBlockAlignmentError";
  }
}

export class MemoryBlockRangeError extends StoreError {
  readonly code = "memory-block-range" as const;

  constructor(
    readonly address: number,
    readonly start: number,
    readonly end: number,
  ) {
    super(
      `${hexAddress(address)} is outside preset memory ${hexAddress(start)}-${hexAddress(end)}`,
    );
    this.name = "MemoryBlockRangeError";
  }
}

export class DuplicateMemoryBlockError extends StoreError {
  readonly code = "duplicate-memory-block" as const;

  constructor(readonly address: number) {
    super(`${hexAddress(address)} is written more than once`);
    this.name = "DuplicateMemoryBlockError";
  }
}

export class IncompletePresetError extends StoreError {
  readonly code = "incomplete-preset" as const;

  constructor(
    readonly start: number,
    readonly missing: number,
  ) {
    super(
      `the preset at ${hexAddress(start)} is partially written, ${hexAddress(missing)} is missing`,
    );
    this.name = "IncompletePresetError";
  }
}

export class MalformedBackupError extends StoreError {
  readonly code = "malformed-backup" as const;

  constructor(readonly fault: string) {
    super(`this is not a library backup: ${fault}`);
    this.name = "MalformedBackupError";
  }
}

export type BackupVersionMarker = "formatVersion" | "schemaVersion";

export class IncompatibleBackupError extends StoreError {
  readonly code = "incompatible-backup" as const;

  constructor(
    readonly marker: BackupVersionMarker,
    readonly supported: number,
    readonly found: number,
  ) {
    super(
      `the backup's ${marker} is ${found}, and this build reads ${supported}${
        found > supported ? " — it was written by a newer build" : ""
      }`,
    );
    this.name = "IncompatibleBackupError";
  }
}

export class LibraryNotEmptyError extends StoreError {
  readonly code = "library-not-empty" as const;

  constructor(readonly entries: number) {
    super(`a backup restores only into an empty library, and this one holds ${entries} entries`);
    this.name = "LibraryNotEmptyError";
  }
}
