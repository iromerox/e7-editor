// The musical division a clock-synced rate reads as, over the LFO's controller axis and the delay's reversed one.
import type { DelayType, LfoClockRate, LfoMode } from "../protocol";
import { delayClockRateFromCc, lfoClockRateFromCc } from "../protocol";
import { ccValue } from "./control-value";

const CLOCK_RATE_NAMES: Readonly<Record<LfoClockRate, string>> = {
  whole: "Whole Note",
  "dotted-half": "Dotted 1/2 Note",
  "whole-triplet": "Whole Note Triplet",
  half: "1/2 Note",
  "dotted-quarter": "Dotted 1/4 Note",
  "half-triplet": "1/2 Note Triplet",
  quarter: "1/4 Note",
  "dotted-eighth": "Dotted 1/8 Note",
  "quarter-triplet": "1/4 Note Triplet",
  eighth: "1/8 Note",
  "dotted-sixteenth": "Dotted 1/16 Note",
  "eighth-triplet": "1/8 Note Triplet",
  sixteenth: "1/16 Note",
  "sixteenth-triplet": "1/16 Note Triplet",
  "thirty-second": "1/32 Note",
};

export function isClockSyncedLfoMode(mode: LfoMode): boolean {
  return mode === "clock-sync" || mode === "keyboard-clock-sync";
}

export function isClockSyncedDelayType(type: DelayType): boolean {
  return type === "stereo-sync" || type === "ping-pong-sync";
}

export function lfoRateReadout(value: number): string {
  return CLOCK_RATE_NAMES[lfoClockRateFromCc(ccValue(value))];
}

export function delayTimeReadout(value: number): string {
  return CLOCK_RATE_NAMES[delayClockRateFromCc(ccValue(value))];
}
