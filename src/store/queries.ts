// Reactive views over the library collection, in the form src/app subscribes to.
import type { MangoQuery } from "rxdb";
import type { Observable } from "rxjs";
import type { LibraryDatabase } from "./database";
import type { LibraryEntry, LibraryEntryKind } from "./schema";
import { map } from "rxjs";

function observeEntries(
  database: LibraryDatabase,
  query: MangoQuery<LibraryEntry>,
): Observable<readonly LibraryEntry[]> {
  return database.entries
    .find(query)
    .$.pipe(map((documents) => documents.map((document) => document.toJSON())));
}

export function allEntries(database: LibraryDatabase): Observable<readonly LibraryEntry[]> {
  return observeEntries(database, { sort: [{ capturedAt: "asc" }] });
}

export function entriesByKind(
  database: LibraryDatabase,
  kind: LibraryEntryKind,
): Observable<readonly LibraryEntry[]> {
  return observeEntries(database, {
    selector: { kind },
    sort: [{ kind: "asc" }, { capturedAt: "asc" }],
  });
}

export function entriesInGroup(
  database: LibraryDatabase,
  bank: number,
  group: number,
): Observable<readonly LibraryEntry[]> {
  return observeEntries(database, {
    selector: { bank, group },
    sort: [{ capturedAt: "asc" }],
  });
}

export function entryById(
  database: LibraryDatabase,
  id: string,
): Observable<LibraryEntry | undefined> {
  return database.entries.findOne(id).$.pipe(map((document) => document?.toJSON()));
}

export function entryCount(database: LibraryDatabase): Observable<number> {
  return database.entries.count().$;
}
