// An ENVELOPE GENERATOR box: the four stages as knobs above the curve they draw, built once and pointed at whichever of the two envelopes it is given.
import type { JSX } from "solid-js";
import type { ControlValue } from "./control-value";
import type { LiveEdit } from "./live-edit";
import { AdsrEditor } from "./AdsrEditor";
import { Knob } from "./Knob";
import { PanelSection } from "./PanelSection";
import { KNOB_COLUMN } from "./panel-rows";

export type EnvelopeName = "eg1" | "eg2";

export interface EnvelopeSectionProps {
  readonly live: LiveEdit;
  readonly envelope: EnvelopeName;
}

export function EnvelopeSection(props: EnvelopeSectionProps): JSX.Element {
  const shortName = (): string => props.envelope.toUpperCase();

  const attack = (): ControlValue =>
    props.live.control(`${props.envelope}Attack`, {
      label: "Attack",
      description: "Time the envelope takes to rise from nothing to its maximum.",
    });

  const decay = (): ControlValue =>
    props.live.control(`${props.envelope}Decay`, {
      label: "Decay",
      description: "Time the envelope takes to fall from its maximum to the sustain level.",
    });

  const sustain = (): ControlValue =>
    props.live.control(`${props.envelope}Sustain`, {
      label: "Sustain",
      description: "Level the envelope holds for as long as the key is held.",
    });

  const release = (): ControlValue =>
    props.live.control(`${props.envelope}Release`, {
      label: "Release",
      description: "Time the envelope takes to fall back to nothing once the key is released.",
    });

  return (
    <PanelSection title={`ENVELOPE GENERATOR ${props.envelope.slice(2)}`}>
      <div
        style={{
          display: "grid",
          "grid-template-columns": `repeat(4, ${KNOB_COLUMN})`,
          "align-items": "start",
          "justify-items": "center",
          "column-gap": "0.75rem",
        }}
      >
        <Knob
          primary={attack()}
          shift={props.live.control(`${props.envelope}AttackVelocityMod`, {
            label: "Attack velocity mod",
            description:
              "How far playing harder shortens the attack time. The panel labels this Velocity mod, shared with the release knob's own.",
          })}
        />
        <Knob
          primary={decay()}
          shift={props.live.control(`${props.envelope}KeyboardTracking`, {
            label: "Keyboard tracking",
            description:
              "How far the envelope times follow the note played, shortening attack, decay and release together towards the top of the keyboard. It shares the decay knob but is not a decay parameter.",
          })}
        />
        <Knob primary={sustain()} />
        <Knob
          primary={release()}
          shift={props.live.control(`${props.envelope}ReleaseVelocityMod`, {
            label: "Release velocity mod",
            description:
              "How far playing harder shortens the release time. The panel labels this Velocity mod, shared with the attack knob's own.",
          })}
        />
      </div>
      <AdsrEditor
        label={shortName()}
        attack={attack()}
        decay={decay()}
        sustain={sustain()}
        release={release()}
      />
    </PanelSection>
  );
}
