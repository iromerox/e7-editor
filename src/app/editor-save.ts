// Saving the editor's preset to the library: the place the library keeps it, whether what the editor holds still matches what is stored there, and the two writes that put it back.
import type { SinglePreset } from "../protocol";
import type { LibraryDatabase, LibraryEntry, PresetImage } from "../store";
import type { AppStateControls, MultiPart } from "./app-state";
import type { SlotAddress } from "./device-slots";
import { createEffect, createMemo, createSignal, onCleanup } from "solid-js";
import { SINGLE_PRESET_BYTES, encodeSinglePreset } from "../protocol";
import { entryById, entryBytes, parseSyxFile, replaceEntryWithEdit, storeEdit } from "../store";
import { slotByteAddress, slotKey, slotLabel } from "./device-slots";
import { EntryNotOnePresetError } from "./errors";
import { describeFailure, savedNote, savedOverNote } from "./transfer";

export const SAVE_OVER_NOTE =
  "Save replaces what the entry this preset came from stores. The device keeps the sound it is playing, and no other entry is touched.";

export const SAVE_AS_NEW_NOTE =
  "Save as new stores the editor's preset as another library entry, leaving the one it came from exactly as it is.";

export const NOTHING_LOADED =
  "The preset in the editor came from neither the device nor the library, so the library has nowhere to keep it. Load a slot or an entry first.";

export const PART_OF_A_DEVICE_MULTI =
  "The editor holds one part of a multi read from the device, and storing it needs the other three, which the editor does not hold. Save the slot to the library first, then load that entry.";

export const ENTRY_GONE =
  "The entry this preset came from is no longer in the library, so there is nothing left to save it over.";

export interface EntryImage {
  readonly address: number;
  readonly bytes: Uint8Array;
  readonly offset: number;
}

export type SaveDestination =
  | { readonly kind: "Entry"; readonly entry: LibraryEntry; readonly image: EntryImage }
  | { readonly kind: "Slot"; readonly address: SlotAddress }
  | { readonly kind: "Reading" }
  | { readonly kind: "None"; readonly reason: string };

export type EditorSaveState =
  | { readonly status: "confirming" }
  | { readonly status: "naming"; readonly name: string }
  | { readonly status: "saving" }
  | { readonly status: "done"; readonly note: string }
  | { readonly status: "failed"; readonly reason: string };

export interface EditorSave {
  readonly destination: () => SaveDestination;
  readonly differs: () => boolean | undefined;
  readonly state: () => EditorSaveState | undefined;
  readonly saveOver: () => void;
  readonly saveAsNew: () => void;
  readonly rename: (name: string) => void;
  readonly proceed: () => void;
  readonly cancel: () => void;
}

export function entryImage(entry: LibraryEntry, part: MultiPart | undefined): EntryImage {
  const file = parseSyxFile(entryBytes(entry));
  const [single] = file.singles;
  const [multi] = file.multis;
  if (file.kind === "Single" && single !== undefined) {
    return { address: single.slot.byteAddress(), bytes: single.bytes, offset: 0 };
  }
  if (file.kind === "Multi" && multi !== undefined) {
    return {
      address: multi.slot.byteAddress(),
      bytes: multi.bytes,
      offset: ((part ?? 1) - 1) * SINGLE_PRESET_BYTES,
    };
  }
  throw new EntryNotOnePresetError(entry.id, file.kind);
}

export function editedImage(image: EntryImage, preset: SinglePreset): PresetImage {
  const bytes = Uint8Array.from(image.bytes);
  bytes.set(encodeSinglePreset(preset), image.offset);
  return { address: image.address, bytes };
}

export function differsFromStored(image: EntryImage, preset: SinglePreset): boolean {
  return encodeSinglePreset(preset).some(
    (byte, index) => byte !== image.bytes[image.offset + index],
  );
}

