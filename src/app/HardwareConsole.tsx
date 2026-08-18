// Dev-only page that logs every byte a connected e7 sends, as it arrives, for as long as it is open, and sends the commands and control changes the editor will not.
import type { JSX } from "solid-js";
import type { Connection, PortInfo, WireLogHeader } from "../midi";
import type {
  ControlChangeMessage,
  WireEvent,
  WireLog,
  WireMonitorSubscription,
} from "./wire-monitor";
import type { CommandDraft, SenderCommand, SenderField } from "./wire-sender";
import { For, Show, createMemo, createSignal, onCleanup } from "solid-js";
import { enableMidi, listInputPorts, listOutputPorts, openConnection } from "../midi";
import {
  CAPTURE_NOTE,
  NOTHING_WRITTEN,
  emptyCaptureHeader,
  saveWireCapture,
  savedCaptureNote,
} from "./wire-capture";
import { emptyWireLog, formatWireMonitorReport, monitorWire, recorded } from "./wire-monitor";
import {
  CONFIGURATION_FIELDS,
  INITIAL_CONTROL_CHANGE,
  INITIAL_DRAFT,
  NO_UNDO_NOTE,
  SENDER_COMMANDS,
  buildCommand,
  commandNamed,
  sendCommand,
  sendControlChange,
} from "./wire-sender";

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

interface NumberFieldProps {
  readonly label: string;
  readonly value: number;
  readonly min: number;
  readonly max: number;
  readonly onInput: (value: number) => void;
}

function NumberField(props: NumberFieldProps): JSX.Element {
  return (
    <label>
      {props.label}{" "}
      <input
        type="number"
        min={props.min}
        max={props.max}
        size={4}
        value={props.value}
        onInput={(event) => props.onInput(event.currentTarget.valueAsNumber)}
      />
    </label>
  );
}

interface TextFieldProps {
  readonly label: string;
  readonly value: string;
  readonly size: number;
  readonly onInput: (value: string) => void;
}

function TextField(props: TextFieldProps): JSX.Element {
  return (
    <label>
      {props.label}{" "}
      <input
        type="text"
        size={props.size}
        value={props.value}
        onInput={(event) => props.onInput(event.currentTarget.value)}
      />
    </label>
  );
}

interface CommandChoiceProps {
  readonly legend: string;
  readonly commands: readonly SenderCommand[];
  readonly chosen: CommandDraft["kind"];
  readonly onChoose: (kind: CommandDraft["kind"]) => void;
}

