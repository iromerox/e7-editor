// Device browser: bank and group navigation over the e7's single and multi slots, with per-slot name and lock reads.
import type { JSX } from "solid-js";
import type { Connection } from "../midi";
import type { DeviceSlotState } from "./app-state";
import type { SlotAddress, SlotSummary } from "./device-slots";
import { For, Match, Show, Switch, createMemo } from "solid-js";
import { useAppState } from "./AppStateProvider";
import {
  BANKS_PER_KIND,
  GROUPS_PER_BANK,
  SLOTS_PER_GROUP,
  SLOT_KINDS,
  createSlotReader,
  slotKey,
  slotLabel,
} from "./device-slots";

export interface DevicePaneProps {
  readonly connection: Connection | undefined;
}

const UNNAMED = "(unnamed)";

function describe(error: unknown): string {
  return error instanceof Error ? `${error.name}: ${error.message}` : String(error);
}

function counting(total: number): readonly number[] {
  return Array.from({ length: total }, (_, index) => index + 1);
}

interface ChoiceProps {
  readonly label: string;
  readonly options: readonly number[];
  readonly value: number;
  readonly onSelect: (value: number) => void;
}

function ChoiceRow(props: ChoiceProps): JSX.Element {
  return (
    <fieldset
      style={{
        display: "flex",
        "align-items": "baseline",
        gap: "0.25rem",
        border: "none",
        margin: "0",
        padding: "0",
      }}
    >
      <legend style={{ color: "var(--e7-label-secondary)", float: "left", padding: "0" }}>
        {props.label}
      </legend>
      <For each={props.options}>
        {(option) => (
          <button
            type="button"
            aria-label={`${props.label} ${option}`}
            aria-pressed={option === props.value}
            onClick={() => props.onSelect(option)}
            style={{
              "font-weight": option === props.value ? "bold" : "normal",
              "min-width": "2rem",
            }}
          >
            {option}
          </button>
        )}
      </For>
    </fieldset>
  );
}

function LockChip(props: { readonly locked: boolean }): JSX.Element {
  return (
    <span
      style={{
        border: `1px solid ${props.locked ? "var(--e7-led-on)" : "var(--e7-silkscreen)"}`,
        background: props.locked ? "var(--e7-led-halo)" : "transparent",
        "border-radius": "0.75rem",
        padding: "0 0.5rem",
        "font-size": "0.75rem",
        color: props.locked ? "var(--e7-led-on)" : "var(--e7-label-secondary)",
      }}
    >
      {props.locked ? "Locked" : "Unlocked"}
    </span>
  );
}

interface SlotCellProps {
  readonly address: SlotAddress;
  readonly state: DeviceSlotState | undefined;
  readonly readable: boolean;
  readonly onRead: (address: SlotAddress) => void;
}

function SlotCell(props: SlotCellProps): JSX.Element {
  const summary = (): SlotSummary | undefined =>
    props.state?.status === "read" ? props.state.summary : undefined;
  const failure = (): string | undefined =>
    props.state?.status === "failed" ? props.state.reason : undefined;
  const locked = (): boolean => summary()?.locked === true;

  return (
    <li
      style={{
        display: "flex",
        "flex-direction": "column",
        gap: "0.25rem",
        padding: "0.5rem",
        border: `1px solid ${locked() ? "var(--e7-led-on)" : "var(--e7-silkscreen)"}`,
        "border-radius": "0.25rem",
      }}
    >
      <div style={{ display: "flex", "align-items": "baseline", gap: "0.5rem" }}>
        <span style={{ "font-weight": "bold" }}>{slotLabel(props.address)}</span>
        <button
          type="button"
          aria-label={`Read ${props.address.kind} ${slotLabel(props.address)}`}
          disabled={!props.readable || props.state?.status === "reading"}
          onClick={() => props.onRead(props.address)}
        >
          Read
        </button>
      </div>
      <Switch fallback={<span>Not read</span>}>
        <Match when={props.state?.status === "reading"}>
          <span>Reading…</span>
        </Match>
        <Match when={summary()}>
          {(read) => (
            <div style={{ display: "flex", "align-items": "baseline", gap: "0.5rem" }}>
              <span>{read().name === "" ? UNNAMED : read().name}</span>
              <LockChip locked={read().locked} />
            </div>
          )}
        </Match>
        <Match when={failure()}>{(reason) => <span role="alert">{reason()}</span>}</Match>
      </Switch>
    </li>
  );
}

export function DevicePane(props: DevicePaneProps): JSX.Element {
  const { state, selectSlotKind, selectBank, selectGroup, setSlotState } = useAppState();

  const reader = createMemo(() => {
    const connection = props.connection;
    return connection === undefined ? undefined : createSlotReader(connection);
  });

  const readSlot = (address: SlotAddress): void => {
    const reading = reader();
    if (reading === undefined) {
      return;
    }
    setSlotState(address, { status: "reading" });
    void reading.read(address).then(
      (summary) => setSlotState(address, { status: "read", summary }),
      (error: unknown) => setSlotState(address, { status: "failed", reason: describe(error) }),
    );
  };

  return (
    <section
      aria-label="Device"
      style={{
        background: "var(--e7-section-background)",
        color: "var(--e7-label)",
        padding: "0.75rem",
      }}
    >
      <div style={{ display: "flex", "align-items": "baseline", gap: "0.75rem" }}>
        <h2 style={{ margin: "0" }}>Device</h2>
        <div role="tablist" aria-label="Slot kind" style={{ display: "flex", gap: "0.25rem" }}>
          <For each={SLOT_KINDS}>
            {(option) => (
              <button
                type="button"
                role="tab"
                aria-selected={option === state.device.kind}
                onClick={() => selectSlotKind(option)}
                style={{ "font-weight": option === state.device.kind ? "bold" : "normal" }}
              >
                {option}
              </button>
            )}
          </For>
        </div>
      </div>
      <div
        style={{
          display: "flex",
          "flex-wrap": "wrap",
          gap: "0.75rem",
          margin: "0.5rem 0",
        }}
      >
        <ChoiceRow
          label="Bank"
          options={counting(BANKS_PER_KIND[state.device.kind])}
          value={state.device.bank}
          onSelect={selectBank}
        />
        <ChoiceRow
          label="Group"
          options={counting(GROUPS_PER_BANK)}
          value={state.device.group}
          onSelect={selectGroup}
        />
      </div>
      <Show when={props.connection === undefined}>
        <p style={{ margin: "0 0 0.5rem" }}>
          Connect to a device to read the names and lock state of its slots.
        </p>
      </Show>
      <div role="tabpanel" aria-label={`${state.device.kind} slots`}>
        <ul
          style={{
            display: "grid",
            "grid-template-columns": "repeat(auto-fit, minmax(11rem, 1fr))",
            gap: "0.5rem",
            "list-style": "none",
            margin: "0",
            padding: "0",
          }}
        >
          <For each={counting(SLOTS_PER_GROUP)}>
            {(slot) => {
              const address = (): SlotAddress => ({
                kind: state.device.kind,
                bank: state.device.bank,
                group: state.device.group,
                slot,
              });
              return (
                <SlotCell
                  address={address()}
                  state={state.device.slots[slotKey(address())]}
                  readable={props.connection !== undefined}
                  onRead={readSlot}
                />
              );
            }}
          </For>
        </ul>
      </div>
    </section>
  );
}
