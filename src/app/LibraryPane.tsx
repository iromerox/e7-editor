// Browsable list of stored library entries, filterable by kind, kept in step with the store, the import of .syx files from disk into it, and the loading of an entry that holds one preset into the editor.
import type { JSX } from "solid-js";
import type { LibraryDatabase, LibraryEntry, SyxImportReport } from "../store";
import type { LibraryKindFilter } from "./app-state";
import type { EntryTransfers } from "./entry-transfer";
import type { LibraryImport } from "./library-import";
import { For, Match, Show, Switch, createEffect, createMemo, onCleanup } from "solid-js";
import { LIBRARY_ENTRY_KINDS, allEntries, entriesByKind } from "../store";
import { useAppState } from "./AppStateProvider";
import { EVERY_KIND } from "./app-state";
import { EditorChip } from "./EditorChip";
import { createEntryTransfers, holdsOnePreset, loadNote, manyPresetsNote } from "./entry-transfer";
import {
  IMPORT_NOTE,
  createLibraryImport,
  failedNote,
  importedNote,
  skippedNote,
} from "./library-import";
import { KEEP_EDITING, unsavedEditsQuestion } from "./transfer";

const KIND_FILTERS: readonly LibraryKindFilter[] = [EVERY_KIND, ...LIBRARY_ENTRY_KINDS];

export interface LibraryPaneProps {
  readonly database: LibraryDatabase;
}

function capturedFrom(entry: LibraryEntry): string {
  return [
    entry.bank === undefined ? "" : `Bank ${entry.bank}`,
    entry.group === undefined ? "" : `Group ${entry.group}`,
    entry.slot === undefined ? "" : `Slot ${entry.slot}`,
  ]
    .filter((part) => part !== "")
    .join(" · ");
}

function counted(entries: readonly LibraryEntry[]): string {
  return entries.length === 1 ? "1 entry" : `${entries.length} entries`;
}

function Chip(props: { readonly children: JSX.Element }): JSX.Element {
  return (
    <span
      style={{
        border: "1px solid var(--e7-silkscreen)",
        "border-radius": "0.75rem",
        padding: "0 0.5rem",
        "font-size": "0.75rem",
        color: "var(--e7-label-secondary)",
      }}
    >
      {props.children}
    </span>
  );
}

interface ImportButtonProps {
  readonly label: string;
  readonly imports: LibraryImport;
}

function ImportButton(props: ImportButtonProps): JSX.Element {
  return (
    <button
      type="button"
      aria-label={props.label}
      title={IMPORT_NOTE}
      disabled={props.imports.state()?.status === "importing"}
      onClick={() => props.imports.start()}
    >
      Import .syx files
    </button>
  );
}

function ImportReport(props: { readonly imports: LibraryImport }): JSX.Element {
  const importing = (): boolean => props.imports.state()?.status === "importing";
  const report = (): SyxImportReport | undefined => {
    const pending = props.imports.state();
    return pending?.status === "done" ? pending.report : undefined;
  };
  const refused = (): string | undefined => {
    const pending = props.imports.state();
    return pending?.status === "failed" ? pending.reason : undefined;
  };

  return (
    <Switch>
      <Match when={importing()}>
        <p role="status" style={{ margin: "0.5rem 0 0" }}>
          Reading the files…
        </p>
      </Match>
      <Match when={report()}>
        {(found) => (
          <div
            style={{
              display: "flex",
              "flex-direction": "column",
              gap: "0.25rem",
              margin: "0.5rem 0 0",
            }}
          >
            <div
              style={{
                display: "flex",
                "align-items": "baseline",
                "flex-wrap": "wrap",
                gap: "0.5rem",
              }}
            >
              <span role="status">{importedNote(found())}</span>
              <button
                type="button"
                aria-label="Dismiss what the import reported"
                onClick={() => props.imports.dismiss()}
              >
                Dismiss
              </button>
            </div>
            <For each={found().skipped}>
              {(skip) => <span role="alert">{skippedNote(skip)}</span>}
            </For>
            <For each={found().failed}>
              {(failure) => <span role="alert">{failedNote(failure)}</span>}
            </For>
          </div>
        )}
      </Match>
      <Match when={refused()}>{(reason) => <span role="alert">{reason()}</span>}</Match>
    </Switch>
  );
}

interface EntryRowProps {
  readonly entry: LibraryEntry;
  readonly transfers: EntryTransfers;
}

