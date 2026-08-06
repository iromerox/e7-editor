// Envelope curve for one EG: the silkscreened ADSR shape with its four stages draggable on the curve itself.
import type { JSX } from "solid-js";
import type { ControlValue } from "./control-value";
import { For, Show, createSignal, onCleanup } from "solid-js";
import {
  createEmitter,
  draggedValue,
  fractionOf,
  lowerBound,
  nudgedValue,
  readout,
  upperBound,
} from "./control-value";

export type StageName = "attack" | "decay" | "sustain" | "release";

export interface Point {
  readonly x: number;
  readonly y: number;
}

export interface AdsrFractions {
  readonly attack: number;
  readonly decay: number;
  readonly sustain: number;
  readonly release: number;
}

export interface AdsrGeometry {
  readonly origin: Point;
  readonly attack: Point;
  readonly decay: Point;
  readonly sustain: Point;
  readonly release: Point;
}

export interface AdsrEditorProps {
  readonly label: string;
  readonly attack: ControlValue;
  readonly decay: ControlValue;
  readonly sustain: ControlValue;
  readonly release: ControlValue;
}

export const VIEW_WIDTH = 362;

export const VIEW_HEIGHT = 80;

export const EDGE = 8;

export const TIME_SPAN = 96;

export const SUSTAIN_SPAN = 58;

export const PEAK_Y = 14;

export const BASE_Y = 62;

const GATE_TOP = 70;

export const GATE_BOTTOM = 76;

const HANDLE_RADIUS = 5.5;

const HANDLE_HIT_RADIUS = 13;

const ACTIVE_HANDLE_RADIUS = 7;

const READOUT_OFFSET = 9;

const STAGE_ORDER: readonly StageName[] = ["attack", "decay", "sustain", "release"];

const TIME_STAGES: ReadonlySet<StageName> = new Set<StageName>(["attack", "decay", "release"]);

export function timeWidth(fraction: number): number {
  return fraction * TIME_SPAN;
}

function levelY(fraction: number): number {
  return BASE_Y - fraction * (BASE_Y - PEAK_Y);
}

export function adsrGeometry(fractions: AdsrFractions): AdsrGeometry {
  const peakX = EDGE + timeWidth(fractions.attack);
  const decayX = peakX + timeWidth(fractions.decay);
  const sustainX = decayX + SUSTAIN_SPAN;
  const sustainY = levelY(fractions.sustain);
  return {
    origin: { x: EDGE, y: BASE_Y },
    attack: { x: peakX, y: PEAK_Y },
    decay: { x: decayX, y: sustainY },
    sustain: { x: sustainX, y: sustainY },
    release: { x: sustainX + timeWidth(fractions.release), y: BASE_Y },
  };
}

export function adsrPath(geometry: AdsrGeometry): string {
  return boundaries(geometry)
    .map((point, index) => `${index === 0 ? "M" : "L"}${round(point.x)} ${round(point.y)}`)
    .join("");
}

export function boundaries(geometry: AdsrGeometry): readonly Point[] {
  return [geometry.origin, geometry.attack, geometry.decay, geometry.sustain, geometry.release];
}

export function gatePath(geometry: AdsrGeometry): string {
  return [
    `M${round(geometry.origin.x)} ${GATE_BOTTOM}`,
    `L${round(geometry.origin.x)} ${GATE_TOP}`,
    `L${round(geometry.sustain.x)} ${GATE_TOP}`,
    `L${round(geometry.sustain.x)} ${GATE_BOTTOM}`,
    `L${round(geometry.release.x)} ${GATE_BOTTOM}`,
  ].join("");
}

function round(value: number): string {
  return value.toFixed(2);
}

