// The editor's live path: a preset field read as a control value, the control change each edit sends, the inbound control change that moves it back, and the fields the device only ever reports.
import type { CcEvent, Connection } from "../midi";
import type { CcField, ReceiveChannel } from "../protocol";
import type { AppStateControls } from "./app-state";
import type { ControlValue } from "./control-value";
import { ccDirection, ccToFields, fieldToCc, readField } from "../protocol";

export const OMNI_TARGET_CHANNEL = 1;

export interface FieldReadout {
  readonly label: string;
  readonly description?: string;
  readonly format?: (value: number) => string;
}

export interface LiveEdit {
  readonly value: (field: CcField) => number;
  readonly write: (field: CcField, value: number) => void;
  readonly receive: (event: CcEvent) => CcField | undefined;
  readonly control: (field: CcField, readout: FieldReadout) => ControlValue;
}

export function targetChannel(setting: ReceiveChannel | undefined): number | undefined {
  if (setting === undefined) {
    return undefined;
  }
  switch (setting.kind) {
    case "channel":
      return setting.channel;
    case "omni":
      return OMNI_TARGET_CHANNEL;
    case "invalid":
      return undefined;
  }
}

export function createLiveEdit(
  controls: AppStateControls,
  connection: () => Connection | undefined,
): LiveEdit {
  const value = (field: CcField): number => readField(controls.state.editor.preset, field);

  const write = (field: CcField, next: number): void => {
    controls.editField(field, next);
    const active = connection();
    const channel = targetChannel(controls.state.connection.receiveChannel);
    const cc = fieldToCc(field);
    if (active === undefined || channel === undefined || ccDirection(cc) === "inbound-only") {
      return;
    }
    active.sendControlChange(channel, cc, next);
  };

  const receive = (event: CcEvent): CcField | undefined => {
    const [field, ...rest] = ccToFields(event.controller);
    if (field === undefined || rest.length > 0) {
      return undefined;
    }
    controls.editField(field, event.value);
    return field;
  };

  return {
    value,
    write,
    receive,
    control: (field, readout) => ({
      ...readout,
      value: value(field),
      readOnly: ccDirection(fieldToCc(field)) === "inbound-only",
      onInput: (next: number) => write(field, next),
    }),
  };
}
