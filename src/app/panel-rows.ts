// The horizontal guides the panel's top band shares, so a Mixer knob sits on the same line as the Oscillator knob beside it.
export const LEGEND_ROW = "1.4rem";

export const KNOB_ROW = "6rem";

export const RULE_ROW = "0.9rem";

export const DIVIDER_ROW = "0.9rem";

export const BUTTON_COLUMN = "6rem";

export const KNOB_COLUMN = "minmax(4rem, 7rem)";

const OSCILLATOR_ROWS = `${LEGEND_ROW} ${KNOB_ROW} ${RULE_ROW} ${KNOB_ROW}`;

export const OSCILLATOR_GRID_ROWS = `${KNOB_ROW} ${RULE_ROW} ${KNOB_ROW}`;

export const TOP_BAND_ROWS = `${OSCILLATOR_ROWS} ${DIVIDER_ROW} ${OSCILLATOR_ROWS}`;

export const TOP_BAND_ROW = {
  osc1Legend: 1,
  osc1Upper: 2,
  osc1Rule: 3,
  osc1Lower: 4,
  divider: 5,
  osc2Legend: 6,
  osc2Upper: 7,
  osc2Rule: 8,
  osc2Lower: 9,
} as const;
