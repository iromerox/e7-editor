// Finish selector for the manual widget harnesses: panel tone, LED colour and knob/cap colour.
import type { JSX } from "solid-js";
import type { CapColor, LedColor, PanelTone } from "./theme";
import { For } from "solid-js";
import { useTheme } from "./ThemeProvider";
import { CAP_COLORS, LED_COLORS, PANEL_TONES } from "./theme";

interface FinishSelectProps<T extends string> {
  readonly label: string;
  readonly options: readonly T[];
  readonly value: T;
  readonly onSelect: (value: T) => void;
}

function FinishSelect<T extends string>(props: FinishSelectProps<T>): JSX.Element {
  return (
    <label style={{ color: "var(--e7-label)" }}>
      {props.label}{" "}
      <select
        value={props.value}
        onChange={(event) => {
          const next = props.options.find((option) => option === event.currentTarget.value);
          if (next !== undefined) {
            props.onSelect(next);
          }
        }}
      >
        <For each={props.options}>{(option) => <option value={option}>{option}</option>}</For>
      </select>
    </label>
  );
}

export function FinishPicker(): JSX.Element {
  const { theme, setPanel, setLed, setCap } = useTheme();

  return (
    <fieldset style={{ "border-color": "var(--e7-silkscreen)", "margin-bottom": "1.5rem" }}>
      <legend>Finish</legend>
      <FinishSelect
        label="Panel"
        options={PANEL_TONES}
        value={theme().panel}
        onSelect={(tone: PanelTone) => setPanel(tone)}
      />{" "}
      <FinishSelect
        label="LEDs"
        options={LED_COLORS}
        value={theme().led}
        onSelect={(color: LedColor) => setLed(color)}
      />{" "}
      <FinishSelect
        label="Knobs"
        options={CAP_COLORS}
        value={theme().cap}
        onSelect={(color: CapColor) => setCap(color)}
      />
    </fieldset>
  );
}
