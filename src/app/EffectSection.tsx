// The shape CHORUS and DELAY share: a row of knobs, the enable indicator the panel prints in the header, and what a multi's parts 2-4 are told about controls only part 1 owns.
import type { JSX } from "solid-js";
import { Show } from "solid-js";
import { LedRow } from "./Led";
import { PanelSection } from "./PanelSection";
import { KNOB_COLUMN } from "./panel-rows";

export interface EffectSectionProps {
  readonly title: string;
  readonly effect: string;
  readonly mix: number;
  readonly applies: boolean;
  readonly children: JSX.Element;
}

const KNOB_COLUMNS = 3;

export function enableIndicatorTitle(effect: string): string {
  return `The instrument has no ${effect.toLowerCase()} on/off parameter — its own panel lamp is lit whenever Mix is above zero, and this one follows it.`;
}

export function partNotice(effect: string): string {
  return `Part 1 of a multi sets the ${effect.toLowerCase()} for the whole instrument, so these controls do nothing on the part loaded here.`;
}

export function EffectSection(props: EffectSectionProps): JSX.Element {
  const indicator = (): JSX.Element => (
    <span title={enableIndicatorTitle(props.effect)} style={{ display: "flex" }}>
      <LedRow count={1} lit={[props.mix > 0]} label={props.effect} names={["On"]} />
    </span>
  );

  return (
    <PanelSection title={props.title} indicator={indicator()}>
      <Show when={!props.applies}>
        <p
          style={{
            margin: "0",
            "max-width": "20rem",
            "font-size": "0.7rem",
            "line-height": "1.4",
            color: "var(--e7-label-secondary)",
          }}
        >
          {partNotice(props.effect)}
        </p>
      </Show>
      <div
        style={{
          display: "grid",
          "grid-template-columns": `repeat(${KNOB_COLUMNS}, ${KNOB_COLUMN})`,
          "align-items": "start",
          "justify-items": "center",
          "column-gap": "0.75rem",
        }}
      >
        {props.children}
      </div>
    </PanelSection>
  );
}
