// Splitting bytes into 4 bits per byte, the form SysEx payloads travel in.
export class OddNibbleCountError extends Error {
  constructor(readonly count: number) {
    super(`a nibble payload must have an even length, got ${count}`);
    this.name = "OddNibbleCountError";
  }
}

export class NibbleRangeError extends Error {
  constructor(
    readonly value: number,
    readonly index: number,
  ) {
    super(`nibble ${index} must be between 0 and 15, got ${value}`);
    this.name = "NibbleRangeError";
  }
}

export function pack(bytes: Uint8Array): Uint8Array {
  const nibbles = new Uint8Array(bytes.length * 2);
  for (const [index, byte] of bytes.entries()) {
    nibbles[index * 2] = byte & 0x0f;
    nibbles[index * 2 + 1] = byte >> 4;
  }
  return nibbles;
}

export function unpack(nibbles: Uint8Array): Uint8Array {
  if (nibbles.length % 2 !== 0) {
    throw new OddNibbleCountError(nibbles.length);
  }
  const bytes = new Uint8Array(nibbles.length / 2);
  let lower = 0;
  for (const [index, nibble] of nibbles.entries()) {
    if (nibble > 0x0f) {
      throw new NibbleRangeError(nibble, index);
    }
    if (index % 2 === 0) {
      lower = nibble;
    } else {
      bytes[(index - 1) / 2] = lower | (nibble << 4);
    }
  }
  return bytes;
}
