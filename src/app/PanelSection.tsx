// A section of the front panel: the rounded box the panel draws around a group of controls, titled across its top edge.
import type { JSX } from "solid-js";

export interface PanelSectionProps {
  readonly title: string;
  readonly indicator?: JSX.Element;
  readonly children: JSX.Element;
}

export function PanelSection(props: PanelSectionProps): JSX.Element {
  return (
    <section
      aria-label={props.title}
      style={{
        display: "flex",
        "flex-direction": "column",
        gap: "0.75rem",
        padding: "0.75rem 1rem 1rem",
        border: "1px solid var(--e7-silkscreen)",
        "border-radius": "0.5rem",
        background: "var(--e7-section-background)",
        color: "var(--e7-label)",
      }}
    >
      <div
        style={{
          display: "flex",
          "align-items": "center",
          "justify-content": "center",
          gap: "0.4rem",
        }}
      >
        <h2
          style={{
            margin: "0",
            "font-size": "0.85rem",
            "font-weight": "normal",
            "letter-spacing": "0.18em",
            "text-align": "center",
            color: "var(--e7-silkscreen)",
          }}
        >
          {props.title}
        </h2>
        {props.indicator}
      </div>
      {props.children}
    </section>
  );
}
