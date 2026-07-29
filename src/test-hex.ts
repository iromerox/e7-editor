// Parses byte sequences transcribed verbatim from the reference documents' printed hex examples.
const HEX_BYTE = /^[0-9A-Fa-f]{2}$/;

export function specBytes(printed: string): Uint8Array {
  const tokens = printed.trim().split(/\s+/);
  return Uint8Array.from(tokens, (token) => {
    if (!HEX_BYTE.test(token)) {
      throw new Error(`not a transcribed hex byte: "${token}"`);
    }
    return Number.parseInt(token, 16);
  });
}
