// The preset editor: the panel's sections over the preset in hand, sending each edit to the device and following the control changes it sends back.
import type { JSX } from "solid-js";
import type { Connection } from "../midi";
import { Match, Switch, createEffect, onCleanup } from "solid-js";
import { AmplifierSection } from "./AmplifierSection";
import { useAppState } from "./AppStateProvider";
import { ChorusSection } from "./ChorusSection";
import { DelaySection } from "./DelaySection";
import { EnvelopeSection } from "./EnvelopeSection";
import { FilterSection } from "./FilterSection";
import { createLiveEdit, targetChannel } from "./live-edit";
import { MixerSection } from "./MixerSection";
import { createMasterVolume } from "./master-volume";
import { OscillatorsSection } from "./OscillatorsSection";
import { OutputSection } from "./OutputSection";
import { PortamentoPolyphonySection } from "./PortamentoPolyphonySection";
import { VoicesSection } from "./VoicesSection";

export interface EditorPaneProps {
  readonly connection: Connection | undefined;
}

export function EditorPane(props: EditorPaneProps): JSX.Element {
  const controls = useAppState();
  const live = createLiveEdit(controls, () => props.connection);
  const volume = createMasterVolume(controls, () => props.connection);

  const channel = (): number | undefined => targetChannel(controls.state.connection.receiveChannel);

  createEffect(() => {
    const connection = props.connection;
    if (connection === undefined) {
      return;
    }
    const subscription = connection.cc.subscribe((event) => {
      if (volume.receive(event)) {
        return;
      }
      live.receive(event);
    });
    onCleanup(() => subscription.unsubscribe());
  });

  return (
    <section
      aria-label="Editor"
      style={{
        display: "flex",
        "flex-direction": "column",
        gap: "0.5rem",
        color: "var(--e7-label)",
      }}
    >
      <div style={{ display: "flex", "align-items": "baseline", gap: "0.75rem" }}>
        <h2 style={{ margin: "0" }}>Editor</h2>
        <Switch>
          <Match when={props.connection === undefined}>
            <span style={{ color: "var(--e7-label-secondary)" }}>
              Not connected — edits change the preset in the editor only.
            </span>
          </Match>
          <Match when={channel() === undefined}>
            <span role="status" style={{ color: "var(--e7-label-secondary)" }}>
              The device never reported a receive channel, so edits stay in the editor.
            </span>
          </Match>
          <Match when={channel()}>
            {(active) => (
              <span style={{ color: "var(--e7-label-secondary)" }}>
                Edits are sent on MIDI channel {active()} as they happen; saving to the library is a
                separate action.
              </span>
            )}
          </Match>
        </Switch>
      </div>
      <div
        style={{
          display: "flex",
          "flex-wrap": "wrap",
          "align-items": "flex-start",
          gap: "1rem",
        }}
      >
        <OscillatorsSection live={live} />
        <MixerSection live={live} />
        <div style={{ display: "flex", "flex-direction": "column", gap: "1rem" }}>
          <div
            style={{
              display: "flex",
              "flex-wrap": "wrap",
              "align-items": "flex-start",
              gap: "1rem",
            }}
          >
            <FilterSection live={live} />
            <AmplifierSection live={live} />
            <div style={{ display: "flex", "flex-direction": "column", gap: "1rem" }}>
              <OutputSection volume={volume} />
              <VoicesSection live={live} />
            </div>
          </div>
          <div
            style={{
              display: "flex",
              "flex-wrap": "wrap",
              "align-items": "flex-start",
              gap: "1rem",
            }}
          >
            <PortamentoPolyphonySection live={live} />
            <EnvelopeSection live={live} envelope="eg1" />
            <EnvelopeSection live={live} envelope="eg2" />
          </div>
          <div
            style={{
              display: "flex",
              "flex-wrap": "wrap",
              "align-items": "flex-start",
              gap: "1rem",
            }}
          >
            <ChorusSection live={live} />
            <DelaySection live={live} />
          </div>
        </div>
      </div>
    </section>
  );
}
