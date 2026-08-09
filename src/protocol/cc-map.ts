// Bidirectional map between MIDI CC numbers and the SinglePreset fields they drive.
import type {
  Amplifier,
  Chorus,
  Delay,
  Envelope,
  Filter,
  Lfo1,
  Lfo2,
  Lfo3,
  Mixer,
  Oscillator,
  Portamento,
  SinglePreset,
  Stereo,
} from "./preset";
import {
  AMPLIFIER_KEYBOARD_TRACKING,
  AMPLIFIER_LEVEL,
  AMPLIFIER_LFO1_MOD,
  AMPLIFIER_LFO2_MOD,
  AMPLIFIER_LFO3_MOD,
  AMPLIFIER_STEREO_MOTION,
  AMPLIFIER_STEREO_SPREAD,
  AMPLIFIER_VELOCITY_EG2_MOD,
  CHORUS_DEPTH,
  CHORUS_MIX,
  CHORUS_RATE,
  CHORUS_TYPE,
  DELAY_FEEDBACK,
  DELAY_MIX,
  DELAY_TIME,
  DELAY_TYPE,
  EG1_ATTACK,
  EG1_ATTACK_VELOCITY_MOD,
  EG1_DECAY,
  EG1_KEYBOARD_TRACKING,
  EG1_RELEASE,
  EG1_RELEASE_VELOCITY_MOD,
  EG1_SUSTAIN,
  EG2_ATTACK,
  EG2_ATTACK_VELOCITY_MOD,
  EG2_DECAY,
  EG2_KEYBOARD_TRACKING,
  EG2_RELEASE,
  EG2_RELEASE_VELOCITY_MOD,
  EG2_SUSTAIN,
  FILTER_AFTERTOUCH,
  FILTER_CUTOFF,
  FILTER_EG1_MOD,
  FILTER_KEYBOARD_TRACKING,
  FILTER_LFO1_MOD,
  FILTER_LFO2_MOD,
  FILTER_LFO3_MOD,
  FILTER_MOD_WHEEL,
  FILTER_RESONANCE,
  FILTER_VELOCITY_EG1_MOD,
  LFO1_MODE,
  LFO1_RATE,
  LFO1_SHAPE,
  LFO2_MODE,
  LFO2_RATE,
  LFO2_SHAPE,
  LFO3_AFTERTOUCH,
  LFO3_MOD_WHEEL,
  LFO3_RATE,
  LFO3_SHAPE,
  MIXER_NOISE_EXT_LEVEL,
  MIXER_OSC1_LEVEL,
  MIXER_OSC2_LEVEL,
  MIXER_SUB1_LEVEL,
  MIXER_SUB2_LEVEL,
  OSC1_EG1_MOD,
  OSC1_EG1_PWM,
  OSC1_LFO1_MOD,
  OSC1_LFO1_PWM,
  OSC1_LFO2_MOD,
  OSC1_LFO2_PWM,
  OSC1_LFO3_MOD,
  OSC1_LFO3_PWM,
  OSC1_PULSE_WIDTH,
  OSC1_SHAPE,
  OSC1_TRANSPOSE,
  OSC1_TUNE,
  OSC2_EG1_MOD,
  OSC2_EG1_PWM,
  OSC2_LFO1_MOD,
  OSC2_LFO1_PWM,
  OSC2_LFO2_MOD,
  OSC2_LFO2_PWM,
  OSC2_LFO3_MOD,
  OSC2_LFO3_PWM,
  OSC2_PULSE_WIDTH,
  OSC2_SHAPE,
  OSC2_SYNC,
  OSC2_TRANSPOSE,
  OSC2_TUNE,
  OTHER_MODE,
  OTHER_VOICES,
  PITCH_BEND_RANGE,
  PORTAMENTO_SWITCH,
  PORTAMENTO_TIME,
} from "./cc";
import { Voices } from "./voices";

type NumericKey<Group> = {
  [Key in keyof Group]-?: Group[Key] extends number ? Key : never;
}[keyof Group];

export interface CcAccessor {
  readonly read: (preset: SinglePreset) => number;
  readonly write: (preset: SinglePreset, value: number) => SinglePreset;
  readonly part1Only?: boolean;
}

interface CcFieldEntry extends CcAccessor {
  readonly cc: number;
}

function scalar(key: NumericKey<SinglePreset>): CcAccessor {
  return {
    read: (preset) => preset[key],
    write: (preset, value) => ({ ...preset, [key]: value }),
  };
}

