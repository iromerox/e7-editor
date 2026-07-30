// Buffers inbound bytes until a complete F0...F7 SysEx frame is on hand.
import { SYSEX_END, SYSEX_START } from "../protocol";

export interface SysExReassemblyStats {
  readonly pendingBytes: number;
  readonly fragmentedFrames: number;
  readonly discardedPartials: number;
}

export interface SysExReassembler extends SysExReassemblyStats {
  push(chunk: Uint8Array): readonly Uint8Array[];
  reset(): void;
}

export function createSysExReassembler(): SysExReassembler {
  const partial: number[] = [];
  let open = false;
  let chunks = 0;
  let openedInChunk = 0;
  let fragmentedFrames = 0;
  let discardedPartials = 0;

  return {
    get pendingBytes(): number {
      return partial.length;
    },
    get fragmentedFrames(): number {
      return fragmentedFrames;
    },
    get discardedPartials(): number {
      return discardedPartials;
    },
    push(chunk: Uint8Array): readonly Uint8Array[] {
      chunks += 1;
      const frames: Uint8Array[] = [];
      for (const byte of chunk) {
        if (byte === SYSEX_START) {
          if (open) {
            discardedPartials += 1;
          }
          partial.length = 0;
          partial.push(byte);
          open = true;
          openedInChunk = chunks;
          continue;
        }
        if (!open) {
          continue;
        }
        partial.push(byte);
        if (byte === SYSEX_END) {
          if (openedInChunk !== chunks) {
            fragmentedFrames += 1;
          }
          frames.push(Uint8Array.from(partial));
          partial.length = 0;
          open = false;
        }
      }
      return frames;
    },
    reset(): void {
      partial.length = 0;
      open = false;
    },
  };
}
