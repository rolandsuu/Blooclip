import assert from "node:assert/strict";
import test from "node:test";

import {
  buildAssSubtitleFile,
  buildClipScalePadFilters,
  normalizeRenderDimensions,
  readRenderDimensionsFromFfprobe,
} from "./video-rendering.ts";

test("readRenderDimensionsFromFfprobe preserves landscape source size", () => {
  const dimensions = readRenderDimensionsFromFfprobe({
    streams: [
      {
        width: 1920,
        height: 1080,
        sample_aspect_ratio: "1:1",
        display_aspect_ratio: "16:9",
      },
    ],
  });

  assert.deepEqual(dimensions, { width: 1920, height: 1080 });
  assert.deepEqual(buildClipScalePadFilters(dimensions), [
    "scale=1920:1080:force_original_aspect_ratio=decrease",
    "pad=1920:1080:(ow-iw)/2:(oh-ih)/2",
    "setsar=1",
  ]);
});

test("readRenderDimensionsFromFfprobe preserves portrait source size", () => {
  const dimensions = readRenderDimensionsFromFfprobe({
    streams: [
      {
        width: 1080,
        height: 1920,
        sample_aspect_ratio: "1:1",
        display_aspect_ratio: "9:16",
      },
    ],
  });

  assert.deepEqual(dimensions, { width: 1080, height: 1920 });
  assert.deepEqual(buildClipScalePadFilters(dimensions), [
    "scale=1080:1920:force_original_aspect_ratio=decrease",
    "pad=1080:1920:(ow-iw)/2:(oh-ih)/2",
    "setsar=1",
  ]);
});

test("buildAssSubtitleFile uses render dimensions and scales style", () => {
  const subtitles = buildAssSubtitleFile(
    [
      {
        startSeconds: 0,
        endSeconds: 2.5,
        text: "Prepare the cup stack",
      },
    ],
    { width: 1920, height: 1080 }
  );

  assert.match(subtitles, /PlayResX: 1920/);
  assert.match(subtitles, /PlayResY: 1080/);
  assert.match(subtitles, /Style: Default,Arial,33,/);
  assert.match(
    subtitles,
    /Dialogue: 0,0:00:00\.00,0:00:02\.50,Default,,0,0,0,,Prepare the cup stack/
  );
});

test("normalizeRenderDimensions rounds odd dimensions up for yuv420p", () => {
  assert.deepEqual(normalizeRenderDimensions({ width: 1919, height: 1079 }), {
    width: 1920,
    height: 1080,
  });
});
