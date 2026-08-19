// Repeating one send at a chosen interval or with no wait at all, pairing what comes back with what went out, and reporting the round trips as a spread rather than as a figure.
import type { Connection, RespondingCommandKind } from "../midi";
import type { SysExCommand } from "../protocol";
import type { ControlChangeMessage, SysExReading, SysExResponseKind } from "./wire-monitor";
import type { RecordWireEvent } from "./wire-sender";
import { DEFAULT_RESPONSE_TIMEOUT_MS, MIN_CC_INTERVAL_MS, drawsResponse } from "../midi";
import { MAX_SYSEX_ADDRESS, SysExAddressRangeError, encodeResponse } from "../protocol";
import { formatHex } from "./hex";
import { readSysExFrame } from "./wire-monitor";
import { sendCommand, sendControlChange } from "./wire-sender";

export const BURST_SETTLE_MS = DEFAULT_RESPONSE_TIMEOUT_MS;

export const MAX_BURST_REPEATS = 8192;

export const MAX_BURST_INTERVAL_MS = 10000;

export const MAX_BURST_STEP_BYTES = 128;

export const STEP_NOTE =
  "A step of 0 sends the same address every time; 16 walks consecutive memory blocks, which is the read a full backup would make and the one worth measuring. The echo a write draws carries the data and not the address, so stepping alone does not make answers tell each other apart. A stepped Write Memory writes to every address it walks.";

export const BURST_NOTE =
  "A repeat sends the same thing over and over: at the interval typed here, or — at 0 — all of them back to back, none of them waiting for the answer to the last. Sends go out past the outbound rate limiter the way every send from this page does, so MIN_CC_INTERVAL_MS does not apply and an interval below it is delivered as typed. Repeating a control change writes to the instrument once per repeat.";

export type BurstExpectation =
  | { readonly kind: "echo"; readonly bytes: Uint8Array }
  | { readonly kind: "response"; readonly reads: SysExResponseKind }
  | { readonly kind: "silence" };

export type BurstSend =
  | { readonly kind: "command"; readonly command: SysExCommand; readonly expects: BurstExpectation }
  | {
      readonly kind: "control-change";
      readonly message: ControlChangeMessage;
      readonly expects: BurstExpectation;
    };

export interface BurstPlan {
  readonly sends: readonly BurstSend[];
  readonly intervalMs: number;
}

export type BurstStatus = "sent" | "received" | "out-of-order" | "missing" | "unsent";

export interface BurstReply {
  readonly index: number;
  readonly sentAtMs: number;
  readonly status: BurstStatus;
  readonly roundTripMs: number | undefined;
  readonly identified: boolean;
}

export interface BurstTimings {
  readonly minMs: number;
  readonly medianMs: number;
  readonly maxMs: number;
}

export interface BurstReport {
  readonly planned: number;
  readonly sent: number;
  readonly received: number;
  readonly outOfOrder: number;
  readonly missing: number;
  readonly unmatched: number;
  readonly identified: number;
  readonly intervalMs: number;
  readonly elapsedMs: number;
  readonly stopped: boolean;
  readonly fault: string | undefined;
  readonly timings: BurstTimings | undefined;
  readonly replies: readonly BurstReply[];
}

export interface BurstClock {
  readonly elapsedMs: () => number;
  readonly delay: (ms: number) => Promise<void>;
}

export interface BurstRun {
  readonly report: Promise<BurstReport>;
  stop(): void;
}

const ANSWERS: { readonly [Kind in RespondingCommandKind]: SysExResponseKind } = {
  "read-serial-number": "serial-number",
  "read-memory": "memory-data",
  "write-memory": "memory-data",
  "read-configuration": "configuration",
  "read-autotuning-status": "autotuning-status",
};

export function expectedAnswer(command: SysExCommand): BurstExpectation {
  if (command.kind === "write-memory") {
    return { kind: "echo", bytes: encodeResponse({ kind: "memory-data", data: command.data }) };
  }
  const kind = command.kind;
  return drawsResponse(kind) ? { kind: "response", reads: ANSWERS[kind] } : { kind: "silence" };
}

function addressOf(command: SysExCommand): number | undefined {
  return command.kind === "read-memory" || command.kind === "write-memory"
    ? command.address
    : undefined;
}

function advanced(command: SysExCommand, by: number): SysExCommand {
  if (by === 0) {
    return command;
  }
  switch (command.kind) {
    case "read-memory":
    case "write-memory":
      return { ...command, address: command.address + by };
    default:
      return command;
  }
}

function assertWalkFits(command: SysExCommand, repeats: number, stepBytes: number): void {
  const from = addressOf(command);
  if (from === undefined || stepBytes === 0 || repeats < 1) {
    return;
  }
  const last = from + stepBytes * (repeats - 1);
  if (last > MAX_SYSEX_ADDRESS) {
    throw new SysExAddressRangeError(last, 0, MAX_SYSEX_ADDRESS);
  }
}

