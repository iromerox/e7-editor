// Rotary knob: vertical-drag and keyboard value editing, drawn with the panel's pointer cap and 300-degree tick arc.
import type { JSX } from "solid-js";
import type { ControlValue } from "./control-value";
import { For, Show, createSignal, createUniqueId, onCleanup } from "solid-js";
import {
  clamp,
  createEmitter,
  draggedValue,
  isEditable,
  lowerBound,
  nudgedValue,
  readout,
  upperBound,
} from "./control-value";
import { LayerLabel } from "./LayerLabel";

export type KnobSize = "standard" | "large";

export type KnobLayerName = "primary" | "shift";

export type KnobLayer = ControlValue;

export interface KnobProps {
  readonly primary: KnobLayer;
  readonly shift?: KnobLayer | undefined;
  readonly size?: KnobSize;
}

export const ARC_START_DEGREES = -150;

export const ARC_SPAN_DEGREES = 300;

export const TICK_STEP_DEGREES = 15;

export const TICK_COUNT = 21;

export const SKIRT_LOBES = 7;

const LARGE_CAP_RATIO = 1.7;

export const STANDARD_CAP_REM = 3;

const READ_ONLY_OPACITY = 0.7;

const CENTRE = 50;

const SKIRT_RADIUS = 32;

const SKIRT_LOBE_DEPTH = 0.055;

const SKIRT_SAMPLES_PER_LOBE = 24;

const INLAY_RADIUS = 20;

const TICK_INNER_RADIUS = 34;

const TICK_MINOR_RADIUS = 41.6;

const TICK_MAJOR_RADIUS = 45.4;

const POINTER_INNER_RADIUS = 22.5;

const POINTER_OUTER_RADIUS = 29;

interface Tick {
  readonly angle: number;
  readonly major: boolean;
}

const TICKS: readonly Tick[] = Array.from({ length: TICK_COUNT }, (_, index) => ({
  angle: ARC_START_DEGREES + index * TICK_STEP_DEGREES,
  major: index % 2 === 0,
}));

const SKIRT_PATH = skirtPath();

export function skirtRadius(angle: number): number {
  return SKIRT_RADIUS * (1 + SKIRT_LOBE_DEPTH * Math.cos((SKIRT_LOBES * angle * Math.PI) / 180));
}

function skirtPath(): string {
  const samples = SKIRT_LOBES * SKIRT_SAMPLES_PER_LOBE;
  let path = "";
  for (let index = 0; index < samples; index += 1) {
    const angle = (index / samples) * 360;
    const point = polar(angle, skirtRadius(angle));
    path += `${index === 0 ? "M" : "L"}${point.x.toFixed(2)} ${point.y.toFixed(2)}`;
  }
  return `${path}Z`;
}

export function knobAngle(value: number, min: number, max: number): number {
  if (max === min) {
    return ARC_START_DEGREES;
  }
  const fraction = (clamp(value, min, max) - min) / (max - min);
  return ARC_START_DEGREES + fraction * ARC_SPAN_DEGREES;
}

function polar(angle: number, radius: number): { readonly x: number; readonly y: number } {
  const radians = (angle * Math.PI) / 180;
  return { x: CENTRE + radius * Math.sin(radians), y: CENTRE - radius * Math.cos(radians) };
}

