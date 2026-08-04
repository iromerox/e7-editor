// Cap buttons: the momentary switch with its own LED, and the two-layer selector that steps an LED column.
import type { JSX } from "solid-js";
import { Show, createSignal } from "solid-js";
import { LayerLabel } from "./LayerLabel";
import { LED_GAP_REM, Led, LedStack, activeLedName } from "./Led";

export const CAP_REM = 1.5;

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
  readonly active?: number | undefined;
  readonly names?: readonly string[] | undefined;
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

  const layer = (): ButtonLayer => {
    const shift = props.shift;
    return selected() === "shift" && shift !== undefined ? shift : props.primary;
  };

  const capName = (): string => {
    const current = layer();
    return `${current.label}: ${activeLedName(current.count, current.active, current.names)}`;
  };

  return (
    <div
      style={{
        display: "flex",
        "flex-direction": "column",
        "align-items": "flex-start",
        gap: "0.2rem",
        color: "var(--e7-label)",
        "user-select": "none",
      }}
    >
      <div style={{ display: "flex", "align-items": "center", gap: "0.35rem" }}>
        <Cap name={capName()} description={layer().description} onPress={() => layer().onPress()} />
        <LedStack count={layer().count} active={layer().active} names={layer().names} />
      </div>
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
    </div>
  );
}
