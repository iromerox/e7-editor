import type { RxJsonSchema } from "rxdb";
import type { LibraryEntry } from "./schema";
import { checkSchema } from "rxdb/plugins/dev-mode";
import { describe, expect, it } from "vitest";
import {
  LIBRARY_ENTRY_MIGRATIONS,
  LIBRARY_ENTRY_SCHEMA,
  LIBRARY_ENTRY_SCHEMA_VERSION,
} from "./schema";

describe("LIBRARY_ENTRY_SCHEMA", () => {
  it("passes RxDB's own schema checks", () => {
    expect(() => checkSchema(LIBRARY_ENTRY_SCHEMA)).not.toThrow();
  });

  it("declares a string primary key that every entry carries", () => {
    expect(LIBRARY_ENTRY_SCHEMA.primaryKey).toBe("id");
    expect(LIBRARY_ENTRY_SCHEMA.properties.id.type).toBe("string");
    expect(LIBRARY_ENTRY_SCHEMA.required).toContain("id");
  });

  it("marks the identifying and provenance fields required", () => {
    expect(LIBRARY_ENTRY_SCHEMA.required).toEqual([
      "id",
      "kind",
      "name",
      "capturedAt",
      "source",
      "tags",
      "comment",
      "sha256",
      "sysex",
    ]);
  });

  it("leaves the slot components optional, since a Bank or Backup has no single slot", () => {
    for (const field of ["bank", "group", "slot"] as const) {
      expect(LIBRARY_ENTRY_SCHEMA.required).not.toContain(field);
    }
  });

  it("rejects a schema whose indexed field has no length bound", () => {
    const unbounded: RxJsonSchema<LibraryEntry> = {
      ...LIBRARY_ENTRY_SCHEMA,
      properties: {
        ...LIBRARY_ENTRY_SCHEMA.properties,
        sha256: { type: "string" },
      },
    };

    expect(() => checkSchema(unbounded)).toThrow();
  });

  it("has a migration strategy for every version above the initial one", () => {
    const versions = Object.keys(LIBRARY_ENTRY_MIGRATIONS).map(Number);

    expect(versions).toEqual([LIBRARY_ENTRY_SCHEMA_VERSION]);
  });
});
