// LED indicators: one lens, the column beside a selector button, and the horizontal indicator row.
import type { JSX } from "solid-js";
import { For, Show } from "solid-js";

export const LED_DIAMETER_REM = 0.5;

export const LED_GAP_REM = 0.25;

export const NO_LED_LIT = "none";

export interface LedProps {
  readonly lit: boolean;
}

export interface LedRowProps {
  readonly count: number;
  readonly lit: readonly boolean[];
  readonly label?: string;
  readonly names?: readonly string[];
}

export type LedSelection = number | readonly number[];

export interface LedStackProps {
  readonly count: number;
  readonly active?: LedSelection | undefined;
  readonly label?: string;
  readonly names?: readonly string[] | undefined;
}

export function ledName(index: number, names?: readonly string[]): string {
  return names?.[index] ?? String(index + 1);
}

export function litIndexes(count: number, active?: LedSelection): readonly number[] {
  if (active === undefined) {
    return [];
  }
  const wanted = typeof active === "number" ? [active] : active;
  return wanted.map((index) => Math.trunc(index)).filter((index) => index >= 0 && index < count);
}

export function activeLedName(
  count: number,
  active?: LedSelection,
  names?: readonly string[],
): string {
  const lit = litIndexes(count, active);
  return lit.length === 0 ? NO_LED_LIT : lit.map((index) => ledName(index, names)).join(", ");
}

function positions(count: number): readonly number[] {
  return Array.from({ length: Math.max(0, Math.trunc(count)) }, (_, index) => index);
}

export function Led(props: LedProps): JSX.Element {
  return (
    <span
      aria-hidden="true"
      style={{
        display: "inline-block",
        "flex-shrink": "0",
        width: `${LED_DIAMETER_REM}rem`,
        height: `${LED_DIAMETER_REM}rem`,
        "border-radius": "50%",
        background: props.lit ? "var(--e7-led-on)" : "var(--e7-led-off)",
        "box-shadow": props.lit
          ? "0 0 0 0.12rem var(--e7-led-halo), 0 0 0.45rem 0.1rem var(--e7-led-halo)"
          : "inset 0 0 0 1px var(--e7-panel)",
      }}
    />
  );
}

export function LedRow(props: LedRowProps): JSX.Element {
  const isLit = (index: number): boolean => props.lit[index] ?? false;

  const description = (): string => {
    const names = positions(props.count)
      .filter(isLit)
      .map((index) => ledName(index, props.names));
    return `${props.label ?? ""}: ${names.length === 0 ? NO_LED_LIT : names.join(", ")}`;
  };

  return (
    <div
      role="img"
      aria-label={props.label === undefined ? undefined : description()}
      aria-hidden={props.label === undefined ? true : undefined}
      style={{
        display: "flex",
        "align-items": "center",
        gap: `${LED_GAP_REM}rem`,
      }}
    >
      <For each={positions(props.count)}>{(index) => <Led lit={isLit(index)} />}</For>
    </div>
  );
}

export function LedStack(props: LedStackProps): JSX.Element {
  const lit = (): readonly number[] => litIndexes(props.count, props.active);

  const description = (): string =>
    `${props.label ?? ""}: ${activeLedName(props.count, props.active, props.names)}`;

  return (
    <div
      role="img"
      aria-label={props.label === undefined ? undefined : description()}
      aria-hidden={props.label === undefined ? true : undefined}
      style={{
        display: "flex",
        "flex-direction": "column",
        "align-items": "flex-start",
        gap: `${LED_GAP_REM}rem`,
      }}
    >
      <For each={positions(props.count)}>
        {(index) => (
          <span style={{ display: "flex", "align-items": "center", gap: "0.3rem" }}>
            <Led lit={lit().includes(index)} />
            <Show when={props.names?.[index]}>
              {(name) => (
                <span
                  style={{
                    "font-size": "0.65rem",
                    "line-height": "1",
                    color: "var(--e7-silkscreen)",
                  }}
                >
                  {name()}
                </span>
              )}
            </Show>
          </span>
        )}
      </For>
    </div>
  );
}
