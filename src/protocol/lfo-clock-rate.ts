// LFO clock-sync rate: the 15 musical divisions and the CC zones that select them.
import type { Zone } from "./cc";
import { bandedZones, decodeZoned, encodeZoned } from "./cc";

const LFO_CLOCK_RATE_ORDER = [
  "whole",
  "dotted-half",
  "whole-triplet",
  "half",
  "dotted-quarter",
  "half-triplet",
  "quarter",
  "dotted-eighth",
  "quarter-triplet",
  "eighth",
  "dotted-sixteenth",
  "eighth-triplet",
  "sixteenth",
  "sixteenth-triplet",
  "thirty-second",
] as const;

export type LfoClockRate = (typeof LFO_CLOCK_RATE_ORDER)[number];

const CLOCK_RATE_BAND_WIDTH = 8;

export const LFO_CLOCK_RATE_ZONES: readonly Zone<LfoClockRate>[] = bandedZones(
  LFO_CLOCK_RATE_ORDER,
  CLOCK_RATE_BAND_WIDTH,
);

export function lfoClockRateFromCc(value: number): LfoClockRate {
  return decodeZoned(value, LFO_CLOCK_RATE_ZONES);
}

export function lfoClockRateToCc(rate: LfoClockRate): number {
  return encodeZoned(rate, LFO_CLOCK_RATE_ZONES);
}
