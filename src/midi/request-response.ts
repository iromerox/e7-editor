// Sends a command and waits for the response it draws, tolerating frames that arrive ahead of it.
import type { Observable } from "rxjs";
import type {
  AutotuningStatusResponse,
  ConfigurationResponse,
  MemoryDataResponse,
  SerialNumberResponse,
  SysExCommand,
  SysExCommandKind,
} from "../protocol";
import type { Connection } from "./connection";
import {
  EMPTY,
  defer,
  filter,
  firstValueFrom,
  map,
  merge,
  take,
  throwError,
  throwIfEmpty,
  timeout,
} from "rxjs";
import {
  ProtocolError,
  decodeAutotuningStatusResponse,
  decodeConfigurationResponse,
  decodeMemoryDataResponse,
  decodeSerialNumberResponse,
} from "../protocol";
import { ConnectionClosedError, NoResponseExpectedError, ResponseTimeoutError } from "./errors";

export const DEFAULT_RESPONSE_TIMEOUT_MS = 1000;

export interface ResponseByCommandKind {
  "read-serial-number": SerialNumberResponse;
  "read-memory": MemoryDataResponse;
  "write-memory": MemoryDataResponse;
  "read-configuration": ConfigurationResponse;
  "read-autotuning-status": AutotuningStatusResponse;
}

export type RespondingCommandKind = keyof ResponseByCommandKind;

export type RespondingCommand = Extract<SysExCommand, { kind: RespondingCommandKind }>;

export type ResponseFor<Command extends RespondingCommand> = ResponseByCommandKind[Command["kind"]];

const RESPONSE_DECODERS: {
  readonly [Kind in RespondingCommandKind]: (frame: Uint8Array) => ResponseByCommandKind[Kind];
} = {
  "read-serial-number": decodeSerialNumberResponse,
  "read-memory": decodeMemoryDataResponse,
  "write-memory": decodeMemoryDataResponse,
  "read-configuration": decodeConfigurationResponse,
  "read-autotuning-status": decodeAutotuningStatusResponse,
};

export function drawsResponse(kind: SysExCommandKind): kind is RespondingCommandKind {
  return kind in RESPONSE_DECODERS;
}

export function requestResponse<Command extends RespondingCommand>(
  connection: Connection,
  command: Command,
  timeoutMs: number = DEFAULT_RESPONSE_TIMEOUT_MS,
): Promise<ResponseFor<Command>> {
  if (!drawsResponse(command.kind)) {
    throw new NoResponseExpectedError(command.kind);
  }
  const decode = RESPONSE_DECODERS[command.kind];
  let unparsedFrames = 0;

  const responses: Observable<ResponseFor<Command>> = connection.sysex.pipe(
    map((frame) => {
      try {
        return decode(frame);
      } catch (error) {
        if (error instanceof ProtocolError) {
          unparsedFrames += 1;
          return undefined;
        }
        throw error;
      }
    }),
    filter((response): response is ResponseFor<Command> => response !== undefined),
    take(1),
  );

  const request = defer(() => {
    connection.sendCommand(command);
    return EMPTY;
  });

  return firstValueFrom(
    merge(responses, request).pipe(
      timeout({
        first: timeoutMs,
        with: () =>
          throwError(() => new ResponseTimeoutError(command.kind, timeoutMs, unparsedFrames)),
      }),
      throwIfEmpty(() => new ConnectionClosedError(connection.inputName, connection.outputName)),
    ),
  );
}
