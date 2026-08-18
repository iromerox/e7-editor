// Wording and failure reporting shared by the transfers that move a preset between the device, the editor and the library.
export const KEEP_EDITING = "Keep editing";

export const KEEP_STORED = "Keep what is stored";

function counted(edits: number): string {
  return edits === 1 ? "1 edit" : `${edits} edits`;
}

export function unsavedEditsQuestion(edits: number): string {
  return `Loading replaces the preset in the editor, discarding ${counted(edits)} not saved to the library.`;
}

export function partSwitchQuestion(part: number, edits: number): string {
  return `Switching to part ${part} replaces the preset in the editor, discarding ${counted(edits)} not saved to the library.`;
}

export function overwriteQuestion(name: string): string {
  return `Saving replaces what “${name}” stores with the preset in the editor. What it stores now is not kept.`;
}

export function writeQuestion(slot: string, holding: string): string {
  return `Writing replaces what ${slot} holds on the instrument with the ${holding} in the editor. What it holds now is not kept.`;
}

export function writtenNote(slot: string): string {
  return `Written to ${slot}.`;
}

export function savedNote(name: string): string {
  return `Saved to the library as “${name}”.`;
}

export function savedOverNote(name: string): string {
  return `Saved over “${name}”.`;
}

export function describeFailure(error: unknown): string {
  return error instanceof Error ? `${error.name}: ${error.message}` : String(error);
}
