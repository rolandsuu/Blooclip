export const TARGET_LANGUAGE_OPTIONS = [
  {
    label: "中文",
    value: "zh",
  },
  {
    label: "英语",
    value: "en",
  },
] as const;

export const DEFAULT_TARGET_LANGUAGE = TARGET_LANGUAGE_OPTIONS[0].value;

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

  return trimmed ?? "未知";
}
