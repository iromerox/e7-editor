// Reading .syx files from disk into the library, storing a slot read off the instrument as an entry, and writing library entries back out to disk.
import type { MultiPreset, SinglePreset } from "../protocol";
import type { LibraryDatabase } from "./database";
import type { LibraryEntry, LibraryEntrySource, PresetSnapshot } from "./schema";
import type { SyxFile } from "./syx-codec";
import * as z from "zod";
import { ADDRESS_BYTES, COMMAND_HEADER, SYSEX_END, SYSEX_START } from "../protocol";
import { EntryPayloadError, SyxPayloadError } from "./errors";
import { BACKUP_BLOCKS, MEMORY_BLOCK_BYTES, encodeMemoryImage, parseSyxFile } from "./syx-codec";

export const SYX_FILE_EXTENSION = ".syx";
export const SYX_MEDIA_TYPE = "application/octet-stream";

const FRAME_DELIMITER_BYTES = 2;
const COMMAND_ID_BYTES = 1;
const NIBBLES_PER_BYTE = 2;

const WRITE_MEMORY_FRAME_BYTES =
  FRAME_DELIMITER_BYTES +
  COMMAND_HEADER.length +
  COMMAND_ID_BYTES +
  ADDRESS_BYTES +
  MEMORY_BLOCK_BYTES * NIBBLES_PER_BYTE;

export const MIN_SYX_FILE_BYTES = WRITE_MEMORY_FRAME_BYTES;
export const MAX_SYX_FILE_BYTES = BACKUP_BLOCKS * WRITE_MEMORY_FRAME_BYTES;

export interface SyxPayload {
  readonly fileName: string;
  readonly bytes: Uint8Array;
}

const syxPayloadSchema = z.object({
  fileName: z.string().min(1).max(255),
  bytes: z
    .instanceof(Uint8Array)
    .refine((bytes) => bytes.length >= MIN_SYX_FILE_BYTES, {
      error: `it is shorter than the ${MIN_SYX_FILE_BYTES} bytes one memory block takes`,
    })
    .refine((bytes) => bytes.length <= MAX_SYX_FILE_BYTES, {
      error: `it is longer than the ${MAX_SYX_FILE_BYTES} bytes a whole-instrument backup takes`,
    })
    .refine((bytes) => bytes[0] === SYSEX_START, {
      error: "it does not open with an F0 status byte",
    })
    .refine((bytes) => bytes[bytes.length - 1] === SYSEX_END, {
      error: "it does not close with an F7 status byte",
    }),
});

export function validateSyxPayload(payload: SyxPayload): SyxPayload {
  const validated = syxPayloadSchema.safeParse(payload);
  if (!validated.success) {
    throw new SyxPayloadError(
      payload.fileName,
      validated.error.issues.map((issue) => issue.message),
    );
  }
  return validated.data;
}

const BASE64_CHUNK_BYTES = 0x8000;

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += BASE64_CHUNK_BYTES) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + BASE64_CHUNK_BYTES));
  }
  return btoa(binary);
}

function fromBase64(text: string): Uint8Array {
  return Uint8Array.from(atob(text), (character) => character.charCodeAt(0));
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", Uint8Array.from(bytes));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

const PRINTABLE_MIN = 0x20;
const PRINTABLE_MAX = 0x7e;

function readableName(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) =>
    byte >= PRINTABLE_MIN && byte <= PRINTABLE_MAX ? String.fromCharCode(byte) : "",
  )
    .join("")
    .trim();
}

function fileStem(fileName: string): string {
  const dot = fileName.lastIndexOf(".");
  return (dot > 0 ? fileName.slice(0, dot) : fileName).trim();
}

function storedName(file: SyxFile, fileName: string): string {
  const [single] = file.singles;
  const [multi] = file.multis;
  const stored =
    file.kind === "Single" && single !== undefined
      ? readableName(single.preset.part1Only.name)
      : file.kind === "Multi" && multi !== undefined
        ? readableName(multi.multi.parts[0].part1Only.name)
        : "";
  return stored !== "" ? stored : fileStem(fileName) || file.kind;
}

function jsonSafe(preset: SinglePreset | MultiPreset): PresetSnapshot {
  const json = JSON.stringify(preset, (_key, value: unknown) =>
    value instanceof Uint8Array ? Array.from(value) : value,
  );
  return JSON.parse(json) as PresetSnapshot;
}

function storedSnapshot(file: SyxFile): PresetSnapshot | undefined {
  const [single] = file.singles;
  const [multi] = file.multis;
  if (file.kind === "Single" && single !== undefined) {
    return jsonSafe(single.preset);
  }
  if (file.kind === "Multi" && multi !== undefined) {
    return jsonSafe(multi.multi);
  }
  return undefined;
}

type SlotMetadata = Pick<LibraryEntry, "bank" | "group" | "slot">;

function storedSlot(file: SyxFile): SlotMetadata {
  switch (file.kind) {
    case "Single":
    case "Multi":
      return { bank: file.bank, group: file.group, slot: file.slot };
    case "Group":
      return { bank: file.bank, group: file.group };
    case "Bank":
      return { bank: file.bank };
    case "Backup":
    case "MultiPack":
      return {};
  }
}

