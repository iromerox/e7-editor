// Dev-only page that runs the transport smoke test against a connected e7 and shows the raw log.
import type { PortInfo } from "../midi";
import { For, Show, createSignal } from "solid-js";
import { enableMidi, listInputPorts, listOutputPorts, openConnection } from "../midi";
import { PresetSlot } from "../protocol";
import { formatSmokeTestReport, runHardwareSmokeTest } from "./hardware-smoke-test";

const DEVICE_HINT = "e7";

function describe(error: unknown): string {
  return error instanceof Error ? `${error.name}: ${error.message}` : String(error);
}

function preferred(ports: readonly PortInfo[]): string {
  const match = ports.find((port) => port.name.toLowerCase().includes(DEVICE_HINT));
  return (match ?? ports[0])?.name ?? "";
}

export function HardwareSmokeTest() {
  const [inputs, setInputs] = createSignal<readonly PortInfo[]>([]);
  const [outputs, setOutputs] = createSignal<readonly PortInfo[]>([]);
  const [inputName, setInputName] = createSignal("");
  const [outputName, setOutputName] = createSignal("");
  const [status, setStatus] = createSignal("Web MIDI not enabled yet.");
  const [log, setLog] = createSignal("");
  const [busy, setBusy] = createSignal(false);

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

  const run = async (): Promise<void> => {
    setBusy(true);
    setLog("");
    setStatus("Running…");
    try {
      const connection = await openConnection({ input: inputName(), output: outputName() });
      try {
        const report = await runHardwareSmokeTest(connection, new PresetSlot(1, 1, 1));
        setLog(formatSmokeTestReport(report));
        setStatus(`Serial ${report.serialNumber}, preset 1.1.1 read as "${report.presetName}".`);
      } finally {
        await connection.close();
      }
    } catch (error) {
      setStatus(describe(error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <main>
      <h1>e7 hardware smoke test</h1>
      <p>
        Reads the serial number and preset 1.1.1 from a connected e7. Read-only — nothing is written
        to the device.
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
              onChange={(event) => setInputName(event.currentTarget.value)}
            >
              <For each={inputs()}>{(port) => <option value={port.name}>{port.name}</option>}</For>
            </select>
          </label>{" "}
          <label>
            Output{" "}
            <select
              value={outputName()}
              onChange={(event) => setOutputName(event.currentTarget.value)}
            >
              <For each={outputs()}>{(port) => <option value={port.name}>{port.name}</option>}</For>
            </select>
          </label>{" "}
          <button type="button" disabled={busy() || inputName() === ""} onClick={() => void run()}>
            Run smoke test
          </button>
        </p>
      </Show>

      <p>{status()}</p>

      <Show when={log() !== ""}>
        <pre>{log()}</pre>
      </Show>
    </main>
  );
}
