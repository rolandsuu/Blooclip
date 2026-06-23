export const DEFAULT_UPLOAD_PROMPT =
  "识别视频中最重要的操作步骤和关键画面，剪成一段结构清晰的教学短片，并添加自然旁白和字幕。";

export const MAX_BATCH_UPLOAD_FILES = 10;

export function getTrimmedString(value: unknown) {
  if (typeof value !== "string" || value.trim() === "") {
    return null;
  }

  return value.trim();
}

export function normalizePrompt(value: unknown) {
  return getTrimmedString(value) ?? DEFAULT_UPLOAD_PROMPT;
}
