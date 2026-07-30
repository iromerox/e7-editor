// Creation of the IndexedDB-backed database holding the library collection.
import type { RxCollection, RxDatabase, RxDatabaseCreator } from "rxdb";
import type { LibraryEntry } from "./schema";
import { addRxPlugin, createRxDatabase } from "rxdb";
import { RxDBMigrationSchemaPlugin } from "rxdb/plugins/migration-schema";
import { getRxStorageDexie } from "rxdb/plugins/storage-dexie";
import { LIBRARY_ENTRY_MIGRATIONS, LIBRARY_ENTRY_SCHEMA } from "./schema";

addRxPlugin(RxDBMigrationSchemaPlugin);

export const LIBRARY_DATABASE_NAME = "e7-library";

export type LibraryEntryCollection = RxCollection<LibraryEntry>;

export interface LibraryCollections {
  readonly entries: LibraryEntryCollection;
}

export type LibraryDatabase = RxDatabase<LibraryCollections>;

export interface LibraryDatabaseOptions {
  readonly name?: string;
  readonly storage?: RxDatabaseCreator["storage"];
}

export async function createLibraryDatabase(
  options: LibraryDatabaseOptions = {},
): Promise<LibraryDatabase> {
  const database = await createRxDatabase<LibraryCollections>({
    name: options.name ?? LIBRARY_DATABASE_NAME,
    storage: options.storage ?? getRxStorageDexie(),
    multiInstance: true,
    eventReduce: true,
  });

  await database.addCollections({
    entries: {
      schema: LIBRARY_ENTRY_SCHEMA,
      migrationStrategies: LIBRARY_ENTRY_MIGRATIONS,
    },
  });

  return database;
}