export async function syxEntry(
  payload: SyxPayload,
  source: LibraryEntrySource,
): Promise<LibraryEntry> {
  const { fileName, bytes } = validateSyxPayload(payload);
  const file = parseSyxFile(bytes);
  const snapshot = storedSnapshot(file);
  return {
    id: crypto.randomUUID(),
    kind: file.kind,
    name: storedName(file, fileName),
    ...storedSlot(file),
    capturedAt: new Date().toISOString(),
    source,
    tags: [],
    comment: "",
    sha256: await sha256Hex(bytes),
    sysex: toBase64(bytes),
    ...(snapshot === undefined ? {} : { snapshot }),
  };
}

export async function readSyxFile(file: File): Promise<SyxPayload> {
  return { fileName: file.name, bytes: new Uint8Array(await file.arrayBuffer()) };
}

export async function importSyxPayload(
  database: LibraryDatabase,
  payload: SyxPayload,
): Promise<LibraryEntry> {
  const entry = await syxEntry(payload, "UserImport");
  await database.entries.insert(entry);
  return entry;
}

export async function importSyxFiles(
  database: LibraryDatabase,
  files: readonly File[],
): Promise<readonly LibraryEntry[]> {
  const payloads = await Promise.all(files.map(readSyxFile));
  const entries = await Promise.all(payloads.map((payload) => syxEntry(payload, "UserImport")));
  for (const entry of entries) {
    await database.entries.insert(entry);
  }
  return entries;
}

export interface DeviceDump {
  readonly label: string;
  readonly address: number;
  readonly bytes: Uint8Array;
}

export function deviceDumpPayload(dump: DeviceDump): SyxPayload {
  return {
    fileName: `${dump.label}${SYX_FILE_EXTENSION}`,
    bytes: encodeMemoryImage(dump.address, dump.bytes),
  };
}

export async function storeDeviceDump(
  database: LibraryDatabase,
  dump: DeviceDump,
): Promise<LibraryEntry> {
  const entry = await syxEntry(deviceDumpPayload(dump), "DeviceDump");
  await database.entries.insert(entry);
  return entry;
}

export function entryBytes(entry: LibraryEntry): Uint8Array {
  try {
    return fromBase64(entry.sysex);
  } catch (reason) {
    throw new EntryPayloadError(entry.id, reason instanceof Error ? reason.message : "unknown");
  }
}

const UNSAFE_FILE_NAME_CHARACTERS = /[^A-Za-z0-9 ._-]+/g;

export function entryFileName(entry: LibraryEntry): string {
  const base = entry.name.replace(UNSAFE_FILE_NAME_CHARACTERS, "-").trim();
  return `${base === "" ? entry.kind : base}${SYX_FILE_EXTENSION}`;
}

interface FilePickerType {
  readonly description: string;
  readonly accept: Readonly<Record<string, readonly string[]>>;
}

const SYX_PICKER_TYPES: readonly FilePickerType[] = [
  { description: "MIDI System Exclusive", accept: { [SYX_MEDIA_TYPE]: [SYX_FILE_EXTENSION] } },
];

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

async function pickWithPicker(picker: OpenFilePicker): Promise<readonly File[]> {
  try {
    const handles = await picker.showOpenFilePicker({ multiple: true, types: SYX_PICKER_TYPES });
    return await Promise.all(handles.map((handle) => handle.getFile()));
  } catch (reason) {
    if (cancelled(reason)) {
      return [];
    }
    throw reason;
  }
}

function pickWithInput(): Promise<readonly File[]> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = `${SYX_FILE_EXTENSION},${SYX_MEDIA_TYPE}`;
    input.multiple = true;
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

export function pickSyxFiles(): Promise<readonly File[]> {
  return canOpenWithPicker(window) ? pickWithPicker(window) : pickWithInput();
}

export async function importSyxFromDisk(
  database: LibraryDatabase,
): Promise<readonly LibraryEntry[]> {
  return importSyxFiles(database, await pickSyxFiles());
}

async function saveWithPicker(
  picker: SaveFilePicker,
  bytes: Uint8Array,
  fileName: string,
): Promise<boolean> {
  let handle: FileSystemFileHandle;
  try {
    handle = await picker.showSaveFilePicker({
      suggestedName: fileName,
      types: SYX_PICKER_TYPES,
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

function saveWithDownload(bytes: Uint8Array, fileName: string): void {
  const url = URL.createObjectURL(new Blob([Uint8Array.from(bytes)], { type: SYX_MEDIA_TYPE }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.hidden = true;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export async function exportEntryToDisk(entry: LibraryEntry): Promise<boolean> {
  const bytes = entryBytes(entry);
  const fileName = entryFileName(entry);
  if (canSaveWithPicker(window)) {
    return saveWithPicker(window, bytes, fileName);
  }
  saveWithDownload(bytes, fileName);
  return true;
}
