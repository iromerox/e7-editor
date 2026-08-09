// The DELAY box: time, feedback and mix, the time knob carrying the four delay types on its shift layer as the panel does.
import type { JSX } from "solid-js";
import type { DelayType } from "../protocol";
import type { LiveEdit } from "./live-edit";
import { delayTypeFromCc } from "../protocol";
import { ccValue } from "./control-value";
import { EffectSection } from "./EffectSection";
import { Knob } from "./Knob";

export interface DelaySectionProps {
  readonly live: LiveEdit;
}

const DELAY_TYPE_NAMES: Readonly<Record<DelayType, string>> = {
  stereo: "Stereo",
  "ping-pong": "Ping-Pong",
  "stereo-sync": "Stereo Sync",
  "ping-pong-sync": "Ping-Pong Sync",
};

export function delayTypeReadout(value: number): string {
  return DELAY_TYPE_NAMES[delayTypeFromCc(ccValue(value))];
}

export function DelaySection(props: DelaySectionProps): JSX.Element {
  return (
    <EffectSection
      title="DELAY"
      effect="Delay"
      mix={props.live.value("delayMix")}
      applies={props.live.applies("delayMix")}
    >
      <Knob
        primary={props.live.control("delayTime", {
          label: "Delay Time",
          description:
            "Time between repetitions — 50 ms to 1.35 s in the Stereo and Ping-Pong types, and a division of the MIDI clock in the two Sync ones.",
        })}
        shift={props.live.control("delayType", {
          label: "Type",
          format: delayTypeReadout,
          description:
            "Selects how the repetitions are placed, in four quarters of the knob's travel. Stereo repeats in both channels at once and Ping-Pong alternates between them; the two Sync types do the same locked to the MIDI clock.",
        })}
      />
      <Knob
        primary={props.live.control("delayFeedback", {
          label: "Feedback",
          description:
            "How much of the delay output is fed back into its input, and so how many repetitions are heard.",
        })}
      />
      <Knob
        primary={props.live.control("delayMix", {
          label: "Mix",
          description: "Balance between the dry signal and the delayed one.",
        })}
      />
    </EffectSection>
  );
}