type StoredEntry =
  | { readonly status: "reading" }
  | { readonly status: "found"; readonly entry: LibraryEntry }
  | { readonly status: "missing" };

export function createEditorSave(
  controls: AppStateControls,
  database: LibraryDatabase,
): EditorSave {
  const [stored, setStored] = createSignal<StoredEntry>({ status: "reading" });
  const [state, setState] = createSignal<EditorSaveState | undefined>();

  createEffect(() => {
    const { source } = controls.state.editor;
    setState(undefined);
    if (source.kind !== "LibraryEntry") {
      setStored({ status: "missing" });
      return;
    }
    setStored({ status: "reading" });
    const subscription = entryById(database, source.id).subscribe((entry) => {
      setStored(entry === undefined ? { status: "missing" } : { status: "found", entry });
    });
    onCleanup(() => subscription.unsubscribe());
  });

  const destination = createMemo((): SaveDestination => {
    const { source, part } = controls.state.editor;
    switch (source.kind) {
      case "Empty":
        return { kind: "None", reason: NOTHING_LOADED };
      case "DeviceSlot":
        return source.address.kind === "Single"
          ? { kind: "Slot", address: source.address }
          : { kind: "None", reason: PART_OF_A_DEVICE_MULTI };
      case "LibraryEntry": {
        const found = stored();
        if (found.status === "reading") {
          return { kind: "Reading" };
        }
        if (found.status === "missing") {
          return { kind: "None", reason: ENTRY_GONE };
        }
        try {
          return { kind: "Entry", entry: found.entry, image: entryImage(found.entry, part) };
        } catch (error: unknown) {
          return { kind: "None", reason: describeFailure(error) };
        }
      }
    }
  });

  const differs = (): boolean | undefined => {
    const place = destination();
    return place.kind === "Entry"
      ? differsFromStored(place.image, controls.state.editor.preset)
      : undefined;
  };

  const suggestedName = (place: SaveDestination): string => {
    if (place.kind === "Entry") {
      return place.entry.name;
    }
    if (place.kind !== "Slot") {
      return "";
    }
    const read = controls.state.device.slots[slotKey(place.address)];
    const name = read?.status === "read" ? read.summary.name : "";
    return name === "" ? slotLabel(place.address) : name;
  };

  const imageOf = (place: SaveDestination): PresetImage | undefined => {
    const { preset } = controls.state.editor;
    if (place.kind === "Entry") {
      return editedImage(place.image, preset);
    }
    if (place.kind === "Slot") {
      return { address: slotByteAddress(place.address), bytes: encodeSinglePreset(preset) };
    }
    return undefined;
  };

  const settle = (write: Promise<string>): void => {
    setState({ status: "saving" });
    void write.then(
      (note) => {
        controls.clearHistory();
        setState({ status: "done", note });
      },
      (error: unknown) => setState({ status: "failed", reason: describeFailure(error) }),
    );
  };

  return {
    destination,
    differs,
    state,
    saveOver(): void {
      if (destination().kind === "Entry" && differs() === true) {
        setState({ status: "confirming" });
      }
    },
    saveAsNew(): void {
      setState({ status: "naming", name: suggestedName(destination()) });
    },
    rename(name: string): void {
      if (state()?.status === "naming") {
        setState({ status: "naming", name });
      }
    },
    proceed(): void {
      const pending = state();
      const place = destination();
      const image = imageOf(place);
      if (pending === undefined || image === undefined) {
        return;
      }
      if (pending.status === "confirming" && place.kind === "Entry") {
        const { entry } = place;
        settle(
          replaceEntryWithEdit(database, entry, image).then((saved) => savedOverNote(saved.name)),
        );
        return;
      }
      if (pending.status === "naming" && pending.name.trim() !== "") {
        const name = pending.name.trim();
        settle(storeEdit(database, name, image).then((saved) => savedNote(saved.name)));
      }
    },
    cancel(): void {
      setState(undefined);
    },
  };
}
