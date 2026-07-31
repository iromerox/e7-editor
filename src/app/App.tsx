// Application shell: the theme root, the header, the connection bar, and the hardware-finish selector.
import type { JSX } from "solid-js";
import { For } from "solid-js";
import { ConnectionBar } from "./ConnectionBar";
import { ThemeProvider, useTheme } from "./ThemeProvider";
import { CAP_COLORS, LED_COLORS, PANEL_TONES } from "./theme";

interface FinishSelectProps<T extends string> {
  readonly label: string;
  readonly options: readonly T[];
  readonly value: T;
  readonly onSelect: (value: T) => void;
}

function FinishSelect<T extends string>(props: FinishSelectProps<T>): JSX.Element {
  return (
    <label>
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

function Shell(): JSX.Element {
  const { theme, setPanel, setLed, setCap } = useTheme();

  return (
    <main
      style={{
        "min-height": "100vh",
        padding: "1rem",
        background: "var(--e7-panel)",
        color: "var(--e7-label)",
      }}
    >
      <h1>e7 editor</h1>
      <ConnectionBar />
      <fieldset style={{ "border-color": "var(--e7-silkscreen)" }}>
        <legend>Finish</legend>
        <FinishSelect
          label="Panel"
          options={PANEL_TONES}
          value={theme().panel}
          onSelect={setPanel}
        />{" "}
        <FinishSelect label="LEDs" options={LED_COLORS} value={theme().led} onSelect={setLed} />{" "}
        <FinishSelect label="Caps" options={CAP_COLORS} value={theme().cap} onSelect={setCap} />
      </fieldset>
    </main>
  );
}

export function App(): JSX.Element {
  return (
    <ThemeProvider>
      <Shell />
    </ThemeProvider>
  );
}
