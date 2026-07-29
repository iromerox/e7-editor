// Byte layout of the 128-byte single preset and the 512-byte multitimbral preset.
export const SINGLE_PRESET_BYTES = 128;
export const MULTI_PRESET_PARTS = 4;
export const MULTI_PRESET_BYTES = SINGLE_PRESET_BYTES * MULTI_PRESET_PARTS;

export const NAME_OFFSET = 0;
export const NAME_BYTES = 20;
export const LOCK_BYTE_INDEX = 127;

export const RESERVED_BYTE_INDICES: readonly number[] = [
  56, 57, 61, 62, 63, 69, 100, 101, 102, 103, 104, 125, 126,
];

export class PresetLengthError extends Error {
  constructor(
    readonly field: string,
    readonly expected: number,
    readonly actual: number,
  ) {
    super(`${field} must be ${expected} bytes, got ${actual}`);
    this.name = "PresetLengthError";
  }
}

export class PresetByteRangeError extends Error {
  constructor(
    readonly field: string,
    readonly value: number | undefined,
  ) {
    super(`${field} must be an integer between 0 and 255, got ${value}`);
    this.name = "PresetByteRangeError";
  }
}

export interface Oscillator {
  readonly transpose: number;
  readonly tune: number;
  readonly shape: number;
  readonly pulseWidth: number;
  readonly lfo1Mod: number;
  readonly lfo2Mod: number;
  readonly lfo3Mod: number;
  readonly eg1Mod: number;
  readonly lfo1Pwm: number;
  readonly lfo2Pwm: number;
  readonly lfo3Pwm: number;
  readonly eg1Pwm: number;
}

export interface Mixer {
  readonly osc1Level: number;
  readonly sub1Level: number;
  readonly osc2Level: number;
  readonly sub2Level: number;
  readonly noiseLevel: number;
}

export interface Portamento {
  readonly on: number;
  readonly time: number;
}

export interface Lfo1 {
  readonly shape: number;
  readonly rate: number;
  readonly eg1Mod: number;
  readonly mode: number;
}

export interface Lfo2 {
  readonly shape: number;
  readonly rate: number;
  readonly mode: number;
}

export interface Lfo3 {
  readonly shape: number;
  readonly rate: number;
  readonly aftertouchMod: number;
  readonly modWheelMod: number;
}

export interface Filter {
  readonly cutoff: number;
  readonly resonance: number;
  readonly keyboardTracking: number;
  readonly velocityEg1Mod: number;
  readonly aftertouchMod: number;
  readonly modWheelMod: number;
  readonly eg1Mod: number;
  readonly lfo1Mod: number;
  readonly lfo2Mod: number;
  readonly lfo3Mod: number;
}

export interface Amplifier {
  readonly keyboardTracking: number;
  readonly velocityMod: number;
  readonly lfo1Mod: number;
  readonly lfo2Mod: number;
  readonly lfo3Mod: number;
  readonly level: number;
}

export interface Envelope {
  readonly attack: number;
  readonly decay: number;
  readonly sustain: number;
  readonly release: number;
  readonly attackVelocityMod: number;
  readonly releaseVelocityMod: number;
  readonly keyboardTracking: number;
}

export interface PartSettings {
  readonly keyboardZoneLower: number;
  readonly keyboardZoneUpper: number;
  readonly velocityZoneLower: number;
  readonly velocityZoneUpper: number;
  readonly midiChannel: number;
  readonly midiFilter: number;
}

export interface Delay {
  readonly type: number;
  readonly time: number;
  readonly feedback: number;
  readonly mix: number;
}

export interface Chorus {
  readonly type: number;
  readonly rate: number;
  readonly depth: number;
  readonly mix: number;
}

export interface Stereo {
  readonly spread: number;
  readonly motion: number;
}

export interface Part1Only {
  readonly name: Uint8Array;
  readonly delay: Delay;
  readonly chorus: Chorus;
  readonly stereo: Stereo;
  readonly lock: number;
}

