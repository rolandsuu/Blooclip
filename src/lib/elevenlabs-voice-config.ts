export type ElevenLabsVoiceEnvironment = {
  [key: string]: string | undefined;
  ELEVENLABS_VOICE_ID?: string;
  ELEVENLABS_VOICE_ID_EN?: string;
  ELEVENLABS_VOICE_ID_ZH?: string;
};

export type ElevenLabsVoiceSelection = {
  voiceId: string;
  languageCode: string | null;
  envVarName: string;
};

export class ElevenLabsVoiceConfigError extends Error {
  readonly code: string;
  readonly envVarName: string;

  constructor(message: string, code: string, envVarName: string) {
    super(message);
    this.name = "ElevenLabsVoiceConfigError";
    this.code = code;
    this.envVarName = envVarName;
  }
}

function readEnvValue(value: string | undefined) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function getElevenLabsLanguageCode(targetLanguage: string) {
  const normalized = targetLanguage.trim().toLowerCase().replace(/_/g, "-");

  if (
    normalized === "zh" ||
    normalized.startsWith("zh-") ||
    normalized === "chinese" ||
    targetLanguage.trim() === "中文"
  ) {
    return "zh";
  }

  if (
    normalized === "en" ||
    normalized.startsWith("en-") ||
    normalized === "english"
  ) {
    return "en";
  }

  return /^[a-z]{2}$/.test(normalized) ? normalized : null;
}

export function selectElevenLabsVoice(
  targetLanguage: string,
  env: ElevenLabsVoiceEnvironment
): ElevenLabsVoiceSelection {
  const languageCode = getElevenLabsLanguageCode(targetLanguage);

  if (languageCode === "zh") {
    const voiceId = readEnvValue(env.ELEVENLABS_VOICE_ID_ZH);

    if (!voiceId) {
      throw new ElevenLabsVoiceConfigError(
        "Missing Chinese ElevenLabs voice ID. Set ELEVENLABS_VOICE_ID_ZH.",
        "elevenlabs_chinese_voice_id_missing",
        "ELEVENLABS_VOICE_ID_ZH"
      );
    }

    return {
      voiceId,
      languageCode,
      envVarName: "ELEVENLABS_VOICE_ID_ZH",
    };
  }

  if (languageCode === "en") {
    const explicitEnglishVoiceId = readEnvValue(env.ELEVENLABS_VOICE_ID_EN);
    const fallbackVoiceId = readEnvValue(env.ELEVENLABS_VOICE_ID);
    const voiceId = explicitEnglishVoiceId ?? fallbackVoiceId;

    if (!voiceId) {
      throw new ElevenLabsVoiceConfigError(
        "Missing English ElevenLabs voice ID. Set ELEVENLABS_VOICE_ID_EN or ELEVENLABS_VOICE_ID.",
        "elevenlabs_english_voice_id_missing",
        "ELEVENLABS_VOICE_ID_EN"
      );
    }

    return {
      voiceId,
      languageCode,
      envVarName: explicitEnglishVoiceId
        ? "ELEVENLABS_VOICE_ID_EN"
        : "ELEVENLABS_VOICE_ID",
    };
  }

  const voiceId = readEnvValue(env.ELEVENLABS_VOICE_ID);

  if (!voiceId) {
    throw new ElevenLabsVoiceConfigError(
      "Missing ElevenLabs voice ID. Set ELEVENLABS_VOICE_ID.",
      "elevenlabs_voice_id_missing",
      "ELEVENLABS_VOICE_ID"
    );
  }

  return {
    voiceId,
    languageCode,
    envVarName: "ELEVENLABS_VOICE_ID",
  };
}
