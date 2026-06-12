import assert from "node:assert/strict";
import test from "node:test";

import { buildSubtitleCues } from "./subtitle-cues.ts";

function alignmentFor(script: string) {
  const characters = Array.from(script);

  return {
    characters,
    characterStartTimesSeconds: characters.map((_, index) => index * 0.1),
    characterEndTimesSeconds: characters.map((_, index) => index * 0.1 + 0.08),
  };
}

test("buildSubtitleCues keeps English word spacing", () => {
  const script = "Prepare the cup stack.";
  const cues = buildSubtitleCues(script, alignmentFor(script), {
    targetLanguage: "en",
  });

  assert.equal(cues[0].text, "Prepare the cup stack.");
});

test("buildSubtitleCues keeps Chinese characters visible without inserted spaces", () => {
  const script = "安装型材架到平台。";
  const cues = buildSubtitleCues(script, alignmentFor(script), {
    targetLanguage: "zh",
  });

  assert.equal(cues[0].text, "安装型材架到平台。");
});

test("buildSubtitleCues splits long Chinese subtitles by character count", () => {
  const script = "先安装型材架到平台再固定所有螺丝并检查位置。";
  const cues = buildSubtitleCues(script, alignmentFor(script), {
    targetLanguage: "zh",
  });

  assert.ok(cues.length > 1);
  assert.ok(cues.every((cue) => Array.from(cue.text).length <= 16));
});
