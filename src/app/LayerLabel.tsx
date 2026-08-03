// The panel's silkscreen under a control: a plain primary label and the shift layer in its white-filled box.
import type { JSX } from "solid-js";
import { Show } from "solid-js";

export interface LayerLabelProps {
  readonly label: string;
  readonly boxed?: boolean;
  readonly selectable: boolean;
  readonly selected?: boolean;
  readonly onSelect?: () => void;
}

export function LayerLabel(props: LayerLabelProps): JSX.Element {
  const styles = (): JSX.CSSProperties => ({
    "font-size": "0.7rem",
    "line-height": "1.2",
    padding: props.boxed === true ? "0.05rem 0.3rem" : "0.05rem 0",
    "border-radius": props.boxed === true ? "0.15rem" : "0",
    background: props.boxed === true ? "var(--e7-silkscreen)" : "transparent",
    color: props.boxed === true ? "var(--e7-panel)" : "var(--e7-label)",
    opacity: props.selectable && props.selected !== true ? "0.55" : "1",
    border: "none",
    cursor: props.selectable ? "pointer" : "default",
    "text-align": "center",
  });

  return (
    <Show when={props.selectable} fallback={<span style={styles()}>{props.label}</span>}>
      <button
        type="button"
        aria-pressed={props.selected === true}
        onClick={props.onSelect}
        style={styles()}
      >
        {props.label}
      </button>
    </Show>
  );
}