export interface SinglePreset {
  readonly osc1: Oscillator;
  readonly osc2: Oscillator;
  readonly osc2Sync: number;
  readonly mixer: Mixer;
  readonly portamento: Portamento;
  readonly pitchBendRange: number;
  readonly lfo1: Lfo1;
  readonly lfo2: Lfo2;
  readonly lfo3: Lfo3;
  readonly filter: Filter;
  readonly amp: Amplifier;
  readonly eg1: Envelope;
  readonly eg2: Envelope;
  readonly mode: number;
  readonly transpose: number;
  readonly monoVoice: number;
  readonly polyVoice: number;
  readonly partSettings: PartSettings;
  readonly part1Only: Part1Only;
  readonly reserved: Uint8Array;
}

export interface MultiPreset {
  readonly parts: readonly [SinglePreset, SinglePreset, SinglePreset, SinglePreset];
}

type ByteOffsets = Readonly<Record<string, number>>;
type ByteFields<Offsets extends ByteOffsets> = { readonly [Field in keyof Offsets]: number };
type OffsetsFor<Fields> = Readonly<Record<keyof Fields, number>>;

type PresetScalar =
  | "pitchBendRange"
  | "osc2Sync"
  | "mode"
  | "transpose"
  | "monoVoice"
  | "polyVoice";

const SCALAR_OFFSETS: Readonly<Record<PresetScalar, number>> = {
  pitchBendRange: 50,
  osc2Sync: 51,
  mode: 99,
  transpose: 105,
  monoVoice: 106,
  polyVoice: 107,
};

const OSC1_OFFSETS: OffsetsFor<Oscillator> = {
  transpose: 20,
  tune: 21,
  shape: 22,
  pulseWidth: 23,
  lfo1Mod: 26,
  lfo2Mod: 27,
  lfo3Mod: 28,
  eg1Mod: 29,
  lfo1Pwm: 30,
  lfo2Pwm: 31,
  lfo3Pwm: 32,
  eg1Pwm: 33,
};

const OSC2_OFFSETS: OffsetsFor<Oscillator> = {
  transpose: 34,
  tune: 35,
  shape: 36,
  pulseWidth: 37,
  lfo1Mod: 40,
  lfo2Mod: 41,
  lfo3Mod: 42,
  eg1Mod: 43,
  lfo1Pwm: 44,
  lfo2Pwm: 45,
  lfo3Pwm: 46,
  eg1Pwm: 47,
};

const MIXER_OFFSETS: OffsetsFor<Mixer> = {
  osc1Level: 24,
  sub1Level: 25,
  osc2Level: 38,
  sub2Level: 39,
  noiseLevel: 52,
};

const PORTAMENTO_OFFSETS: OffsetsFor<Portamento> = {
  on: 48,
  time: 49,
};

const LFO1_OFFSETS: OffsetsFor<Lfo1> = {
  shape: 53,
  rate: 54,
  eg1Mod: 55,
  mode: 58,
};

const LFO2_OFFSETS: OffsetsFor<Lfo2> = {
  shape: 59,
  rate: 60,
  mode: 64,
};

const LFO3_OFFSETS: OffsetsFor<Lfo3> = {
  shape: 65,
  rate: 66,
  aftertouchMod: 67,
  modWheelMod: 68,
};

const FILTER_OFFSETS: OffsetsFor<Filter> = {
  cutoff: 70,
  resonance: 71,
  keyboardTracking: 72,
  velocityEg1Mod: 73,
  aftertouchMod: 74,
  modWheelMod: 75,
  eg1Mod: 76,
  lfo1Mod: 77,
  lfo2Mod: 78,
  lfo3Mod: 79,
};

const AMPLIFIER_OFFSETS: OffsetsFor<Amplifier> = {
  keyboardTracking: 80,
  velocityMod: 81,
  lfo1Mod: 82,
  lfo2Mod: 83,
  lfo3Mod: 84,
  level: 108,
};

