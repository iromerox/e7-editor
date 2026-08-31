// Bulk Read Memory over a sliding window of requests in flight, crediting each answer to the oldest request outstanding.
import type { Subscription } from "rxjs";
import type { Connection } from "./connection";
import { READ_MEMORY_BLOCK_BYTES, decodeMemoryDataResponse } from "../protocol";
import { BulkReadCancelledError, BulkReadShortFrameError, BulkReadUnansweredError } from "./errors";
import { DEFAULT_RESPONSE_TIMEOUT_MS } from "./request-response";

const FRAME_DELIMITER_BYTES = 2;

const NIBBLES_PER_BYTE = 2;

export const READ_MEMORY_RESPONSE_BYTES =
  FRAME_DELIMITER_BYTES + READ_MEMORY_BLOCK_BYTES * NIBBLES_PER_BYTE;

export const READ_WINDOW = 4;

export interface BulkReadOptions {
  readonly windowSize?: number;
  readonly timeoutMs?: number;
  readonly onBlock?: (index: number, data: Uint8Array) => void;
  readonly signal?: AbortSignal | undefined;
}

interface RunState {
  sent: number;
  received: number;
  flushed: boolean;
}

function windowOf(size: number | undefined): number {
  return Math.max(1, Math.min(size ?? READ_WINDOW, READ_WINDOW));
}

export function readMemoryBlocks(
  connection: Connection,
  addresses: readonly number[],
  options: BulkReadOptions = {},
): Promise<readonly Uint8Array[]> {
  const depth = windowOf(options.windowSize);
  const timeoutMs = options.timeoutMs ?? DEFAULT_RESPONSE_TIMEOUT_MS;
  const blocks: Uint8Array[] = [];
  if (addresses.length === 0) {
    return Promise.resolve(blocks);
  }

  return new Promise<readonly Uint8Array[]>((resolve, reject) => {
    const state: RunState = { sent: 0, received: 0, flushed: false };
    let subscription: Subscription | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let settled = false;

    const oldestOutstanding = (): number => addresses[state.received] ?? 0;

    const cleanup = (): void => {
      if (timer !== undefined) {
        clearTimeout(timer);
      }
      subscription?.unsubscribe();
      options.signal?.removeEventListener("abort", onAbort);
    };

    const fail = (error: Error): void => {
      if (settled) {
        return;
      }
      settled = true;
      cleanup();
      reject(error);
    };

    const succeed = (): void => {
      settled = true;
      cleanup();
      resolve(blocks);
    };

    function onAbort(): void {
      fail(new BulkReadCancelledError(state.received, addresses.length));
    }

    const expire = (): void => {
      if (state.sent >= addresses.length && !state.flushed) {
        state.flushed = true;
        connection.sendCommand({ kind: "read-memory", address: oldestOutstanding() });
        arm();
        return;
      }
      fail(
        new BulkReadUnansweredError(
          oldestOutstanding(),
          state.received,
          addresses.length,
          timeoutMs,
        ),
      );
    };

    function arm(): void {
      if (timer !== undefined) {
        clearTimeout(timer);
      }
      timer = setTimeout(expire, timeoutMs);
    }

    const fill = (): void => {
      while (state.sent < addresses.length && state.sent - state.received < depth) {
        const address = addresses[state.sent];
        if (address === undefined) {
          return;
        }
        state.sent += 1;
        connection.sendCommand({ kind: "read-memory", address });
      }
    };

    const onFrame = (frame: Uint8Array): void => {
      if (settled) {
        return;
      }
      if (frame.length !== READ_MEMORY_RESPONSE_BYTES) {
        if (state.received === 0) {
          return;
        }
        fail(
          new BulkReadShortFrameError(
            oldestOutstanding(),
            frame.length,
            state.received,
            addresses.length,
          ),
        );
        return;
      }
      const index = state.received;
      state.received += 1;
      const { data } = decodeMemoryDataResponse(frame);
      blocks.push(data);
      options.onBlock?.(index, data);
      if (state.received === addresses.length) {
        succeed();
        return;
      }
      fill();
      arm();
    };

    if (options.signal?.aborted === true) {
      reject(new BulkReadCancelledError(0, addresses.length));
      return;
    }
    options.signal?.addEventListener("abort", onAbort);

    subscription = connection.sysex.subscribe({
      next: onFrame,
      error: (error: unknown) => {
        fail(error instanceof Error ? error : new Error(String(error)));
      },
    });

    try {
      fill();
    } catch (reason) {
      fail(reason instanceof Error ? reason : new Error(String(reason)));
      return;
    }
    arm();
  });
}