function CommandChoice(props: CommandChoiceProps): JSX.Element {
  return (
    <fieldset>
      <legend>{props.legend}</legend>
      <For each={props.commands}>
        {(command) => (
          <div>
            <label>
              <input
                type="radio"
                name="command"
                value={command.kind}
                checked={props.chosen === command.kind}
                onChange={() => props.onChoose(command.kind)}
              />{" "}
              {command.label}
            </label>
          </div>
        )}
      </For>
    </fieldset>
  );
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
  const [draft, setDraft] = createSignal<CommandDraft>(INITIAL_DRAFT);
  const [controlChange, setControlChange] =
    createSignal<ControlChangeMessage>(INITIAL_CONTROL_CHANGE);
  const [sent, setSent] = createSignal("");
  const [refusal, setRefusal] = createSignal("");
  const [header, setHeader] = createSignal<WireLogHeader>(emptyCaptureHeader());
  const [saving, setSaving] = createSignal(false);
  const [saved, setSaved] = createSignal("");
  const [saveRefusal, setSaveRefusal] = createSignal("");

  let monitor: WireMonitorSubscription | undefined;

  const paused = (): boolean => held() !== undefined;

  const shown = (): WireLog => held() ?? log();

  const chosen = createMemo(() => commandNamed(draft().kind));

  const takes = (field: SenderField): boolean => chosen().fields.includes(field);

  const report = createMemo(() => {
    const active = connection();
    return formatWireMonitorReport({
      inputName: active?.inputName ?? NO_PORT,
      outputName: active?.outputName ?? NO_PORT,
      log: shown(),
      reassembly: active === undefined ? IDLE_STATS : active.reassembly,
    });
  });

  const record = (event: WireEvent): void => {
    setLog((current) => recorded(current, event));
  };

  const attempt = (label: string, send: (active: Connection) => void): void => {
    const active = connection();
    if (active === undefined || monitor === undefined) {
      return;
    }
    setSent("");
    setRefusal("");
    try {
      send(active);
      setSent(`Sent ${label}.`);
    } catch (error) {
      setRefusal(`${label} was not sent. ${describe(error)}`);
    }
  };

  const send = (): void => {
    attempt(chosen().label, (active) => {
      sendCommand(active, buildCommand(draft()), record, () => monitor?.elapsedMs() ?? 0);
    });
  };

  const sendCc = (): void => {
    const message = controlChange();
    attempt(
      `CC ${message.controller} = ${message.value} on channel ${message.channel}`,
      (active) => {
        sendControlChange(active, message, record, () => monitor?.elapsedMs() ?? 0);
      },
    );
  };

  const save = (): void => {
    setSaved("");
    setSaveRefusal("");
    setSaving(true);
    void saveWireCapture(shown(), header()).then(
      (result) => {
        setSaving(false);
        if (result.status === "refused") {
          setSaveRefusal(result.reason);
          return;
        }
        setSaved(
          result.status === "written"
            ? savedCaptureNote(result.fileName, result.events)
            : NOTHING_WRITTEN,
        );
      },
      (error: unknown) => {
        setSaving(false);
        setSaveRefusal(describe(error));
      },
    );
  };

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
      monitor = monitorWire(active, record);
      setConnection(active);
      setHeader((current) => ({
        ...current,
        input: active.inputName,
        output: active.outputName,
      }));
      setStatus(`Monitoring ${active.inputName}. Play, turn a knob, or send from a DAW.`);
    } catch (error) {
      setStatus(describe(error));
    } finally {
      setBusy(false);
    }
  };

  const disconnect = async (): Promise<void> => {
    monitor?.unsubscribe();
    monitor = undefined;
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
    monitor?.unsubscribe();
    void connection()?.close();
  });

  return (
    <main>
      <h1>e7 hardware console</h1>
      <p>
        Logs every SysEx frame and control change crossing the wire, timestamped and in hex, whether
        or not this app understands it, and sends the commands and control changes the editor will
        not. Everything sent from here is logged beside what comes back.
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

      <section aria-label="Send">
        <h2>Send</h2>
        <p>{NO_UNDO_NOTE}</p>

        <fieldset>
          <legend>Control change — moves a parameter and leaves it moved</legend>
          <p>
            Sent as typed, on any controller: the CC map has no say here, and neither does the
            editor's refusal to send a controller it believes the device only reports.
          </p>
          <p>
            <NumberField
              label="Channel"
              value={controlChange().channel}
              min={1}
              max={16}
              onInput={(channel) => setControlChange((current) => ({ ...current, channel }))}
            />{" "}
            <NumberField
              label="Controller"
              value={controlChange().controller}
              min={0}
              max={127}
              onInput={(controller) => setControlChange((current) => ({ ...current, controller }))}
            />{" "}
            <NumberField
              label="Value"
              value={controlChange().value}
              min={0}
              max={127}
              onInput={(value) => setControlChange((current) => ({ ...current, value }))}
            />{" "}
            <button type="button" disabled={connection() === undefined} onClick={sendCc}>
              Send control change
            </button>
          </p>
        </fieldset>

        <div style={{ display: "flex", "flex-wrap": "wrap", gap: "1rem" }}>
          <CommandChoice
            legend="Commands that read"
            commands={SENDER_COMMANDS.filter((command) => !command.writes)}
            chosen={draft().kind}
            onChoose={(kind) => setDraft((current) => ({ ...current, kind }))}
          />
          <CommandChoice
            legend="Commands that change the instrument — no undo"
            commands={SENDER_COMMANDS.filter((command) => command.writes)}
            chosen={draft().kind}
            onChoose={(kind) => setDraft((current) => ({ ...current, kind }))}
          />
        </div>

        <p>{chosen().note}</p>

        <Show when={takes("address")}>
          <p>
            <label>
              Address (hex){" "}
              <input
                type="text"
                size={8}
                value={draft().address}
                onInput={(event) => {
                  const address = event.currentTarget.value;
                  setDraft((current) => ({ ...current, address }));
                }}
              />
            </label>
          </p>
        </Show>

        <Show when={takes("data")}>
          <p>
            <label>
              Data bytes (hex, one byte per pair){" "}
              <input
                type="text"
                size={48}
                value={draft().data}
                onInput={(event) => {
                  const data = event.currentTarget.value;
                  setDraft((current) => ({ ...current, data }));
                }}
              />
            </label>
          </p>
        </Show>

        <Show when={takes("slot")}>
          <p>
            <NumberField
              label="Bank"
              value={draft().bank}
              min={1}
              max={8}
              onInput={(bank) => setDraft((current) => ({ ...current, bank }))}
            />{" "}
            <NumberField
              label="Group"
              value={draft().group}
              min={1}
              max={8}
              onInput={(group) => setDraft((current) => ({ ...current, group }))}
            />{" "}
            <NumberField
              label="Slot"
              value={draft().slot}
              min={1}
              max={8}
              onInput={(slot) => setDraft((current) => ({ ...current, slot }))}
            />
          </p>
        </Show>

        <Show when={takes("configuration")}>
          <p>
            <For each={CONFIGURATION_FIELDS}>
              {(field) => (
                <>
                  <NumberField
                    label={field.label}
                    value={draft().configuration[field.name]}
                    min={0}
                    max={127}
                    onInput={(value) =>
                      setDraft((current) => ({
                        ...current,
                        configuration: { ...current.configuration, [field.name]: value },
                      }))
                    }
                  />{" "}
                </>
              )}
            </For>
          </p>
        </Show>

        <p>
          <button type="button" disabled={connection() === undefined} onClick={send}>
            Send {chosen().label}
          </button>
        </p>

        <Show when={sent() !== ""}>
          <p role="status">{sent()}</p>
        </Show>
        <Show when={refusal() !== ""}>
          <p role="alert">{refusal()}</p>
        </Show>
      </section>

      <section aria-label="Capture">
        <h2>Capture</h2>
        <p>{CAPTURE_NOTE}</p>

        <p>
          <TextField
            label="Device"
            value={header().device}
            size={44}
            onInput={(device) => setHeader((current) => ({ ...current, device }))}
          />
        </p>
        <p>
          <TextField
            label="Input"
            value={header().input}
            size={20}
            onInput={(input) => setHeader((current) => ({ ...current, input }))}
          />{" "}
          <TextField
            label="Output"
            value={header().output}
            size={20}
            onInput={(output) => setHeader((current) => ({ ...current, output }))}
          />{" "}
          <label>
            Date{" "}
            <input
              type="date"
              value={header().date}
              onInput={(event) => {
                const date = event.currentTarget.value;
                setHeader((current) => ({ ...current, date }));
              }}
            />
          </label>
        </p>
        <p>
          <TextField
            label="Session"
            value={header().session}
            size={72}
            onInput={(session) => setHeader((current) => ({ ...current, session }))}
          />
        </p>

        <p>
          <button type="button" disabled={saving()} onClick={save}>
            Save capture
          </button>
        </p>

        <Show when={saved() !== ""}>
          <p role="status">{saved()}</p>
        </Show>
        <Show when={saveRefusal() !== ""}>
          <p role="alert">{saveRefusal()}</p>
        </Show>
      </section>

      <h2>Log</h2>
      <pre>{report()}</pre>
    </main>
  );
}
