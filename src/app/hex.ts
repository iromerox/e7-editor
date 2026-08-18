// Raw MIDI bytes as the spaced uppercase hex the reference documents print and a log can be pasted from.
export function formatHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).toUpperCase().padStart(2, "0")).join(" ");
}
