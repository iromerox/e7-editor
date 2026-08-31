// The LFO box: LFO 1 over LFO 2, each a Wave shape button with its LED column over a Rate knob.
import type { JSX } from "solid-js";
import type { CcField, LfoMode, LfoShape } from "../protocol";
import type { ButtonLayer } from "./ButtonLed";
import type { LiveEdit } from "./live-edit";
import { Show } from "solid-js";
import { lfoModeFromCc, lfoModeToCc, lfoShapeFromCc, lfoShapeToCc } from "../protocol";
import { DualButton } from "./ButtonLed";
import { isClockSyncedLfoMode, lfoRateReadout } from "./clock-rate";
import { ccValue } from "./control-value";
import { Knob } from "./Knob";
import { PanelSection } from "./PanelSection";
import {
  DIVIDER_ROW,
  LEGEND_ROW,
  NOTED_GRID_ROWS,
  NOTE_ROW,
  OSCILLATOR_GRID_ROW,
  OSCILLATOR_GRID_ROWS,
} from "./panel-rows";

export interface LfoFields {
  readonly shape: CcField;
  readonly rate: CcField;
  readonly mode: CcField;
}

export interface LfoSectionProps {
  readonly live: LiveEdit;
}

interface LfoProps {
  readonly live: LiveEdit;
  readonly name: string;
  readonly fields: LfoFields;
  readonly rateDescription: string;
  readonly note?: string | undefined;
}

export const LFO1_FIELDS: LfoFields = {
  shape: "lfo1Shape",
  rate: "lfo1Rate",
  mode: "lfo1Mode",
};

export const LFO2_FIELDS: LfoFields = {
  shape: "lfo2Shape",
  rate: "lfo2Rate",
  mode: "lfo2Mode",
};

export const SHAPE_LEDS: readonly LfoShape[] = [
  "triangle",
  "ramp-up",
  "ramp-down",
  "square",
  "noise-sample-hold",
];

export const SHAPE_NAMES: Readonly<Record<LfoShape, string>> = {
  triangle: "Triangle",
  "ramp-up": "Ramp up",
  "ramp-down": "Ramp down",
  square: "Square",
  "noise-sample-hold": "S&H",
  "noise-sample-hold-led-off": "S&H (LED off)",
};

export const MODE_ORDER: readonly LfoMode[] = [
  "monophonic",
  "polyphonic",
  "keyboard-tracking",
  "keyboard-sync",
  "clock-sync",
  "keyboard-clock-sync",
];

export const MODE_NAMES: Readonly<Record<LfoMode, string>> = {
  monophonic: "Monophonic",
  polyphonic: "Polyphonic",
  "keyboard-tracking": "KB Tracking",
  "keyboard-sync": "KB Sync",
  "clock-sync": "Clock Sync",
  "keyboard-clock-sync": "KB + Clock Sync",
};

export const SHAPE_DESCRIPTION =
  "Selects the waveform. The fifth position, S&H, has a sixth value behind it that the button never reaches and the instrument can still report: the same sample-and-hold waveform with no LED lit.";

export const MODE_DESCRIPTION =
  "Steps through the six synchronization modes: monophonic, polyphonic, keyboard tracking, keyboard sync, clock sync, and keyboard plus clock sync. The instrument shows the mode on its display rather than in LEDs, so this layer lights none.";

export const RATE_DESCRIPTION =
  "Sets the frequency of the LFO. In the two clock-sync modes the instrument divides the MIDI clock instead, and this reads as the musical division the value lands on rather than as the value itself.";

export const EG1_MOD_NOTE =
  "EG1 Mod, the shift layer the panel prints on this knob, is not built yet: it is this LFO's own parameter, and the instrument makes it unavailable in the clock-sync and monophonic modes.";

