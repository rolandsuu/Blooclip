import { MAX_BATCH_UPLOAD_FILES } from "./upload-settings.ts";

export type ClientUploadFileLike = {
  name: string;
  type: string;
  size: number;
};

export type PreparedClientUploadFile<TFile extends ClientUploadFileLike> = {
  file: TFile;
  filename: string;
  contentType: string;
  size: number;
};

export type RejectedClientUploadFile<TFile extends ClientUploadFileLike> = {
  file: TFile;
  filename: string;
  error: string;
};

export type PreparedClientUploadFiles<TFile extends ClientUploadFileLike> = {
  accepted: PreparedClientUploadFile<TFile>[];
  rejected: RejectedClientUploadFile<TFile>[];
};

const ACCEPTED_VIDEO_CONTENT_TYPES = new Set([
  "video/mp4",
  "video/webm",
  "video/quicktime",
]);

const CONTENT_TYPE_BY_EXTENSION: Record<string, string> = {
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".mov": "video/quicktime",
};

function getFileExtension(filename: string) {
  const dotIndex = filename.lastIndexOf(".");

  if (dotIndex < 0) {
    return "";
  }

  return filename.slice(dotIndex).toLowerCase();
}

export function resolveVideoContentType(filename: string, browserType: string) {
  const normalizedType = browserType.split(";")[0]?.trim().toLowerCase() ?? "";

  if (ACCEPTED_VIDEO_CONTENT_TYPES.has(normalizedType)) {
    return normalizedType;
  }

  if (normalizedType) {
    return null;
  }

  return CONTENT_TYPE_BY_EXTENSION[getFileExtension(filename)] ?? null;
}

export function prepareClientUploadFiles<TFile extends ClientUploadFileLike>(
  files: readonly TFile[]
): PreparedClientUploadFiles<TFile> {
  if (files.length > MAX_BATCH_UPLOAD_FILES) {
    return {
      accepted: [],
      rejected: files.map((file) => ({
        file,
        filename: file.name.trim() || "未命名视频",
        error: `最多选择 ${MAX_BATCH_UPLOAD_FILES} 个视频。`,
      })),
    };
  }

  return files.reduce<PreparedClientUploadFiles<TFile>>(
    (result, file) => {
      const filename = file.name.trim();
      const contentType = resolveVideoContentType(filename, file.type);

      if (!filename) {
        result.rejected.push({
          file,
          filename: "未命名视频",
          error: "文件名不能为空。",
        });
        return result;
      }

      if (!contentType) {
        result.rejected.push({
          file,
          filename,
          error: "不支持的视频格式。请使用 MP4、WebM 或 MOV。",
        });
        return result;
      }

      if (
        !Number.isFinite(file.size) ||
        !Number.isInteger(file.size) ||
        file.size <= 0
      ) {
        result.rejected.push({
          file,
          filename,
          error: "视频文件为空。",
        });
        return result;
      }

      result.accepted.push({
        file,
        filename,
        contentType,
        size: file.size,
      });

      return result;
    },
    { accepted: [], rejected: [] }
  );
}
