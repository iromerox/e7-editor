// Full-library backup and restore through RxDB's JSON dump, and the file the user saves it as and reads it back from.
import type { LibraryDatabase } from "./database";
import type { FilePickerType } from "./file-dialog";
import type { LibraryEntry } from "./schema";
import { addRxPlugin } from "rxdb";
import { RxDBJsonDumpPlugin } from "rxdb/plugins/json-dump";
import { IncompatibleBackupError, LibraryNotEmptyError, MalformedBackupError } from "./errors";
import { pickFiles, saveFile } from "./file-dialog";
import { LIBRARY_ENTRY_KINDS, LIBRARY_ENTRY_SCHEMA_VERSION, LIBRARY_ENTRY_SOURCES } from "./schema";

addRxPlugin(RxDBJsonDumpPlugin);

export const LIBRARY_BACKUP_FORMAT = "e7-editor-library-backup";
export const LIBRARY_BACKUP_FORMAT_VERSION = 1;
export const LIBRARY_BACKUP_FILE_EXTENSION = ".json";
export const LIBRARY_BACKUP_MEDIA_TYPE = "application/json";

export interface LibraryBackupCollection {
  readonly name: string;
  readonly schemaHash: string;
  readonly docs: readonly LibraryEntry[];
}

export interface LibraryBackupDump {
  readonly name: string;
  readonly instanceToken: string;
  readonly collections: readonly LibraryBackupCollection[];
}

