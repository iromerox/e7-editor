// Delay clock-sync rate: the LFO's 15 divisions again, over a reversed controller axis.
import type { Zone } from "./cc";
import { decodeZoned, encodeZoned } from "./cc";

export type DelayClockRate =
  | "thirty-second"
  | "sixteenth-triplet"
  | "sixteenth"
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
  | "whole";

const DELAY_CLOCK_RATE_ZONES: readonly Zone<DelayClockRate>[] = [
  { max: 15, variant: "thirty-second" },
  { max: 23, variant: "sixteenth-triplet" },
  { max: 31, variant: "sixteenth" },
  { max: 39, variant: "eighth-triplet" },
  { max: 47, variant: "dotted-sixteenth" },
  { max: 55, variant: "eighth" },
  { max: 63, variant: "quarter-triplet" },
  { max: 71, variant: "dotted-eighth" },
  { max: 79, variant: "quarter" },
  { max: 87, variant: "half-triplet" },
  { max: 95, variant: "dotted-quarter" },
  { max: 103, variant: "half" },
  { max: 111, variant: "whole-triplet" },
  { max: 119, variant: "dotted-half" },
  { max: 127, variant: "whole" },
];

export function delayClockRateFromCc(value: number): DelayClockRate {
  return decodeZoned(value, DELAY_CLOCK_RATE_ZONES);
}

export function delayClockRateToCc(rate: DelayClockRate): number {
  return encodeZoned(rate, DELAY_CLOCK_RATE_ZONES);
}
