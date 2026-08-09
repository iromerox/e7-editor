// The OSCILLATORS box: OSC 1 over OSC 2, each a waveform and pulse-generator button column beside two rows of knobs.
import type { JSX } from "solid-js";
import type { CcField, OscShapeParts, OscWaveform } from "../protocol";
import type { ButtonLayer } from "./ButtonLed";
import type { LiveEdit } from "./live-edit";
import {
  Tune,
  oscShapeFromCc,
  oscShapeFromParts,
  oscShapeParts,
  oscShapeToCc,
  oscSyncFromCc,
  oscSyncToCc,
  transposeFromCc,
} from "../protocol";
import { DualButton } from "./ButtonLed";
import { ccValue } from "./control-value";
import { Knob } from "./Knob";
import { PanelSection } from "./PanelSection";
import {
  BUTTON_COLUMN,
  DIVIDER_ROW,
  KNOB_COLUMN,
  LEGEND_ROW,
  OSCILLATOR_GRID_ROWS,
} from "./panel-rows";

export interface OscillatorFields {
  readonly transpose: CcField;
  readonly tune: CcField;
  readonly shape: CcField;
  readonly pulseWidth: CcField;
  readonly lfo1Mod: CcField;
  readonly lfo2Mod: CcField;
  readonly lfo3Mod: CcField;
  readonly eg1Mod: CcField;
  readonly lfo1Pwm: CcField;
  readonly eg1Pwm: CcField;
}

export interface OscillatorsSectionProps {
  readonly live: LiveEdit;
}

interface OscillatorProps {
  readonly live: LiveEdit;
  readonly name: string;
  readonly fields: OscillatorFields;
  readonly pulseShift?: ButtonLayer | undefined;
}

export const OSC1_FIELDS: OscillatorFields = {
  transpose: "osc1Transpose",
  tune: "osc1Tune",
  shape: "osc1Shape",
  pulseWidth: "osc1PulseWidth",
  lfo1Mod: "osc1Lfo1Mod",
  lfo2Mod: "osc1Lfo2Mod",
  lfo3Mod: "osc1Lfo3Mod",
  eg1Mod: "osc1Eg1Mod",
  lfo1Pwm: "osc1Lfo1Pwm",
  eg1Pwm: "osc1Eg1Pwm",
};

export const OSC2_FIELDS: OscillatorFields = {
  transpose: "osc2Transpose",
  tune: "osc2Tune",
  shape: "osc2Shape",
  pulseWidth: "osc2PulseWidth",
  lfo1Mod: "osc2Lfo1Mod",
  lfo2Mod: "osc2Lfo2Mod",
  lfo3Mod: "osc2Lfo3Mod",
  eg1Mod: "osc2Eg1Mod",
  lfo1Pwm: "osc2Lfo1Pwm",
  eg1Pwm: "osc2Eg1Pwm",
};

export const WAVEFORM_LEDS: readonly OscWaveform[] = ["triangle", "saw-tri", "sawtooth"];

const WAVEFORM_NAMES: readonly string[] = ["Triangle", "Saw-Tri", "Sawtooth"];

const NEXT_WAVEFORM: Readonly<Record<OscWaveform, OscWaveform>> = {
  triangle: "saw-tri",
  "saw-tri": "sawtooth",
  sawtooth: "none",
  none: "triangle",
};

const TUNE_DECIMALS = 3;

const COLUMNS = `${BUTTON_COLUMN} repeat(3, ${KNOB_COLUMN})`;

export function tuneReadout(value: number): string {
  const semitones = Tune.fromCc(ccValue(value)).semitones();
  return `${semitones > 0 ? "+" : ""}${semitones.toFixed(TUNE_DECIMALS)} st`;
}

export function transposeReadout(value: number): string {
  const semitones = transposeFromCc(ccValue(value));
  return `${semitones > 0 ? "+" : ""}${semitones} st`;
}

export function nextWaveform(waveform: OscWaveform): OscWaveform {
  return NEXT_WAVEFORM[waveform];
}

function Rule(): JSX.Element {
  return (
    <div
      style={{
        "grid-column": "1 / -1",
        "align-self": "center",
        "border-top": "1px dotted var(--e7-silkscreen)",
        opacity: "0.6",
      }}
    />
  );
}