export function commandBurst(
  command: SysExCommand,
  repeats: number,
  stepBytes = 0,
): readonly BurstSend[] {
  const walk = addressOf(command) === undefined ? 0 : Math.max(0, stepBytes);
  assertWalkFits(command, repeats, walk);
  return Array.from({ length: repeats }, (_, index): BurstSend => {
    const at = advanced(command, walk * index);
    return { kind: "command", command: at, expects: expectedAnswer(at) };
  });
}

export function controlChangeBurst(
  message: ControlChangeMessage,
  repeats: number,
): readonly BurstSend[] {
  return Array.from(
    { length: repeats },
    (): BurstSend => ({ kind: "control-change", message, expects: { kind: "silence" } }),
  );
}

export function liveBurstClock(elapsedMs: () => number): BurstClock {
  return {
    elapsedMs,
    delay: (ms: number) =>
      new Promise((resolve) => {
        setTimeout(resolve, ms);
      }),
  };
}

interface Attempt {
  sentAtMs: number;
  readonly expects: BurstExpectation;
  answeredAtMs: number | undefined;
  arrival: number | undefined;
  identified: boolean;
}

function echoes(attempt: Attempt | undefined, frame: Uint8Array): boolean {
  if (attempt?.expects.kind !== "echo") {
    return false;
  }
  const { bytes } = attempt.expects;
  return bytes.length === frame.length && bytes.every((byte, index) => frame[index] === byte);
}

function answers(attempt: Attempt | undefined, reading: SysExReading): boolean {
  if (attempt === undefined || reading.kind !== "response") {
    return false;
  }
  switch (attempt.expects.kind) {
    case "silence":
      return false;
    case "echo":
    case "response":
      return reading.reads.includes(
        attempt.expects.kind === "response" ? attempt.expects.reads : "memory-data",
      );
  }
}

function nameable(sends: readonly BurstSend[]): ReadonlySet<string> {
  const echoes = new Map<string, number>();
  for (const send of sends) {
    if (send.expects.kind === "echo") {
      const key = formatHex(send.expects.bytes);
      echoes.set(key, (echoes.get(key) ?? 0) + 1);
    }
  }
  return new Set([...echoes].filter(([, count]) => count === 1).map(([key]) => key));
}

function median(values: readonly number[]): number {
  const sorted = [...values].sort((first, second) => first - second);
  const middle = Math.floor(sorted.length / 2);
  const upper = sorted[middle] ?? 0;
  return sorted.length % 2 === 1 ? upper : ((sorted[middle - 1] ?? upper) + upper) / 2;
}

function timingsOf(roundTrips: readonly number[]): BurstTimings | undefined {
  if (roundTrips.length === 0) {
    return undefined;
  }
  return {
    minMs: Math.min(...roundTrips),
    medianMs: median(roundTrips),
    maxMs: Math.max(...roundTrips),
  };
}

function statusOf(attempt: Attempt, arrival: number | undefined, behind: boolean): BurstStatus {
  if (arrival === undefined) {
    return attempt.expects.kind === "silence" ? "sent" : "missing";
  }
  return behind ? "out-of-order" : "received";
}

function describe(error: unknown): string {
  return error instanceof Error ? `${error.name}: ${error.message}` : String(error);
}

