// The horizontal guides the panel's top band shares, so a Mixer knob sits on the same line as the Oscillator knob beside it.
export const LEGEND_ROW = "1.4rem";

export const KNOB_ROW = "6rem";

export const RULE_ROW = "0.9rem";

export const DIVIDER_ROW = "0.9rem";

export const BUTTON_COLUMN = "6rem";

export const KNOB_COLUMN = "minmax(4rem, 7rem)";

export const TOP_BAND_HALF_ROWS = `${LEGEND_ROW} ${KNOB_ROW} ${RULE_ROW} ${KNOB_ROW}`;

export const OSCILLATOR_GRID_ROWS = `${KNOB_ROW} ${RULE_ROW} ${KNOB_ROW}`;

export const NOTED_GRID_ROWS = `${OSCILLATOR_GRID_ROWS} auto`;

export const OSCILLATOR_GRID_ROW = {
  upper: 1,
  rule: 2,
  lower: 3,
} as const;

export const NOTE_ROW = OSCILLATOR_GRID_ROW.lower + 1;

export const TOP_BAND_ROWS = `${TOP_BAND_HALF_ROWS} ${DIVIDER_ROW} ${TOP_BAND_HALF_ROWS}`;

export const HALF_BAND_ROW = {
  legend: 1,
  upper: 2,
  rule: 3,
  lower: 4,
} as const;

const SECOND_HALF = 5;

export const TOP_BAND_ROW = {
  osc1Legend: HALF_BAND_ROW.legend,
  osc1Upper: HALF_BAND_ROW.upper,
  osc1Rule: HALF_BAND_ROW.rule,
  osc1Lower: HALF_BAND_ROW.lower,
  divider: SECOND_HALF,
  osc2Legend: SECOND_HALF + HALF_BAND_ROW.legend,
  osc2Upper: SECOND_HALF + HALF_BAND_ROW.upper,
  osc2Rule: SECOND_HALF + HALF_BAND_ROW.rule,
  osc2Lower: SECOND_HALF + HALF_BAND_ROW.lower,
} as const;
