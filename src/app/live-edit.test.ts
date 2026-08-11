import type { CcEvent, Connection } from "../midi";
import type { ReceiveChannel } from "../protocol";
import type { AppStateControls } from "./app-state";
import type { LiveEdit } from "./live-edit";
import { EMPTY } from "rxjs";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  FILTER_CUTOFF,
  FILTER_RESONANCE,
  MIXER_OSC1_LEVEL,
  MOD_WHEEL,
  OSC1_TRANSPOSE,
  OTHER_VOICES,
  readField,
} from "../protocol";
import { createAppState, emptyPreset } from "./app-state";
import { COALESCE_WINDOW_MS } from "./edit-history";
import { OMNI_TARGET_CHANNEL, PART_1_ONLY_NOTE, createLiveEdit, targetChannel } from "./live-edit";

interface SentCc {
  readonly channel: number;
  readonly controller: number;
  readonly value: number;
}

function stubConnection(sent: SentCc[]): Connection {
  return {
    inputName: "GS Music e7 IN",
    outputName: "GS Music e7 OUT",
    sysex: EMPTY,
    sysexMonitor: EMPTY,
    cc: EMPTY,
    isOpen: true,
    reassembly: { pendingBytes: 0, fragmentedFrames: 0, discardedPartials: 0 },
    send: () => {},
    sendCommand: () => {},
    sendControlChange: (channel, controller, value) => sent.push({ channel, controller, value }),
    sendProgramChange: () => {},
    close: () => Promise.resolve(),
  };
}

function ccEvent(controller: number, value: number): CcEvent {
  return { channel: 1, controller, value, timestamp: 0 };
}

interface Harness {
  readonly controls: AppStateControls;
  readonly live: LiveEdit;
  readonly sent: readonly SentCc[];
}

function setUp(receiveChannel: ReceiveChannel | undefined): Harness {
  const controls = createAppState();
  const sent: SentCc[] = [];
  const connection = stubConnection(sent);
  controls.setReceiveChannel(receiveChannel);
  return { controls, live: createLiveEdit(controls, () => connection), sent };
}

describe("targetChannel", () => {
  it("addresses the device on the channel it receives on", () => {
    expect(targetChannel({ kind: "channel", channel: 5 })).toBe(5);
  });

  it("picks a channel of its own when the device listens on all of them", () => {
    expect(targetChannel({ kind: "omni" })).toBe(OMNI_TARGET_CHANNEL);
  });

  it("has no channel to address when the setting is unknown or unreadable", () => {
    expect(targetChannel(undefined)).toBeUndefined();
    expect(targetChannel({ kind: "invalid", value: 200 })).toBeUndefined();
  });
});

describe("createLiveEdit", () => {
  it("reads a field's current value as the control's value", () => {
    const { controls, live } = setUp({ kind: "channel", channel: 1 });
    controls.editField("mixerOsc1Level", 42);

    expect(live.value("mixerOsc1Level")).toBe(42);
    expect(live.control("mixerOsc1Level", { label: "OSC1" })).toMatchObject({
      label: "OSC1",
      value: 42,
    });
  });

  it("writes the edit into the editor and sends it on the device's receive channel", () => {
    const { controls, live, sent } = setUp({ kind: "channel", channel: 5 });

    live.write("mixerOsc1Level", 90);

    expect(readField(controls.state.editor.preset, "mixerOsc1Level")).toBe(90);
    expect(sent).toEqual([{ channel: 5, controller: MIXER_OSC1_LEVEL, value: 90 }]);
  });

  it("sends on its own channel when the device listens on all of them", () => {
    const { live, sent } = setUp({ kind: "omni" });

    live.write("mixerOsc1Level", 3);

    expect(sent).toEqual([
      { channel: OMNI_TARGET_CHANNEL, controller: MIXER_OSC1_LEVEL, value: 3 },
    ]);
  });

  it("keeps editing with no channel to send on, rather than dropping the edit", () => {
    const { controls, live, sent } = setUp(undefined);

    live.write("mixerOsc1Level", 7);

    expect(readField(controls.state.editor.preset, "mixerOsc1Level")).toBe(7);
    expect(sent).toEqual([]);
  });

  it("holds back a control change the device is not known to accept", () => {
    const { controls, live, sent } = setUp({ kind: "channel", channel: 1 });

    live.write("filterResonance", 64);

    expect(readField(controls.state.editor.preset, "filterResonance")).toBe(64);
    expect(sent.map((cc) => cc.controller)).not.toContain(FILTER_RESONANCE);
  });

  it("hands the UI a read-only control for a field the device only reports", () => {
    const { live } = setUp({ kind: "channel", channel: 1 });

    expect(live.control("filterResonance", { label: "Resonance" }).readOnly).toBe(true);
    expect(live.control("filterCutoff", { label: "Cutoff" }).readOnly).toBe(false);
  });

  it("applies an inbound control change to the field behind it", () => {
    const { controls, live } = setUp({ kind: "channel", channel: 1 });

    expect(live.receive(ccEvent(MIXER_OSC1_LEVEL, 31))).toBe("mixerOsc1Level");
    expect(readField(controls.state.editor.preset, "mixerOsc1Level")).toBe(31);
  });

  it("does not echo an inbound control change back to the device", () => {
    const { live, sent } = setUp({ kind: "channel", channel: 1 });

    live.receive(ccEvent(MIXER_OSC1_LEVEL, 31));

    expect(sent).toEqual([]);
  });

  it("leaves an inbound control change with more than one candidate field alone", () => {
    const { controls, live } = setUp({ kind: "channel", channel: 1 });

    expect(live.receive(ccEvent(OSC1_TRANSPOSE, 100))).toBeUndefined();
    expect(readField(controls.state.editor.preset, "osc1Transpose")).toBe(0);
    expect(readField(controls.state.editor.preset, "transpose")).toBe(0);
  });

  it("ignores an inbound control change with no field behind it", () => {
    const { live } = setUp({ kind: "channel", channel: 1 });

    expect(live.receive(ccEvent(MOD_WHEEL, 64))).toBeUndefined();
  });

  it("ignores an inbound value the field's own table reserves, rather than failing on it", () => {
    const { controls, live } = setUp({ kind: "channel", channel: 1 });
    live.receive(ccEvent(OTHER_VOICES, 34));

    expect(live.receive(ccEvent(OTHER_VOICES, 100))).toBeUndefined();
    expect(readField(controls.state.editor.preset, "voices")).toBe(34);
  });

  it("holds every field live for a single preset and for part 1 of a multi", () => {
    const { controls, live } = setUp({ kind: "channel", channel: 1 });

    expect(live.applies("chorusMix")).toBe(true);

    controls.loadEditor(emptyPreset(), { kind: "Empty" }, 1);

    expect(live.applies("chorusMix")).toBe(true);
    expect(live.control("chorusMix", { label: "Mix" }).readOnly).toBe(false);
  });

  it("hands back a read-only control that says why on a multi's parts 2-4", () => {
    const { controls, live } = setUp({ kind: "channel", channel: 1 });
    controls.loadEditor(emptyPreset(), { kind: "Empty" }, 4);

    expect(live.applies("chorusMix")).toBe(false);
    expect(live.applies("delayTime")).toBe(false);
    expect(live.applies("stereoSpread")).toBe(false);
    expect(live.applies("filterCutoff")).toBe(true);

    const control = live.control("chorusMix", { label: "Mix", description: "Dry against wet." });

    expect(control.readOnly).toBe(true);
    expect(control.description).toBe(`Dry against wet. ${PART_1_ONLY_NOTE}`);
    expect(live.control("delayTime", { label: "Delay Time" }).description).toBe(PART_1_ONLY_NOTE);
  });
});