export function Knob(props: KnobProps): JSX.Element {
  const skirtId = createUniqueId();
  const inlayId = createUniqueId();
  const [selected, setSelected] = createSignal<KnobLayerName>("primary");
  const [dragging, setDragging] = createSignal(false);

  const layer = (): KnobLayer => {
    const shift = props.shift;
    return selected() === "shift" && shift !== undefined ? shift : props.primary;
  };

  const diameter = (): string =>
    `${props.size === "large" ? STANDARD_CAP_REM * LARGE_CAP_RATIO : STANDARD_CAP_REM}rem`;

  const angle = (): number => {
    const current = layer();
    return knobAngle(current.value, lowerBound(current), upperBound(current));
  };

  const emitter = createEmitter();
  let startY = 0;
  let startValue = 0;

  const onMove = (event: PointerEvent): void => {
    const current = layer();
    emitter.emit(current, draggedValue(current, startValue, startY - event.clientY));
  };

  const endDrag = (): void => {
    setDragging(false);
    window.removeEventListener("pointermove", onMove);
    window.removeEventListener("pointerup", endDrag);
    window.removeEventListener("pointercancel", endDrag);
  };

  const beginDrag = (event: PointerEvent & { currentTarget: HTMLDivElement }): void => {
    if (event.button !== 0 || !isEditable(layer())) {
      return;
    }
    startY = event.clientY;
    startValue = layer().value;
    emitter.begin(startValue);
    setDragging(true);
    event.preventDefault();
    event.currentTarget.focus();
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", endDrag);
    window.addEventListener("pointercancel", endDrag);
  };

  const onKeyDown = (event: KeyboardEvent): void => {
    const current = layer();
    if (!isEditable(current)) {
      return;
    }
    const next = nudgedValue(current, event.key);
    if (next === undefined) {
      return;
    }
    if (next !== current.value) {
      current.onInput(next);
    }
    event.preventDefault();
  };

  onCleanup(endDrag);

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
        role="slider"
        tabIndex={0}
        aria-label={layer().label}
        aria-orientation="vertical"
        aria-valuemin={lowerBound(layer())}
        aria-valuemax={upperBound(layer())}
        aria-valuenow={layer().value}
        aria-valuetext={readout(layer())}
        aria-readonly={!isEditable(layer())}
        title={layer().description}
        onPointerDown={beginDrag}
        onKeyDown={onKeyDown}
        style={{
          width: diameter(),
          height: diameter(),
          "touch-action": "none",
          "user-select": "none",
          opacity: isEditable(layer()) ? "1" : String(READ_ONLY_OPACITY),
          cursor: isEditable(layer()) ? (dragging() ? "grabbing" : "grab") : "default",
        }}
      >
        <svg viewBox="0 0 100 100" width="100%" height="100%" aria-hidden="true">
          <defs>
            <linearGradient
              id={skirtId}
              x1="0"
              y1="0"
              x2="0"
              y2="1"
              gradientTransform={`rotate(${-angle()} 0.5 0.5)`}
            >
              <stop offset="0%" stop-color="var(--e7-cap-top)" />
              <stop offset="100%" stop-color="var(--e7-cap-bottom)" />
            </linearGradient>
            <linearGradient
              id={inlayId}
              x1="0"
              y1="0"
              x2="0"
              y2="1"
              gradientTransform={`rotate(${-angle()} 0.5 0.5)`}
            >
              <stop offset="0%" stop-color="var(--e7-knob-inlay-top)" />
              <stop offset="100%" stop-color="var(--e7-knob-inlay-bottom)" />
            </linearGradient>
          </defs>
          <For each={TICKS}>
            {(tick) => {
              const inner = polar(tick.angle, TICK_INNER_RADIUS);
              const outer = polar(tick.angle, tick.major ? TICK_MAJOR_RADIUS : TICK_MINOR_RADIUS);
              return (
                <line
                  x1={inner.x}
                  y1={inner.y}
                  x2={outer.x}
                  y2={outer.y}
                  stroke="var(--e7-silkscreen)"
                  stroke-width={tick.major ? 2.4 : 1.6}
                  stroke-linecap="round"
                />
              );
            }}
          </For>
          <g transform={`rotate(${angle()} ${CENTRE} ${CENTRE})`}>
            <path d={SKIRT_PATH} fill={`url(#${skirtId})`} />
            <line
              x1={polar(0, POINTER_INNER_RADIUS).x}
              y1={polar(0, POINTER_INNER_RADIUS).y}
              x2={polar(0, POINTER_OUTER_RADIUS).x}
              y2={polar(0, POINTER_OUTER_RADIUS).y}
              stroke="var(--e7-knob-notch)"
              stroke-width="3.4"
              stroke-linecap="round"
            />
            <circle
              cx={CENTRE}
              cy={CENTRE}
              r={INLAY_RADIUS}
              fill={`url(#${inlayId})`}
              stroke="var(--e7-knob-notch)"
              stroke-opacity="0.35"
              stroke-width="0.8"
            />
          </g>
        </svg>
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
      <span style={{ "font-size": "0.7rem", color: "var(--e7-label-secondary)" }}>
        {readout(layer())}
      </span>
    </div>
  );
}
