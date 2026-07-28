// Delay clock-sync rate divisions (15 musical divisions); hardware-captured
// zone boundaries in a different byte order than LfoClockRate, unverified
// pending hardware re-validation.
import { decodeZoned, encodeZoned, type Zone } from "./cc";

export type DelayClockRate =
  | "sixteenth"
  | "sixteenth-triplet"
  | "eighth-triplet"
  | "dotted-sixteenth"
  | "eighth"
  | "quarter-triplet"
  | "dotted-eighth"
  | "quarter"
  | "half-triplet"
  | "dotted-quarter"
  | "half"
  | "whole-triplet"
  | "dotted-half"
  | "whole"
  | "thirty-second";

const DELAY_CLOCK_RATE_ZONES: readonly Zone<DelayClockRate>[] = [
  { max: 15, variant: "sixteenth" },
  { max: 17, variant: "sixteenth-triplet" },
  { max: 25, variant: "eighth-triplet" },
  { max: 33, variant: "dotted-sixteenth" },
  { max: 41, variant: "eighth" },
  { max: 49, variant: "quarter-triplet" },
  { max: 58, variant: "dotted-eighth" },
  { max: 66, variant: "quarter" },
  { max: 73, variant: "half-triplet" },
  { max: 81, variant: "dotted-quarter" },
  { max: 90, variant: "half" },
  { max: 98, variant: "whole-triplet" },
  { max: 106, variant: "dotted-half" },
  { max: 119, variant: "whole" },
  { max: 127, variant: "thirty-second" },
];

export function delayClockRateFromCc(value: number): DelayClockRate {
  return decodeZoned(value, DELAY_CLOCK_RATE_ZONES);
}

export function delayClockRateToCc(rate: DelayClockRate): number {
  return encodeZoned(rate, DELAY_CLOCK_RATE_ZONES);
}