function osc(which: "osc1" | "osc2", key: keyof Oscillator): CcAccessor {
  return {
    read: (preset) => preset[which][key],
    write: (preset, value) => ({ ...preset, [which]: { ...preset[which], [key]: value } }),
  };
}

function envelope(which: "eg1" | "eg2", key: keyof Envelope): CcAccessor {
  return {
    read: (preset) => preset[which][key],
    write: (preset, value) => ({ ...preset, [which]: { ...preset[which], [key]: value } }),
  };
}

function mixer(key: keyof Mixer): CcAccessor {
  return {
    read: (preset) => preset.mixer[key],
    write: (preset, value) => ({ ...preset, mixer: { ...preset.mixer, [key]: value } }),
  };
}

function portamento(key: keyof Portamento): CcAccessor {
  return {
    read: (preset) => preset.portamento[key],
    write: (preset, value) => ({
      ...preset,
      portamento: { ...preset.portamento, [key]: value },
    }),
  };
}

function lfo1(key: keyof Lfo1): CcAccessor {
  return {
    read: (preset) => preset.lfo1[key],
    write: (preset, value) => ({ ...preset, lfo1: { ...preset.lfo1, [key]: value } }),
  };
}

function lfo2(key: keyof Lfo2): CcAccessor {
  return {
    read: (preset) => preset.lfo2[key],
    write: (preset, value) => ({ ...preset, lfo2: { ...preset.lfo2, [key]: value } }),
  };
}

function lfo3(key: keyof Lfo3): CcAccessor {
  return {
    read: (preset) => preset.lfo3[key],
    write: (preset, value) => ({ ...preset, lfo3: { ...preset.lfo3, [key]: value } }),
  };
}

function filter(key: keyof Filter): CcAccessor {
  return {
    read: (preset) => preset.filter[key],
    write: (preset, value) => ({ ...preset, filter: { ...preset.filter, [key]: value } }),
  };
}

function amplifier(key: keyof Amplifier): CcAccessor {
  return {
    read: (preset) => preset.amp[key],
    write: (preset, value) => ({ ...preset, amp: { ...preset.amp, [key]: value } }),
  };
}

function delay(key: keyof Delay): CcAccessor {
  return {
    part1Only: true,
    read: (preset) => preset.part1Only.delay[key],
    write: (preset, value) => ({
      ...preset,
      part1Only: {
        ...preset.part1Only,
        delay: { ...preset.part1Only.delay, [key]: value },
      },
    }),
  };
}

function chorus(key: keyof Chorus): CcAccessor {
  return {
    part1Only: true,
    read: (preset) => preset.part1Only.chorus[key],
    write: (preset, value) => ({
      ...preset,
      part1Only: {
        ...preset.part1Only,
        chorus: { ...preset.part1Only.chorus, [key]: value },
      },
    }),
  };
}

function stereo(key: keyof Stereo): CcAccessor {
  return {
    part1Only: true,
    read: (preset) => preset.part1Only.stereo[key],
    write: (preset, value) => ({
      ...preset,
      part1Only: {
        ...preset.part1Only,
        stereo: { ...preset.part1Only.stereo, [key]: value },
      },
    }),
  };
}

const voices: CcAccessor = {
  read: (preset) => new Voices(preset.polyVoice, preset.monoVoice).toCc(),
  write: (preset, value) => {
    const unpacked = Voices.fromCc(value);
    return { ...preset, polyVoice: unpacked.v1, monoVoice: unpacked.v2 };
  },
};

