// The value contract every panel control shares: bounds, readout, whether the value is the user's to set, drag travel, keyboard steps, and one emission per distinct value.
export interface ControlValue {
  readonly label: string;
  readonly value: number;
  readonly min?: number;
  readonly max?: number;
  readonly description?: string;
  readonly format?: (value: number) => string;
  readonly readOnly?: boolean;
  readonly onInput: (value: number) => void;
}

export interface ValueEmitter {
  readonly begin: (value: number) => void;
  readonly emit: (control: ControlValue, value: number) => void;
}

export const CONTROL_MIN = 0;

export const CONTROL_MAX = 127;

export const DRAG_TRAVEL_PX = 200;

export const PAGE_STEP = 10;

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function lowerBound(control: ControlValue): number {
  return control.min ?? CONTROL_MIN;
}

export function upperBound(control: ControlValue): number {
  return control.max ?? CONTROL_MAX;
}

export function fractionOf(control: ControlValue): number {
  const min = lowerBound(control);
  const max = upperBound(control);
  return max === min ? 0 : (clamp(control.value, min, max) - min) / (max - min);
}

export function isEditable(control: ControlValue): boolean {
  return control.readOnly !== true;
}

export function readout(control: ControlValue): string {
  return control.format === undefined ? String(control.value) : control.format(control.value);
}

export function quantize(control: ControlValue, raw: number): number {
  return clamp(Math.round(raw), lowerBound(control), upperBound(control));
}

export function draggedValue(control: ControlValue, from: number, travelledPx: number): number {
  const span = upperBound(control) - lowerBound(control);
  return quantize(control, from + (travelledPx / DRAG_TRAVEL_PX) * span);
}

export function nudgedValue(control: ControlValue, key: string): number | undefined {
  switch (key) {
    case "ArrowUp":
    case "ArrowRight":
      return quantize(control, control.value + 1);
    case "ArrowDown":
    case "ArrowLeft":
      return quantize(control, control.value - 1);
    case "PageUp":
      return quantize(control, control.value + PAGE_STEP);
    case "PageDown":
      return quantize(control, control.value - PAGE_STEP);
    case "Home":
      return lowerBound(control);
    case "End":
      return upperBound(control);
    default:
      return undefined;
  }
}

export function createEmitter(): ValueEmitter {
  let last = Number.NaN;
  return {
    begin(value: number): void {
      last = value;
    },
    emit(control: ControlValue, value: number): void {
      if (value === last) {
        return;
      }
      last = value;
      control.onInput(value);
    },
  };
}
