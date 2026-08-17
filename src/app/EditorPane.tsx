// The preset editor: the panel's sections over the preset in hand, sending each edit to the device and following the control changes it sends back.
import type { JSX } from "solid-js";
import type { Connection } from "../midi";
import type { LibraryDatabase } from "../store";
import type { EditorSave, EditorSaveState, SaveDestination } from "./editor-save";
import { Match, Switch, createEffect, onCleanup } from "solid-js";
import { ENTRY_NAME_MAX_LENGTH } from "../store";
import { AmplifierSection } from "./AmplifierSection";
import { useAppState } from "./AppStateProvider";
import { ChorusSection } from "./ChorusSection";
import { DelaySection } from "./DelaySection";
import { slotLabel } from "./device-slots";
import { EnvelopeSection } from "./EnvelopeSection";
import { historyShortcut } from "./edit-history";
import { SAVE_AS_NEW_NOTE, SAVE_OVER_NOTE, createEditorSave } from "./editor-save";
import { FilterSection } from "./FilterSection";
import { Lfo3Section } from "./Lfo3Section";
import { LfoSection } from "./LfoSection";
import { createLiveEdit, targetChannel } from "./live-edit";
import { MixerSection } from "./MixerSection";
import { createMasterVolume } from "./master-volume";
import { OscillatorsSection } from "./OscillatorsSection";
import { OutputSection } from "./OutputSection";
import { PortamentoPolyphonySection } from "./PortamentoPolyphonySection";
import { KEEP_STORED, overwriteQuestion } from "./transfer";
import { VoicesSection } from "./VoicesSection";

export interface EditorPaneProps {
  readonly connection: Connection | undefined;
  readonly database: LibraryDatabase;
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

const SAVE_ROW_STYLE = {
  display: "flex",
  "align-items": "baseline",
  "flex-wrap": "wrap",
  gap: "0.5rem",
} as const;

function StoredChip(props: { readonly name: string; readonly differs: boolean }): JSX.Element {
  return (
    <span
      role="status"
      style={{
        border: `1px solid ${props.differs ? "var(--e7-led-on)" : "var(--e7-silkscreen)"}`,
        background: props.differs ? "var(--e7-led-halo)" : "transparent",
        "border-radius": "0.75rem",
        padding: "0 0.5rem",
        "font-size": "0.75rem",
        color: props.differs ? "var(--e7-led-on)" : "var(--e7-label-secondary)",
      }}
    >
      {props.differs ? `Differs from “${props.name}”` : `Matches “${props.name}”`}
    </span>
  );
}

function SaveAsNewButton(props: { readonly save: EditorSave }): JSX.Element {
  return (
    <button
      type="button"
      aria-label="Save as a new library entry"
      title={SAVE_AS_NEW_NOTE}
      onClick={props.save.saveAsNew}
    >
      Save as new
    </button>
  );
}

function SaveBar(props: { readonly save: EditorSave }): JSX.Element {
  const place = (): SaveDestination => props.save.destination();
  const entry = (): Extract<SaveDestination, { kind: "Entry" }> | undefined => {
    const found = place();
    return found.kind === "Entry" ? found : undefined;
  };
  const slot = (): Extract<SaveDestination, { kind: "Slot" }> | undefined => {
    const found = place();
    return found.kind === "Slot" ? found : undefined;
  };
  const refused = (): string | undefined => {
    const found = place();
    return found.kind === "None" ? found.reason : undefined;
  };
  const pending = (): EditorSaveState | undefined => props.save.state();
  const naming = (): string | undefined => {
    const current = pending();
    return current?.status === "naming" ? current.name : undefined;
  };
  const done = (): string | undefined => {
    const current = pending();
    return current?.status === "done" ? current.note : undefined;
  };
  const failed = (): string | undefined => {
    const current = pending();
    return current?.status === "failed" ? current.reason : undefined;
  };

  return (
    <div style={{ display: "flex", "flex-direction": "column", gap: "0.25rem" }}>
      <div style={SAVE_ROW_STYLE}>
        <Switch>
          <Match when={place().kind === "Reading"}>
            <span>Reading the library…</span>
          </Match>
          <Match when={entry()}>
            {(found) => (
              <>
                <span>Loaded from “{found().entry.name}”.</span>
                <StoredChip name={found().entry.name} differs={props.save.differs() === true} />
                <button
                  type="button"
                  aria-label={`Save over ${found().entry.name} in the library`}
                  title={SAVE_OVER_NOTE}
                  disabled={props.save.differs() !== true}
                  onClick={props.save.saveOver}
                >
                  Save
                </button>
                <SaveAsNewButton save={props.save} />
              </>
            )}
          </Match>
          <Match when={slot()}>
            {(found) => (
              <>
                <span>
                  Loaded from {found().address.kind} {slotLabel(found().address)}, which the library
                  does not hold.
                </span>
                <SaveAsNewButton save={props.save} />
              </>
            )}
          </Match>
          <Match when={refused()}>{(reason) => <span>{reason()}</span>}</Match>
        </Switch>
      </div>
      <Switch>
        <Match when={naming() !== undefined}>
          <div style={SAVE_ROW_STYLE}>
            <label>
              Name{" "}
              <input
                type="text"
                value={naming() ?? ""}
                maxlength={ENTRY_NAME_MAX_LENGTH}
                onInput={(event) => props.save.rename(event.currentTarget.value)}
              />
            </label>
            <button
              type="button"
              aria-label="Save the new library entry"
              disabled={(naming() ?? "").trim() === ""}
              onClick={props.save.proceed}
            >
              Save
            </button>
            <button type="button" aria-label="Cancel saving as new" onClick={props.save.cancel}>
              Cancel
            </button>
          </div>
        </Match>
        <Match when={pending()?.status === "confirming" && entry()}>
          {(found) => (
            <div style={SAVE_ROW_STYLE}>
              <span role="alert">{overwriteQuestion(found().entry.name)}</span>
              <button
                type="button"
                aria-label={`Save over ${found().entry.name} anyway`}
                onClick={props.save.proceed}
              >
                Save anyway
              </button>
              <button
                type="button"
                aria-label={`${KEEP_STORED}, leaving ${found().entry.name} as it is`}
                onClick={props.save.cancel}
              >
                {KEEP_STORED}
              </button>
            </div>
          )}
        </Match>
        <Match when={pending()?.status === "saving"}>
          <span role="status">Saving…</span>
        </Match>
        <Match when={done()}>{(note) => <span role="status">{note()}</span>}</Match>
        <Match when={failed()}>{(reason) => <span role="alert">{reason()}</span>}</Match>
      </Switch>
    </div>
  );
}

export function EditorPane(props: EditorPaneProps): JSX.Element {
  const controls = useAppState();
  const live = createLiveEdit(controls, () => props.connection);
  const volume = createMasterVolume(controls, () => props.connection);
  const save = createEditorSave(controls, props.database);

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
      <SaveBar save={save} />
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
