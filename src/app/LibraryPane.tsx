// Browsable list of stored library entries, filterable by kind, kept in step with the store, the import of .syx files from disk into it, the export of an entry back out to one, the editing of what the library stores about one, the deletion of one from the library, the backup of the whole library to a file and its restore from one, and the loading of an entry that holds one preset into the editor.
import type { JSX } from "solid-js";
import type { LibraryDatabase, LibraryEntry, SyxImportReport } from "../store";
import type { LibraryKindFilter } from "./app-state";
import type { EntryMetadataEdits, MetadataDraft } from "./entry-metadata";
import type { EntryRemovals } from "./entry-removal";
import type { EntryTransfers } from "./entry-transfer";
import type { LibraryBackups } from "./library-backup";
import type { LibraryExports } from "./library-export";
import type { LibraryImport } from "./library-import";
import {
  For,
  Match,
  Show,
  Switch,
  createEffect,
  createMemo,
  createSignal,
  onCleanup,
} from "solid-js";
import {
  ENTRY_COMMENT_MAX_LENGTH,
  ENTRY_NAME_MAX_LENGTH,
  LIBRARY_ENTRY_KINDS,
  allEntries,
  entriesByKind,
  entryCount,
} from "../store";
import { useAppState } from "./AppStateProvider";
import { EVERY_KIND } from "./app-state";
import { EditorChip } from "./EditorChip";
import { EDIT_NOTE, createEntryMetadataEdits, entryLabel } from "./entry-metadata";
import { DELETE_NOTE, KEEP_ENTRY, createEntryRemovals, deleteQuestion } from "./entry-removal";
import { createEntryTransfers, holdsOnePreset, loadNote, manyPresetsNote } from "./entry-transfer";
import { BACKUP_NOTE, RESTORE_NOTE, createLibraryBackups } from "./library-backup";
import { EXPORT_NOTE, createLibraryExports } from "./library-export";
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

function BackupReport(props: { readonly backups: LibraryBackups }): JSX.Element {
  const running = (): string | undefined => {
    const pending = props.backups.state();
    if (pending?.status === "backing-up") {
      return "Writing the backup file…";
    }
    return pending?.status === "restoring" ? "Reading the backup file…" : undefined;
  };
  const reported = (): string | undefined => {
    const pending = props.backups.state();
    return pending?.status === "done" ? pending.note : undefined;
  };
  const refused = (): string | undefined => {
    const pending = props.backups.state();
    return pending?.status === "failed" ? pending.reason : undefined;
  };

  return (
    <Switch>
      <Match when={running()}>
        {(note) => (
          <p role="status" style={{ margin: "0.5rem 0 0" }}>
            {note()}
          </p>
        )}
      </Match>
      <Match when={reported()}>
        {(note) => (
          <div
            style={{
              display: "flex",
              "align-items": "baseline",
              "flex-wrap": "wrap",
              gap: "0.5rem",
              margin: "0.5rem 0 0",
            }}
          >
            <span role="status">{note()}</span>
            <button
              type="button"
              aria-label="Dismiss what the backup reported"
              onClick={() => props.backups.dismiss()}
            >
              Dismiss
            </button>
          </div>
        )}
      </Match>
      <Match when={refused()}>
        {(reason) => (
          <p role="alert" style={{ margin: "0.5rem 0 0" }}>
            {reason()}
          </p>
        )}
      </Match>
    </Switch>
  );
}

interface MetadataFormProps {
  readonly entry: LibraryEntry;
  readonly named: string;
  readonly draft: MetadataDraft;
  readonly metadata: EntryMetadataEdits;
}

