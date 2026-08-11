// Selecting a preset on the instrument: what the panel's numbered buttons do, sent as Bank Select plus Program Change.
import type { Connection } from "../midi";
import type { AppStateControls } from "./app-state";
import type { SlotAddress } from "./device-slots";
import { createSignal } from "solid-js";
import { slotProgramChange } from "./device-slots";
import { targetChannel } from "./live-edit";

export interface PresetSelection {
  readonly selected: () => SlotAddress | undefined;
  readonly reachable: () => boolean;
  readonly select: (address: SlotAddress) => void;
}

export function createPresetSelection(
  controls: AppStateControls,
  connection: () => Connection | undefined,
): PresetSelection {
  const [selected, setSelected] = createSignal<SlotAddress | undefined>(undefined);

  const channel = (): number | undefined => targetChannel(controls.state.connection.receiveChannel);

  return {
    selected,
    reachable: () => connection() !== undefined && channel() !== undefined,
    select(address: SlotAddress): void {
      const active = connection();
      const target = channel();
      if (active === undefined || target === undefined) {
        return;
      }
      active.sendProgramChange(target, slotProgramChange(address));
      setSelected(address);
    },
  };
}