export type CcField =
  | "portamentoTime"
  | "portamentoSwitch"
  | "pitchBendRange"
  | "osc1Transpose"
  | "osc1Tune"
  | "osc1Shape"
  | "osc1PulseWidth"
  | "osc1Lfo1Mod"
  | "osc1Lfo2Mod"
  | "osc1Lfo3Mod"
  | "osc1Eg1Mod"
  | "osc1Lfo1Pwm"
  | "osc1Lfo2Pwm"
  | "osc1Lfo3Pwm"
  | "osc1Eg1Pwm"
  | "osc2Transpose"
  | "osc2Tune"
  | "osc2Shape"
  | "osc2PulseWidth"
  | "osc2Lfo1Mod"
  | "osc2Lfo2Mod"
  | "osc2Lfo3Mod"
  | "osc2Eg1Mod"
  | "osc2Lfo1Pwm"
  | "osc2Lfo2Pwm"
  | "osc2Lfo3Pwm"
  | "osc2Eg1Pwm"
  | "osc2Sync"
  | "mixerOsc1Level"
  | "mixerOsc2Level"
  | "mixerSub1Level"
  | "mixerSub2Level"
  | "mixerNoiseExtLevel"
  | "lfo1Shape"
  | "lfo1Rate"
  | "lfo1Mode"
  | "lfo2Shape"
  | "lfo2Rate"
  | "lfo2Mode"
  | "lfo3Shape"
  | "lfo3Rate"
  | "lfo3ModWheel"
  | "lfo3Aftertouch"
  | "filterCutoff"
  | "filterResonance"
  | "filterEg1Mod"
  | "filterVelocityEg1Mod"
  | "filterLfo1Mod"
  | "filterLfo2Mod"
  | "filterLfo3Mod"
  | "filterKeyboardTracking"
  | "filterModWheel"
  | "filterAftertouch"
  | "amplifierLevel"
  | "amplifierLfo1Mod"
  | "amplifierLfo2Mod"
  | "amplifierLfo3Mod"
  | "amplifierKeyboardTracking"
  | "amplifierVelocityEg2Mod"
  | "stereoSpread"
  | "stereoMotion"
  | "eg1Attack"
  | "eg1Decay"
  | "eg1Sustain"
  | "eg1Release"
  | "eg1AttackVelocityMod"
  | "eg1ReleaseVelocityMod"
  | "eg1KeyboardTracking"
  | "eg2Attack"
  | "eg2Decay"
  | "eg2Sustain"
  | "eg2Release"
  | "eg2AttackVelocityMod"
  | "eg2ReleaseVelocityMod"
  | "eg2KeyboardTracking"
  | "chorusType"
  | "chorusRate"
  | "chorusDepth"
  | "chorusMix"
  | "delayType"
  | "delayTime"
  | "delayFeedback"
  | "delayMix"
  | "mode"
  | "voices"
  | "transpose";

