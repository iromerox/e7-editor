// Holds the selected hardware finish and applies its custom properties to the subtree below it.
import type { Accessor, JSX } from "solid-js";
import type { CapColor, LedColor, PanelTone, Theme } from "./theme";
import { createContext, createSignal, useContext } from "solid-js";
import { DEFAULT_THEME, themeVariables } from "./theme";

export const THEME_ROOT_CLASS = "e7-theme-root";

export interface ThemeControls {
  readonly theme: Accessor<Theme>;
  readonly setPanel: (tone: PanelTone) => void;
  readonly setLed: (color: LedColor) => void;
  readonly setCap: (color: CapColor) => void;
}

export interface ThemeProviderProps {
  readonly initial?: Theme;
  readonly children: JSX.Element;
}

const ThemeContext = createContext<ThemeControls>();

export function ThemeProvider(props: ThemeProviderProps): JSX.Element {
  const [theme, setTheme] = createSignal<Theme>(props.initial ?? DEFAULT_THEME);

  const controls: ThemeControls = {
    theme,
    setPanel: (panel) => setTheme((current) => ({ ...current, panel })),
    setLed: (led) => setTheme((current) => ({ ...current, led })),
    setCap: (cap) => setTheme((current) => ({ ...current, cap })),
  };

  return (
    <ThemeContext.Provider value={controls}>
      <div class={THEME_ROOT_CLASS} style={themeVariables(theme())}>
        {props.children}
      </div>
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeControls {
  const controls = useContext(ThemeContext);
  if (controls === undefined) {
    throw new Error("useTheme called outside a ThemeProvider");
  }
  return controls;
}
