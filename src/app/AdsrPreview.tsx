// Manual harness for the envelope curve widget: one EG's knob row and curve over the same values, plus the extremes that used to draw badly.
import type { JSX } from "solid-js";
import type { ControlValue } from "./control-value";
import { For, createSignal } from "solid-js";
import { AdsrEditor } from "./AdsrEditor";
import { FinishPicker } from "./FinishPicker";
import { Knob } from "./Knob";
import { ThemeProvider } from "./ThemeProvider";

interface Extreme {
  readonly name: string;
  readonly values: readonly [number, number, number, number];
}

const EXTREMES: readonly Extreme[] = [
  { name: "Organ", values: [0, 0, 127, 0] },
  { name: "Pluck", values: [0, 30, 0, 20] },
  { name: "Pad", values: [127, 127, 90, 127] },
  { name: "Everything at zero", values: [0, 0, 0, 0] },
  { name: "Everything at full", values: [127, 127, 127, 127] },
];

function Envelope(props: { readonly label: string }): JSX.Element {
  const [attack, setAttack] = createSignal(40);
  const [decay, setDecay] = createSignal(70);
  const [sustain, setSustain] = createSignal(90);
  const [release, setRelease] = createSignal(55);
  const [attackVelocity, setAttackVelocity] = createSignal(0);
  const [keyboardTracking, setKeyboardTracking] = createSignal(0);
  const [releaseVelocity, setReleaseVelocity] = createSignal(0);

  const stages = (): {
    readonly attack: ControlValue;
    readonly decay: ControlValue;
    readonly sustain: ControlValue;
    readonly release: ControlValue;
  } => ({
    attack: { label: "Attack", value: attack(), onInput: setAttack },
    decay: { label: "Decay", value: decay(), onInput: setDecay },
    sustain: { label: "Sustain", value: sustain(), onInput: setSustain },
    release: { label: "Release", value: release(), onInput: setRelease },
  });

  const load = (values: Extreme["values"]): void => {
    setAttack(values[0]);
    setDecay(values[1]);
    setSustain(values[2]);
    setRelease(values[3]);
  };

  return (
    <section
      aria-label={props.label}
      style={{
        padding: "1rem",
        "border-radius": "0.3rem",
        background: "var(--e7-section-background)",
      }}
    >
      <h2 style={{ "font-size": "0.8rem", "letter-spacing": "0.1em", margin: "0 0 0.75rem" }}>
        ENVELOPE GENERATOR {props.label.slice(-1)}
      </h2>

      <div
        style={{
          display: "grid",
          "grid-template-columns": "repeat(4, minmax(0, 1fr))",
          "align-items": "start",
          "justify-items": "center",
          gap: "0.75rem",
        }}
      >
        <Knob
          primary={stages().attack}
          shift={{
            label: "Attack velocity mod",
            value: attackVelocity(),
            onInput: setAttackVelocity,
          }}
        />
        <Knob
          primary={stages().decay}
          shift={{
            label: "Keyboard tracking",
            value: keyboardTracking(),
            onInput: setKeyboardTracking,
          }}
        />
        <Knob primary={stages().sustain} />
        <Knob
          primary={stages().release}
          shift={{
            label: "Release velocity mod",
            value: releaseVelocity(),
            onInput: setReleaseVelocity,
          }}
        />
      </div>

      <div style={{ "margin-top": "1rem" }}>
        <AdsrEditor label={props.label} {...stages()} />
      </div>

      <div style={{ display: "flex", gap: "0.5rem", "flex-wrap": "wrap", "margin-top": "0.75rem" }}>
        <For each={EXTREMES}>
          {(extreme) => (
            <button
              type="button"
              onClick={() => load(extreme.values)}
              style={{
                padding: "0.2rem 0.5rem",
                "font-size": "0.7rem",
                "border-radius": "0.15rem",
                border: "1px solid var(--e7-silkscreen)",
                background: "transparent",
                color: "var(--e7-label)",
                cursor: "pointer",
              }}
            >
              {extreme.name}
            </button>
          )}
        </For>
      </div>
    </section>
  );
}

export function AdsrPreview(): JSX.Element {
  return (
    <ThemeProvider>
      <main
        style={{
          "min-height": "100vh",
          padding: "1.5rem",
          background: "var(--e7-panel)",
          color: "var(--e7-label)",
          "font-family": "system-ui, sans-serif",
        }}
      >
        <h1 style={{ "font-size": "1rem" }}>Envelope curve widget</h1>
        <FinishPicker />
        <div
          style={{
            display: "flex",
            gap: "1.5rem",
            "flex-wrap": "wrap",
            "align-items": "flex-start",
          }}
        >
          <Envelope label="EG1" />
          <Envelope label="EG2" />
        </div>
      </main>
    </ThemeProvider>
  );
}
