// Typed error hierarchy for every MIDI transport failure mode.
export type MidiErrorCode =
  | "no-matching-port"
  | "ambiguous-port"
  | "sysex-not-enabled"
  | "connection-closed"
  | "stream-busy";

export abstract class MidiError extends Error {
  abstract readonly code: MidiErrorCode;
}

export class NoMatchingPortError extends MidiError {
  readonly code = "no-matching-port" as const;

  constructor(readonly specifier: string) {
    super(`no MIDI port matches "${specifier}"`);
    this.name = "NoMatchingPortError";
  }
}

export class AmbiguousPortError extends MidiError {
  readonly code = "ambiguous-port" as const;

  constructor(
    readonly specifier: string,
    readonly matches: readonly string[],
  ) {
    super(`"${specifier}" matches ${matches.length} MIDI ports: ${matches.join(", ")}`);
    this.name = "AmbiguousPortError";
  }
}

export class SysExNotEnabledError extends MidiError {
  readonly code = "sysex-not-enabled" as const;

  constructor() {
    super("Web MIDI access was granted without system exclusive permission");
    this.name = "SysExNotEnabledError";
  }
}

export class ConnectionClosedError extends MidiError {
  readonly code = "connection-closed" as const;

  constructor(
    readonly inputName: string,
    readonly outputName: string,
  ) {
    super(`the connection to ${inputName} / ${outputName} is closed`);
    this.name = "ConnectionClosedError";
  }
}

export class SysExStreamBusyError extends MidiError {
  readonly code = "stream-busy" as const;

  constructor(readonly stream: string) {
    super(`the ${stream} stream already has a consumer`);
    this.name = "SysExStreamBusyError";
  }
}
