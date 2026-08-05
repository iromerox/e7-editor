// The AMPLIFIER box: four knobs in a 2x2 grid, the lower pair's shift layer reaching the stereo controls a multi takes from part 1 alone.
import type { JSX } from "solid-js";
import type { LiveEdit } from "./live-edit";
import { Knob } from "./Knob";
import { PanelSection } from "./PanelSection";
import { HALF_BAND_ROW, KNOB_COLUMN, TOP_BAND_HALF_ROWS } from "./panel-rows";

export interface AmplifierSectionProps {
  readonly live: LiveEdit;
}

interface CellProps {
  readonly row: number;
  readonly column: number;
  readonly children: JSX.Element;
}

function Cell(props: CellProps): JSX.Element {
  return (
    <div style={{ "grid-row": String(props.row), "grid-column": String(props.column) }}>
      {props.children}
    </div>
  );
}

export function AmplifierSection(props: AmplifierSectionProps): JSX.Element {
  return (
    <PanelSection title="AMPLIFIER">
      <div
        style={{
          display: "grid",
          "grid-template-columns": `repeat(2, ${KNOB_COLUMN})`,
          "grid-template-rows": TOP_BAND_HALF_ROWS,
          "align-items": "start",
          "justify-items": "center",
          "column-gap": "0.75rem",
          "row-gap": "0",
        }}
      >
        <Cell row={HALF_BAND_ROW.upper} column={1}>
          <Knob
            primary={props.live.control("amplifierLfo1Mod", {
              label: "LFO1 Mod",
              description: "Amount of amplitude modulation from LFO 1.",
            })}
            shift={props.live.control("amplifierLevel", {
              label: "Level",
              description:
                "Level of the audio signal before the effects section. In a multi it sets the selected part's level, and it is not the master volume.",
            })}
          />
        </Cell>
        <Cell row={HALF_BAND_ROW.upper} column={2}>
          <Knob
            primary={props.live.control("amplifierLfo2Mod", {
              label: "LFO2 Mod",
              description: "Amount of amplitude modulation from LFO 2.",
            })}
            shift={props.live.control("amplifierLfo3Mod", {
              label: "LFO3 Mod",
              description: "Amount of amplitude modulation from LFO 3.",
            })}
          />
        </Cell>
        <Cell row={HALF_BAND_ROW.lower} column={1}>
          <Knob
            primary={props.live.control("amplifierKeyboardTracking", {
              label: "Keyboard tracking",
              description: "How far the amplitude follows the note played.",
            })}
            shift={props.live.control("stereoSpread", {
              label: "Stereo spread",
              description:
                "Stereo position of the seven voices — centred, all of them are equal in both channels; turned either way they spread across the image. Taken from part 1 for the whole instrument in a multi.",
            })}
          />
        </Cell>
        <Cell row={HALF_BAND_ROW.lower} column={2}>
          <Knob
            primary={props.live.control("amplifierVelocityEg2Mod", {
              label: "Velocity EG2 mod",
              description:
                "How far the amplitude of EG 2 follows how hard the key is played. EG 2 is the amplitude-oriented envelope.",
            })}
            shift={props.live.control("stereoMotion", {
              label: "Stereo motion",
              description:
                "Movement of the seven voices between the channels, at a fixed rate. Its depth is relative to Stereo spread, so it does nothing at the spread extremes. Taken from part 1 for the whole instrument in a multi.",
            })}
          />
        </Cell>
      </div>
    </PanelSection>
  );
}
