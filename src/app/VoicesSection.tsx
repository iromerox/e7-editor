// The VOICES box: the two selections behind the panel's indicator row — which voices a polyphonic preset may use, and which one a monophonic preset takes.
import type { JSX } from "solid-js";
import type { LiveEdit } from "./live-edit";
import { For, Show } from "solid-js";
import { Voices } from "../protocol";
import { ccValue } from "./control-value";
import { PanelSection } from "./PanelSection";
import { unlessReserved } from "./reserved-values";

export interface VoicesSectionProps {
  readonly live: LiveEdit;
}

export const POLYPHONIC_VOICES: readonly string[] = ["All", "Even", "Odd", "1→7", "7→1"];

export const MONOPHONIC_VOICES: readonly string[] = ["Free", "1", "2", "3", "4", "5", "6", "7"];

export const INDICATOR_NOTE =
  "The panel shows this as a row of seven LEDs. The instrument never reports which voices are sounding, so the editor shows the two selections the Preset Menu sets instead of an indicator nothing can drive.";

export const RESERVED_NOTE =
  "The instrument reported a voices value the spec reserves. Choosing either selection replaces it.";

interface VoiceChoiceProps {
  readonly label: string;
  readonly description: string;
  readonly options: readonly string[];
  readonly value: number | undefined;
  readonly onSelect: (value: number) => void;
}

function VoiceChoice(props: VoiceChoiceProps): JSX.Element {
  return (
    <label
      style={{
        display: "flex",
        "flex-direction": "column",
        gap: "0.2rem",
        "font-size": "0.7rem",
        "letter-spacing": "0.08em",
        color: "var(--e7-silkscreen)",
      }}
    >
      {props.label}
      <select
        title={props.description}
        value={props.value === undefined ? "" : String(props.value)}
        onChange={(event) => props.onSelect(Number(event.currentTarget.value))}
        style={{ "font-size": "0.8rem" }}
      >
        <Show when={props.value === undefined}>
          <option value="" disabled={true}>
            Reserved
          </option>
        </Show>
        <For each={props.options}>
          {(option, index) => <option value={String(index())}>{option}</option>}
        </For>
      </select>
    </label>
  );
}

export function VoicesSection(props: VoicesSectionProps): JSX.Element {
  const voices = (): Voices | undefined =>
    unlessReserved(() => Voices.fromCc(ccValue(props.live.value("voices"))));

  const write = (v1: number, v2: number): void => {
    props.live.write("voices", new Voices(v1, v2).toCc());
  };

  return (
    <PanelSection title="VOICES">
      <p
        style={{
          margin: "0",
          "max-width": "14rem",
          "font-size": "0.7rem",
          "line-height": "1.4",
          color: "var(--e7-label-secondary)",
        }}
      >
        {INDICATOR_NOTE}
      </p>
      <Show when={voices() === undefined}>
        <p role="status" style={{ margin: "0", "font-size": "0.7rem", "line-height": "1.4" }}>
          {RESERVED_NOTE}
        </p>
      </Show>
      <div style={{ display: "flex", "flex-direction": "column", gap: "0.5rem" }}>
        <VoiceChoice
          label="Polyphonic voices"
          description="Which of the seven voices a preset in Polyphonic mode may use. 1→7 and 7→1 assign them from left to right and from right to left."
          options={POLYPHONIC_VOICES}
          value={voices()?.v1}
          onSelect={(next) => write(next, voices()?.v2 ?? 0)}
        />
        <VoiceChoice
          label="Monophonic voice"
          description="Which voice a preset in Monophonic or Unison mode plays. Free leaves the choice to the instrument."
          options={MONOPHONIC_VOICES}
          value={voices()?.v2}
          onSelect={(next) => write(voices()?.v1 ?? 0, next)}
        />
      </div>
    </PanelSection>
  );
}
