// The untitled block under the Mixer: the Mode button that steps the polyphony modes, and the Portamento Time knob, carrying Bend range on its shift layer and the instrument's portamento switch behind it.
import type { JSX } from "solid-js";
import type { OtherMode } from "../protocol";
import type { ButtonLayer } from "./ButtonLed";
import type { ControlValue } from "./control-value";
import type { LiveEdit } from "./live-edit";
import { otherModeFromCc, otherModeToCc } from "../protocol";
import { DualButton } from "./ButtonLed";
import { ccValue } from "./control-value";
import { Knob } from "./Knob";
import { PanelSection } from "./PanelSection";
import { unlessReserved } from "./reserved-values";

export interface PortamentoPolyphonySectionProps {
  readonly live: LiveEdit;
}

export const SECTION_TITLE = "PORTAMENTO / POLYPHONY MODES";

export const SECTION_NOTE =
  "The panel prints no title over this block. The name is the user manual's, not a silkscreen.";

export const MODE_LEDS: readonly string[] = ["Poly", "ST", "MT", "Unison"];

export const MODE_COLUMN = "7rem";

export const MODE_READOUT_LINE = "1.1rem";

export const RESERVED_MODE = "Reserved";

export const PORTAMENTO_ON_VALUE = 127;

export const PORTAMENTO_ON_THRESHOLD = 64;

export const PORTAMENTO_TIME_DESCRIPTION =
  "Time the pitch takes to travel between notes played and triggered by the same voice. The instrument has a separate portamento on/off parameter that no panel control reaches; the knob switches it on as the time leaves zero and leaves it on, which is how every preset the instrument ships stores it.";

const MODE_ORDER: readonly OtherMode[] = [
  "polyphonic",
  "monophonic-single-trigger",
  "monophonic-multi-trigger",
  "unison-single-trigger",
  "unison-multi-trigger",
];

const MODE_LIT: Readonly<Record<OtherMode, readonly number[]>> = {
  polyphonic: [0],
  "monophonic-single-trigger": [1],
  "monophonic-multi-trigger": [2],
  "unison-single-trigger": [1, 3],
  "unison-multi-trigger": [2, 3],
};

const MODE_NAMES: Readonly<Record<OtherMode, string>> = {
  polyphonic: "Polyphonic",
  "monophonic-single-trigger": "Monophonic, Single Trigger",
  "monophonic-multi-trigger": "Monophonic, Multi Trigger",
  "unison-single-trigger": "Unison, Single Trigger",
  "unison-multi-trigger": "Unison, Multi Trigger",
};

const MODE_DESCRIPTION =
  "Steps through the five polyphony modes. Unison lights alongside ST or MT, as it does on the panel: the instrument plays one note across all seven voices, slightly detuned. Unison is unavailable while a multi is loaded.";

export function nextMode(mode: OtherMode | undefined): OtherMode {
  const current = mode === undefined ? -1 : MODE_ORDER.indexOf(mode);
  return MODE_ORDER[(current + 1) % MODE_ORDER.length] ?? "polyphonic";
}

export function modeName(mode: OtherMode | undefined): string {
  return mode === undefined ? RESERVED_MODE : MODE_NAMES[mode];
}

export function bendRangeReadout(value: number): string {
  return `${value} st`;
}

export function PortamentoPolyphonySection(props: PortamentoPolyphonySectionProps): JSX.Element {
  const mode = (): OtherMode | undefined =>
    unlessReserved(() => otherModeFromCc(ccValue(props.live.value("mode"))));

  const writeTime = (next: number): void => {
    const on = props.live.value("portamentoSwitch") >= PORTAMENTO_ON_THRESHOLD;
    props.live.write("portamentoTime", next);
    if (next > 0 && !on) {
      props.live.write("portamentoSwitch", PORTAMENTO_ON_VALUE);
    }
  };

  const time = (): ControlValue => ({
    ...props.live.control("portamentoTime", {
      label: "Portamento Time",
      description: PORTAMENTO_TIME_DESCRIPTION,
    }),
    onInput: writeTime,
  });

  const modeLayer = (): ButtonLayer => {
    const current = mode();
    return {
      label: "Mode",
      count: MODE_LEDS.length,
      active: current === undefined ? [] : MODE_LIT[current],
      names: MODE_LEDS,
      description: MODE_DESCRIPTION,
      onPress: () => props.live.write("mode", otherModeToCc(nextMode(current))),
    };
  };

  return (
    <PanelSection title={SECTION_TITLE} note={SECTION_NOTE}>
      <div style={{ display: "flex", "align-items": "flex-start", gap: "1.25rem" }}>
        <div
          style={{
            display: "flex",
            "flex-direction": "column",
            "align-items": "flex-start",
            gap: "0.2rem",
            flex: `0 0 ${MODE_COLUMN}`,
            width: MODE_COLUMN,
          }}
        >
          <DualButton primary={modeLayer()} />
          <span
            style={{
              "font-size": "0.7rem",
              "line-height": MODE_READOUT_LINE,
              "min-height": `calc(2 * ${MODE_READOUT_LINE})`,
              color: "var(--e7-label-secondary)",
            }}
          >
            {modeName(mode())}
          </span>
        </div>
        <Knob
          primary={time()}
          shift={props.live.control("pitchBendRange", {
            label: "Bend range",
            format: bendRangeReadout,
            description:
              "Range in semitones that a pitch bend wheel moves the pitch, either way from the note played.",
          })}
        />
      </div>
    </PanelSection>
  );
}
