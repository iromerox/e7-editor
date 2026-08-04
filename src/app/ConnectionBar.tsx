// Port selection, connect/disconnect, and the serial number and receive channel the connected device reports.
import type { JSX } from "solid-js";
import type { Connection, PortInfo, PortLists } from "../midi";
import { For, Show, onCleanup, onMount } from "solid-js";
import { enableMidi, listPorts, openConnection, requestResponse, watchPorts } from "../midi";
import { receiveChannel } from "../protocol";
import { useAppState } from "./AppStateProvider";

export interface ConnectionBarProps {
  readonly onConnectionChange?: (connection: Connection | undefined) => void;
}

interface PortSelectProps {
  readonly label: string;
  readonly ports: readonly PortInfo[];
  readonly value: string;
  readonly disabled: boolean;
  readonly onSelect: (name: string) => void;
}

const DEVICE_HINT = "e7";

function describe(error: unknown): string {
  return error instanceof Error ? `${error.name}: ${error.message}` : String(error);
}

function preferred(ports: readonly PortInfo[]): string {
  const match = ports.find((port) => port.name.toLowerCase().includes(DEVICE_HINT));
  return (match ?? ports[0])?.name ?? "";
}

function vanished(current: string, ports: readonly PortInfo[]): boolean {
  return current !== "" && !ports.some((port) => port.name === current);
}

function chosen(current: string, ports: readonly PortInfo[]): string {
  if (vanished(current, ports)) {
    return "";
  }
  return current === "" ? preferred(ports) : current;
}

function PortSelect(props: PortSelectProps): JSX.Element {
  return (
    <label>
      {props.label}{" "}
      <select
        value={props.value}
        disabled={props.disabled}
        onChange={(event) => props.onSelect(event.currentTarget.value)}
      >
        <For each={props.ports}>{(port) => <option value={port.name}>{port.name}</option>}</For>
      </select>
    </label>
  );
}

export function ConnectionBar(props: ConnectionBarProps): JSX.Element {
  const {
    state,
    setPorts,
    selectInputPort,
    selectOutputPort,
    setConnectionStatus,
    setSerialNumber,
    setReceiveChannel,
    setNotice,
  } = useAppState();

  let stopWatchingDevice: (() => void) | undefined;
  let connection: Connection | undefined;

  const applyPorts = (ports: PortLists): void => {
    setPorts(ports);
    const { status, inputName, outputName } = state.connection;
    if (status === "connected" || status === "connecting") {
      return;
    }
    const lost = [
      vanished(inputName, ports.inputs) ? inputName : "",
      vanished(outputName, ports.outputs) ? outputName : "",
    ].filter((name) => name !== "");
    selectInputPort(chosen(inputName, ports.inputs));
    selectOutputPort(chosen(outputName, ports.outputs));
    if (lost.length > 0) {
      setNotice(`No longer available: ${lost.join(", ")}.`);
    }
  };

  const forget = (): void => {
    stopWatchingDevice?.();
    stopWatchingDevice = undefined;
    connection = undefined;
    setSerialNumber(undefined);
    setReceiveChannel(undefined);
    setConnectionStatus("disconnected");
    props.onConnectionChange?.(undefined);
  };

  const readReceiveChannel = async (active: Connection): Promise<void> => {
    try {
      const configuration = await requestResponse(active, { kind: "read-configuration" });
      setReceiveChannel(receiveChannel(configuration.rxChannel));
    } catch (error) {
      setNotice(`Could not read the device's receive channel. ${describe(error)}`);
    }
  };

  const enable = async (): Promise<void> => {
    setNotice("");
    try {
      await enableMidi();
      setConnectionStatus("disconnected");
      applyPorts(listPorts());
    } catch (error) {
      setNotice(describe(error));
    }
  };

  const connect = async (): Promise<void> => {
    setNotice("");
    setConnectionStatus("connecting");
    let opened: Connection | undefined;
    try {
      const active = await openConnection({
        input: state.connection.inputName,
        output: state.connection.outputName,
      });
      opened = active;
      const response = await requestResponse(active, { kind: "read-serial-number" });
      connection = active;
      setSerialNumber(response.serialNumber);
      setConnectionStatus("connected");
      props.onConnectionChange?.(active);
      const subscription = active.cc.subscribe({
        complete: () => {
          setNotice(`${active.inputName} was disconnected.`);
          forget();
        },
      });
      stopWatchingDevice = () => subscription.unsubscribe();
      await readReceiveChannel(active);
    } catch (error) {
      setNotice(describe(error));
      setConnectionStatus("disconnected");
      await opened?.close();
      applyPorts(listPorts());
    }
  };

  const disconnect = async (): Promise<void> => {
    const active = connection;
    setNotice("");
    forget();
    await active?.close();
    applyPorts(listPorts());
  };

  onMount(() => {
    applyPorts(listPorts());
    onCleanup(watchPorts(applyPorts));
  });

  onCleanup(() => {
    stopWatchingDevice?.();
    void connection?.close();
  });

  return (
    <section
      aria-label="Device connection"
      style={{
        display: "flex",
        "align-items": "baseline",
        gap: "0.75rem",
        "flex-wrap": "wrap",
        color: "var(--e7-label)",
      }}
    >
      <Show
        when={state.connection.status !== "midi-disabled"}
        fallback={
          <button type="button" onClick={() => void enable()}>
            Enable MIDI
          </button>
        }
      >
        <PortSelect
          label="Input"
          ports={state.ports.inputs}
          value={state.connection.inputName}
          disabled={state.connection.status !== "disconnected"}
          onSelect={selectInputPort}
        />
        <PortSelect
          label="Output"
          ports={state.ports.outputs}
          value={state.connection.outputName}
          disabled={state.connection.status !== "disconnected"}
          onSelect={selectOutputPort}
        />
        <Show
          when={state.connection.status === "connected"}
          fallback={
            <button
              type="button"
              disabled={
                state.connection.status === "connecting" ||
                state.connection.inputName === "" ||
                state.connection.outputName === ""
              }
              onClick={() => void connect()}
            >
              Connect
            </button>
          }
        >
          <button type="button" onClick={() => void disconnect()}>
            Disconnect
          </button>
          <span>Serial number {state.connection.serialNumber}</span>
        </Show>
      </Show>
      <Show when={state.connection.notice !== ""}>
        <span role="alert" style={{ "font-weight": "bold" }}>
          {state.connection.notice}
        </span>
      </Show>
    </section>
  );
}
