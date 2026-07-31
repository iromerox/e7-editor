// Browsable list of stored library entries, filterable by kind and kept in step with the store.
import type { JSX } from "solid-js";
import type { LibraryDatabase, LibraryEntry, LibraryEntryKind } from "../store";
import { For, Show, createEffect, createMemo, createSignal, onCleanup } from "solid-js";
import { LIBRARY_ENTRY_KINDS, allEntries, entriesByKind } from "../store";

const EVERY_KIND = "All kinds";

type KindFilter = LibraryEntryKind | typeof EVERY_KIND;

const KIND_FILTERS: readonly KindFilter[] = [EVERY_KIND, ...LIBRARY_ENTRY_KINDS];

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

function EntryRow(props: { readonly entry: LibraryEntry }): JSX.Element {
  return (
    <li
      style={{
        display: "flex",
        "align-items": "baseline",
        gap: "0.5rem",
        "flex-wrap": "wrap",
        padding: "0.25rem 0",
      }}
    >
      <span style={{ "font-weight": "bold" }}>{props.entry.name}</span>
      <Chip>{props.entry.kind}</Chip>
      <Show when={capturedFrom(props.entry) !== ""}>
        <span style={{ color: "var(--e7-label-secondary)" }}>{capturedFrom(props.entry)}</span>
      </Show>
      <For each={props.entry.tags}>{(tag) => <Chip>{tag}</Chip>}</For>
    </li>
  );
}

export function LibraryPane(props: LibraryPaneProps): JSX.Element {
  const [kind, setKind] = createSignal<KindFilter>(EVERY_KIND);
  const [entries, setEntries] = createSignal<readonly LibraryEntry[]>();

  const shown = createMemo(() => {
    const selected = kind();
    return selected === EVERY_KIND
      ? allEntries(props.database)
      : entriesByKind(props.database, selected);
  });

  createEffect(() => {
    const observable = shown();
    setEntries(undefined);
    const subscription = observable.subscribe((found) => setEntries(found));
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
            value={kind()}
            onChange={(event) => {
              const next = KIND_FILTERS.find((option) => option === event.currentTarget.value);
              if (next !== undefined) {
                setKind(next);
              }
            }}
          >
            <For each={KIND_FILTERS}>{(option) => <option value={option}>{option}</option>}</For>
          </select>
        </label>
        <Show when={entries()}>{(found) => <span>{counted(found())}</span>}</Show>
      </div>
      <Show when={entries()} fallback={<p>Reading the library…</p>}>
        {(found) => (
          <Show
            when={found().length > 0}
            fallback={
              <p>
                <Show
                  when={kind() === EVERY_KIND}
                  fallback={`No ${kind()} entries in the library. Pick another kind to see the rest.`}
                >
                  The library is empty. Import a .syx file, or save a preset from the device, to
                  fill it.
                </Show>
              </p>
            }
          >
            <ul style={{ "list-style": "none", margin: "0.5rem 0 0", padding: "0" }}>
              <For each={found()}>{(entry) => <EntryRow entry={entry} />}</For>
            </ul>
          </Show>
        )}
      </Show>
    </section>
  );
}
