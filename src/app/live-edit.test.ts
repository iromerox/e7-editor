import type { CcEvent, Connection } from "../midi";
import type { ReceiveChannel } from "../protocol";
import type { AppStateControls } from "./app-state";
import type { LiveEdit } from "./live-edit";
import { EMPTY } from "rxjs";
import { describe, expect, it } from "vitest";
import {
  FILTER_RESONANCE,
  MIXER_OSC1_LEVEL,
  MOD_WHEEL,
  OSC1_TRANSPOSE,
  OTHER_VOICES,
  readField,
} from "../protocol";
import { createAppState, emptyPreset } from "./app-state";
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
