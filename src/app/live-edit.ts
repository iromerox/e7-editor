// The editor's live path: a preset field read as a control value, the control change each edit sends, the inbound control change that moves it back, the fields the device only ever reports, and the recorded steps undo and redo walk.
import type { CcEvent, Connection } from "../midi";
import type { CcField, ReceiveChannel } from "../protocol";
import type { AppStateControls } from "./app-state";
import type { ControlValue } from "./control-value";
import { ccDirection, ccToField, fieldToCc, isPart1OnlyField, readField } from "../protocol";
import { unlessReserved } from "./reserved-values";

export const OMNI_TARGET_CHANNEL = 1;

export const PART_1_ONLY_NOTE =
  "A multi takes this parameter from part 1 alone, so it does nothing on the part loaded here.";

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
  readonly applies: (field: CcField) => boolean;
  readonly undo: () => void;
  readonly redo: () => void;
  readonly undoable: () => boolean;
  readonly redoable: () => boolean;
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

  const applied = (field: CcField, next: number): boolean =>
    unlessReserved(() => {
      controls.editField(field, next);
      return true;
    }) ?? false;

  const send = (field: CcField, next: number): void => {
    const active = connection();
    const channel = targetChannel(controls.state.connection.receiveChannel);
    const cc = fieldToCc(field);
    if (active === undefined || channel === undefined || ccDirection(cc) === "inbound-only") {
      return;
    }
    active.sendControlChange(channel, cc, next);
  };

  const restore = (field: CcField, next: number): void => {
    controls.editField(field, next);
    send(field, next);
  };

  const write = (field: CcField, next: number): void => {
    const previous = unlessReserved(() => value(field));
    controls.editField(field, next);
    if (previous !== undefined) {
      controls.recordEdit({ field, previousValue: previous, nextValue: next, at: Date.now() });
    }
    send(field, next);
  };

  const undo = (): void => {
    const entry = controls.takeUndo();
    if (entry !== undefined) {
      restore(entry.field, entry.previousValue);
    }
  };

  const redo = (): void => {
    const entry = controls.takeRedo();
    if (entry !== undefined) {
      restore(entry.field, entry.nextValue);
    }
  };

  const receive = (event: CcEvent): CcField | undefined => {
    const field = ccToField(event.controller);
    if (field === undefined) {
      return undefined;
    }
    return applied(field, event.value) ? field : undefined;
  };

  const applies = (field: CcField): boolean => {
    const multi = controls.state.editor.multi;
    return multi === undefined || multi.part === 1 || !isPart1OnlyField(field);
  };

  const noted = (readout: FieldReadout): FieldReadout => ({
    ...readout,
    description:
      readout.description === undefined
        ? PART_1_ONLY_NOTE
        : `${readout.description} ${PART_1_ONLY_NOTE}`,
  });

  return {
    value,
    write,
    receive,
    applies,
    undo,
    redo,
    undoable: () => controls.state.history.undo.length > 0,
    redoable: () => controls.state.history.redo.length > 0,
    control: (field, readout) => {
      const editable = applies(field);
      return {
        ...(editable ? readout : noted(readout)),
        value: value(field),
        readOnly: !editable || ccDirection(fieldToCc(field)) === "inbound-only",
        onInput: (next: number) => write(field, next),
      };
    },
  };
}