const EG1_OFFSETS: OffsetsFor<Envelope> = {
  attack: 85,
  decay: 86,
  sustain: 87,
  release: 88,
  attackVelocityMod: 89,
  releaseVelocityMod: 90,
  keyboardTracking: 91,
};

const EG2_OFFSETS: OffsetsFor<Envelope> = {
  attack: 92,
  decay: 93,
  sustain: 94,
  release: 95,
  attackVelocityMod: 96,
  releaseVelocityMod: 97,
  keyboardTracking: 98,
};

const PART_SETTINGS_OFFSETS: OffsetsFor<PartSettings> = {
  keyboardZoneLower: 109,
  keyboardZoneUpper: 110,
  velocityZoneLower: 111,
  velocityZoneUpper: 112,
  midiChannel: 113,
  midiFilter: 114,
};

const DELAY_OFFSETS: OffsetsFor<Delay> = {
  type: 115,
  time: 116,
  feedback: 117,
  mix: 118,
};

const CHORUS_OFFSETS: OffsetsFor<Chorus> = {
  type: 119,
  rate: 120,
  depth: 121,
  mix: 122,
};

const STEREO_OFFSETS: OffsetsFor<Stereo> = {
  spread: 123,
  motion: 124,
};

const LOCK_OFFSETS: Readonly<Record<"lock", number>> = {
  lock: LOCK_BYTE_INDEX,
};

const NAME_BYTE_INDICES: readonly number[] = Array.from(
  { length: NAME_BYTES },
  (_, index) => NAME_OFFSET + index,
);

function ascending(a: number, b: number): number {
  return a - b;
}

export const MULTI_ONLY_BYTES: readonly number[] =
  Object.values(PART_SETTINGS_OFFSETS).sort(ascending);

export const PART1_ONLY_BYTES: readonly number[] = [
  ...NAME_BYTE_INDICES,
  ...Object.values(DELAY_OFFSETS),
  ...Object.values(CHORUS_OFFSETS),
  ...Object.values(STEREO_OFFSETS),
  ...Object.values(LOCK_OFFSETS),
].sort(ascending);

function byteAt(bytes: Uint8Array, offset: number): number {
  const value = bytes[offset];
  if (value === undefined) {
    throw new RangeError(`offset ${offset} is outside a ${bytes.length}-byte block`);
  }
  return value;
}

function assertByte(field: string, value: number | undefined): number {
  if (value === undefined || !Number.isInteger(value) || value < 0 || value > 255) {
    throw new PresetByteRangeError(field, value);
  }
  return value;
}

function decodeGroup<Offsets extends ByteOffsets>(
  bytes: Uint8Array,
  offsets: Offsets,
): ByteFields<Offsets> {
  const fields: Record<string, number> = {};
  for (const [field, offset] of Object.entries(offsets)) {
    fields[field] = byteAt(bytes, offset);
  }
  return fields as ByteFields<Offsets>;
}

function encodeGroup<Offsets extends ByteOffsets>(
  bytes: Uint8Array,
  offsets: Offsets,
  fields: ByteFields<Offsets>,
): void {
  for (const [field, offset] of Object.entries(offsets)) {
    bytes[offset] = assertByte(field, fields[field]);
  }
}

