import assert from "node:assert/strict";
import test from "node:test";

import {
  buildSmoothBouncingWatermarkAss,
  calculateWatermarkSegments,
  resolveWatermarkLayout,
} from "./smooth-bouncing-watermark.ts";

function assertClose(actual: number, expected: number, epsilon = 0.01) {
  assert.ok(
    Math.abs(actual - expected) <= epsilon,
    `expected ${actual} to be within ${epsilon} of ${expected}`
  );
}

test("calculateWatermarkSegments matches the 1366x768 reference trajectory", () => {
  const layout = resolveWatermarkLayout({ width: 1366, height: 768 });
  const segments = calculateWatermarkSegments(layout, 73);

  assertClose(segments[0].startSeconds, 0);
  assertClose(segments[0].startX, 150);
  assertClose(segments[0].startY, 490);

  assertClose(segments[0].endSeconds, 24.444, 0.001);
  assertClose(segments[0].endX, 883.33);
  assertClose(segments[0].endY, 50);

  assertClose(segments[1].endSeconds, 34.667, 0.001);
  assertClose(segments[1].endX, 1190);
  assertClose(segments[1].endY, 234);

  assertClose(segments[2].endSeconds, 57.778, 0.001);
  assertClose(segments[2].endX, 496.67);
  assertClose(segments[2].endY, 650);

  assertClose(segments[3].endSeconds, 72.667, 0.001);
  assertClose(segments[3].endX, 50);
  assertClose(segments[3].endY, 382);
});

test("calculateWatermarkSegments keeps segment boundaries continuous", () => {
  const layout = resolveWatermarkLayout({ width: 1920, height: 1080 });
  const segments = calculateWatermarkSegments(layout, 120);

  assert.ok(segments.length > 4);

  for (let index = 0; index < segments.length - 1; index += 1) {
    const current = segments[index];
    const next = segments[index + 1];

    assert.equal(current.endSeconds, next.startSeconds);
    assert.equal(current.endX, next.startX);
    assert.equal(current.endY, next.startY);
    assert.ok(current.endSeconds > current.startSeconds);
  }
});

test("resolveWatermarkLayout scales the reference layout for 1920x1080 output", () => {
  const layout = resolveWatermarkLayout({ width: 1920, height: 1080 });

  assert.equal(layout.fontSize, 51);
  assertClose(layout.startX, 210.83);
  assertClose(layout.startY, 689.06);
  assertClose(layout.left, 70.28);
  assertClose(layout.right, 1672.62);
  assertClose(layout.top, 70.31);
  assertClose(layout.bottom, 914.06);
  assertClose(layout.velocityX, 42.17);
  assertClose(layout.velocityY, -25.31);
});

test("buildSmoothBouncingWatermarkAss emits libass move animation events", () => {
  const ass = buildSmoothBouncingWatermarkAss({
    dimensions: { width: 1366, height: 768 },
    durationSeconds: 35,
  });

  assert.match(ass, /PlayResX: 1366/);
  assert.match(ass, /PlayResY: 768/);
  assert.match(ass, /Style: Watermark,Noto Sans CJK SC,36,&HCCFFFFFF/);
  assert.match(ass, /\\an7\\frz22\\fs36\\alpha&HCC&/);
  assert.match(
    ass,
    /\\move\(150\.00,490\.00,883\.33,50\.00,0,24444\)/
  );
  assert.match(ass, /CSJ创赛捷/);
});
