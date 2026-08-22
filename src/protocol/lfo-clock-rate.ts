// LFO clock-sync rate: the 15 musical divisions and the CC zones that select them.
import type { Zone } from "./cc";
import { decodeZoned, encodeZoned } from "./cc";

export type LfoClockRate =
  | "whole"
  | "dotted-half"
  | "whole-triplet"
  | "half"
  | "dotted-quarter"
  | "half-triplet"
  | "quarter"
  | "dotted-eighth"
  | "quarter-triplet"
  | "eighth"
  | "dotted-sixteenth"
  | "eighth-triplet"
  | "sixteenth"
  | "sixteenth-triplet"
  | "thirty-second";

const LFO_CLOCK_RATE_ZONES: readonly Zone<LfoClockRate>[] = [
  { max: 7, variant: "whole" },
  { max: 15, variant: "dotted-half" },
  { max: 23, variant: "whole-triplet" },
  { max: 31, variant: "half" },
  { max: 39, variant: "dotted-quarter" },
  { max: 47, variant: "half-triplet" },
  { max: 55, variant: "quarter" },
  { max: 63, variant: "dotted-eighth" },
  { max: 71, variant: "quarter-triplet" },
  { max: 79, variant: "eighth" },
  { max: 87, variant: "dotted-sixteenth" },
  { max: 95, variant: "eighth-triplet" },
  { max: 103, variant: "sixteenth" },
  { max: 111, variant: "sixteenth-triplet" },
  { max: 127, variant: "thirty-second" },
];

export function lfoClockRateFromCc(value: number): LfoClockRate {
  return decodeZoned(value, LFO_CLOCK_RATE_ZONES);
}

export function lfoClockRateToCc(rate: LfoClockRate): number {
  return encodeZoned(rate, LFO_CLOCK_RATE_ZONES);
}
