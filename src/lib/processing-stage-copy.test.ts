import assert from "node:assert/strict";
import test from "node:test";

import { getProcessingDisplay } from "./processing-stage-copy.ts";

test("getProcessingDisplay maps queued state to plain Chinese waiting copy", () => {
  const display = getProcessingDisplay({
    status: "queued",
    currentStage: "queued",
    progress: 5,
  });

  assert.equal(display.title, "等待 AI 处理器");
  assert.equal(display.statusLabel, "处理中");
  assert.equal(display.tone, "active");
  assert.equal(display.progress, 5);
});

test("getProcessingDisplay maps visual analysis to Chinese copy", () => {
  const display = getProcessingDisplay({
    status: "processing",
    currentStage: "analyzing_visuals",
    progress: 50,
  });

  assert.equal(display.title, "正在理解视频");
  assert.match(display.detail, /画面细节/);
  assert.equal(display.tone, "active");
});

test("getProcessingDisplay shows completed work as done at 100 percent", () => {
  const display = getProcessingDisplay({
    status: "completed",
    currentStage: "completed",
    progress: 98,
  });

  assert.equal(display.title, "最终视频已完成");
  assert.equal(display.statusLabel, "完成");
  assert.equal(display.tone, "success");
  assert.equal(display.progress, 100);
});

test("getProcessingDisplay hides raw provider error messages from visible copy", () => {
  const display = getProcessingDisplay({
    status: "failed",
    currentStage: "rendering_final",
    progress: 95,
    errorMessage: "ffmpeg failed while rendering subtitles",
  });

  assert.equal(display.title, "处理失败");
  assert.equal(display.detail, "Volts24 没能完成这个视频。请重新上传后再试。");
  assert.equal(display.tone, "error");
});

test("getProcessingDisplay handles canceled jobs", () => {
  const display = getProcessingDisplay({
    status: "canceled",
    currentStage: "canceled",
    progress: 24,
  });

  assert.equal(display.title, "处理已取消");
  assert.equal(display.statusLabel, "已取消");
  assert.equal(display.tone, "canceled");
});

test("getProcessingDisplay handles upload failures before generic failures", () => {
  const display = getProcessingDisplay({
    status: "failed",
    currentStage: "upload_failed",
    progress: 0,
    errorMessage: "Network connection dropped",
  });

  assert.equal(display.title, "上传失败");
  assert.match(display.detail, /没有成功上传/);
  assert.equal(display.tone, "error");
});

test("getProcessingDisplay falls back safely for unknown stages", () => {
  const display = getProcessingDisplay({
    status: "processing",
    currentStage: "new_worker_stage",
    progress: 142,
  });

  assert.equal(display.title, "AI 正在处理");
  assert.equal(display.detail, "Volts24 正在处理这个视频。");
  assert.equal(display.tone, "active");
  assert.equal(display.progress, 100);
});
