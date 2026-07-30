import type { CcRateLimiter } from "./cc-rate-limit";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MIN_CC_INTERVAL_MS, createCcRateLimiter } from "./cc-rate-limit";

type Sent = [channel: number, controller: number, value: number];

interface Harness {
  readonly sent: Sent[];
  readonly limiter: CcRateLimiter;
}

function harness(): Harness {
  const sent: Sent[] = [];
  const limiter = createCcRateLimiter((channel, controller, value) => {
    sent.push([channel, controller, value]);
  });
  return { sent, limiter };
}

async function settle(ms = 0): Promise<void> {
  await vi.advanceTimersByTimeAsync(ms);
}

describe("createCcRateLimiter", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("coalesces a burst for one channel and controller into a single send of the last value", async () => {
    const { sent, limiter } = harness();

    for (let value = 0; value < 50; value += 1) {
      limiter.send(1, 74, value);
    }
    await settle();

    expect(sent).toEqual([[1, 74, 49]]);

    await settle(10);
    expect(sent).toEqual([[1, 74, 49]]);
  });

  it("keeps every channel and controller pair on its own budget", async () => {
    const { sent, limiter } = harness();

    limiter.send(1, 74, 10);
    limiter.send(1, 20, 20);
    limiter.send(2, 74, 30);
    limiter.send(1, 74, 11);
    await settle();

    expect(sent).toEqual([
      [1, 74, 11],
      [1, 20, 20],
      [2, 74, 30],
    ]);
  });

  it("sends an isolated value without waiting out the interval", async () => {
    const { sent, limiter } = harness();

    limiter.send(1, 74, 64);
    await settle();

    expect(sent).toEqual([[1, 74, 64]]);
    expect(vi.getTimerCount()).toBe(1);
  });

  it("ships the trailing value of a drag one interval after the leading one", async () => {
    const { sent, limiter } = harness();

    limiter.send(1, 74, 1);
    await settle();
    limiter.send(1, 74, 2);
    limiter.send(1, 74, 3);

    await settle(MIN_CC_INTERVAL_MS - 1);
    expect(sent).toEqual([[1, 74, 1]]);

    await settle(1);
    expect(sent).toEqual([
      [1, 74, 1],
      [1, 74, 3],
    ]);
  });

  it("caps a sustained stream at one send per interval, always the latest value", async () => {
    const { sent, limiter } = harness();

    for (let tick = 0; tick < 40; tick += 1) {
      limiter.send(1, 74, tick);
      await settle(1);
    }
    await settle(MIN_CC_INTERVAL_MS);

    expect(sent).toEqual([
      [1, 74, 0],
      [1, 74, 4],
      [1, 74, 9],
      [1, 74, 14],
      [1, 74, 19],
      [1, 74, 24],
      [1, 74, 29],
      [1, 74, 34],
      [1, 74, 39],
    ]);
  });

  it("stops holding values back once the stream goes idle", async () => {
    const { sent, limiter } = harness();

    limiter.send(1, 74, 1);
    await settle(100);
    expect(vi.getTimerCount()).toBe(0);

    limiter.send(1, 74, 2);
    await settle();

    expect(sent).toEqual([
      [1, 74, 1],
      [1, 74, 2],
    ]);
  });

  it("drops queued and pending values when disposed", async () => {
    const { sent, limiter } = harness();

    limiter.send(1, 74, 1);
    await settle();
    limiter.send(1, 74, 2);
    limiter.send(2, 20, 3);
    limiter.dispose();
    await settle(100);

    expect(sent).toEqual([[1, 74, 1]]);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("ignores a leading value queued before disposal", async () => {
    const { sent, limiter } = harness();

    limiter.send(1, 74, 1);
    limiter.dispose();
    await settle(100);

    expect(sent).toEqual([]);
  });

  it("stays disposed for later sends", async () => {
    const { sent, limiter } = harness();

    limiter.dispose();
    limiter.send(1, 74, 1);
    await settle(100);

    expect(sent).toEqual([]);
  });

  it("honors a custom interval", async () => {
    const sent: Sent[] = [];
    const limiter = createCcRateLimiter((channel, controller, value) => {
      sent.push([channel, controller, value]);
    }, 20);

    limiter.send(1, 74, 1);
    await settle();
    limiter.send(1, 74, 2);

    await settle(MIN_CC_INTERVAL_MS);
    expect(sent).toEqual([[1, 74, 1]]);

    await settle(20);
    expect(sent).toEqual([
      [1, 74, 1],
      [1, 74, 2],
    ]);
  });
});
