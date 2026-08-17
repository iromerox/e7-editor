// Wording and failure reporting shared by the transfers that put a preset in the editor.
export const KEEP_EDITING = "Keep editing";

export function unsavedEditsQuestion(edits: number): string {
  const counted = edits === 1 ? "1 edit" : `${edits} edits`;
  return `Loading replaces the preset in the editor, discarding ${counted} not saved to the library.`;
}

export function describeFailure(error: unknown): string {
  return error instanceof Error ? `${error.name}: ${error.message}` : String(error);
}
