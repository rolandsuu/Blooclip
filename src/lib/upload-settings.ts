export const DEFAULT_UPLOAD_PROMPT =
  "生成带旁白和字幕的关键事件视频";

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