function EntryRow(props: EntryRowProps): JSX.Element {
  const named = (): string => (props.entry.name === "" ? props.entry.kind : props.entry.name);
  const confirming = (): boolean => props.transfers.state(props.entry)?.status === "confirming";
  const refused = (): string | undefined => {
    const pending = props.transfers.state(props.entry);
    return pending?.status === "failed" ? pending.reason : undefined;
  };

  return (
    <li
      style={{
        display: "flex",
        "flex-direction": "column",
        gap: "0.25rem",
        padding: "0.25rem 0",
      }}
    >
      <div
        style={{ display: "flex", "align-items": "baseline", gap: "0.5rem", "flex-wrap": "wrap" }}
      >
        <span style={{ "font-weight": "bold" }}>{props.entry.name}</span>
        <Chip>{props.entry.kind}</Chip>
        <Show when={capturedFrom(props.entry) !== ""}>
          <span style={{ color: "var(--e7-label-secondary)" }}>{capturedFrom(props.entry)}</span>
        </Show>
        <For each={props.entry.tags}>{(tag) => <Chip>{tag}</Chip>}</For>
        <Show
          when={holdsOnePreset(props.entry.kind)}
          fallback={
            <span style={{ color: "var(--e7-label-secondary)" }}>
              {manyPresetsNote(props.entry.kind)}
            </span>
          }
        >
          <button
            type="button"
            aria-label={`Load ${named()} into the editor`}
            title={loadNote(props.entry.kind)}
            onClick={() => props.transfers.load(props.entry)}
          >
            Load
          </button>
        </Show>
        <Show when={props.transfers.inEditor(props.entry)}>
          <EditorChip part={props.transfers.editorPart()} />
        </Show>
      </div>
      <Switch>
        <Match when={confirming()}>
          <div
            style={{
              display: "flex",
              "align-items": "baseline",
              "flex-wrap": "wrap",
              gap: "0.5rem",
            }}
          >
            <span role="alert">{unsavedEditsQuestion(props.transfers.unsavedEdits())}</span>
            <button
              type="button"
              aria-label={`Load ${named()} anyway`}
              onClick={() => props.transfers.proceed(props.entry)}
            >
              Load anyway
            </button>
            <button
              type="button"
              aria-label={`${KEEP_EDITING}, leaving ${named()} where it is`}
              onClick={() => props.transfers.cancel(props.entry)}
            >
              {KEEP_EDITING}
            </button>
          </div>
        </Match>
        <Match when={refused()}>{(reason) => <span role="alert">{reason()}</span>}</Match>
      </Switch>
    </li>
  );
}

export function LibraryPane(props: LibraryPaneProps): JSX.Element {
  const controls = useAppState();
  const { state, selectLibraryKind, setLibraryEntries } = controls;
  const transfers = createEntryTransfers(controls);
  const imports = createLibraryImport(props.database);

  const shown = createMemo(() => {
    const selected = state.library.kind;
    return selected === EVERY_KIND
      ? allEntries(props.database)
      : entriesByKind(props.database, selected);
  });

  createEffect(() => {
    const observable = shown();
    setLibraryEntries(undefined);
    const subscription = observable.subscribe((found) => setLibraryEntries(found));
    onCleanup(() => subscription.unsubscribe());
  });

  return (
    <section
      aria-label="Library"
      style={{
        background: "var(--e7-section-background)",
        color: "var(--e7-label)",
        padding: "0.75rem",
      }}
    >
      <div style={{ display: "flex", "align-items": "baseline", gap: "0.75rem" }}>
        <h2 style={{ margin: "0" }}>Library</h2>
        <label>
          Kind{" "}
          <select
            value={state.library.kind}
            onChange={(event) => {
              const next = KIND_FILTERS.find((option) => option === event.currentTarget.value);
              if (next !== undefined) {
                selectLibraryKind(next);
              }
            }}
          >
            <For each={KIND_FILTERS}>{(option) => <option value={option}>{option}</option>}</For>
          </select>
        </label>
        <Show when={state.library.entries}>{(found) => <span>{counted(found())}</span>}</Show>
        <ImportButton label="Import .syx files into the library" imports={imports} />
      </div>
      <ImportReport imports={imports} />
      <Show when={state.library.entries} fallback={<p>Reading the library…</p>}>
        {(found) => (
          <Show
            when={found().length > 0}
            fallback={
              <Show
                when={state.library.kind === EVERY_KIND}
                fallback={
                  <p>{`No ${state.library.kind} entries in the library. Pick another kind to see the rest.`}</p>
                }
              >
                <div
                  style={{
                    display: "flex",
                    "align-items": "baseline",
                    "flex-wrap": "wrap",
                    gap: "0.5rem",
                  }}
                >
                  <p>
                    The library is empty. Import a .syx file, or save a preset from the device, to
                    fill it.
                  </p>
                  <ImportButton
                    label="Import .syx files into the empty library"
                    imports={imports}
                  />
                </div>
              </Show>
            }
          >
            <ul style={{ "list-style": "none", margin: "0.5rem 0 0", padding: "0" }}>
              <For each={found()}>
                {(entry) => <EntryRow entry={entry} transfers={transfers} />}
              </For>
            </ul>
          </Show>
        )}
      </Show>
    </section>
  );
}
