// Voices CC (97): V1/V2 packed as 16*V1 + V2; V1 > 4 or V2 > 7 is reserved,
// capping the maximum legal CC at 71 (protocol-quirks.md #8).
import { ReservedValue } from "./cc";

export class Voices {
  constructor(
    readonly v1: number,
    readonly v2: number,
  ) {
    if (!Number.isInteger(v1) || v1 < 0 || v1 > 4 || !Number.isInteger(v2) || v2 < 0 || v2 > 7) {
      throw new ReservedValue(16 * v1 + v2, 71);
    }
  }

  static fromCc(value: number): Voices {
    return new Voices(Math.floor(value / 16), value % 16);
  }

  toCc(): number {
    return 16 * this.v1 + this.v2;
  }
}
