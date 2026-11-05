import { expect, it } from "vitest";
import { wavSampleLoop } from "./wavSampleLoop.js";
import { convertSoundFont } from "../main/soundFont.js";
import { soundFontFixture } from "../testFixtures/soundFont.js";

it("uses SF2 loop boundaries in seconds for the Web Audio preview", () => {
  const { wav } = convertSoundFont(soundFontFixture({ loop: true }), "bank.sf2").instruments[0];
  expect(wavSampleLoop(Uint8Array.from(wav).buffer)).toEqual({ start: 16 / 15768, end: 112 / 15768 });
  expect(wavSampleLoop(new ArrayBuffer(0))).toBeNull();
  expect(wavSampleLoop(Uint8Array.from(wav.subarray(0, 30)).buffer)).toBeNull();
});