export function runBurst(
  connection: Connection,
  plan: BurstPlan,
  record: RecordWireEvent,
  clock: BurstClock,
): BurstRun {
  const attempts: Attempt[] = [];
  const outstanding: number[] = [];
  let arrivals = 0;
  let unmatched = 0;
  let stopped = false;
  let owed: (() => void) | undefined;

  const attribute = (index: number, atMs: number, identified: boolean): void => {
    const attempt = attempts[index];
    if (attempt === undefined) {
      return;
    }
    attempt.answeredAtMs = atMs;
    attempt.arrival = arrivals;
    attempt.identified = identified;
    arrivals += 1;
    outstanding.splice(outstanding.indexOf(index), 1);
    if (outstanding.length === 0) {
      owed?.();
    }
  };

  const named = nameable(plan.sends);

  const frames = connection.sysexMonitor.subscribe((bytes) => {
    const atMs = clock.elapsedMs();
    const echoed = outstanding.find((index) => echoes(attempts[index], bytes));
    if (echoed !== undefined) {
      attribute(echoed, atMs, named.has(formatHex(bytes)));
      return;
    }
    const reading = readSysExFrame(bytes);
    const oldest = outstanding.find((index) => answers(attempts[index], reading));
    if (oldest === undefined) {
      unmatched += 1;
      return;
    }
    attribute(oldest, atMs, false);
  });

  const dispatch = (send: BurstSend): number => {
    const event =
      send.kind === "command"
        ? sendCommand(connection, send.command, record, clock.elapsedMs)
        : sendControlChange(connection, send.message, record, clock.elapsedMs);
    return event.atMs;
  };

  const collect = (startedAtMs: number, fault: string | undefined): BurstReport => {
    const replies: BurstReply[] = [];
    const roundTrips: number[] = [];
    let highest = -1;

    for (let index = 0; index < plan.sends.length; index += 1) {
      const attempt = attempts[index];
      if (attempt === undefined) {
        replies.push({
          index,
          sentAtMs: Number.NaN,
          status: "unsent",
          roundTripMs: undefined,
          identified: false,
        });
        continue;
      }
      const { arrival, answeredAtMs } = attempt;
      const behind = arrival !== undefined && arrival < highest;
      if (arrival !== undefined) {
        highest = Math.max(highest, arrival);
      }
      const roundTripMs = answeredAtMs === undefined ? undefined : answeredAtMs - attempt.sentAtMs;
      if (roundTripMs !== undefined) {
        roundTrips.push(roundTripMs);
      }
      replies.push({
        index,
        sentAtMs: attempt.sentAtMs,
        status: statusOf(attempt, arrival, behind),
        roundTripMs,
        identified: attempt.identified,
      });
    }

    const counted = (status: BurstStatus): number =>
      replies.filter((reply) => reply.status === status).length;

    return {
      planned: plan.sends.length,
      sent: attempts.length,
      received: roundTrips.length,
      outOfOrder: counted("out-of-order"),
      missing: counted("missing"),
      unmatched,
      identified: replies.filter((reply) => reply.identified).length,
      intervalMs: plan.intervalMs,
      elapsedMs: clock.elapsedMs() - startedAtMs,
      stopped,
      fault,
      timings: timingsOf(roundTrips),
      replies,
    };
  };

  const run = async (): Promise<BurstReport> => {
    const startedAtMs = clock.elapsedMs();
    let fault: string | undefined;

    for (const [index, send] of plan.sends.entries()) {
      if (stopped) {
        break;
      }
      if (index > 0 && plan.intervalMs > 0) {
        await clock.delay(plan.intervalMs);
        if (stopped) {
          break;
        }
      }
      const attempt: Attempt = {
        sentAtMs: clock.elapsedMs(),
        expects: send.expects,
        answeredAtMs: undefined,
        arrival: undefined,
        identified: false,
      };
      attempts.push(attempt);
      if (send.expects.kind !== "silence") {
        outstanding.push(attempts.length - 1);
      }
      try {
        attempt.sentAtMs = dispatch(send);
      } catch (error) {
        attempts.pop();
        const waiting = outstanding.indexOf(attempts.length);
        if (waiting !== -1) {
          outstanding.splice(waiting, 1);
        }
        fault = describe(error);
        break;
      }
    }

    if (outstanding.length > 0) {
      await new Promise<void>((resolve) => {
        owed = resolve;
        void clock.delay(BURST_SETTLE_MS).then(resolve);
      });
      owed = undefined;
    }

    frames.unsubscribe();
    return collect(startedAtMs, fault);
  };

  return {
    report: run(),
    stop(): void {
      stopped = true;
    },
  };
}

const REPORT_KEY_WIDTH = 17;

const MS_DECIMALS = 1;

function line(key: string, value: string): string {
  return `${key.padEnd(REPORT_KEY_WIDTH)}${value}`;
}

function ms(value: number): string {
  return `${value.toFixed(MS_DECIMALS)}ms`;
}

function cadence(intervalMs: number): string {
  return intervalMs > 0
    ? `${intervalMs}ms apart`
    : "back to back, none of them awaiting the answer to the last";
}

function firstFault(replies: readonly BurstReply[]): string {
  const fault = replies.find(
    (reply) => reply.status === "missing" || reply.status === "out-of-order",
  );
  return fault === undefined
    ? "none — every send that expected an answer got one, in the order it was sent"
    : `send ${fault.index + 1} came back ${fault.status === "missing" ? "not at all" : "out of order"}`;
}

function pairing(report: BurstReport): string {
  const positional = report.received - report.identified;
  if (report.received === 0) {
    return "nothing came back to pair";
  }
  if (positional === 0) {
    return `all ${report.received} named by their own bytes`;
  }
  const blind = `a reordering among those ${positional} cannot be seen`;
  return report.identified === 0
    ? `${positional} paired in arrival order — nothing in these answers names the request they answer, so ${blind}`
    : `${report.identified} named by their own bytes, ${positional} paired in arrival order — ${blind}`;
}

export function formatBurstReport(report: BurstReport): string {
  const lines = [
    line("sends", `${report.sent} of ${report.planned}, ${cadence(report.intervalMs)}`),
    line(
      "answers",
      `${report.received} received, ${report.outOfOrder} out of order, ${report.missing} missing, ${report.unmatched} answering nothing outstanding`,
    ),
    line(
      "round trip",
      report.timings === undefined
        ? "nothing came back to time"
        : `min ${ms(report.timings.minMs)}   median ${ms(report.timings.medianMs)}   max ${ms(report.timings.maxMs)}`,
    ),
    line("pairing", pairing(report)),
    line("first fault", firstFault(report.replies)),
    line("elapsed", ms(report.elapsedMs)),
    line(
      "rate limit",
      `sends bypass it — MIN_CC_INTERVAL_MS (${MIN_CC_INTERVAL_MS}ms) does not apply`,
    ),
  ];
  if (report.stopped) {
    lines.push(line("stopped", "stopped part-way; what it had measured by then is above"));
  }
  if (report.fault !== undefined) {
    lines.push(line("fault", report.fault));
  }
  return lines.join("\n");
}