const ENTRIES: Readonly<Record<CcField, CcFieldEntry>> = {
  portamentoTime: { cc: PORTAMENTO_TIME, ...portamento("time") },
  portamentoSwitch: { cc: PORTAMENTO_SWITCH, ...portamento("on") },
  pitchBendRange: { cc: PITCH_BEND_RANGE, ...scalar("pitchBendRange") },

  // docs/protocol-quirks.md #14: CC 3 has two candidate fields until HW-04 settles it.
  osc1Transpose: { cc: OSC1_TRANSPOSE, ...osc("osc1", "transpose") },
  transpose: { cc: OSC1_TRANSPOSE, ...scalar("transpose") },

  osc1Tune: { cc: OSC1_TUNE, ...osc("osc1", "tune") },
  osc1Shape: { cc: OSC1_SHAPE, ...osc("osc1", "shape") },
  osc1PulseWidth: { cc: OSC1_PULSE_WIDTH, ...osc("osc1", "pulseWidth") },
  osc1Lfo1Mod: { cc: OSC1_LFO1_MOD, ...osc("osc1", "lfo1Mod") },
  osc1Lfo2Mod: { cc: OSC1_LFO2_MOD, ...osc("osc1", "lfo2Mod") },
  osc1Lfo3Mod: { cc: OSC1_LFO3_MOD, ...osc("osc1", "lfo3Mod") },
  osc1Eg1Mod: { cc: OSC1_EG1_MOD, ...osc("osc1", "eg1Mod") },
  osc1Lfo1Pwm: { cc: OSC1_LFO1_PWM, ...osc("osc1", "lfo1Pwm") },
  osc1Lfo2Pwm: { cc: OSC1_LFO2_PWM, ...osc("osc1", "lfo2Pwm") },
  osc1Lfo3Pwm: { cc: OSC1_LFO3_PWM, ...osc("osc1", "lfo3Pwm") },
  osc1Eg1Pwm: { cc: OSC1_EG1_PWM, ...osc("osc1", "eg1Pwm") },

  osc2Transpose: { cc: OSC2_TRANSPOSE, ...osc("osc2", "transpose") },
  osc2Tune: { cc: OSC2_TUNE, ...osc("osc2", "tune") },
  osc2Shape: { cc: OSC2_SHAPE, ...osc("osc2", "shape") },
  osc2PulseWidth: { cc: OSC2_PULSE_WIDTH, ...osc("osc2", "pulseWidth") },
  osc2Lfo1Mod: { cc: OSC2_LFO1_MOD, ...osc("osc2", "lfo1Mod") },
  osc2Lfo2Mod: { cc: OSC2_LFO2_MOD, ...osc("osc2", "lfo2Mod") },
  osc2Lfo3Mod: { cc: OSC2_LFO3_MOD, ...osc("osc2", "lfo3Mod") },
  osc2Eg1Mod: { cc: OSC2_EG1_MOD, ...osc("osc2", "eg1Mod") },
  osc2Lfo1Pwm: { cc: OSC2_LFO1_PWM, ...osc("osc2", "lfo1Pwm") },
  osc2Lfo2Pwm: { cc: OSC2_LFO2_PWM, ...osc("osc2", "lfo2Pwm") },
  osc2Lfo3Pwm: { cc: OSC2_LFO3_PWM, ...osc("osc2", "lfo3Pwm") },
  osc2Eg1Pwm: { cc: OSC2_EG1_PWM, ...osc("osc2", "eg1Pwm") },
  osc2Sync: { cc: OSC2_SYNC, ...scalar("osc2Sync") },

  mixerOsc1Level: { cc: MIXER_OSC1_LEVEL, ...mixer("osc1Level") },
  mixerOsc2Level: { cc: MIXER_OSC2_LEVEL, ...mixer("osc2Level") },
  mixerSub1Level: { cc: MIXER_SUB1_LEVEL, ...mixer("sub1Level") },
  mixerSub2Level: { cc: MIXER_SUB2_LEVEL, ...mixer("sub2Level") },
  mixerNoiseExtLevel: { cc: MIXER_NOISE_EXT_LEVEL, ...mixer("noiseLevel") },

  lfo1Shape: { cc: LFO1_SHAPE, ...lfo1("shape") },
  lfo1Rate: { cc: LFO1_RATE, ...lfo1("rate") },
  lfo1Mode: { cc: LFO1_MODE, ...lfo1("mode") },
  lfo2Shape: { cc: LFO2_SHAPE, ...lfo2("shape") },
  lfo2Rate: { cc: LFO2_RATE, ...lfo2("rate") },
  lfo2Mode: { cc: LFO2_MODE, ...lfo2("mode") },
  lfo3Shape: { cc: LFO3_SHAPE, ...lfo3("shape") },
  lfo3Rate: { cc: LFO3_RATE, ...lfo3("rate") },
  lfo3ModWheel: { cc: LFO3_MOD_WHEEL, ...lfo3("modWheelMod") },
  lfo3Aftertouch: { cc: LFO3_AFTERTOUCH, ...lfo3("aftertouchMod") },

  filterCutoff: { cc: FILTER_CUTOFF, ...filter("cutoff") },
  filterResonance: { cc: FILTER_RESONANCE, ...filter("resonance") },
  filterEg1Mod: { cc: FILTER_EG1_MOD, ...filter("eg1Mod") },
  filterVelocityEg1Mod: { cc: FILTER_VELOCITY_EG1_MOD, ...filter("velocityEg1Mod") },
  filterLfo1Mod: { cc: FILTER_LFO1_MOD, ...filter("lfo1Mod") },
  filterLfo2Mod: { cc: FILTER_LFO2_MOD, ...filter("lfo2Mod") },
  filterLfo3Mod: { cc: FILTER_LFO3_MOD, ...filter("lfo3Mod") },
  filterKeyboardTracking: { cc: FILTER_KEYBOARD_TRACKING, ...filter("keyboardTracking") },
  filterModWheel: { cc: FILTER_MOD_WHEEL, ...filter("modWheelMod") },
  filterAftertouch: { cc: FILTER_AFTERTOUCH, ...filter("aftertouchMod") },

  amplifierLevel: { cc: AMPLIFIER_LEVEL, ...amplifier("level") },
  amplifierLfo1Mod: { cc: AMPLIFIER_LFO1_MOD, ...amplifier("lfo1Mod") },
  amplifierLfo2Mod: { cc: AMPLIFIER_LFO2_MOD, ...amplifier("lfo2Mod") },
  amplifierLfo3Mod: { cc: AMPLIFIER_LFO3_MOD, ...amplifier("lfo3Mod") },
  amplifierKeyboardTracking: {
    cc: AMPLIFIER_KEYBOARD_TRACKING,
    ...amplifier("keyboardTracking"),
  },
  amplifierVelocityEg2Mod: { cc: AMPLIFIER_VELOCITY_EG2_MOD, ...amplifier("velocityMod") },
  stereoSpread: { cc: AMPLIFIER_STEREO_SPREAD, ...stereo("spread") },
  stereoMotion: { cc: AMPLIFIER_STEREO_MOTION, ...stereo("motion") },

  eg1Attack: { cc: EG1_ATTACK, ...envelope("eg1", "attack") },
  eg1Decay: { cc: EG1_DECAY, ...envelope("eg1", "decay") },
  eg1Sustain: { cc: EG1_SUSTAIN, ...envelope("eg1", "sustain") },
  eg1Release: { cc: EG1_RELEASE, ...envelope("eg1", "release") },
  eg1AttackVelocityMod: { cc: EG1_ATTACK_VELOCITY_MOD, ...envelope("eg1", "attackVelocityMod") },
  eg1ReleaseVelocityMod: {
    cc: EG1_RELEASE_VELOCITY_MOD,
    ...envelope("eg1", "releaseVelocityMod"),
  },
  eg1KeyboardTracking: { cc: EG1_KEYBOARD_TRACKING, ...envelope("eg1", "keyboardTracking") },

  eg2Attack: { cc: EG2_ATTACK, ...envelope("eg2", "attack") },
  eg2Decay: { cc: EG2_DECAY, ...envelope("eg2", "decay") },
  eg2Sustain: { cc: EG2_SUSTAIN, ...envelope("eg2", "sustain") },
  eg2Release: { cc: EG2_RELEASE, ...envelope("eg2", "release") },
  eg2AttackVelocityMod: { cc: EG2_ATTACK_VELOCITY_MOD, ...envelope("eg2", "attackVelocityMod") },
  eg2ReleaseVelocityMod: {
    cc: EG2_RELEASE_VELOCITY_MOD,
    ...envelope("eg2", "releaseVelocityMod"),
  },
  eg2KeyboardTracking: { cc: EG2_KEYBOARD_TRACKING, ...envelope("eg2", "keyboardTracking") },

  chorusType: { cc: CHORUS_TYPE, ...chorus("type") },
  chorusRate: { cc: CHORUS_RATE, ...chorus("rate") },
  chorusDepth: { cc: CHORUS_DEPTH, ...chorus("depth") },
  chorusMix: { cc: CHORUS_MIX, ...chorus("mix") },
  delayType: { cc: DELAY_TYPE, ...delay("type") },
  delayTime: { cc: DELAY_TIME, ...delay("time") },
  delayFeedback: { cc: DELAY_FEEDBACK, ...delay("feedback") },
  delayMix: { cc: DELAY_MIX, ...delay("mix") },

  mode: { cc: OTHER_MODE, ...scalar("mode") },
  voices: { cc: OTHER_VOICES, ...voices },
};

