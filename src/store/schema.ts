// Collection schema and migration strategies for stored library entries.
import type { MigrationStrategies, RxJsonSchema } from "rxdb";
import type { MultiPreset, SinglePreset } from "../protocol";

export const LIBRARY_ENTRY_KINDS = [
  "Single",
  "Multi",
  "Group",
  "Bank",
  "MultiPack",
  "Backup",
] as const;

export type LibraryEntryKind = (typeof LIBRARY_ENTRY_KINDS)[number];

export const LIBRARY_ENTRY_SOURCES = ["DeviceDump", "UserImport", "Edit"] as const;

export type LibraryEntrySource = (typeof LIBRARY_ENTRY_SOURCES)[number];

export const ENTRY_NAME_MAX_LENGTH = 64;

type JsonSafe<Value> = Value extends Uint8Array
  ? readonly number[]
  : Value extends object
    ? { readonly [Field in keyof Value]: JsonSafe<Value[Field]> }
    : Value;

export type PresetSnapshot = JsonSafe<SinglePreset> | JsonSafe<MultiPreset>;

export interface LibraryEntry {
  readonly id: string;
  readonly kind: LibraryEntryKind;
  readonly name: string;
  readonly bank?: number;
  readonly group?: number;
  readonly slot?: number;
  readonly capturedAt: string;
  readonly source: LibraryEntrySource;
  readonly tags: readonly string[];
  readonly comment: string;
  readonly sha256: string;
  readonly sysex: string;
  readonly snapshot?: PresetSnapshot;
}

export type LibraryEntryV0 = Omit<LibraryEntry, "tags">;

export const LIBRARY_ENTRY_SCHEMA_VERSION = 1;

export const LIBRARY_ENTRY_SCHEMA: RxJsonSchema<LibraryEntry> = {
  title: "e7 library entry",
  version: LIBRARY_ENTRY_SCHEMA_VERSION,
  primaryKey: "id",
  type: "object",
  properties: {
    id: { type: "string", maxLength: 64 },
    kind: { type: "string", enum: [...LIBRARY_ENTRY_KINDS], maxLength: 16 },
    name: { type: "string", maxLength: ENTRY_NAME_MAX_LENGTH },
    bank: { type: "integer", minimum: 1, maximum: 8, multipleOf: 1 },
    group: { type: "integer", minimum: 1, maximum: 8, multipleOf: 1 },
    slot: { type: "integer", minimum: 1, maximum: 8, multipleOf: 1 },
    capturedAt: { type: "string", format: "date-time", maxLength: 24 },
    source: { type: "string", enum: [...LIBRARY_ENTRY_SOURCES], maxLength: 16 },
    tags: { type: "array", items: { type: "string", maxLength: 64 }, uniqueItems: true },
    comment: { type: "string" },
    sha256: { type: "string", minLength: 64, maxLength: 64, pattern: "^[0-9a-f]{64}$" },
    sysex: { type: "string" },
    snapshot: { type: "object" },
  },
  required: ["id", "kind", "name", "capturedAt", "source", "tags", "comment", "sha256", "sysex"],
  indexes: ["capturedAt", "sha256", ["kind", "capturedAt"]],
} as const;

export const LIBRARY_ENTRY_MIGRATIONS: MigrationStrategies<LibraryEntry> = {
  1: (previous: LibraryEntryV0) => ({ ...previous, tags: [] }),
};