export interface LibraryBackup {
  readonly format: typeof LIBRARY_BACKUP_FORMAT;
  readonly formatVersion: number;
  readonly schemaVersion: number;
  readonly createdAt: string;
  readonly dump: LibraryBackupDump;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isVersion(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

function isSlotNumber(value: unknown): boolean {
  return value === undefined || (typeof value === "number" && Number.isInteger(value));
}

function isEntry(value: unknown): value is LibraryEntry {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.name === "string" &&
    typeof value.comment === "string" &&
    typeof value.capturedAt === "string" &&
    typeof value.sysex === "string" &&
    typeof value.sha256 === "string" &&
    /^[0-9a-f]{64}$/.test(value.sha256) &&
    LIBRARY_ENTRY_KINDS.some((kind) => kind === value.kind) &&
    LIBRARY_ENTRY_SOURCES.some((source) => source === value.source) &&
    Array.isArray(value.tags) &&
    value.tags.every((tag: unknown) => typeof tag === "string") &&
    isSlotNumber(value.bank) &&
    isSlotNumber(value.group) &&
    isSlotNumber(value.slot) &&
    (value.snapshot === undefined || isRecord(value.snapshot))
  );
}

function isCollection(value: unknown): value is LibraryBackupCollection {
  return (
    isRecord(value) &&
    typeof value.name === "string" &&
    typeof value.schemaHash === "string" &&
    Array.isArray(value.docs) &&
    value.docs.every(isEntry)
  );
}

function isDump(value: unknown): value is LibraryBackupDump {
  return (
    isRecord(value) &&
    typeof value.name === "string" &&
    typeof value.instanceToken === "string" &&
    Array.isArray(value.collections) &&
    value.collections.every(isCollection)
  );
}

export function parseLibraryBackup(value: unknown): LibraryBackup {
  if (!isRecord(value)) {
    throw new MalformedBackupError("it does not hold a JSON object");
  }
  if (value.format !== LIBRARY_BACKUP_FORMAT) {
    throw new MalformedBackupError(`its format marker is ${JSON.stringify(value.format)}`);
  }
  if (!isVersion(value.formatVersion) || !isVersion(value.schemaVersion)) {
    throw new MalformedBackupError("its version markers are missing or not whole numbers");
  }
  if (typeof value.createdAt !== "string") {
    throw new MalformedBackupError("it carries no capture time");
  }
  if (value.formatVersion !== LIBRARY_BACKUP_FORMAT_VERSION) {
    throw new IncompatibleBackupError(
      "formatVersion",
      LIBRARY_BACKUP_FORMAT_VERSION,
      value.formatVersion,
    );
  }
  if (value.schemaVersion !== LIBRARY_ENTRY_SCHEMA_VERSION) {
    throw new IncompatibleBackupError(
      "schemaVersion",
      LIBRARY_ENTRY_SCHEMA_VERSION,
      value.schemaVersion,
    );
  }
  if (!isDump(value.dump)) {
    throw new MalformedBackupError("its collections are missing or hold unreadable entries");
  }
  return {
    format: LIBRARY_BACKUP_FORMAT,
    formatVersion: value.formatVersion,
    schemaVersion: value.schemaVersion,
    createdAt: value.createdAt,
    dump: value.dump,
  };
}

export async function exportLibrary(database: LibraryDatabase): Promise<LibraryBackup> {
  return {
    format: LIBRARY_BACKUP_FORMAT,
    formatVersion: LIBRARY_BACKUP_FORMAT_VERSION,
    schemaVersion: LIBRARY_ENTRY_SCHEMA_VERSION,
    createdAt: new Date().toISOString(),
    dump: await database.exportJSON(),
  };
}

export async function importLibrary(database: LibraryDatabase, value: unknown): Promise<void> {
  const backup = parseLibraryBackup(value);
  const entries = await database.entries.count().exec();
  if (entries > 0) {
    throw new LibraryNotEmptyError(entries);
  }
  await database.importJSON({
    name: backup.dump.name,
    instanceToken: backup.dump.instanceToken,
    passwordHash: null,
    collections: backup.dump.collections.map((collection) => ({
      name: collection.name,
      schemaHash: collection.schemaHash,
      docs: [...collection.docs],
    })),
  });
}

export function backupEntryCount(backup: LibraryBackup): number {
  return backup.dump.collections.reduce((total, collection) => total + collection.docs.length, 0);
}

const DATE_STAMP_LENGTH = 10;

export function libraryBackupFileName(createdAt: string): string {
  return `e7-library-${createdAt.slice(0, DATE_STAMP_LENGTH)}${LIBRARY_BACKUP_FILE_EXTENSION}`;
}

const BACKUP_PICKER_TYPES: readonly FilePickerType[] = [
  {
    description: "e7 library backup",
    accept: { [LIBRARY_BACKUP_MEDIA_TYPE]: [LIBRARY_BACKUP_FILE_EXTENSION] },
  },
];

const BACKUP_JSON_INDENT = 2;

export interface LibraryBackupFile {
  readonly fileName: string;
  readonly entries: number;
}

export async function backupLibraryToDisk(
  database: LibraryDatabase,
): Promise<LibraryBackupFile | undefined> {
  const backup = await exportLibrary(database);
  const fileName = libraryBackupFileName(backup.createdAt);
  const bytes = new TextEncoder().encode(JSON.stringify(backup, undefined, BACKUP_JSON_INDENT));
  const written = await saveFile(bytes, {
    fileName,
    mediaType: LIBRARY_BACKUP_MEDIA_TYPE,
    types: BACKUP_PICKER_TYPES,
  });
  return written ? { fileName, entries: backupEntryCount(backup) } : undefined;
}

function readBackupJson(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new MalformedBackupError("it does not hold readable JSON");
  }
}

export async function restoreLibraryFromDisk(
  database: LibraryDatabase,
): Promise<LibraryBackupFile | undefined> {
  const stored = await database.entries.count().exec();
  if (stored > 0) {
    throw new LibraryNotEmptyError(stored);
  }
  const [file] = await pickFiles({
    types: BACKUP_PICKER_TYPES,
    accept: `${LIBRARY_BACKUP_FILE_EXTENSION},${LIBRARY_BACKUP_MEDIA_TYPE}`,
    multiple: false,
  });
  if (file === undefined) {
    return undefined;
  }
  const backup = parseLibraryBackup(readBackupJson(await file.text()));
  await importLibrary(database, backup);
  return { fileName: file.name, entries: backupEntryCount(backup) };
}