export const CC_FIELDS: readonly CcField[] = Object.keys(ENTRIES) as readonly CcField[];

const FIELDS_BY_CC: ReadonlyMap<number, readonly CcField[]> = CC_FIELDS.reduce((index, field) => {
  const cc = ENTRIES[field].cc;
  return index.set(cc, [...(index.get(cc) ?? []), field]);
}, new Map<number, readonly CcField[]>());

export function ccToFields(cc: number): readonly CcField[] {
  return FIELDS_BY_CC.get(cc) ?? [];
}

export function fieldToCc(field: CcField): number {
  return ENTRIES[field].cc;
}

export function isPart1OnlyField(field: CcField): boolean {
  return ENTRIES[field].part1Only === true;
}

export function readField(preset: SinglePreset, field: CcField): number {
  return ENTRIES[field].read(preset);
}

export function writeField(preset: SinglePreset, field: CcField, value: number): SinglePreset {
  return ENTRIES[field].write(preset, value);
}

export type CcApplication =
  | { readonly kind: "applied"; readonly field: CcField; readonly preset: SinglePreset }
  | { readonly kind: "ambiguous"; readonly candidates: readonly CcField[] }
  | { readonly kind: "unmapped" };

export function applyCc(preset: SinglePreset, cc: number, value: number): CcApplication {
  const [field, ...rest] = ccToFields(cc);
  if (field === undefined) {
    return { kind: "unmapped" };
  }
  if (rest.length > 0) {
    return { kind: "ambiguous", candidates: ccToFields(cc) };
  }
  return { kind: "applied", field, preset: writeField(preset, field, value) };
}
