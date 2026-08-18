// Removing an entry from the library: the one write that leaves nothing of it behind.
import type { LibraryDatabase } from "./database";
import type { LibraryEntry } from "./schema";
import { EntryMissingError } from "./errors";

export async function deleteEntry(database: LibraryDatabase, id: string): Promise<LibraryEntry> {
  const document = await database.entries.findOne(id).exec();
  if (document === null) {
    throw new EntryMissingError(id);
  }
  const removed = document.toJSON();
  await document.remove();
  return removed;
}
