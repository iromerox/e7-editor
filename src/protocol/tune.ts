// 128-entry CC-to-millisemitone lookup for Tune; CC 63 and 64 both decode to
// 0, the table's only duplicate.
import { ReservedValue } from "./errors";

const TABLE: readonly number[] = [
  -500, -492, -484, -477, -469, -461, -453, -445, -438, -430, -422, -410, -402, -395, -387, -379,
  -371, -363, -355, -348, -340, -332, -324, -316, -309, -301, -293, -285, -277, -270, -262, -254,
  -246, -238, -230, -223, -215, -207, -199, -191, -184, -176, -164, -156, -148, -141, -133, -125,
  -117, -109, -102, -94, -86, -78, -70, -63, -55, -47, -39, -31, -23, -16, -8, 0, 0, 8, 16, 23, 31,
  39, 47, 55, 63, 70, 78, 86, 94, 102, 109, 117, 125, 133, 141, 148, 156, 164, 176, 184, 191, 199,
  207, 215, 223, 230, 238, 246, 254, 262, 270, 277, 285, 293, 301, 309, 316, 324, 332, 340, 348,
  355, 363, 371, 379, 387, 395, 402, 410, 422, 430, 438, 445, 453, 461, 469, 477, 484, 492, 500,
];

export class Tune {
  private constructor(readonly millisemitones: number) {}

  static fromCc(value: number): Tune {
    const millisemitones = TABLE[value];
    if (millisemitones === undefined) {
      throw new ReservedValue(value, 127);
    }
    return new Tune(millisemitones);
  }

  semitones(): number {
    return this.millisemitones / 1000;
  }

  toCc(): number {
    return TABLE.indexOf(this.millisemitones);
  }
}
