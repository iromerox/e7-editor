// Picking files off disk and writing one back, through the File System Access API where the browser has it and a hidden input or download anchor where it does not.
export interface FilePickerType {
  readonly description: string;
  readonly accept: Readonly<Record<string, readonly string[]>>;
}

export interface FilePick {
  readonly types: readonly FilePickerType[];
  readonly accept: string;
  readonly multiple: boolean;
}

export interface FileSave {
  readonly fileName: string;
  readonly mediaType: string;
  readonly types: readonly FilePickerType[];
}

interface OpenFilePicker {
  showOpenFilePicker(options: {
    readonly multiple: boolean;
    readonly types: readonly FilePickerType[];
  }): Promise<readonly FileSystemFileHandle[]>;
}

interface SaveFilePicker {
  showSaveFilePicker(options: {
    readonly suggestedName: string;
    readonly types: readonly FilePickerType[];
  }): Promise<FileSystemFileHandle>;
}

function canOpenWithPicker(
  scope: Window & typeof globalThis,
): scope is Window & typeof globalThis & OpenFilePicker {
  return "showOpenFilePicker" in scope && typeof scope.showOpenFilePicker === "function";
}

function canSaveWithPicker(
  scope: Window & typeof globalThis,
): scope is Window & typeof globalThis & SaveFilePicker {
  return "showSaveFilePicker" in scope && typeof scope.showSaveFilePicker === "function";
}

function cancelled(reason: unknown): boolean {
  return reason instanceof DOMException && reason.name === "AbortError";
}

async function pickWithPicker(picker: OpenFilePicker, pick: FilePick): Promise<readonly File[]> {
  try {
    const handles = await picker.showOpenFilePicker({
      multiple: pick.multiple,
      types: pick.types,
    });
    return await Promise.all(handles.map((handle) => handle.getFile()));
  } catch (reason) {
    if (cancelled(reason)) {
      return [];
    }
    throw reason;
  }
}

function pickWithInput(pick: FilePick): Promise<readonly File[]> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = pick.accept;
    input.multiple = pick.multiple;
    input.hidden = true;
    const settle = (files: readonly File[]): void => {
      input.remove();
      resolve(files);
    };
    input.addEventListener("change", () => settle(Array.from(input.files ?? [])));
    input.addEventListener("cancel", () => settle([]));
    document.body.append(input);
    input.click();
  });
}

export function pickFiles(pick: FilePick): Promise<readonly File[]> {
  return canOpenWithPicker(window) ? pickWithPicker(window, pick) : pickWithInput(pick);
}

async function saveWithPicker(
  picker: SaveFilePicker,
  bytes: Uint8Array,
  save: FileSave,
): Promise<boolean> {
  let handle: FileSystemFileHandle;
  try {
    handle = await picker.showSaveFilePicker({
      suggestedName: save.fileName,
      types: save.types,
    });
  } catch (reason) {
    if (cancelled(reason)) {
      return false;
    }
    throw reason;
  }
  const writable = await handle.createWritable();
  await writable.write(Uint8Array.from(bytes));
  await writable.close();
  return true;
}

function saveWithDownload(bytes: Uint8Array, save: FileSave): void {
  const url = URL.createObjectURL(new Blob([Uint8Array.from(bytes)], { type: save.mediaType }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = save.fileName;
  anchor.hidden = true;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export async function saveFile(bytes: Uint8Array, save: FileSave): Promise<boolean> {
  if (canSaveWithPicker(window)) {
    return saveWithPicker(window, bytes, save);
  }
  saveWithDownload(bytes, save);
  return true;
}