function Oscillator(props: OscillatorProps): JSX.Element {
  const parts = (): OscShapeParts =>
    oscShapeParts(oscShapeFromCc(ccValue(props.live.value(props.fields.shape))));

  const writeShape = (next: OscShapeParts): void => {
    props.live.write(props.fields.shape, oscShapeToCc(oscShapeFromParts(next)));
  };

  const waveformLayer = (): ButtonLayer => ({
    label: "Waveform selector",
    count: WAVEFORM_LEDS.length,
    active: WAVEFORM_LEDS.indexOf(parts().waveform),
    names: WAVEFORM_NAMES,
    description:
      "Selects the oscillator waveform. With no waveform selected the oscillator plays the pulse generator alone.",
    onPress: () => writeShape({ ...parts(), waveform: nextWaveform(parts().waveform) }),
  });

  const pulseLayer = (): ButtonLayer => ({
    label: "Pulse generator",
    count: 1,
    active: parts().pulse ? 0 : undefined,
    names: ["Pulse"],
    description:
      "Switches the pulse generator on. With a waveform also selected, the two are mixed at the same level.",
    onPress: () => writeShape({ ...parts(), pulse: !parts().pulse }),
  });

  return (
    <fieldset style={{ border: "none", margin: "0", padding: "0" }}>
      <legend
        style={{
          height: LEGEND_ROW,
          "line-height": LEGEND_ROW,
          padding: "0",
          "font-size": "0.75rem",
          "letter-spacing": "0.1em",
          color: "var(--e7-silkscreen)",
        }}
      >
        {props.name}
      </legend>
      <div
        style={{
          display: "grid",
          "grid-template-columns": COLUMNS,
          "grid-template-rows": OSCILLATOR_GRID_ROWS,
          "align-items": "start",
          "justify-items": "center",
          "column-gap": "0.75rem",
          "row-gap": "0",
        }}
      >
        <div style={{ "justify-self": "start" }}>
          <DualButton primary={waveformLayer()} />
        </div>
        <Knob
          primary={props.live.control(props.fields.tune, {
            label: "Tune",
            format: tuneReadout,
            description: "Adjusts the oscillator frequency within a half-semitone range.",
          })}
          shift={props.live.control(props.fields.transpose, {
            label: "Transpose",
            format: transposeReadout,
            description:
              "Transposes the oscillator up to 24 semitones either way from the note played.",
          })}
        />
        <Knob
          primary={props.live.control(props.fields.lfo1Mod, {
            label: "LFO1 Mod",
            description: "Amount of LFO 1 modulation of the oscillator pitch.",
          })}
          shift={props.live.control(props.fields.eg1Mod, {
            label: "EG1 Mod",
            description: "Amount of EG 1 modulation of the oscillator pitch.",
          })}
        />
        <Knob
          primary={props.live.control(props.fields.lfo2Mod, {
            label: "LFO2 Mod",
            description: "Amount of LFO 2 modulation of the oscillator pitch.",
          })}
          shift={props.live.control(props.fields.lfo3Mod, {
            label: "LFO3 Mod",
            description: "Amount of LFO 3 modulation of the oscillator pitch.",
          })}
        />

        <Rule />

        <div style={{ "justify-self": "start" }}>
          <DualButton primary={pulseLayer()} shift={props.pulseShift} />
        </div>
        <Knob
          primary={props.live.control(props.fields.pulseWidth, {
            label: "Pulse Width",
            description: "Sets the pulse width between 10% and 50% duty cycle.",
          })}
        />
        <Knob
          primary={props.live.control(props.fields.eg1Pwm, {
            label: "EG1 PWM",
            description: "Amount of pulse width modulation from EG 1.",
          })}
        />
        <Knob
          primary={props.live.control(props.fields.lfo1Pwm, {
            label: "LFO1 PWM",
            description: "Amount of pulse width modulation from LFO 1.",
          })}
        />
      </div>
    </fieldset>
  );
}

export function OscillatorsSection(props: OscillatorsSectionProps): JSX.Element {
  const synced = (): boolean => oscSyncFromCc(ccValue(props.live.value("osc2Sync"))) === "on";

  const syncLayer = (): ButtonLayer => ({
    label: "Sync",
    count: 1,
    active: synced() ? 0 : undefined,
    names: ["On"],
    description: "Synchronizes both oscillators in hard sync.",
    onPress: () => props.live.write("osc2Sync", oscSyncToCc(synced() ? "off" : "on")),
  });

  return (
    <PanelSection title="OSCILLATORS">
      <div style={{ display: "flex", "flex-direction": "column" }}>
        <Oscillator live={props.live} name="OSC 1" fields={OSC1_FIELDS} />
        <div
          style={{
            height: DIVIDER_ROW,
            "border-bottom": "1px solid var(--e7-silkscreen)",
            "box-sizing": "border-box",
          }}
        />
        <Oscillator live={props.live} name="OSC 2" fields={OSC2_FIELDS} pulseShift={syncLayer()} />
      </div>
    </PanelSection>
  );
}
