// Master Volume: the one panel knob with no preset byte behind it — an instrument level the editor sends and follows, and never saves.
import type { CcEvent, Connection } from "../midi";
import type { AppStateControls } from "./app-state";
import { VOLUME } from "../protocol";
import { targetChannel } from "./live-edit";

export interface MasterVolume {
  readonly value: () => number;
  readonly write: (value: number) => void;
  readonly receive: (event: CcEvent) => boolean;
}

export function createMasterVolume(
  controls: AppStateControls,
  connection: () => Connection | undefined,
): MasterVolume {
  return {
    value: () => controls.state.output.masterVolume,
    write(next: number): void {
      controls.setMasterVolume(next);
      const active = connection();
      const channel = targetChannel(controls.state.connection.receiveChannel);
      if (active === undefined || channel === undefined) {
        return;
      }
      active.sendControlChange(channel, VOLUME, next);
    },
    receive(event: CcEvent): boolean {
      if (event.controller !== VOLUME) {
        return false;
      }
      controls.setMasterVolume(event.value);
      return true;
    },
  };
}
