// The OUTPUT box: Master Volume, the one knob on the panel that sets an instrument level rather than a preset value.
import type { JSX } from "solid-js";
import type { ControlValue } from "./control-value";
import type { MasterVolume } from "./master-volume";
import { Knob } from "./Knob";
import { PanelSection } from "./PanelSection";

export interface OutputSectionProps {
  readonly volume: MasterVolume;
}

export const MASTER_VOLUME_DESCRIPTION =
  "Output level of the instrument, not part of any preset — loading a preset does not move it and saving one does not capture it. The instrument never reports its own level, so this follows what the editor has sent and what the panel knob reports, starting from full.";

export function OutputSection(props: OutputSectionProps): JSX.Element {
  const control = (): ControlValue => ({
    label: "Master Volume",
    description: MASTER_VOLUME_DESCRIPTION,
    value: props.volume.value(),
    onInput: (next: number) => props.volume.write(next),
  });

  return (
    <PanelSection title="OUTPUT">
      <div style={{ display: "flex", "justify-content": "center" }}>
        <Knob size="large" primary={control()} />
      </div>
    </PanelSection>
  );
}