export const EG1_MOD_DETAIL =
  "The panel prints EG1 Mod on this knob's shift layer. It sets how much EG1 modifies this LFO's frequency, and it is not built yet: the instrument reports it as unavailable whenever this LFO's mode is clock sync or monophonic, while still accepting the control change in those modes, so a plain knob here would show a live value for a parameter the hardware is ignoring.";

const COLUMNS = "9rem";

export function nextShape(shape: LfoShape): LfoShape {
  const step = SHAPE_LEDS.indexOf(shape) + 1;
  return SHAPE_LEDS[step % SHAPE_LEDS.length] ?? "triangle";
}

export function nextMode(mode: LfoMode): LfoMode {
  const step = MODE_ORDER.indexOf(mode) + 1;
  return MODE_ORDER[step % MODE_ORDER.length] ?? "monophonic";
}

function Lfo(props: LfoProps): JSX.Element {
  const shape = (): LfoShape => lfoShapeFromCc(ccValue(props.live.value(props.fields.shape)));

  const mode = (): LfoMode => lfoModeFromCc(ccValue(props.live.value(props.fields.mode)));

  const litShape = (): number | undefined => {
    const index = SHAPE_LEDS.indexOf(shape());
    return index < 0 ? undefined : index;
  };

  const shapeLayer = (): ButtonLayer => ({
    label: "Wave shape",
    count: SHAPE_LEDS.length,
    active: litShape(),
    names: SHAPE_LEDS.map((variant) => SHAPE_NAMES[variant]),
    readout: SHAPE_NAMES[shape()],
    description: SHAPE_DESCRIPTION,
    onPress: () => props.live.write(props.fields.shape, lfoShapeToCc(nextShape(shape()))),
  });

  const modeLayer = (): ButtonLayer => ({
    label: "Mode",
    count: 0,
    readout: MODE_NAMES[mode()],
    description: MODE_DESCRIPTION,
    onPress: () => props.live.write(props.fields.mode, lfoModeToCc(nextMode(mode()))),
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
          "grid-template-rows": props.note === undefined ? OSCILLATOR_GRID_ROWS : NOTED_GRID_ROWS,
          "align-items": "start",
          "justify-items": "center",
          "row-gap": "0",
        }}
      >
        <div style={{ "grid-row": String(OSCILLATOR_GRID_ROW.upper) }}>
          <DualButton primary={shapeLayer()} shift={modeLayer()} />
        </div>
        <div style={{ "grid-row": String(OSCILLATOR_GRID_ROW.lower) }}>
          <Knob
            primary={props.live.control(props.fields.rate, {
              label: "Rate",
              description: props.rateDescription,
              ...(isClockSyncedLfoMode(mode()) ? { format: lfoRateReadout } : {}),
            })}
          />
        </div>
        <Show when={props.note}>
          {(note) => (
            <p
              style={{
                "grid-row": String(NOTE_ROW),
                "align-self": "start",
                margin: "0",
                "font-size": "0.7rem",
                "line-height": "1.3",
                color: "var(--e7-label-secondary)",
              }}
            >
              {note()}
            </p>
          )}
        </Show>
      </div>
    </fieldset>
  );
}

export function LfoSection(props: LfoSectionProps): JSX.Element {
  return (
    <PanelSection title="LFO">
      <div style={{ display: "flex", "flex-direction": "column" }}>
        <Lfo
          live={props.live}
          name="LFO 1"
          fields={LFO1_FIELDS}
          rateDescription={RATE_DESCRIPTION}
        />
        <div
          style={{
            height: DIVIDER_ROW,
            "border-bottom": "1px solid var(--e7-silkscreen)",
            "box-sizing": "border-box",
          }}
        />
        <Lfo
          live={props.live}
          name="LFO 2"
          fields={LFO2_FIELDS}
          rateDescription={`${RATE_DESCRIPTION} ${EG1_MOD_DETAIL}`}
          note={EG1_MOD_NOTE}
        />
      </div>
    </PanelSection>
  );
}
