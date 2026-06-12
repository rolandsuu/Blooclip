import assert from "node:assert/strict";
import test from "node:test";

import {
  ElevenLabsVoiceConfigError,
  getElevenLabsLanguageCode,
  selectElevenLabsVoice,
} from "./elevenlabs-voice-config.ts";

test("getElevenLabsLanguageCode recognizes supported target languages", () => {
  assert.equal(getElevenLabsLanguageCode("zh"), "zh");
  assert.equal(getElevenLabsLanguageCode("中文"), "zh");
  assert.equal(getElevenLabsLanguageCode("zh-CN"), "zh");
  assert.equal(getElevenLabsLanguageCode("en"), "en");
  assert.equal(getElevenLabsLanguageCode("English"), "en");
});

test("selectElevenLabsVoice requires a Chinese voice for Chinese output", () => {
  assert.throws(
    () =>
      selectElevenLabsVoice("zh", {
        ELEVENLABS_VOICE_ID: "english-fallback",
      }),
    (error) => {
      assert.ok(error instanceof ElevenLabsVoiceConfigError);
      assert.equal(error.code, "elevenlabs_chinese_voice_id_missing");
      assert.equal(error.envVarName, "ELEVENLABS_VOICE_ID_ZH");
      return true;
    }
  );
});

test("selectElevenLabsVoice uses the Chinese voice for Chinese output", () => {
  assert.deepEqual(
    selectElevenLabsVoice("zh", {
      ELEVENLABS_VOICE_ID: "english-fallback",
      ELEVENLABS_VOICE_ID_ZH: "mandarin-voice",
    }),
    {
      voiceId: "mandarin-voice",
      languageCode: "zh",
      envVarName: "ELEVENLABS_VOICE_ID_ZH",
    }
  );
});

test("selectElevenLabsVoice keeps the existing English voice fallback", () => {
  assert.deepEqual(
    selectElevenLabsVoice("en", {
      ELEVENLABS_VOICE_ID: "american-female",
    }),
    {
      voiceId: "american-female",
      languageCode: "en",
      envVarName: "ELEVENLABS_VOICE_ID",
    }
  );
});

test("selectElevenLabsVoice prefers explicit English voice when set", () => {
  assert.deepEqual(
    selectElevenLabsVoice("en", {
      ELEVENLABS_VOICE_ID: "generic-voice",
      ELEVENLABS_VOICE_ID_EN: "english-voice",
    }),
    {
      voiceId: "english-voice",
      languageCode: "en",
      envVarName: "ELEVENLABS_VOICE_ID_EN",
    }
  );
});
