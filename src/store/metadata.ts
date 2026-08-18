// Changing what the library stores about an entry — its name, tags and comment — without touching the SysEx it holds.
import type { LibraryDatabase } from "./database";
import type { LibraryEntry } from "./schema";
import * as z from "zod";
import { EntryMetadataError, EntryMissingError } from "./errors";
import { ENTRY_NAME_MAX_LENGTH } from "./schema";

export const ENTRY_TAG_MAX_LENGTH = 64;
export const ENTRY_COMMENT_MAX_LENGTH = 2000;
export const TAG_SEPARATOR = ",";

export interface EntryMetadata {
  readonly name: string;
  readonly tags: readonly string[];
  readonly comment: string;
}

export function entryMetadata(entry: LibraryEntry): EntryMetadata {
  return { name: entry.name, tags: entry.tags, comment: entry.comment };
}

export function normalizeTags(tags: readonly string[]): readonly string[] {
  const kept = new Set<string>();
  for (const tag of tags) {
    const trimmed = tag.trim();
    if (trimmed !== "") {
      kept.add(trimmed);
    }
  }
  return [...kept];
}

export function parseTags(text: string): readonly string[] {
  return normalizeTags(text.split(TAG_SEPARATOR));
}

export function formatTags(tags: readonly string[]): string {
  return tags.join(`${TAG_SEPARATOR} `);
}

const entryMetadataSchema = z.object({
  name: z
    .string()
    .transform((name) => name.trim())
    .refine((name) => name !== "", { error: "an entry needs a name to be listed under" })
    .refine((name) => name.length <= ENTRY_NAME_MAX_LENGTH, {
      error: `a name is at most ${ENTRY_NAME_MAX_LENGTH} characters`,
    }),
  tags: z
    .array(z.string())
    .transform((tags) => normalizeTags(tags))
    .refine((tags) => tags.every((tag) => tag.length <= ENTRY_TAG_MAX_LENGTH), {
      error: `a tag is at most ${ENTRY_TAG_MAX_LENGTH} characters`,
    }),
  comment: z.string().max(ENTRY_COMMENT_MAX_LENGTH, {
    error: `a comment is at most ${ENTRY_COMMENT_MAX_LENGTH} characters`,
  }),
});

export function validateEntryMetadata(id: string, metadata: EntryMetadata): EntryMetadata {
  const validated = entryMetadataSchema.safeParse(metadata);
  if (!validated.success) {
    throw new EntryMetadataError(
      id,
      validated.error.issues.map((issue) => issue.message),
    );
  }
  return validated.data;
}

export async function updateEntryMetadata(
  database: LibraryDatabase,
  id: string,
  metadata: EntryMetadata,
): Promise<LibraryEntry> {
  const { name, tags, comment } = validateEntryMetadata(id, metadata);
  const document = await database.entries.findOne(id).exec();
  if (document === null) {
    throw new EntryMissingError(id);
  }
  const updated = await document.incrementalPatch({ name, tags, comment });
  return updated.toJSON();
}
