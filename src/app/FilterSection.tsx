// The FILTER box: the large Cutoff cap and Resonance on their own side of the panel's stepped dotted rule, the modulation depths and tracking on the other.
import type { JSX } from "solid-js";
import type { LiveEdit } from "./live-edit";
import { Knob } from "./Knob";
import { PanelSection } from "./PanelSection";
import { HALF_BAND_ROW, KNOB_COLUMN, TOP_BAND_HALF_ROWS } from "./panel-rows";

export interface FilterSectionProps {
  readonly live: LiveEdit;
}

interface CellProps {
  readonly row: number;
  readonly column: number;
  readonly children: JSX.Element;
}

const COLUMNS = `repeat(4, ${KNOB_COLUMN})`;

const COLUMN_GAP = "0.75rem";

const HALF_GAP = "0.375rem";

function Cell(props: CellProps): JSX.Element {
  return (
    <div style={{ "grid-row": String(props.row), "grid-column": String(props.column) }}>
      {props.children}
    </div>
  );
}

function SteppedRule(): JSX.Element {
  const dotted = "1px dotted var(--e7-silkscreen)";
  const segment = (row: number, column: number): JSX.CSSProperties => ({
    "grid-row": String(row),
    "grid-column": String(column),
    "justify-self": "start",
    "margin-left": `-${HALF_GAP}`,
    opacity: "0.6",
  });

  return (
    <>
      <div
        aria-hidden="true"
        style={{
          ...segment(HALF_BAND_ROW.upper, 2),
          height: "100%",
          "border-left": dotted,
        }}
      />
      <div
        aria-hidden="true"
        style={{
          ...segment(HALF_BAND_ROW.rule, 2),
          "align-self": "center",
          width: `calc(100% + ${COLUMN_GAP})`,
          "border-top": dotted,
        }}
      />
      <div
        aria-hidden="true"
        style={{
          ...segment(HALF_BAND_ROW.lower, 3),
          height: "100%",
          "border-left": dotted,
        }}
      />
    </>
  );
}

export function FilterSection(props: FilterSectionProps): JSX.Element {
  return (
    <PanelSection title="FILTER">
      <div
        style={{
          display: "grid",
          "grid-template-columns": COLUMNS,
          "grid-template-rows": TOP_BAND_HALF_ROWS,
          "align-items": "start",
          "justify-items": "center",
          "column-gap": COLUMN_GAP,
          "row-gap": "0",
        }}
      >
        <Cell row={HALF_BAND_ROW.upper} column={1}>
          <Knob
            size="large"
            primary={props.live.control("filterCutoff", {
              label: "Cutoff",
              description: "Sets the low-pass filter cutoff frequency, from 10 Hz to 25 kHz.",
            })}
          />
        </Cell>
        <Cell row={HALF_BAND_ROW.upper} column={2}>
          <Knob
            primary={props.live.control("filterEg1Mod", {
              label: "EG1 Mod",
              description: "Amount of cutoff frequency modulation from EG 1.",
            })}
            shift={props.live.control("filterVelocityEg1Mod", {
              label: "Velocity EG1 Mod",
              description:
                "Amount of EG 1 cutoff modulation that follows how hard the key is played.",
            })}
          />
        </Cell>
        <Cell row={HALF_BAND_ROW.upper} column={3}>
          <Knob
            primary={props.live.control("filterLfo1Mod", {
              label: "LFO1 Mod",
              description: "Amount of cutoff frequency modulation from LFO 1.",
            })}
          />
        </Cell>
        <Cell row={HALF_BAND_ROW.upper} column={4}>
          <Knob
            primary={props.live.control("filterLfo2Mod", {
              label: "LFO2 Mod",
              description: "Amount of cutoff frequency modulation from LFO 2.",
            })}
            shift={props.live.control("filterLfo3Mod", {
              label: "LFO3 Mod",
              description: "Amount of cutoff frequency modulation from LFO 3.",
            })}
          />
        </Cell>

        <SteppedRule />

        <Cell row={HALF_BAND_ROW.lower} column={2}>
          <Knob
            primary={props.live.control("filterResonance", {
              label: "Resonance",
              description:
                "Emphasis around the cutoff frequency; at maximum the filter oscillates into a pure tone. The device reports this knob but is not known to accept it, so the editor only follows the instrument here.",
            })}
          />
        </Cell>
        <Cell row={HALF_BAND_ROW.lower} column={3}>
          <Knob
            primary={props.live.control("filterKeyboardTracking", {
              label: "Keyboard tracking",
              description:
                "How far the cutoff frequency follows the note played, keeping high notes as bright as low ones. At the minimum the cutoff is the same for every key.",
            })}
          />
        </Cell>
        <Cell row={HALF_BAND_ROW.lower} column={4}>
          <Knob
            primary={props.live.control("filterModWheel", {
              label: "Mod Wheel",
              description: "How much the modulation wheel affects the cutoff frequency.",
            })}
            shift={props.live.control("filterAftertouch", {
              label: "Aftertouch",
              description: "How much aftertouch affects the cutoff frequency.",
            })}
          />
        </Cell>
      </div>
    </PanelSection>
  );
}
