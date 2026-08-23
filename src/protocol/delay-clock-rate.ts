// Delay clock-sync rate: the LFO's 15 divisions again, over a reversed controller axis.
import type { Zone } from "./cc";
import { decodeZoned, encodeZoned, mirrorZones } from "./cc";
import { LFO_CLOCK_RATE_ZONES } from "./lfo-clock-rate";

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

const DELAY_CLOCK_RATE_ZONES: readonly Zone<DelayClockRate>[] = mirrorZones(LFO_CLOCK_RATE_ZONES);

export function delayClockRateFromCc(value: number): DelayClockRate {
  return decodeZoned(value, DELAY_CLOCK_RATE_ZONES);
}

export function delayClockRateToCc(rate: DelayClockRate): number {
  return encodeZoned(rate, DELAY_CLOCK_RATE_ZONES);
}
