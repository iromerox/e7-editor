// Hardware finish variants and the CSS custom properties derived from them.
export type PanelTone = "blue" | "black";

export type LedColor = "white" | "red";

export type CapColor = "white" | "black";

export interface Theme {
  readonly panel: PanelTone;
  readonly led: LedColor;
  readonly cap: CapColor;
}

export const DEFAULT_THEME: Theme = { panel: "blue", led: "white", cap: "white" };

export const PANEL_TONES: readonly PanelTone[] = ["blue", "black"];

export const LED_COLORS: readonly LedColor[] = ["white", "red"];

export const CAP_COLORS: readonly CapColor[] = ["white", "black"];

export const THEME_COMBINATIONS: readonly Theme[] = PANEL_TONES.flatMap((panel) =>
  LED_COLORS.flatMap((led) => CAP_COLORS.map((cap) => ({ panel, led, cap }))),
);

const PANEL_COLOR: Record<PanelTone, string> = { blue: "#0a4a72", black: "#3a2f2c" };

const SECTION_BACKGROUND: Record<PanelTone, string> = { blue: "#12527a", black: "#423734" };

const SILKSCREEN: Record<PanelTone, string> = { blue: "#ece4dc", black: "#e8e1dc" };

const SILKSCREEN_SECONDARY: Record<PanelTone, string> = { blue: "#ece4dcc8", black: "#e8e1dcc8" };

const LED_ON: Record<LedColor, string> = { white: "#fefae6", red: "#ef2b1e" };

const LED_OFF: Record<LedColor, string> = { white: "#403d32", red: "#652e2a" };

const LED_HALO: Record<LedColor, string> = { white: "#fefae628", red: "#ef2b1e28" };

const CAP_TOP: Record<CapColor, string> = { white: "#e5dddb", black: "#140d0b" };

const CAP_BOTTOM: Record<CapColor, string> = { white: "#d1c8c5", black: "#080402" };

const KNOB_NOTCH: Record<CapColor, string> = { white: "#040001", black: "#fcf5f0" };

const KNOB_INLAY_TOP = "#faf8f5";

const KNOB_INLAY_BOTTOM = "#f1ede9";

const MODIFIED_DOT = "#ffc100";

export const THEME_VARIABLE_NAMES = [
  "--e7-panel",
  "--e7-section-background",
  "--e7-silkscreen",
  "--e7-label",
  "--e7-label-secondary",
  "--e7-led-on",
  "--e7-led-off",
  "--e7-led-halo",
  "--e7-cap-top",
  "--e7-cap-bottom",
  "--e7-knob-inlay-top",
  "--e7-knob-inlay-bottom",
  "--e7-knob-notch",
  "--e7-modified-dot",
] as const;

export type ThemeVariableName = (typeof THEME_VARIABLE_NAMES)[number];

export type ThemeVariables = Readonly<Record<ThemeVariableName, string>>;

export function themeVariables(theme: Theme): ThemeVariables {
  return {
    "--e7-panel": PANEL_COLOR[theme.panel],
    "--e7-section-background": SECTION_BACKGROUND[theme.panel],
    "--e7-silkscreen": SILKSCREEN[theme.panel],
    "--e7-label": SILKSCREEN[theme.panel],
    "--e7-label-secondary": SILKSCREEN_SECONDARY[theme.panel],
    "--e7-led-on": LED_ON[theme.led],
    "--e7-led-off": LED_OFF[theme.led],
    "--e7-led-halo": LED_HALO[theme.led],
    "--e7-cap-top": CAP_TOP[theme.cap],
    "--e7-cap-bottom": CAP_BOTTOM[theme.cap],
    "--e7-knob-inlay-top": KNOB_INLAY_TOP,
    "--e7-knob-inlay-bottom": KNOB_INLAY_BOTTOM,
    "--e7-knob-notch": KNOB_NOTCH[theme.cap],
    "--e7-modified-dot": MODIFIED_DOT,
  };
}
