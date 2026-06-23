export const TARGET_LANGUAGE_OPTIONS = [
  {
    label: "中文",
    value: "zh",
  },
  {
    label: "英语",
    value: "en",
  },
  {
    label: "西班牙语",
    value: "es",
  },
  {
    label: "印地语",
    value: "hi",
  },
  {
    label: "阿拉伯语",
    value: "ar",
  },
  {
    label: "法语",
    value: "fr",
  },
  {
    label: "葡萄牙语",
    value: "pt",
  },
  {
    label: "俄语",
    value: "ru",
  },
  {
    label: "德语",
    value: "de",
  },
  {
    label: "日语",
    value: "ja",
  },
  {
    label: "韩语",
    value: "ko",
  },
] as const;

export const DEFAULT_TARGET_LANGUAGE = TARGET_LANGUAGE_OPTIONS[0].value;

const TARGET_LANGUAGE_LABELS_BY_CODE = new Map(
  TARGET_LANGUAGE_OPTIONS.map((option) => [option.value, option.label])
);

export function getTargetLanguageLabel(targetLanguage: string | null | undefined) {
  const trimmed = targetLanguage?.trim();
  const normalized = trimmed?.toLowerCase().replace(/_/g, "-");

  if (normalized === "zh" || normalized?.startsWith("zh-") || trimmed === "中文") {
    return "中文";
  }

  if (
    normalized === "en" ||
    normalized?.startsWith("en-") ||
    normalized === "english" ||
    trimmed === "英语"
  ) {
    return "英语";
  }

  const languageCode = normalized?.split("-")[0];
  const languageLabel = languageCode
    ? TARGET_LANGUAGE_LABELS_BY_CODE.get(languageCode)
    : null;

  if (languageLabel) {
    return languageLabel;
  }

  return trimmed ?? "未知";
}
