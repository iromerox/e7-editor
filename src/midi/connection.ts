// Bidirectional device connection exposing SysEx frames and CC events as independent streams.
import type { ControlChangeMessageEvent, Input, MessageEvent, Output } from "webmidi";
import type { SysExCommand } from "../protocol";
import type { SysExReassemblyStats } from "./reassembly";
import { Observable, Subject } from "rxjs";
import { WebMidi } from "webmidi";
import { encodeCommand } from "../protocol";
import { createCcRateLimiter } from "./cc-rate-limit";
import {
  ConnectionClosedError,
  NoMatchingPortError,
  SysExNotEnabledError,
  SysExStreamBusyError,
} from "./errors";
import { listInputPorts, listOutputPorts, resolvePort } from "./ports";
import { createSysExReassembler } from "./reassembly";

export interface CcEvent {
  readonly channel: number;
  readonly controller: number;
  readonly value: number;
  readonly timestamp: number;
}

export interface Connection {
  readonly inputName: string;
  readonly outputName: string;
  readonly sysex: Observable<Uint8Array>;
  readonly cc: Observable<CcEvent>;
  readonly isOpen: boolean;
  readonly reassembly: SysExReassemblyStats;
  send(bytes: Uint8Array): void;
  sendCommand(command: SysExCommand): void;
  sendControlChange(channel: number, controller: number, value: number): void;
  close(): Promise<void>;
}

const CONTROL_CHANGE_STATUS = 0xb0;

export interface PortSpecifiers {
  readonly input: string;
  readonly output: string;
}

function exclusive<T>(source: Subject<T>, stream: string): Observable<T> {
  let consumed = false;
  return new Observable<T>((subscriber) => {
    if (consumed) {
      subscriber.error(new SysExStreamBusyError(stream));
      return;
    }
    consumed = true;
    const subscription = source.subscribe(subscriber);
    return () => {
      consumed = false;
      subscription.unsubscribe();
    };
  });
}

export function createConnection(input: Input, output: Output): Connection {
  const sysexFrames = new Subject<Uint8Array>();
  const ccEvents = new Subject<CcEvent>();
  const reassembler = createSysExReassembler();
  let open = true;

  const onSysex = (event: MessageEvent): void => {
    for (const frame of reassembler.push(event.message.rawData)) {
      sysexFrames.next(frame);
    }
  };

  const onControlChange = (event: ControlChangeMessageEvent): void => {
    if (event.rawValue === undefined) {
      return;
    }
    ccEvents.next({
      channel: event.message.channel,
      controller: event.controller.number,
      value: event.rawValue,
      timestamp: event.timestamp,
    });
  };

  const send = (bytes: Uint8Array): void => {
    if (!open) {
      throw new ConnectionClosedError(input.name, output.name);
    }
    output.send(bytes);
  };

  const rateLimiter = createCcRateLimiter((channel, controller, value) => {
    send(Uint8Array.of(CONTROL_CHANGE_STATUS | (channel - 1), controller, value));
  });

  const detach = (): void => {
    if (!open) {
      return;
    }
    open = false;
    rateLimiter.dispose();
    reassembler.reset();
    input.removeListener("sysex", onSysex);
    input.removeListener("controlchange", onControlChange);
    input.removeListener("disconnected", detach);
    output.removeListener("disconnected", detach);
    sysexFrames.complete();
    ccEvents.complete();
  };

  input.addListener("sysex", onSysex);
  input.addListener("controlchange", onControlChange);
  input.addListener("disconnected", detach);
  output.addListener("disconnected", detach);

  return {
    inputName: input.name,
    outputName: output.name,
    sysex: exclusive(sysexFrames, "SysEx frame"),
    cc: ccEvents.asObservable(),
    get isOpen() {
      return open;
    },
    reassembly: reassembler,
    send,
    sendCommand(command: SysExCommand): void {
      send(encodeCommand(command));
    },
    sendControlChange(channel: number, controller: number, value: number): void {
      if (!open) {
        throw new ConnectionClosedError(input.name, output.name);
      }
      rateLimiter.send(channel, controller, value);
    },
    async close(): Promise<void> {
      if (!open) {
        return;
      }
      detach();
      await Promise.all([input.close(), output.close()]);
    },
  };
}

export async function openConnection(specifiers: PortSpecifiers): Promise<Connection> {
  if (!WebMidi.enabled) {
    await WebMidi.enable({ sysex: true });
  }
  if (!WebMidi.sysexEnabled) {
    throw new SysExNotEnabledError();
  }

  const inputPort = resolvePort(specifiers.input, listInputPorts());
  const outputPort = resolvePort(specifiers.output, listOutputPorts());
  const input: Input | undefined = WebMidi.getInputById(inputPort.id);
  const output: Output | undefined = WebMidi.getOutputById(outputPort.id);
  if (input === undefined) {
    throw new NoMatchingPortError(specifiers.input);
  }
  if (output === undefined) {
    throw new NoMatchingPortError(specifiers.output);
  }

  await Promise.all([input.open(), output.open()]);
  return createConnection(input, output);
}
