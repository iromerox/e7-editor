// The preset editor: the panel's sections over the preset in hand, sending each edit to the device and following the control changes it sends back.
import type { JSX } from "solid-js";
import type { Connection } from "../midi";
import { Match, Switch, createEffect, onCleanup } from "solid-js";
import { AmplifierSection } from "./AmplifierSection";
import { useAppState } from "./AppStateProvider";
import { ChorusSection } from "./ChorusSection";
import { DelaySection } from "./DelaySection";
import { EnvelopeSection } from "./EnvelopeSection";
import { historyShortcut } from "./edit-history";
import { FilterSection } from "./FilterSection";
import { Lfo3Section } from "./Lfo3Section";
import { LfoSection } from "./LfoSection";
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

export const UNDO_HINT = "Undo the last edit, a knob drag counting as one — Ctrl+Z or ⌘Z.";

export const REDO_HINT = "Redo the edit last undone — Ctrl+Shift+Z or ⌘⇧Z.";

const TEXT_ENTRY_TAGS: ReadonlySet<string> = new Set(["INPUT", "TEXTAREA", "SELECT"]);

function isTextEntry(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (TEXT_ENTRY_TAGS.has(target.tagName) || target.isContentEditable)
  );
}

export function EditorPane(props: EditorPaneProps): JSX.Element {
  const controls = useAppState();
  const live = createLiveEdit(controls, () => props.connection);
  const volume = createMasterVolume(controls, () => props.connection);

  const channel = (): number | undefined => targetChannel(controls.state.connection.receiveChannel);

  const onKeyDown = (event: KeyboardEvent): void => {
    if (isTextEntry(event.target)) {
      return;
    }
    const step = historyShortcut(event);
    if (step === undefined) {
      return;
    }
    event.preventDefault();
    if (step === "undo") {
      live.undo();
    } else {
      live.redo();
    }
  };

  window.addEventListener("keydown", onKeyDown);
  onCleanup(() => window.removeEventListener("keydown", onKeyDown));

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
        <div style={{ display: "flex", gap: "0.25rem" }}>
          <button type="button" title={UNDO_HINT} disabled={!live.undoable()} onClick={live.undo}>
            Undo
          </button>
          <button type="button" title={REDO_HINT} disabled={!live.redoable()} onClick={live.redo}>
            Redo
          </button>
        </div>
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
        <div
          style={{
            display: "flex",
            "flex-direction": "column",
            "align-items": "flex-start",
            gap: "1rem",
          }}
        >
          <div
            style={{
              display: "flex",
              "flex-wrap": "wrap",
              "align-items": "flex-start",
              gap: "1rem",
            }}
          >
            <LfoSection live={live} />
            <OscillatorsSection live={live} />
          </div>
          <Lfo3Section live={live} />
        </div>
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
