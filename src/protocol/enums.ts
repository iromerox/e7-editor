// Regular-zone CC enums documented directly in the spec's zone tables (pp. 4-10).
import type { Zone } from "./cc";
import { decodeZoned, encodeZoned } from "./cc";

export type OscShape =
  | "triangle"
  | "saw-tri"
  | "sawtooth"
  | "off"
  | "triangle+pulse"
  | "saw-tri+pulse"
  | "sawtooth+pulse"
  | "pulse";

const OSC_SHAPE_ZONES: readonly Zone<OscShape>[] = [
  { max: 15, variant: "triangle" },
  { max: 31, variant: "saw-tri" },
  { max: 47, variant: "sawtooth" },
  { max: 63, variant: "off" },
  { max: 79, variant: "triangle+pulse" },
  { max: 95, variant: "saw-tri+pulse" },
  { max: 111, variant: "sawtooth+pulse" },
  { max: 127, variant: "pulse" },
];

export function oscShapeFromCc(value: number): OscShape {
  return decodeZoned(value, OSC_SHAPE_ZONES);
}

export function oscShapeToCc(shape: OscShape): number {
  return encodeZoned(shape, OSC_SHAPE_ZONES);
}

export type OscSync = "off" | "on";

const OSC_SYNC_ZONES: readonly Zone<OscSync>[] = [
  { max: 63, variant: "off" },
  { max: 127, variant: "on" },
];

export function oscSyncFromCc(value: number): OscSync {
  return decodeZoned(value, OSC_SYNC_ZONES);
}

export function oscSyncToCc(sync: OscSync): number {
  return encodeZoned(sync, OSC_SYNC_ZONES);
}

export type LfoShape =
  | "triangle"
  | "ramp-up"
  | "ramp-down"
  | "square"
  | "noise-sample-hold"
  | "noise-sample-hold-led-off";

const LFO_SHAPE_ZONES: readonly Zone<LfoShape>[] = [
  { max: 15, variant: "triangle" },
  { max: 31, variant: "ramp-up" },
  { max: 47, variant: "ramp-down" },
  { max: 63, variant: "square" },
  { max: 79, variant: "noise-sample-hold" },
  { max: 127, variant: "noise-sample-hold-led-off" },
];

export function lfoShapeFromCc(value: number): LfoShape {
  return decodeZoned(value, LFO_SHAPE_ZONES);
}

export function lfoShapeToCc(shape: LfoShape): number {
  return encodeZoned(shape, LFO_SHAPE_ZONES);
}

export type Lfo3Shape = "triangle" | "ramp-up" | "ramp-down" | "square";

const LFO3_SHAPE_ZONES: readonly Zone<Lfo3Shape>[] = [
  { max: 31, variant: "triangle" },
  { max: 63, variant: "ramp-up" },
  { max: 95, variant: "ramp-down" },
  { max: 127, variant: "square" },
];

export function lfo3ShapeFromCc(value: number): Lfo3Shape {
  return decodeZoned(value, LFO3_SHAPE_ZONES);
}

export function lfo3ShapeToCc(shape: Lfo3Shape): number {
  return encodeZoned(shape, LFO3_SHAPE_ZONES);
}

export type LfoMode =
  | "monophonic"
  | "polyphonic"
  | "keyboard-tracking"
  | "keyboard-sync"
  | "clock-sync"
  | "keyboard-clock-sync";

const LFO_MODE_ZONES: readonly Zone<LfoMode>[] = [
  { max: 15, variant: "monophonic" },
  { max: 31, variant: "polyphonic" },
  { max: 47, variant: "keyboard-tracking" },
  { max: 63, variant: "keyboard-sync" },
  { max: 79, variant: "clock-sync" },
  { max: 127, variant: "keyboard-clock-sync" },
];

export function lfoModeFromCc(value: number): LfoMode {
  return decodeZoned(value, LFO_MODE_ZONES);
}

export function lfoModeToCc(mode: LfoMode): number {
  return encodeZoned(mode, LFO_MODE_ZONES);
}

export type DelayType = "stereo" | "ping-pong" | "stereo-sync" | "ping-pong-sync";

const DELAY_TYPE_ZONES: readonly Zone<DelayType>[] = [
  { max: 31, variant: "stereo" },
  { max: 63, variant: "ping-pong" },
  { max: 95, variant: "stereo-sync" },
  { max: 127, variant: "ping-pong-sync" },
];

export function delayTypeFromCc(value: number): DelayType {
  return decodeZoned(value, DELAY_TYPE_ZONES);
}

export function delayTypeToCc(type: DelayType): number {
  return encodeZoned(type, DELAY_TYPE_ZONES);
}

export type ChorusType = "basic" | "ensemble";

const CHORUS_TYPE_ZONES: readonly Zone<ChorusType>[] = [
  { max: 63, variant: "basic" },
  { max: 127, variant: "ensemble" },
];

export function chorusTypeFromCc(value: number): ChorusType {
  return decodeZoned(value, CHORUS_TYPE_ZONES);
}

export function chorusTypeToCc(type: ChorusType): number {
  return encodeZoned(type, CHORUS_TYPE_ZONES);
}

export type OtherMode =
  | "polyphonic"
  | "monophonic-single-trigger"
  | "monophonic-multi-trigger"
  | "unison-single-trigger"
  | "unison-multi-trigger";

const OTHER_MODE_ZONES: readonly Zone<OtherMode>[] = [
  { max: 15, variant: "polyphonic" },
  { max: 31, variant: "monophonic-single-trigger" },
  { max: 47, variant: "monophonic-multi-trigger" },
  { max: 63, variant: "unison-single-trigger" },
  { max: 79, variant: "unison-multi-trigger" },
];

export function otherModeFromCc(value: number): OtherMode {
  return decodeZoned(value, OTHER_MODE_ZONES);
}

export function otherModeToCc(mode: OtherMode): number {
  return encodeZoned(mode, OTHER_MODE_ZONES);
}