export function decodeSinglePreset(bytes: Uint8Array): SinglePreset {
  if (bytes.length !== SINGLE_PRESET_BYTES) {
    throw new PresetLengthError("single preset", SINGLE_PRESET_BYTES, bytes.length);
  }
  return {
    ...decodeGroup(bytes, SCALAR_OFFSETS),
    osc1: decodeGroup(bytes, OSC1_OFFSETS),
    osc2: decodeGroup(bytes, OSC2_OFFSETS),
    mixer: decodeGroup(bytes, MIXER_OFFSETS),
    portamento: decodeGroup(bytes, PORTAMENTO_OFFSETS),
    lfo1: decodeGroup(bytes, LFO1_OFFSETS),
    lfo2: decodeGroup(bytes, LFO2_OFFSETS),
    lfo3: decodeGroup(bytes, LFO3_OFFSETS),
    filter: decodeGroup(bytes, FILTER_OFFSETS),
    amp: decodeGroup(bytes, AMPLIFIER_OFFSETS),
    eg1: decodeGroup(bytes, EG1_OFFSETS),
    eg2: decodeGroup(bytes, EG2_OFFSETS),
    partSettings: decodeGroup(bytes, PART_SETTINGS_OFFSETS),
    part1Only: {
      name: bytes.slice(NAME_OFFSET, NAME_OFFSET + NAME_BYTES),
      delay: decodeGroup(bytes, DELAY_OFFSETS),
      chorus: decodeGroup(bytes, CHORUS_OFFSETS),
      stereo: decodeGroup(bytes, STEREO_OFFSETS),
      ...decodeGroup(bytes, LOCK_OFFSETS),
    },
    reserved: Uint8Array.from(RESERVED_BYTE_INDICES, (offset) => byteAt(bytes, offset)),
  };
}

export function encodeSinglePreset(preset: SinglePreset): Uint8Array {
  const { name } = preset.part1Only;
  if (name.length !== NAME_BYTES) {
    throw new PresetLengthError("preset name", NAME_BYTES, name.length);
  }
  if (preset.reserved.length !== RESERVED_BYTE_INDICES.length) {
    throw new PresetLengthError(
      "reserved bytes",
      RESERVED_BYTE_INDICES.length,
      preset.reserved.length,
    );
  }
  const bytes = new Uint8Array(SINGLE_PRESET_BYTES);
  bytes.set(name, NAME_OFFSET);
  encodeGroup(bytes, SCALAR_OFFSETS, preset);
  encodeGroup(bytes, OSC1_OFFSETS, preset.osc1);
  encodeGroup(bytes, OSC2_OFFSETS, preset.osc2);
  encodeGroup(bytes, MIXER_OFFSETS, preset.mixer);
  encodeGroup(bytes, PORTAMENTO_OFFSETS, preset.portamento);
  encodeGroup(bytes, LFO1_OFFSETS, preset.lfo1);
  encodeGroup(bytes, LFO2_OFFSETS, preset.lfo2);
  encodeGroup(bytes, LFO3_OFFSETS, preset.lfo3);
  encodeGroup(bytes, FILTER_OFFSETS, preset.filter);
  encodeGroup(bytes, AMPLIFIER_OFFSETS, preset.amp);
  encodeGroup(bytes, EG1_OFFSETS, preset.eg1);
  encodeGroup(bytes, EG2_OFFSETS, preset.eg2);
  encodeGroup(bytes, PART_SETTINGS_OFFSETS, preset.partSettings);
  encodeGroup(bytes, DELAY_OFFSETS, preset.part1Only.delay);
  encodeGroup(bytes, CHORUS_OFFSETS, preset.part1Only.chorus);
  encodeGroup(bytes, STEREO_OFFSETS, preset.part1Only.stereo);
  encodeGroup(bytes, LOCK_OFFSETS, preset.part1Only);
  RESERVED_BYTE_INDICES.forEach((offset, index) => {
    bytes[offset] = byteAt(preset.reserved, index);
  });
  return bytes;
}

export function decodeMultiPreset(bytes: Uint8Array): MultiPreset {
  if (bytes.length !== MULTI_PRESET_BYTES) {
    throw new PresetLengthError("multi preset", MULTI_PRESET_BYTES, bytes.length);
  }
  const part = (index: number): SinglePreset =>
    decodeSinglePreset(
      bytes.subarray(index * SINGLE_PRESET_BYTES, (index + 1) * SINGLE_PRESET_BYTES),
    );
  return { parts: [part(0), part(1), part(2), part(3)] };
}

export function encodeMultiPreset(multi: MultiPreset): Uint8Array {
  const bytes = new Uint8Array(MULTI_PRESET_BYTES);
  multi.parts.forEach((part, index) => {
    bytes.set(encodeSinglePreset(part), index * SINGLE_PRESET_BYTES);
  });
  return bytes;
}
