// Dev-only page that logs every byte a connected e7 sends, as it arrives, for as long as it is open.
import type { Connection, PortInfo } from "../midi";
import type { WireLog } from "./wire-monitor";
import { For, Show, createMemo, createSignal, onCleanup } from "solid-js";
import { enableMidi, listInputPorts, listOutputPorts, openConnection } from "../midi";
import { emptyWireLog, formatWireMonitorReport, monitorWire, recorded } from "./wire-monitor";

const DEVICE_HINT = "e7";

const NO_PORT = "—";

const IDLE_STATS = { pendingBytes: 0, fragmentedFrames: 0, discardedPartials: 0 };

function describe(error: unknown): string {
  return error instanceof Error ? `${error.name}: ${error.message}` : String(error);
}

function preferred(ports: readonly PortInfo[]): string {
  const match = ports.find((port) => port.name.toLowerCase().includes(DEVICE_HINT));
  return (match ?? ports[0])?.name ?? "";
}

export function HardwareConsole() {
  const [inputs, setInputs] = createSignal<readonly PortInfo[]>([]);
  const [outputs, setOutputs] = createSignal<readonly PortInfo[]>([]);
  const [inputName, setInputName] = createSignal("");
  const [outputName, setOutputName] = createSignal("");
  const [status, setStatus] = createSignal("Web MIDI not enabled yet.");
  const [connection, setConnection] = createSignal<Connection | undefined>(undefined);
  const [log, setLog] = createSignal<WireLog>(emptyWireLog());
  const [held, setHeld] = createSignal<WireLog | undefined>(undefined);
  const [busy, setBusy] = createSignal(false);

  let stopMonitoring: (() => void) | undefined;

  const paused = (): boolean => held() !== undefined;

  const report = createMemo(() => {
    const active = connection();
    return formatWireMonitorReport({
      inputName: active?.inputName ?? NO_PORT,
      outputName: active?.outputName ?? NO_PORT,
      log: held() ?? log(),
      reassembly: active === undefined ? IDLE_STATS : active.reassembly,
    });
  });

  const enable = async (): Promise<void> => {
    setBusy(true);
    try {
      await enableMidi();
      const ins = listInputPorts();
      const outs = listOutputPorts();
      setInputs(ins);
      setOutputs(outs);
      setInputName(preferred(ins));
      setOutputName(preferred(outs));
      setStatus(`Web MIDI enabled with SysEx. ${ins.length} inputs, ${outs.length} outputs.`);
    } catch (error) {
      setStatus(describe(error));
    } finally {
      setBusy(false);
    }
  };

  const connect = async (): Promise<void> => {
    setBusy(true);
    try {
      const active = await openConnection({ input: inputName(), output: outputName() });
      const subscription = monitorWire(active, (event) => {
        setLog((current) => recorded(current, event));
      });
      stopMonitoring = () => subscription.unsubscribe();
      setConnection(active);
      setStatus(`Monitoring ${active.inputName}. Play, turn a knob, or send from a DAW.`);
    } catch (error) {
      setStatus(describe(error));
    } finally {
      setBusy(false);
    }
  };

  const disconnect = async (): Promise<void> => {
    stopMonitoring?.();
    stopMonitoring = undefined;
    const active = connection();
    setConnection(undefined);
    await active?.close();
    setStatus("Disconnected. The log is kept until it is cleared.");
  };

  const togglePause = (): void => {
    setHeld(paused() ? undefined : log());
  };

  const clear = (): void => {
    setLog(emptyWireLog());
    setHeld(paused() ? emptyWireLog() : undefined);
  };

  onCleanup(() => {
    stopMonitoring?.();
    void connection()?.close();
  });

  return (
    <main>
      <h1>e7 hardware console</h1>
      <p>
        Logs every SysEx frame and control change the device sends, timestamped and in hex, whether
        or not this app understands it. Read-only — nothing is written to the device.
      </p>

      <p>
        <button type="button" disabled={busy()} onClick={() => void enable()}>
          Enable Web MIDI
        </button>
      </p>

      <Show when={inputs().length > 0}>
        <p>
          <label>
            Input{" "}
            <select
              value={inputName()}
              disabled={connection() !== undefined}
              onChange={(event) => setInputName(event.currentTarget.value)}
            >
              <For each={inputs()}>{(port) => <option value={port.name}>{port.name}</option>}</For>
            </select>
          </label>{" "}
          <label>
            Output{" "}
            <select
              value={outputName()}
              disabled={connection() !== undefined}
              onChange={(event) => setOutputName(event.currentTarget.value)}
            >
              <For each={outputs()}>{(port) => <option value={port.name}>{port.name}</option>}</For>
            </select>
          </label>{" "}
          <Show
            when={connection() === undefined}
            fallback={
              <button type="button" onClick={() => void disconnect()}>
                Disconnect
              </button>
            }
          >
            <button
              type="button"
              disabled={busy() || inputName() === ""}
              onClick={() => void connect()}
            >
              Connect
            </button>
          </Show>{" "}
          <button type="button" onClick={togglePause}>
            {paused() ? "Resume" : "Pause"}
          </button>{" "}
          <button type="button" onClick={clear}>
            Clear
          </button>
        </p>
      </Show>

      <p>
        {status()}
        <Show when={paused()}> Paused — the log is still recording behind this view.</Show>
      </p>

      <pre>{report()}</pre>
    </main>
  );
}
