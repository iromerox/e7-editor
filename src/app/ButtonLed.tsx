// Cap buttons: the momentary switch with its own LED, and the two-layer selector that steps an LED column.
import type { JSX } from "solid-js";
import type { LedSelection } from "./Led";
import { For, Show, createSignal } from "solid-js";
import { STANDARD_CAP_REM } from "./Knob";
import { LayerLabel } from "./LayerLabel";
import { LED_GAP_REM, Led, LedStack, activeLedName, ledStackHeightRem, litIndexes } from "./Led";

export const CAP_REM = 1.5;

export const CAP_ROW_OFFSET_REM = (STANDARD_CAP_REM - CAP_REM) / 2;

export const READOUT_WIDTH_REM = 5.5;

const LED_COLUMN_GAP_REM = 0.35;

const READOUT_LINE_REM = 0.9;

const ACTIVATION_KEYS: ReadonlySet<string> = new Set([" ", "Enter"]);

export type LedPlacement = "above" | "beside";

export type ButtonLayerName = "primary" | "shift";

export interface ButtonLedProps {
  readonly label: string;
  readonly lit: boolean;
  readonly placement?: LedPlacement;
  readonly description?: string | undefined;
  readonly onPress: () => void;
}

export interface ButtonLayer {
  readonly label: string;
  readonly count: number;
  readonly active?: LedSelection | undefined;
  readonly names?: readonly string[] | undefined;
  readonly readout?: string | undefined;
  readonly description?: string | undefined;
  readonly onPress: () => void;
}

export interface DualButtonProps {
  readonly primary: ButtonLayer;
  readonly shift?: ButtonLayer | undefined;
}

interface CapProps {
  readonly name: string;
  readonly pressed?: boolean;
  readonly description?: string | undefined;
  readonly onPress: () => void;
}

function Cap(props: CapProps): JSX.Element {
  const [held, setHeld] = createSignal(false);
  const release = (): void => {
    setHeld(false);
  };

  return (
    <button
      type="button"
      aria-label={props.name}
      aria-pressed={props.pressed}
      title={props.description}
      onClick={props.onPress}
      onPointerDown={() => setHeld(true)}
      onPointerUp={release}
      onPointerLeave={release}
      onPointerCancel={release}
      onKeyDown={(event) => {
        if (ACTIVATION_KEYS.has(event.key)) {
          setHeld(true);
        }
      }}
      onKeyUp={release}
      onBlur={release}
      style={{
        width: `${CAP_REM}rem`,
        height: `${CAP_REM}rem`,
        padding: "0",
        "flex-shrink": "0",
        border: "1px solid var(--e7-panel)",
        "border-radius": "0.15rem",
        background: "linear-gradient(var(--e7-cap-top), var(--e7-cap-bottom))",
        cursor: "pointer",
        "touch-action": "manipulation",
        transform: held() ? "translateY(1px)" : "none",
        filter: held() ? "brightness(0.85)" : "none",
      }}
    />
  );
}

export function ButtonLed(props: ButtonLedProps): JSX.Element {
  const above = (): boolean => props.placement !== "beside";

  return (
    <div
      style={{
        display: "flex",
        "flex-direction": "column",
        "align-items": "center",
        gap: "0.2rem",
        color: "var(--e7-label)",
        "user-select": "none",
      }}
    >
      <div
        style={{
          display: "flex",
          "flex-direction": above() ? "column" : "row-reverse",
          "align-items": "center",
          gap: `${LED_GAP_REM}rem`,
        }}
      >
        <Led lit={props.lit} />
        <Cap
          name={props.label}
          pressed={props.lit}
          description={props.description}
          onPress={props.onPress}
        />
      </div>
      <LayerLabel label={props.label} selectable={false} />
    </div>
  );
}

export function DualButton(props: DualButtonProps): JSX.Element {
  const [selected, setSelected] = createSignal<ButtonLayerName>("primary");

  const layerOf = (name: ButtonLayerName): ButtonLayer => {
    const shift = props.shift;
    return name === "shift" && shift !== undefined ? shift : props.primary;
  };

  const showing = (): ButtonLayerName => (props.shift === undefined ? "primary" : selected());

  const names = (): readonly ButtonLayerName[] =>
    props.shift === undefined ? ["primary"] : ["primary", "shift"];

  const layer = (): ButtonLayer => layerOf(showing());

  const lensesOf = (): ButtonLayerName => (layer().count > 0 ? showing() : "primary");

  const capName = (): string => {
    const current = layer();
    return `${current.label}: ${current.readout ?? activeLedName(current.count, current.active, current.names)}`;
  };

  const spelledOut = (): string | undefined => {
    const current = layer();
    return litIndexes(current.count, current.active).length === 0 ? current.readout : undefined;
  };

  const overhangRem = (): number =>
    names().reduce((deepest, name) => {
      const current = layerOf(name);
      const column = ledStackHeightRem(current.count, current.names !== undefined);
      return Math.max(deepest, (column - CAP_REM) / 2);
    }, 0);

  return (
    <div
      style={{
        display: "flex",
        "flex-direction": "column",
        "align-items": "flex-start",
        gap: "0.2rem",
        "padding-top": `${CAP_ROW_OFFSET_REM}rem`,
        color: "var(--e7-label)",
        "user-select": "none",
      }}
    >
      <div
        style={{
          display: "flex",
          "align-items": "center",
          gap: `${LED_COLUMN_GAP_REM}rem`,
          height: `${CAP_REM}rem`,
        }}
      >
        <Cap name={capName()} description={layer().description} onPress={() => layer().onPress()} />
        <div style={{ display: "grid" }}>
          <For each={names()}>
            {(name) => (
              <div
                style={{
                  "grid-area": "1 / 1",
                  visibility: name === lensesOf() ? "visible" : "hidden",
                }}
              >
                <LedStack
                  count={layerOf(name).count}
                  active={layerOf(name).active}
                  names={layerOf(name).names}
                />
              </div>
            )}
          </For>
        </div>
      </div>
      <div
        style={{
          display: "flex",
          "flex-direction": "column",
          "align-items": "flex-start",
          gap: "0.2rem",
          "margin-top": `${overhangRem()}rem`,
        }}
      >
        <LayerLabel
          label={props.primary.label}
          selectable={props.shift !== undefined}
          selected={selected() === "primary"}
          onSelect={() => setSelected("primary")}
        />
        <Show when={props.shift}>
          {(shift) => (
            <LayerLabel
              label={shift().label}
              boxed={true}
              selectable={true}
              selected={selected() === "shift"}
              onSelect={() => setSelected("shift")}
            />
          )}
        </Show>
        <Show when={spelledOut()}>
          {(text) => (
            <span
              style={{
                "max-width": `${READOUT_WIDTH_REM}rem`,
                "font-size": "0.7rem",
                "line-height": `${READOUT_LINE_REM}rem`,
                color: "var(--e7-label-secondary)",
              }}
            >
              {text()}
            </span>
          )}
        </Show>
      </div>
    </div>
  );
}