describe("the editor's edit history", () => {
  function drag(live: LiveEdit, from: number, to: number): void {
    for (let value = from + 1; value <= to; value += 1) {
      vi.advanceTimersByTime(5);
      live.write("filterCutoff", value);
    }
  }

  afterEach(() => {
    vi.useRealTimers();
  });

  it("counts a knob drag as one step, however many values it passes through", () => {
    vi.useFakeTimers();
    const { controls, live } = setUp({ kind: "channel", channel: 1 });

    drag(live, 0, 40);

    expect(controls.state.history.undo).toMatchObject([
      { field: "filterCutoff", previousValue: 0, nextValue: 40 },
    ]);
  });

  it("leaves the drag that follows a pause a step of its own", () => {
    vi.useFakeTimers();
    const { controls, live } = setUp({ kind: "channel", channel: 1 });

    drag(live, 0, 40);
    vi.advanceTimersByTime(COALESCE_WINDOW_MS);
    drag(live, 40, 45);

    expect(controls.state.history.undo).toMatchObject([
      { previousValue: 0, nextValue: 40 },
      { previousValue: 40, nextValue: 45 },
    ]);
  });

  it("puts the value back and re-sends it to the device on undo, and again on redo", () => {
    const { controls, live, sent } = setUp({ kind: "channel", channel: 5 });
    live.write("filterCutoff", 90);

    live.undo();

    expect(readField(controls.state.editor.preset, "filterCutoff")).toBe(0);
    expect(sent.at(-1)).toEqual({ channel: 5, controller: FILTER_CUTOFF, value: 0 });

    live.redo();

    expect(readField(controls.state.editor.preset, "filterCutoff")).toBe(90);
    expect(sent.at(-1)).toEqual({ channel: 5, controller: FILTER_CUTOFF, value: 90 });
  });

  it("has nothing left to redo once a fresh edit follows an undo", () => {
    const { controls, live } = setUp({ kind: "channel", channel: 1 });

    live.write("filterCutoff", 90);
    live.undo();
    expect(live.redoable()).toBe(true);

    live.write("filterEg1Mod", 12);

    expect(live.redoable()).toBe(false);
    live.redo();
    expect(readField(controls.state.editor.preset, "filterCutoff")).toBe(0);
  });

  it("has nothing to undo until an edit is made here", () => {
    const { live } = setUp({ kind: "channel", channel: 1 });

    expect(live.undoable()).toBe(false);
    expect(live.redoable()).toBe(false);

    live.write("filterCutoff", 90);

    expect(live.undoable()).toBe(true);
  });

  it("keeps the control changes the device reports out of the history", () => {
    const { live } = setUp({ kind: "channel", channel: 1 });

    live.receive(ccEvent(MIXER_OSC1_LEVEL, 31));

    expect(live.undoable()).toBe(false);
  });

  it("still edits a field whose current value the table reserves, recording no step for it", () => {
    const { controls, live } = setUp({ kind: "channel", channel: 1 });
    controls.loadEditor({ ...emptyPreset(), polyVoice: 6 }, { kind: "Empty" });

    live.write("voices", 34);

    expect(readField(controls.state.editor.preset, "voices")).toBe(34);
    expect(live.undoable()).toBe(false);
  });
});
