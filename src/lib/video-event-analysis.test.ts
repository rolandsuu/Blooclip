import assert from "node:assert/strict";
import test from "node:test";

import {
  VideoEventAnalysisValidationError,
  validateVideoEventAnalysis,
  type VideoEventAnalysis,
} from "./video-event-analysis.ts";

function validAnalysis(
  overrides: Partial<VideoEventAnalysis> = {}
): VideoEventAnalysis {
  return {
    summary: "The video shows a machine assembly workflow.",
    events: [
      {
        eventIndex: 1,
        title: "Align the frame",
        description: "The operator aligns the metal frame on the platform.",
        startSeconds: 3,
        endSeconds: 12,
        importance: "primary",
        confidence: 0.86,
        visualEvidence: "The frame is placed and adjusted on the platform.",
        transcriptEvidence: "The narration explains the alignment step.",
      },
    ],
    primaryEventIndex: 1,
    recommendedSegments: [
      {
        segmentIndex: 1,
        eventIndex: 1,
        sourceStart: 2.5,
        sourceEnd: 13,
        reason: "This segment preserves the key setup action.",
        confidence: 0.82,
      },
    ],
    omittedRanges: [
      {
        sourceStart: 13,
        sourceEnd: 18,
        reason: "The camera waits without new action.",
      },
    ],
    warnings: ["Fast hand motion may reduce timestamp precision."],
    ...overrides,
  };
}

function validate(value: unknown) {
  return validateVideoEventAnalysis(value, {
    sourceDurationSeconds: 30,
  });
}

test("validateVideoEventAnalysis accepts a valid event analysis", () => {
  const analysis = validate(validAnalysis());

  assert.equal(analysis.events.length, 1);
  assert.equal(analysis.primaryEventIndex, 1);
  assert.equal(analysis.recommendedSegments[0].sourceStart, 2.5);
});

test("validateVideoEventAnalysis rejects empty events", () => {
  assert.throws(
    () => validate(validAnalysis({ events: [] })),
    /events must contain at least one event/
  );
});

test("validateVideoEventAnalysis rejects invalid primary event references", () => {
  assert.throws(
    () => validate(validAnalysis({ primaryEventIndex: 2 })),
    /primaryEventIndex must reference an existing event/
  );
});

test("validateVideoEventAnalysis rejects out-of-range event timestamps", () => {
  assert.throws(
    () =>
      validate(
        validAnalysis({
          events: [
            {
              ...validAnalysis().events[0],
              endSeconds: 31,
            },
          ],
        })
      ),
    /events\[0\] must be inside the source video duration/
  );
});

test("validateVideoEventAnalysis rejects invalid segment ranges", () => {
  assert.throws(
    () =>
      validate(
        validAnalysis({
          recommendedSegments: [
            {
              ...validAnalysis().recommendedSegments[0],
              sourceStart: 20,
              sourceEnd: 18,
            },
          ],
        })
      ),
    /recommendedSegments\[0\] must have sourceStart before sourceEnd/
  );
});

test("validateVideoEventAnalysis rejects invalid confidence values", () => {
  assert.throws(
    () =>
      validate(
        validAnalysis({
          events: [
            {
              ...validAnalysis().events[0],
              confidence: 1.5,
            },
          ],
        })
      ),
    /events\[0\]\.confidence must be between 0 and 1/
  );
});

test("validateVideoEventAnalysis rejects unsupported fields", () => {
  assert.throws(
    () => validate({ ...validAnalysis(), extra: true }),
    VideoEventAnalysisValidationError
  );
});
