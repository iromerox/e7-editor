// Typed error hierarchy for every MIDI transport failure mode.
export type MidiErrorCode = "no-matching-port" | "ambiguous-port";

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
