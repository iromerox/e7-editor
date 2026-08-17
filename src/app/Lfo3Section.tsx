// The LFO3 box: the wave shape button over its four lenses, the rate knob, and the Mod Wheel knob carrying Aftertouch, the pair that lifts this LFO out of silence.
import type { JSX } from "solid-js";
import type { Lfo3Shape } from "../protocol";
import type { ButtonLayer } from "./ButtonLed";
import type { LiveEdit } from "./live-edit";
import { Show } from "solid-js";
import { lfo3ShapeFromCc, lfo3ShapeToCc } from "../protocol";
import { DualButton } from "./ButtonLed";
import { ccValue } from "./control-value";
import { Knob } from "./Knob";
import { PanelSection } from "./PanelSection";
import { BUTTON_COLUMN, KNOB_COLUMN } from "./panel-rows";

export interface Lfo3SectionProps {
  readonly live: LiveEdit;
}

export const SECTION_TITLE = "LFO3";

export const SHAPE_LEDS: readonly Lfo3Shape[] = ["triangle", "ramp-up", "ramp-down", "square"];

export const SHAPE_NAMES: Readonly<Record<Lfo3Shape, string>> = {
  triangle: "Triangle",
  "ramp-up": "Ramp up",
  "ramp-down": "Ramp down",
  square: "Square",
};

export const SHAPE_DESCRIPTION =
  "Selects the waveform. LFO 3 has four, without the sample-and-hold LFO 1 and LFO 2 offer, and they divide the control change's travel into quarters rather than the sixteenths those two read.";

export const RATE_DESCRIPTION =
  "Sets the frequency of LFO 3. It has none of the synchronization modes LFO 1 and LFO 2 carry, so this is a plain frequency, read as the raw value.";

export const MOD_WHEEL_DESCRIPTION =
  "Sets how far the modulation wheel raises the amplitude of LFO 3. This is not a modulation depth like the LFO3 Mod knobs elsewhere on the panel: the amplitude is zero by default, and this knob and Aftertouch are the only things that lift it, so with both at zero the LFO reaches nothing however much of it the oscillators, filter and amplifier ask for.";

export const AFTERTOUCH_DESCRIPTION =
  "Sets how far aftertouch raises the amplitude of LFO 3. Like Mod Wheel beside it, it is what makes this LFO audible at all rather than a modulation depth of its own.";

export const SILENT_NOTE =
  "Mod Wheel and Aftertouch are both at zero, so LFO 3 has no amplitude and is heard nowhere, whatever the LFO3 Mod knobs are set to.";

const COLUMNS = `${BUTTON_COLUMN} repeat(2, ${KNOB_COLUMN})`;

export function nextShape(shape: Lfo3Shape): Lfo3Shape {
  const step = SHAPE_LEDS.indexOf(shape) + 1;
  return SHAPE_LEDS[step % SHAPE_LEDS.length] ?? "triangle";
}

export function Lfo3Section(props: Lfo3SectionProps): JSX.Element {
  const shape = (): Lfo3Shape => lfo3ShapeFromCc(ccValue(props.live.value("lfo3Shape")));

  const silent = (): boolean =>
    props.live.value("lfo3ModWheel") === 0 && props.live.value("lfo3Aftertouch") === 0;

  const shapeLayer = (): ButtonLayer => ({
    label: "Wave shape",
    count: SHAPE_LEDS.length,
    active: SHAPE_LEDS.indexOf(shape()),
    names: SHAPE_LEDS.map((variant) => SHAPE_NAMES[variant]),
    readout: SHAPE_NAMES[shape()],
    description: SHAPE_DESCRIPTION,
    onPress: () => props.live.write("lfo3Shape", lfo3ShapeToCc(nextShape(shape()))),
  });

  return (
    <PanelSection title={SECTION_TITLE}>
      <div
        style={{
          display: "grid",
          "grid-template-columns": COLUMNS,
          "align-items": "start",
          "justify-items": "center",
          "column-gap": "0.75rem",
        }}
      >
        <DualButton primary={shapeLayer()} />
        <Knob
          primary={props.live.control("lfo3Rate", {
            label: "Rate",
            description: RATE_DESCRIPTION,
          })}
        />
        <Knob
          primary={props.live.control("lfo3ModWheel", {
            label: "Mod Wheel",
            description: MOD_WHEEL_DESCRIPTION,
          })}
          shift={props.live.control("lfo3Aftertouch", {
            label: "Aftertouch",
            description: AFTERTOUCH_DESCRIPTION,
          })}
        />
      </div>
      <Show when={silent()}>
        <p
          style={{
            margin: "0",
            "max-width": "20rem",
            "font-size": "0.7rem",
            "line-height": "1.4",
            color: "var(--e7-label-secondary)",
          }}
        >
          {SILENT_NOTE}
        </p>
      </Show>
    </PanelSection>
  );
}
