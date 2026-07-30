// Caps outbound control changes per channel and controller, coalescing faster updates to the latest value.
export const MIN_CC_INTERVAL_MS = 5;

export type CcSink = (channel: number, controller: number, value: number) => void;

export interface CcRateLimiter {
  send(channel: number, controller: number, value: number): void;
  dispose(): void;
}

interface Slot {
  readonly key: number;
  readonly channel: number;
  readonly controller: number;
  value: number;
  queued: boolean;
  pending: boolean;
  cooldown: ReturnType<typeof setTimeout> | undefined;
}

export function createCcRateLimiter(
  sink: CcSink,
  intervalMs: number = MIN_CC_INTERVAL_MS,
): CcRateLimiter {
  const slots = new Map<number, Slot>();
  let disposed = false;

  const emit = (slot: Slot): void => {
    slot.pending = false;
    sink(slot.channel, slot.controller, slot.value);
    slot.cooldown = setTimeout(() => {
      slot.cooldown = undefined;
      if (slot.pending) {
        emit(slot);
      } else {
        slots.delete(slot.key);
      }
    }, intervalMs);
  };

  return {
    send(channel: number, controller: number, value: number): void {
      if (disposed) {
        return;
      }
      const key = channel * 128 + controller;
      const existing = slots.get(key);
      const slot: Slot = existing ?? {
        key,
        channel,
        controller,
        value,
        queued: false,
        pending: false,
        cooldown: undefined,
      };
      if (existing === undefined) {
        slots.set(key, slot);
      }
      slot.value = value;
      if (slot.queued || slot.cooldown !== undefined) {
        slot.pending = true;
        return;
      }
      slot.queued = true;
      queueMicrotask(() => {
        slot.queued = false;
        if (!disposed) {
          emit(slot);
        }
      });
    },
    dispose(): void {
      disposed = true;
      for (const slot of slots.values()) {
        if (slot.cooldown !== undefined) {
          clearTimeout(slot.cooldown);
        }
      }
      slots.clear();
    },
  };
}
