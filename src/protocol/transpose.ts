// Irregular 49-band CC-to-semitone lookup for Transpose.
import type { Zone } from "./cc";
import { decodeZoned, encodeZoned } from "./cc";

export type Transpose =
  | -24
  | -23
  | -22
  | -21
  | -20
  | -19
  | -18
  | -17
  | -16
  | -15
  | -14
  | -13
  | -12
  | -11
  | -10
  | -9
  | -8
  | -7
  | -6
  | -5
  | -4
  | -3
  | -2
  | -1
  | 0
  | 1
  | 2
  | 3
  | 4
  | 5
  | 6
  | 7
  | 8
  | 9
  | 10
  | 11
  | 12
  | 13
  | 14
  | 15
  | 16
  | 17
  | 18
  | 19
  | 20
  | 21
  | 22
  | 23
  | 24;

const TRANSPOSE_ZONES: readonly Zone<Transpose>[] = [
  { max: 1, variant: -24 },
  { max: 3, variant: -23 },
  { max: 6, variant: -22 },
  { max: 9, variant: -21 },
  { max: 11, variant: -20 },
  { max: 14, variant: -19 },
  { max: 17, variant: -18 },
  { max: 19, variant: -17 },
  { max: 22, variant: -16 },
  { max: 25, variant: -15 },
  { max: 27, variant: -14 },
  { max: 30, variant: -13 },
  { max: 33, variant: -12 },
  { max: 35, variant: -11 },
  { max: 38, variant: -10 },
  { max: 41, variant: -9 },
  { max: 43, variant: -8 },
  { max: 46, variant: -7 },
  { max: 48, variant: -6 },
  { max: 51, variant: -5 },
  { max: 54, variant: -4 },
  { max: 56, variant: -3 },
  { max: 59, variant: -2 },
  { max: 61, variant: -1 },
  { max: 65, variant: 0 },
  { max: 67, variant: 1 },
  { max: 70, variant: 2 },
  { max: 72, variant: 3 },
  { max: 75, variant: 4 },
  { max: 78, variant: 5 },
  { max: 80, variant: 6 },
  { max: 83, variant: 7 },
  { max: 85, variant: 8 },
  { max: 88, variant: 9 },
  { max: 91, variant: 10 },
  { max: 93, variant: 11 },
  { max: 96, variant: 12 },
  { max: 99, variant: 13 },
  { max: 101, variant: 14 },
  { max: 104, variant: 15 },
  { max: 107, variant: 16 },
  { max: 109, variant: 17 },
  { max: 112, variant: 18 },
  { max: 115, variant: 19 },
  { max: 117, variant: 20 },
  { max: 120, variant: 21 },
  { max: 123, variant: 22 },
  { max: 125, variant: 23 },
  { max: 127, variant: 24 },
];

export function transposeFromCc(value: number): Transpose {
  return decodeZoned(value, TRANSPOSE_ZONES);
}

export function transposeToCc(transpose: Transpose): number {
  return encodeZoned(transpose, TRANSPOSE_ZONES);
}
