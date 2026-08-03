// Manual harness for the LED and cap-button widgets, at the counts the panel uses, across all finishes.
import type { JSX } from "solid-js";
import { For, createSignal } from "solid-js";
import { ButtonLed, DualButton } from "./ButtonLed";
import { FinishPicker } from "./FinishPicker";
import { Led, LedRow, LedStack } from "./Led";
import { ThemeProvider } from "./ThemeProvider";

const LFO_SHAPES = ["Triangle", "Ramp up", "Ramp down", "Square", "S&H"] as const;

const LFO_MODES = [
  "Mono",
  "Poly",
  "KB tracking",
  "KB sync",
  "Clock sync",
  "KB + clock sync",
] as const;

const LFO3_SHAPES = ["Triangle", "Ramp up", "Ramp down", "Square"] as const;

const OSC_SHAPES = ["Triangle", "Saw-tri", "Sawtooth"] as const;

const POLYPHONY_MODES = ["Poly", "ST", "MT", "Unison"] as const;

const VOICE_COUNT = 7;

const PRESET_BUTTONS = ["1", "2", "3", "4", "5", "6", "7", "8"] as const;

function step(active: number | undefined, count: number): number {
  return active === undefined ? 0 : (active + 1) % count;
}

function Section(props: { readonly title: string; readonly children: JSX.Element }): JSX.Element {
  return (
    <>
      <h2 style={{ "font-size": "0.9rem", "margin-top": "2rem" }}>{props.title}</h2>
      <section
        aria-label={props.title}
        style={{
          display: "flex",
          gap: "2rem",
          "align-items": "flex-start",
          "flex-wrap": "wrap",
          padding: "0.75rem",
          background: "var(--e7-section-background)",
          "border-radius": "0.4rem",
        }}
      >
        {props.children}
      </section>
    </>
  );
}

function Bench(): JSX.Element {
  const [lfo1Shape, setLfo1Shape] = createSignal(1);
  const [lfo1Mode, setLfo1Mode] = createSignal(0);
  const [lfo3Shape, setLfo3Shape] = createSignal(3);
  const [oscShape, setOscShape] = createSignal<number | undefined>(0);
  const [pulse, setPulse] = createSignal(true);
  const [mode, setMode] = createSignal(2);
  const [preset, setPreset] = createSignal(1);
  const [chorus, setChorus] = createSignal(true);
  const [voices, setVoices] = createSignal<readonly boolean[]>([
    true,
    true,
    false,
    true,
    false,
    false,
    true,
  ]);

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
      <h1 style={{ "font-size": "1rem" }}>LED and cap-button widgets</h1>
      <FinishPicker />

      <Section title="Selectors">
        <DualButton
          primary={{
            label: "Wave shape",
            count: LFO_SHAPES.length,
            active: lfo1Shape(),
            names: LFO_SHAPES,
            onPress: () => setLfo1Shape((current) => step(current, LFO_SHAPES.length)),
          }}
          shift={{
            label: "Mode",
            count: LFO_MODES.length,
            active: lfo1Mode(),
            names: LFO_MODES,
            onPress: () => setLfo1Mode((current) => step(current, LFO_MODES.length)),
          }}
        />
        <DualButton
          primary={{
            label: "Wave shape",
            count: LFO3_SHAPES.length,
            active: lfo3Shape(),
            names: LFO3_SHAPES,
            onPress: () => setLfo3Shape((current) => step(current, LFO3_SHAPES.length)),
          }}
        />
        <DualButton
          primary={{
            label: "Wave shape",
            count: OSC_SHAPES.length,
            active: oscShape(),
            names: OSC_SHAPES,
            onPress: () =>
              setOscShape((current) =>
                current === undefined
                  ? 0
                  : current + 1 >= OSC_SHAPES.length
                    ? undefined
                    : current + 1,
              ),
          }}
        />
        <DualButton
          primary={{
            label: "Mode",
            count: POLYPHONY_MODES.length,
            active: mode(),
            names: POLYPHONY_MODES,
            onPress: () => setMode((current) => step(current, POLYPHONY_MODES.length)),
          }}
        />
      </Section>

      <Section title="Single-LED buttons">
        <ButtonLed
          label="Pulse"
          lit={pulse()}
          placement="beside"
          onPress={() => setPulse((current) => !current)}
        />
        <For each={PRESET_BUTTONS}>
          {(label, index) => (
            <ButtonLed
              label={label}
              lit={preset() === index()}
              onPress={() => setPreset(index())}
            />
          )}
        </For>
      </Section>

      <Section title="Indicators">
        <LedRow
          label="VOICES"
          count={VOICE_COUNT}
          lit={voices()}
          names={["1", "2", "3", "4", "5", "6", "7"]}
        />
        <button type="button" onClick={() => setVoices((current) => current.map((lit) => !lit))}>
          Invert VOICES
        </button>
        <span style={{ display: "flex", "align-items": "center", gap: "0.4rem" }}>
          CHORUS
          <Led lit={chorus()} />
          <button type="button" onClick={() => setChorus((current) => !current)}>
            Toggle
          </button>
        </span>
        <LedStack label="Wave shape" count={LFO_SHAPES.length} active={4} names={LFO_SHAPES} />
        <LedStack label="Unnamed" count={LFO3_SHAPES.length} active={1} />
      </Section>
    </main>
  );
}

export function LedButtonPreview(): JSX.Element {
  return (
    <ThemeProvider>
      <Bench />
    </ThemeProvider>
  );
}
