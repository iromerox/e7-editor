// Port selection, connect/disconnect, and the serial number the connected device reports.
import type { JSX } from "solid-js";
import type { Connection, PortInfo, PortLists } from "../midi";
import { For, Show, createSignal, onCleanup, onMount } from "solid-js";
import { enableMidi, listPorts, openConnection, requestResponse, watchPorts } from "../midi";

type ConnectionState = "midi-disabled" | "disconnected" | "connecting" | "connected";

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
  const [inputs, setInputs] = createSignal<readonly PortInfo[]>([]);
  const [outputs, setOutputs] = createSignal<readonly PortInfo[]>([]);
  const [inputName, setInputName] = createSignal("");
  const [outputName, setOutputName] = createSignal("");
  const [state, setState] = createSignal<ConnectionState>("midi-disabled");
  const [serialNumber, setSerialNumber] = createSignal<number | undefined>();
  const [notice, setNotice] = createSignal("");

  let stopWatchingDevice: (() => void) | undefined;
  let connection: Connection | undefined;

  const applyPorts = (ports: PortLists): void => {
    setInputs(ports.inputs);
    setOutputs(ports.outputs);
    if (state() === "connected" || state() === "connecting") {
      return;
    }
    const lost = [
      vanished(inputName(), ports.inputs) ? inputName() : "",
      vanished(outputName(), ports.outputs) ? outputName() : "",
    ].filter((name) => name !== "");
    setInputName(chosen(inputName(), ports.inputs));
    setOutputName(chosen(outputName(), ports.outputs));
    if (lost.length > 0) {
      setNotice(`No longer available: ${lost.join(", ")}.`);
    }
  };

  const forget = (): void => {
    stopWatchingDevice?.();
    stopWatchingDevice = undefined;
    connection = undefined;
    setSerialNumber(undefined);
    setState("disconnected");
    props.onConnectionChange?.(undefined);
  };

  const enable = async (): Promise<void> => {
    setNotice("");
    try {
      await enableMidi();
      setState("disconnected");
      applyPorts(listPorts());
    } catch (error) {
      setNotice(describe(error));
    }
  };

  const connect = async (): Promise<void> => {
    setNotice("");
    setState("connecting");
    let opened: Connection | undefined;
    try {
      const active = await openConnection({ input: inputName(), output: outputName() });
      opened = active;
      const response = await requestResponse(active, { kind: "read-serial-number" });
      connection = active;
      setSerialNumber(response.serialNumber);
      setState("connected");
      props.onConnectionChange?.(active);
      const subscription = active.cc.subscribe({
        complete: () => {
          setNotice(`${active.inputName} was disconnected.`);
          forget();
        },
      });
      stopWatchingDevice = () => subscription.unsubscribe();
    } catch (error) {
      setNotice(describe(error));
      setState("disconnected");
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
        when={state() !== "midi-disabled"}
        fallback={
          <button type="button" onClick={() => void enable()}>
            Enable MIDI
          </button>
        }
      >
        <PortSelect
          label="Input"
          ports={inputs()}
          value={inputName()}
          disabled={state() !== "disconnected"}
          onSelect={setInputName}
        />
        <PortSelect
          label="Output"
          ports={outputs()}
          value={outputName()}
          disabled={state() !== "disconnected"}
          onSelect={setOutputName}
        />
        <Show
          when={state() === "connected"}
          fallback={
            <button
              type="button"
              disabled={state() === "connecting" || inputName() === "" || outputName() === ""}
              onClick={() => void connect()}
            >
              Connect
            </button>
          }
        >
          <button type="button" onClick={() => void disconnect()}>
            Disconnect
          </button>
          <span>Serial number {serialNumber()}</span>
        </Show>
      </Show>
      <Show when={notice() !== ""}>
        <span role="alert" style={{ "font-weight": "bold" }}>
          {notice()}
        </span>
      </Show>
    </section>
  );
}
