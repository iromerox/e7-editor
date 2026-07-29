// MIDI CC number constants and a shared zoned CC decode helper.
import { ReservedValue } from "./errors";

export interface Zone<Variant> {
  readonly max: number;
  readonly variant: Variant;
}

export function decodeZoned<Variant>(value: number, zones: readonly Zone<Variant>[]): Variant {
  let lastMax = -1;
  for (const zone of zones) {
    if (value <= zone.max) {
      return zone.variant;
    }
    lastMax = zone.max;
  }
  throw new ReservedValue(value, lastMax);
}

export function encodeZoned<Variant>(variant: Variant, zones: readonly Zone<Variant>[]): number {
  let min = 0;
  for (const zone of zones) {
    if (zone.variant === variant) {
      return min;
    }
    min = zone.max + 1;
  }
  throw new Error(`variant not present in zones: ${String(variant)}`);
}

export const MOD_WHEEL = 1;
export const PORTAMENTO_TIME = 5;
export const VOLUME = 7;
export const EXPRESSION = 11;
export const HOLD = 64;
export const PORTAMENTO_SWITCH = 65;
export const PITCH_BEND_RANGE = 50;

export const LFO1_SHAPE = 53;
export const LFO1_RATE = 76;
export const LFO1_MODE = 60;

export const LFO2_SHAPE = 61;
export const LFO2_RATE = 62;
export const LFO2_MODE = 70;
export const LFO2_EG1_MOD = 67;

export const LFO3_SHAPE = 72;
export const LFO3_RATE = 73;
export const LFO3_MOD_WHEEL = 79;
export const LFO3_AFTERTOUCH = 78;

export const OSC1_TRANSPOSE = 3;
export const OSC1_TUNE = 9;
export const OSC1_SHAPE = 14;
export const OSC1_PULSE_WIDTH = 15;
export const OSC1_LFO1_MOD = 22;
export const OSC1_LFO2_MOD = 23;
export const OSC1_LFO3_MOD = 24;
export const OSC1_EG1_MOD = 25;
export const OSC1_LFO1_PWM = 26;
export const OSC1_LFO2_PWM = 27;
export const OSC1_LFO3_PWM = 28;
export const OSC1_EG1_PWM = 29;

export const OSC2_TRANSPOSE = 30;
export const OSC2_TUNE = 31;
export const OSC2_SHAPE = 34;
export const OSC2_PULSE_WIDTH = 35;
export const OSC2_LFO1_MOD = 39;
export const OSC2_LFO2_MOD = 40;
export const OSC2_LFO3_MOD = 41;
export const OSC2_EG1_MOD = 42;
export const OSC2_LFO1_PWM = 43;
export const OSC2_LFO2_PWM = 44;
export const OSC2_LFO3_PWM = 45;
export const OSC2_EG1_PWM = 46;
export const OSC2_SYNC = 51;

export const MIXER_OSC1_LEVEL = 20;
export const MIXER_OSC2_LEVEL = 36;
export const MIXER_SUB1_LEVEL = 21;
export const MIXER_SUB2_LEVEL = 37;
export const MIXER_NOISE_EXT_LEVEL = 52;

export const FILTER_CUTOFF = 74;
export const FILTER_RESONANCE = 71;
export const FILTER_EG1_MOD = 89;
export const FILTER_VELOCITY_EG1_MOD = 86;
export const FILTER_LFO1_MOD = 90;
export const FILTER_LFO2_MOD = 91;
export const FILTER_LFO3_MOD = 92;
export const FILTER_KEYBOARD_TRACKING = 85;
export const FILTER_MOD_WHEEL = 88;
export const FILTER_AFTERTOUCH = 87;

export const AMPLIFIER_LEVEL = 11;
export const AMPLIFIER_LFO1_MOD = 103;
export const AMPLIFIER_LFO2_MOD = 104;
export const AMPLIFIER_LFO3_MOD = 105;
export const AMPLIFIER_KEYBOARD_TRACKING = 93;
export const AMPLIFIER_VELOCITY_EG2_MOD = 94;
export const AMPLIFIER_STEREO_SPREAD = 10;
export const AMPLIFIER_STEREO_MOTION = 119;

export const EG1_ATTACK = 16;
export const EG1_DECAY = 17;
export const EG1_SUSTAIN = 18;
export const EG1_RELEASE = 19;
export const EG1_ATTACK_VELOCITY_MOD = 106;
export const EG1_RELEASE_VELOCITY_MOD = 107;
export const EG1_KEYBOARD_TRACKING = 117;

export const EG2_ATTACK = 80;
export const EG2_DECAY = 81;
export const EG2_SUSTAIN = 82;
export const EG2_RELEASE = 83;
export const EG2_ATTACK_VELOCITY_MOD = 108;
export const EG2_RELEASE_VELOCITY_MOD = 109;
export const EG2_KEYBOARD_TRACKING = 118;

export const CHORUS_TYPE = 113;
export const CHORUS_RATE = 114;
export const CHORUS_DEPTH = 115;
export const CHORUS_MIX = 13;

export const DELAY_TYPE = 110;
export const DELAY_TIME = 111;
export const DELAY_FEEDBACK = 112;
export const DELAY_MIX = 12;

export const OTHER_MODE = 116;
export const OTHER_VOICES = 97;

export type CcDirection = "bidirectional" | "inbound-only";

// docs/protocol-quirks.md #13: unverified pending HW-03.
const INBOUND_ONLY_CCS: ReadonlySet<number> = new Set([FILTER_RESONANCE]);

export function ccDirection(cc: number): CcDirection {
  return INBOUND_ONLY_CCS.has(cc) ? "inbound-only" : "bidirectional";
}
