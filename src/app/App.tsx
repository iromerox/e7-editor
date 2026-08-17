// Application shell: the theme root, the header, the connection bar, the library, device and editor panes, and the hardware-finish selector.
import type { JSX } from "solid-js";
import type { Connection } from "../midi";
import type { LibraryDatabase } from "../store";
import { For, createSignal } from "solid-js";
import { AppStateProvider } from "./AppStateProvider";
import { ConnectionBar } from "./ConnectionBar";
import { DevicePane } from "./DevicePane";
import { EditorPane } from "./EditorPane";
import { LibraryPane } from "./LibraryPane";
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

export interface AppProps {
  readonly database: LibraryDatabase;
}

function Shell(props: AppProps): JSX.Element {
  const { theme, setPanel, setLed, setCap } = useTheme();
  const [connection, setConnection] = createSignal<Connection | undefined>();

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
      <ConnectionBar onConnectionChange={setConnection} />
      <LibraryPane database={props.database} />
      <DevicePane connection={connection()} database={props.database} />
      <EditorPane connection={connection()} database={props.database} />
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

export function App(props: AppProps): JSX.Element {
  return (
    <ThemeProvider>
      <AppStateProvider>
        <Shell database={props.database} />
      </AppStateProvider>
    </ThemeProvider>
  );
}
