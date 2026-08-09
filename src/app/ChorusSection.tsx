// The CHORUS box: rate, depth and mix, the rate knob carrying the two algorithms on its shift layer as the panel does.
import type { JSX } from "solid-js";
import type { ChorusType } from "../protocol";
import type { LiveEdit } from "./live-edit";
import { chorusTypeFromCc } from "../protocol";
import { ccValue } from "./control-value";
import { EffectSection } from "./EffectSection";
import { Knob } from "./Knob";

export interface ChorusSectionProps {
  readonly live: LiveEdit;
}

const CHORUS_TYPE_NAMES: Readonly<Record<ChorusType, string>> = {
  basic: "Basic",
  ensemble: "Ensemble",
};

export function chorusTypeReadout(value: number): string {
  return CHORUS_TYPE_NAMES[chorusTypeFromCc(ccValue(value))];
}

export function ChorusSection(props: ChorusSectionProps): JSX.Element {
  return (
    <EffectSection
      title="CHORUS"
      effect="Chorus"
      mix={props.live.value("chorusMix")}
      applies={props.live.applies("chorusMix")}
    >
      <Knob
        primary={props.live.control("chorusRate", {
          label: "Rate",
          description:
            "Rate of the effect's own LFO, which is what keeps the delay applied to each copy of the sound moving rather than fixed.",
        })}
        shift={props.live.control("chorusType", {
          label: "Type",
          format: chorusTypeReadout,
          description:
            "Selects the chorus algorithm across the knob's travel. Basic is subtle and adds a little spatiality; Ensemble is broader, in the manner of a string or vocal ensemble.",
        })}
      />
      <Knob
        primary={props.live.control("chorusDepth", {
          label: "Depth",
          description:
            "Intensity of the modulation — how far each copy of the sound is detuned, and so how strongly the effect is heard.",
        })}
      />
      <Knob
        primary={props.live.control("chorusMix", {
          label: "Mix",
          description: "Balance between the dry signal and the chorused one.",
        })}
      />
    </EffectSection>
  );
}
