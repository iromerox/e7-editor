// The polyphonic voice selection and the monophonic voice, packed into one controller value.
import { bandedZones, decodeZoned, encodeZoned } from "./cc";
import { ReservedValue } from "./errors";

const POLY_SELECTIONS = [0, 1, 2, 3, 4];
const POLY_MAX = POLY_SELECTIONS.length - 1;
const POLY_BAND_WIDTH = 16;
const MONO_MASK = 7;
const CANONICAL_MAX_CC = POLY_BAND_WIDTH * POLY_MAX + MONO_MASK;

const POLY_ZONES = bandedZones(POLY_SELECTIONS, POLY_BAND_WIDTH, "absorb");

function inRange(value: number, max: number): boolean {
  return Number.isInteger(value) && value >= 0 && value <= max;
}

export class Voices {
  constructor(
    readonly v1: number,
    readonly v2: number,
  ) {
    if (!inRange(v1, POLY_MAX) || !inRange(v2, MONO_MASK)) {
      throw new ReservedValue(POLY_BAND_WIDTH * v1 + v2, CANONICAL_MAX_CC);
    }
  }

  static fromCc(value: number): Voices {
    return new Voices(decodeZoned(value, POLY_ZONES), value & MONO_MASK);
  }

  toCc(): number {
    return encodeZoned(this.v1, POLY_ZONES) + this.v2;
  }
}
