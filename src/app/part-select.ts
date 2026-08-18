// Which part of a multi the editor holds: switching between the four it already read, the gate that protects unsaved edits, and the whole multi an edited part goes back into.
import type { SinglePreset } from "../protocol";
import type { AppStateControls, EditorMulti, MultiPart } from "./app-state";
import { createEffect, createSignal, on } from "solid-js";
import { SINGLE_PRESET_BYTES, encodeMultiPreset, encodeSinglePreset } from "../protocol";

export const FIRST_PART: MultiPart = 1;

export const MULTI_PARTS: readonly MultiPart[] = [FIRST_PART, 2, 3, 4];

export const PART_NOTE =
  "A multi holds four presets, one per part, and the editor holds one of them at a time. All four were read together, so switching between them asks the instrument for nothing.";

export interface PartSelection {
  readonly held: () => EditorMulti | undefined;
  readonly pending: () => MultiPart | undefined;
  readonly unsavedEdits: () => number;
  readonly select: (part: MultiPart) => void;
  readonly proceed: () => void;
  readonly cancel: () => void;
}

export function partOffset(part: MultiPart): number {
  return (part - 1) * SINGLE_PRESET_BYTES;
}

export function editedMulti(held: EditorMulti, preset: SinglePreset): Uint8Array {
  const bytes = encodeMultiPreset(held.preset);
  bytes.set(encodeSinglePreset(preset), partOffset(held.part));
  return bytes;
}

export function createPartSelection(controls: AppStateControls): PartSelection {
  const [pending, setPending] = createSignal<MultiPart | undefined>();

  createEffect(
    on(
      () => controls.state.editor.source,
      () => setPending(undefined),
    ),
  );

  const switchTo = (part: MultiPart): void => {
    controls.selectPart(part);
    setPending(undefined);
  };

  return {
    held: () => controls.state.editor.multi,
    pending,
    unsavedEdits: () => controls.state.history.undo.length,
    select(part: MultiPart): void {
      const multi = controls.state.editor.multi;
      if (multi === undefined || multi.part === part) {
        return;
      }
      if (controls.state.history.undo.length > 0) {
        setPending(part);
        return;
      }
      switchTo(part);
    },
    proceed(): void {
      const part = pending();
      if (part !== undefined) {
        switchTo(part);
      }
    },
    cancel(): void {
      setPending(undefined);
    },
  };
}
