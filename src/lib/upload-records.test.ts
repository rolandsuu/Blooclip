import assert from "node:assert/strict";
import test from "node:test";

import {
  DEFAULT_UPLOAD_PROMPT,
  MAX_BATCH_UPLOAD_FILES,
  normalizePrompt,
} from "./upload-settings.ts";

const EXPECTED_DEFAULT_UPLOAD_PROMPT =
  "识别视频中最重要的操作步骤和关键画面，剪成一段结构清晰的教学短片，并添加自然旁白和字幕。";

test("batch upload limit is ten files", () => {
  assert.equal(MAX_BATCH_UPLOAD_FILES, 10);
});

test("normalizePrompt trims shared prompts and falls back to the default", () => {
  assert.equal(DEFAULT_UPLOAD_PROMPT, EXPECTED_DEFAULT_UPLOAD_PROMPT);
  assert.equal(
    normalizePrompt("  Make a short product walkthrough  "),
    "Make a short product walkthrough"
  );
  assert.equal(normalizePrompt("   "), DEFAULT_UPLOAD_PROMPT);
  assert.equal(normalizePrompt(null), DEFAULT_UPLOAD_PROMPT);
});
