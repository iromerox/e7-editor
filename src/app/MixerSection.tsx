// The MIXER box: the oscillator and sub-oscillator levels in a 2x2 block, with Noise/Ext alone on the row the panel steps in for it.
import type { JSX } from "solid-js";
import type { ControlValue } from "./control-value";
import type { LiveEdit } from "./live-edit";
import { Knob } from "./Knob";
import { PanelSection } from "./PanelSection";
import { KNOB_COLUMN, TOP_BAND_ROW, TOP_BAND_ROWS } from "./panel-rows";

export interface MixerSectionProps {
  readonly live: LiveEdit;
}

interface LevelProps {
  readonly row: number;
  readonly column: number;
  readonly control: ControlValue;
}

function Level(props: LevelProps): JSX.Element {
  return (
    <div style={{ "grid-row": String(props.row), "grid-column": String(props.column) }}>
      <Knob primary={props.control} />
    </div>
  );
}

export function MixerSection(props: MixerSectionProps): JSX.Element {
  return (
    <PanelSection title="MIXER">
      <div
        style={{
          display: "grid",
          "grid-template-columns": `repeat(2, ${KNOB_COLUMN})`,
          "grid-template-rows": TOP_BAND_ROWS,
          "align-items": "start",
          "justify-items": "center",
          "column-gap": "0.75rem",
          "row-gap": "0",
        }}
      >
        <Level
          row={TOP_BAND_ROW.osc1Upper}
          column={1}
          control={props.live.control("mixerOsc1Level", {
            label: "OSC1",
            description: "Oscillator 1 level.",
          })}
        />
        <Level
          row={TOP_BAND_ROW.osc1Upper}
          column={2}
          control={props.live.control("mixerSub1Level", {
            label: "Sub1",
            description:
              "Sub-oscillator level, derived from OSC 1 — a square wave one octave below it.",
          })}
        />
        <Level
          row={TOP_BAND_ROW.osc1Lower}
          column={1}
          control={props.live.control("mixerOsc2Level", {
            label: "OSC2",
            description: "Oscillator 2 level.",
          })}
        />
        <Level
          row={TOP_BAND_ROW.osc1Lower}
          column={2}
          control={props.live.control("mixerSub2Level", {
            label: "Sub2",
            description:
              "Sub-oscillator level, derived from OSC 2 — a square wave one octave below it.",
          })}
        />
        <Level
          row={TOP_BAND_ROW.osc2Upper}
          column={1}
          control={props.live.control("mixerNoiseExtLevel", {
            label: "Noise/Ext",
            description:
              "Noise generator level, or the level of the rear-panel External In signal — plugging one in disables the noise generator.",
          })}
        />
      </div>
    </PanelSection>
  );
}
