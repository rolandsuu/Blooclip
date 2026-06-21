import assert from "node:assert/strict";
import test from "node:test";

import { getProcessingDisplay } from "./processing-stage-copy.ts";

test("getProcessingDisplay maps queued state to plain waiting copy", () => {
  const display = getProcessingDisplay({
    status: "queued",
    currentStage: "queued",
    progress: 5,
  });

  assert.equal(display.title, "Waiting for AI worker");
  assert.equal(display.statusLabel, "Working");
  assert.equal(display.tone, "active");
  assert.equal(display.progress, 5);
});

test("getProcessingDisplay maps visual analysis to newbie-friendly copy", () => {
  const display = getProcessingDisplay({
    status: "processing",
    currentStage: "analyzing_visuals",
    progress: 50,
  });

  assert.equal(display.title, "Understanding your video");
  assert.match(display.detail, /visual details/);
  assert.equal(display.tone, "active");
});

test("getProcessingDisplay shows completed work as done at 100 percent", () => {
  const display = getProcessingDisplay({
    status: "completed",
    currentStage: "completed",
    progress: 98,
  });

  assert.equal(display.title, "Final video ready");
  assert.equal(display.statusLabel, "Done");
  assert.equal(display.tone, "success");
  assert.equal(display.progress, 100);
});

test("getProcessingDisplay keeps provider error messages visible", () => {
  const display = getProcessingDisplay({
    status: "failed",
    currentStage: "rendering_final",
    progress: 95,
    errorMessage: "ffmpeg failed while rendering subtitles",
  });

  assert.equal(display.title, "Processing failed");
  assert.equal(display.detail, "ffmpeg failed while rendering subtitles");
  assert.equal(display.tone, "error");
});

test("getProcessingDisplay handles canceled jobs", () => {
  const display = getProcessingDisplay({
    status: "canceled",
    currentStage: "canceled",
    progress: 24,
  });

  assert.equal(display.title, "Processing canceled");
  assert.equal(display.statusLabel, "Canceled");
  assert.equal(display.tone, "canceled");
});

test("getProcessingDisplay handles upload failures before generic failures", () => {
  const display = getProcessingDisplay({
    status: "failed",
    currentStage: "upload_failed",
    progress: 0,
    errorMessage: "Network connection dropped",
  });

  assert.equal(display.title, "Upload failed");
  assert.match(display.detail, /did not finish uploading/);
  assert.equal(display.tone, "error");
});

test("getProcessingDisplay falls back safely for unknown stages", () => {
  const display = getProcessingDisplay({
    status: "processing",
    currentStage: "new_worker_stage",
    progress: 142,
  });

  assert.equal(display.title, "AI is working");
  assert.equal(display.detail, "Blooclip is processing this video.");
  assert.equal(display.tone, "active");
  assert.equal(display.progress, 100);
});
