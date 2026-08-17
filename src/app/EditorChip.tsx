// The lit chip a device slot or a library entry wears while the editor holds what it stores.
import type { JSX } from "solid-js";
import type { MultiPart } from "./app-state";

export interface EditorChipProps {
  readonly part: MultiPart | undefined;
}

export function EditorChip(props: EditorChipProps): JSX.Element {
  return (
    <span
      style={{
        border: "1px solid var(--e7-led-on)",
        background: "var(--e7-led-halo)",
        "border-radius": "0.75rem",
        padding: "0 0.5rem",
        "font-size": "0.75rem",
        color: "var(--e7-led-on)",
      }}
    >
      {props.part === undefined ? "In the editor" : `Part ${props.part} in the editor`}
    </span>
  );
}
