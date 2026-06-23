import assert from "node:assert/strict";
import test from "node:test";

import {
  TARGET_LANGUAGE_OPTIONS,
  getTargetLanguageLabel,
} from "./languages.ts";
import { getTargetLanguageCode } from "./target-language.ts";

const expectedTargetLanguageOptions = [
  ["zh", "中文"],
  ["en", "英语"],
  ["es", "西班牙语"],
  ["hi", "印地语"],
  ["ar", "阿拉伯语"],
  ["fr", "法语"],
  ["pt", "葡萄牙语"],
  ["ru", "俄语"],
  ["de", "德语"],
  ["ja", "日语"],
  ["ko", "韩语"],
];

test("target language options show Chinese labels in upload order", () => {
  assert.deepEqual(
    TARGET_LANGUAGE_OPTIONS.map((option) => [option.value, option.label]),
    expectedTargetLanguageOptions
  );
});

test("getTargetLanguageCode recognizes supported target languages", () => {
  assert.equal(getTargetLanguageCode("zh"), "zh");
  assert.equal(getTargetLanguageCode("中文"), "zh");
  assert.equal(getTargetLanguageCode("zh-CN"), "zh");
  assert.equal(getTargetLanguageCode("en"), "en");
  assert.equal(getTargetLanguageCode("English"), "en");
  assert.equal(getTargetLanguageCode("英语"), "en");

  for (const [code] of expectedTargetLanguageOptions.slice(2)) {
    assert.equal(getTargetLanguageCode(code), code);
  }
});

test("getTargetLanguageCode returns unknown language codes conservatively", () => {
  assert.equal(getTargetLanguageCode("fr"), "fr");
  assert.equal(getTargetLanguageCode("Klingon"), null);
});

test("getTargetLanguageLabel returns Chinese labels for stored codes", () => {
  for (const [code, label] of expectedTargetLanguageOptions) {
    assert.equal(getTargetLanguageLabel(code), label);
  }

  assert.equal(getTargetLanguageLabel("fr-FR"), "法语");
  assert.equal(getTargetLanguageLabel("Klingon"), "Klingon");
});
