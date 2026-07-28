// LFO clock-sync rate divisions (15 musical divisions); hardware-captured
// zone boundaries, unverified pending hardware re-validation.
import { decodeZoned, encodeZoned, type Zone } from "./cc";

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
  { max: 0, variant: "whole" },
  { max: 8, variant: "dotted-half" },
  { max: 16, variant: "whole-triplet" },
  { max: 23, variant: "half" },
  { max: 32, variant: "dotted-quarter" },
  { max: 40, variant: "half-triplet" },
  { max: 48, variant: "quarter" },
  { max: 55, variant: "dotted-eighth" },
  { max: 64, variant: "quarter-triplet" },
  { max: 71, variant: "eighth" },
  { max: 80, variant: "dotted-sixteenth" },
  { max: 87, variant: "eighth-triplet" },
  { max: 96, variant: "sixteenth" },
  { max: 103, variant: "sixteenth-triplet" },
  { max: 127, variant: "thirty-second" },
];

export function lfoClockRateFromCc(value: number): LfoClockRate {
  return decodeZoned(value, LFO_CLOCK_RATE_ZONES);
}

export function lfoClockRateToCc(rate: LfoClockRate): number {
  return encodeZoned(rate, LFO_CLOCK_RATE_ZONES);
}