function MetadataForm(props: MetadataFormProps): JSX.Element {
  const saving = (): boolean => props.metadata.state(props.entry)?.status === "saving";

  return (
    <div
      style={{
        display: "flex",
        "flex-direction": "column",
        gap: "0.25rem",
        padding: "0.25rem 0 0",
      }}
    >
      <label>
        Name{" "}
        <input
          type="text"
          aria-label={`Name of ${props.named}`}
          value={props.draft.name}
          maxlength={ENTRY_NAME_MAX_LENGTH}
          onInput={(event) => props.metadata.edit(props.entry, "name", event.currentTarget.value)}
        />
      </label>
      <label>
        Tags{" "}
        <input
          type="text"
          aria-label={`Tags of ${props.named}, separated by commas`}
          title="Separate tags with commas. Blank and repeated tags are dropped."
          value={props.draft.tags}
          onInput={(event) => props.metadata.edit(props.entry, "tags", event.currentTarget.value)}
        />
      </label>
      <label style={{ display: "flex", "flex-direction": "column", gap: "0.25rem" }}>
        Comment
        <textarea
          aria-label={`Comment on ${props.named}`}
          rows={3}
          value={props.draft.comment}
          maxlength={ENTRY_COMMENT_MAX_LENGTH}
          onInput={(event) =>
            props.metadata.edit(props.entry, "comment", event.currentTarget.value)
          }
        />
      </label>
      <div style={{ display: "flex", "align-items": "baseline", gap: "0.5rem" }}>
        <button
          type="button"
          aria-label={`Save what the library stores about ${props.named}`}
          disabled={saving() || props.draft.name.trim() === ""}
          onClick={() => props.metadata.save(props.entry)}
        >
          Save
        </button>
        <button
          type="button"
          aria-label={`Stop editing ${props.named}, keeping what the library stores`}
          onClick={() => props.metadata.cancel(props.entry)}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

interface EntryRowProps {
  readonly entry: LibraryEntry;
  readonly transfers: EntryTransfers;
  readonly exports: LibraryExports;
  readonly metadata: EntryMetadataEdits;
  readonly removals: EntryRemovals;
}

function EntryRow(props: EntryRowProps): JSX.Element {
  const named = (): string => entryLabel(props.entry);
  const confirming = (): boolean => props.transfers.state(props.entry)?.status === "confirming";
  const refused = (): string | undefined => {
    const pending = props.transfers.state(props.entry);
    return pending?.status === "failed" ? pending.reason : undefined;
  };
  const exported = (): string | undefined => {
    const pending = props.exports.state(props.entry);
    return pending?.status === "done" ? pending.note : undefined;
  };
  const exportRefused = (): string | undefined => {
    const pending = props.exports.state(props.entry);
    return pending?.status === "failed" ? pending.reason : undefined;
  };
  const saved = (): string | undefined => {
    const pending = props.metadata.state(props.entry);
    return pending?.status === "done" ? pending.note : undefined;
  };
  const saveRefused = (): string | undefined => {
    const pending = props.metadata.state(props.entry);
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
        <button
          type="button"
          aria-label={`Export ${named()} to a .syx file`}
          title={EXPORT_NOTE}
          disabled={props.exports.state(props.entry)?.status === "saving"}
          onClick={() => props.exports.save(props.entry)}
        >
          Export
        </button>
        <button
          type="button"
          aria-label={`Edit what the library stores about ${named()}`}
          title={EDIT_NOTE}
          disabled={props.metadata.draft(props.entry) !== undefined}
          onClick={() => props.metadata.start(props.entry)}
        >
          Edit
        </button>
        <button
          type="button"
          aria-label={`Delete ${named()} from the library`}
          title={DELETE_NOTE}
          disabled={props.removals.state(props.entry) !== undefined}
          onClick={() => props.removals.ask(props.entry)}
        >
          Delete
        </button>
        <Show when={props.transfers.inEditor(props.entry)}>
          <EditorChip part={props.transfers.editorPart()} />
        </Show>
      </div>
      <Show when={props.entry.comment !== ""}>
        <p style={{ margin: "0", color: "var(--e7-label-secondary)" }}>{props.entry.comment}</p>
      </Show>
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
      <Show when={props.removals.state(props.entry)?.status === "confirming"}>
        <div
          style={{
            display: "flex",
            "align-items": "baseline",
            "flex-wrap": "wrap",
            gap: "0.5rem",
          }}
        >
          <span role="alert">{deleteQuestion(named())}</span>
          <button
            type="button"
            aria-label={`Delete ${named()} for good`}
            onClick={() => props.removals.proceed(props.entry)}
          >
            Delete
          </button>
          <button
            type="button"
            aria-label={`${KEEP_ENTRY}, leaving ${named()} in the library`}
            onClick={() => props.removals.cancel(props.entry)}
          >
            {KEEP_ENTRY}
          </button>
        </div>
      </Show>
      <Switch>
        <Match when={exported()}>{(note) => <span role="status">{note()}</span>}</Match>
        <Match when={exportRefused()}>{(reason) => <span role="alert">{reason()}</span>}</Match>
      </Switch>
      <Switch>
        <Match when={saved()}>{(note) => <span role="status">{note()}</span>}</Match>
        <Match when={saveRefused()}>{(reason) => <span role="alert">{reason()}</span>}</Match>
      </Switch>
      <Show when={props.metadata.draft(props.entry)}>
        {(draft) => (
          <MetadataForm
            entry={props.entry}
            named={named()}
            draft={draft()}
            metadata={props.metadata}
          />
        )}
      </Show>
    </li>
  );
}

export function LibraryPane(props: LibraryPaneProps): JSX.Element {
  const controls = useAppState();
  const { state, selectLibraryKind, setLibraryEntries } = controls;
  const transfers = createEntryTransfers(controls);
  const imports = createLibraryImport(props.database);
  const exports = createLibraryExports();
  const metadata = createEntryMetadataEdits(props.database);
  const removals = createEntryRemovals(controls, props.database);
  const backups = createLibraryBackups(props.database);

  const [stored, setStored] = createSignal<number | undefined>();
  const counting = entryCount(props.database).subscribe((count) => setStored(count));
  onCleanup(() => counting.unsubscribe());

  const deleted = (): string | undefined => {
    const reported = removals.outcome();
    return reported?.status === "done" ? reported.note : undefined;
  };
  const deleteRefused = (): string | undefined => {
    const reported = removals.outcome();
    return reported?.status === "failed" ? reported.reason : undefined;
  };

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
        <Show when={(stored() ?? 0) > 0}>
          <button
            type="button"
            aria-label="Back the library up to a file"
            title={BACKUP_NOTE}
            disabled={backups.running()}
            onClick={() => backups.backUp()}
          >
            Back up library
          </button>
        </Show>
      </div>
      <ImportReport imports={imports} />
      <BackupReport backups={backups} />
      <Switch>
        <Match when={deleted()}>
          {(note) => (
            <p role="status" style={{ margin: "0.5rem 0 0" }}>
              {note()}
            </p>
          )}
        </Match>
        <Match when={deleteRefused()}>
          {(reason) => (
            <p role="alert" style={{ margin: "0.5rem 0 0" }}>
              {reason()}
            </p>
          )}
        </Match>
      </Switch>
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
                    The library is empty. Import a .syx file, restore a backup, or save a preset
                    from the device, to fill it.
                  </p>
                  <ImportButton
                    label="Import .syx files into the empty library"
                    imports={imports}
                  />
                  <button
                    type="button"
                    aria-label="Restore the library from a backup file"
                    title={RESTORE_NOTE}
                    disabled={backups.running()}
                    onClick={() => backups.restore()}
                  >
                    Restore backup
                  </button>
                </div>
              </Show>
            }
          >
            <ul style={{ "list-style": "none", margin: "0.5rem 0 0", padding: "0" }}>
              <For each={found()}>
                {(entry) => (
                  <EntryRow
                    entry={entry}
                    transfers={transfers}
                    exports={exports}
                    metadata={metadata}
                    removals={removals}
                  />
                )}
              </For>
            </ul>
          </Show>
        )}
      </Show>
    </section>
  );
}
