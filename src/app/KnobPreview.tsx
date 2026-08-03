// Manual harness for the knob widget: every layout it supports, driveable by pointer and keyboard, across all finishes.
import type { JSX } from "solid-js";
import { createSignal } from "solid-js";
import { FinishPicker } from "./FinishPicker";
import { Knob } from "./Knob";
import { ThemeProvider } from "./ThemeProvider";

function Bench(): JSX.Element {
  const [osc1, setOsc1] = createSignal(0);
  const [sub1, setSub1] = createSignal(64);
  const [cutoff, setCutoff] = createSignal(110);
  const [resonance, setResonance] = createSignal(32);
  const [tune, setTune] = createSignal(64);
  const [transpose, setTranspose] = createSignal(24);
  const [time, setTime] = createSignal(3);
  const [type, setType] = createSignal(1);
  const [swept, setSwept] = createSignal(0);

  return (
    <main
      style={{
        "min-height": "100vh",
        padding: "1.5rem",
        background: "var(--e7-panel)",
        color: "var(--e7-label)",
        "font-family": "system-ui, sans-serif",
      }}
    >
      <h1 style={{ "font-size": "1rem" }}>Knob widget</h1>
      <FinishPicker />

      <section
        aria-label="Standard and large"
        style={{ display: "flex", gap: "2rem", "align-items": "flex-start", "flex-wrap": "wrap" }}
      >
        <Knob primary={{ label: "OSC1", value: osc1(), onInput: setOsc1 }} />
        <Knob primary={{ label: "Sub1", value: sub1(), onInput: setSub1 }} />
        <Knob primary={{ label: "Cutoff", value: cutoff(), onInput: setCutoff }} size="large" />
        <Knob primary={{ label: "Resonance", value: resonance(), onInput: setResonance }} />
      </section>

      <h2 style={{ "font-size": "0.9rem", "margin-top": "2rem" }}>Shift layers</h2>
      <section
        aria-label="Shift layers"
        style={{ display: "flex", gap: "2rem", "align-items": "flex-start", "flex-wrap": "wrap" }}
      >
        <Knob
          primary={{ label: "Tune", value: tune(), onInput: setTune }}
          shift={{ label: "Transpose", value: transpose(), max: 48, onInput: setTranspose }}
        />
        <Knob
          primary={{
            label: "Delay Time",
            value: time(),
            max: 14,
            format: (value) => `1/${value + 1}`,
            onInput: setTime,
          }}
          shift={{
            label: "Type",
            value: type(),
            max: 3,
            format: (value) =>
              ["stereo", "ping-pong", "stereo sync", "ping-pong sync"][value] ?? "",
            onInput: setType,
          }}
        />
      </section>

      <h2 style={{ "font-size": "0.9rem", "margin-top": "2rem" }}>Sweep</h2>
      <section aria-label="Sweep" style={{ display: "flex", gap: "2rem", "align-items": "center" }}>
        <Knob primary={{ label: "Swept", value: swept(), onInput: setSwept }} size="large" />
        <input
          type="range"
          min="0"
          max="127"
          value={swept()}
          aria-label="Sweep the knob"
          onInput={(event) => setSwept(event.currentTarget.valueAsNumber)}
          style={{ width: "16rem" }}
        />
      </section>
    </main>
  );
}

export function KnobPreview(): JSX.Element {
  return (
    <ThemeProvider>
      <Bench />
    </ThemeProvider>
  );
}