export function AdsrEditor(props: AdsrEditorProps): JSX.Element {
  const [held, setHeld] = createSignal<StageName | undefined>();
  const [focused, setFocused] = createSignal<StageName | undefined>();

  const active = (): StageName | undefined => held() ?? focused();

  const emitter = createEmitter();
  let startPointer = 0;
  let startValue = 0;

  const control = (stage: StageName): ControlValue => props[stage];

  const geometry = (): AdsrGeometry =>
    adsrGeometry({
      attack: fractionOf(props.attack),
      decay: fractionOf(props.decay),
      sustain: fractionOf(props.sustain),
      release: fractionOf(props.release),
    });

  const travelled = (stage: StageName, event: PointerEvent): number =>
    TIME_STAGES.has(stage) ? event.clientX - startPointer : startPointer - event.clientY;

  const onMove = (event: PointerEvent): void => {
    const stage = held();
    if (stage === undefined) {
      return;
    }
    const current = control(stage);
    emitter.emit(current, draggedValue(current, startValue, travelled(stage, event)));
  };

  const endDrag = (): void => {
    setHeld(undefined);
    window.removeEventListener("pointermove", onMove);
    window.removeEventListener("pointerup", endDrag);
    window.removeEventListener("pointercancel", endDrag);
  };

  const beginDrag = (stage: StageName, event: PointerEvent): void => {
    if (event.button !== 0) {
      return;
    }
    const current = control(stage);
    setHeld(stage);
    startPointer = TIME_STAGES.has(stage) ? event.clientX : event.clientY;
    startValue = current.value;
    emitter.begin(startValue);
    event.preventDefault();
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", endDrag);
    window.addEventListener("pointercancel", endDrag);
  };

  const onKeyDown = (stage: StageName, event: KeyboardEvent): void => {
    const current = control(stage);
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
    <div style={{ width: "100%", margin: "0 auto", "user-select": "none" }}>
      <svg
        viewBox={`0 0 ${VIEW_WIDTH} ${VIEW_HEIGHT}`}
        width="100%"
        style={{ display: "block", "touch-action": "none" }}
      >
        <title>{`${props.label} envelope`}</title>
        <path
          d={gatePath(geometry())}
          fill="none"
          stroke="var(--e7-label-secondary)"
          stroke-width="1.5"
          stroke-linejoin="round"
          opacity="0.5"
        />
        <path
          d={adsrPath(geometry())}
          fill="none"
          stroke="var(--e7-silkscreen)"
          stroke-width="3"
          stroke-linecap="round"
          stroke-linejoin="round"
        />
        <For each={STAGE_ORDER}>
          {(stage) => {
            const point = (): Point => geometry()[stage];
            const current = (): ControlValue => control(stage);
            return (
              <g
                role="slider"
                tabindex="0"
                aria-label={`${props.label} ${current().label}`}
                aria-orientation={TIME_STAGES.has(stage) ? "horizontal" : "vertical"}
                aria-valuemin={lowerBound(current())}
                aria-valuemax={upperBound(current())}
                aria-valuenow={current().value}
                aria-valuetext={readout(current())}
                onPointerDown={(event) => beginDrag(stage, event)}
                onKeyDown={(event) => onKeyDown(stage, event)}
                onFocus={() => setFocused(stage)}
                onBlur={() => setFocused(undefined)}
                style={{ cursor: TIME_STAGES.has(stage) ? "ew-resize" : "ns-resize" }}
              >
                <circle
                  cx={point().x}
                  cy={point().y}
                  r={HANDLE_HIT_RADIUS}
                  fill="none"
                  pointer-events="all"
                />
                <circle
                  cx={point().x}
                  cy={point().y}
                  r={active() === stage ? ACTIVE_HANDLE_RADIUS : HANDLE_RADIUS}
                  fill="var(--e7-cap-top)"
                  stroke="var(--e7-silkscreen)"
                  stroke-width="1.8"
                />
                <Show when={active() === stage}>
                  <text
                    x={point().x}
                    y={point().y - READOUT_OFFSET}
                    text-anchor="middle"
                    font-size="10"
                    fill="var(--e7-label-secondary)"
                  >
                    {readout(current())}
                  </text>
                </Show>
              </g>
            );
          }}
        </For>
      </svg>
    </div>
  );
}
