import assert from "node:assert/strict";
import test from "node:test";

import {
  prepareClientUploadFiles,
  resolveVideoContentType,
  type ClientUploadFileLike,
} from "./client-upload.ts";

function file(
  name: string,
  type = "video/mp4",
  size = 1024
): ClientUploadFileLike {
  return {
    name,
    type,
    size,
  };
}

test("resolveVideoContentType accepts backend-supported browser types", () => {
  assert.equal(resolveVideoContentType("clip.mp4", "video/mp4"), "video/mp4");
  assert.equal(resolveVideoContentType("clip.webm", "video/webm"), "video/webm");
  assert.equal(
    resolveVideoContentType("clip.mov", "video/quicktime"),
    "video/quicktime"
  );
});

test("resolveVideoContentType falls back to common extensions only when browser type is empty", () => {
  assert.equal(resolveVideoContentType("clip.MP4", ""), "video/mp4");
  assert.equal(resolveVideoContentType("clip.WEBM", ""), "video/webm");
  assert.equal(resolveVideoContentType("clip.MOV", ""), "video/quicktime");
  assert.equal(resolveVideoContentType("clip.mp4", "application/octet-stream"), null);
});

test("prepareClientUploadFiles rejects unsupported video types", () => {
  const result = prepareClientUploadFiles([file("notes.txt", "text/plain")]);

  assert.equal(result.accepted.length, 0);
  assert.deepEqual(result.rejected.map((upload) => upload.error), [
    "不支持的视频格式。请使用 MP4、WebM 或 MOV。",
  ]);
});

test("prepareClientUploadFiles enforces the ten-file upload limit", () => {
  const result = prepareClientUploadFiles(
    Array.from({ length: 11 }, (_, index) => file(`clip-${index + 1}.mp4`))
  );

  assert.equal(result.accepted.length, 0);
  assert.equal(result.rejected.length, 11);
  assert.equal(result.rejected[0].error, "最多选择 10 个视频。");
});

test("prepareClientUploadFiles rejects empty files", () => {
  const result = prepareClientUploadFiles([file("empty.mp4", "video/mp4", 0)]);

  assert.equal(result.accepted.length, 0);
  assert.deepEqual(result.rejected.map((upload) => upload.error), [
    "视频文件为空。",
  ]);
});

test("prepareClientUploadFiles accepts valid uploads with normalized content type", () => {
  const result = prepareClientUploadFiles([
    file("  launch.mp4  ", "VIDEO/MP4", 2048),
  ]);

  assert.deepEqual(
    result.accepted.map(({ filename, contentType, size }) => ({
      filename,
      contentType,
      size,
    })),
    [
      {
        filename: "launch.mp4",
        contentType: "video/mp4",
        size: 2048,
      },
    ]
  );
  assert.equal(result.rejected.length, 0);
});
