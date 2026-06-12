export type VideoEventImportance = "primary" | "supporting" | "context";

export type VideoEventAnalysisEvent = {
  eventIndex: number;
  title: string;
  description: string;
  startSeconds: number;
  endSeconds: number;
  importance: VideoEventImportance;
  confidence: number;
  visualEvidence: string;
  transcriptEvidence: string;
};

export type VideoEventAnalysisRecommendedSegment = {
  segmentIndex: number;
  eventIndex: number;
  sourceStart: number;
  sourceEnd: number;
  reason: string;
  confidence: number;
};

export type VideoEventAnalysisOmittedRange = {
  sourceStart: number;
  sourceEnd: number;
  reason: string;
};

export type VideoEventAnalysis = {
  summary: string;
  events: VideoEventAnalysisEvent[];
  primaryEventIndex: number;
  recommendedSegments: VideoEventAnalysisRecommendedSegment[];
  omittedRanges: VideoEventAnalysisOmittedRange[];
  warnings: string[];
};

export type VideoEventAnalysisArtifact = VideoEventAnalysis & {
  videoId: string;
  sourceR2Key: string;
  transcriptR2Key: string;
  provider: string;
  providerRequestId: string | null;
  model: string;
  completedAt: string;
  sourceDurationSeconds: number;
  prompt: string;
  targetLanguage: string;
  rawResponse?: unknown;
  usage?: unknown;
};

export type ValidateVideoEventAnalysisOptions = {
  sourceDurationSeconds: number;
};

export class VideoEventAnalysisValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "VideoEventAnalysisValidationError";
  }
}

export const VIDEO_EVENT_ANALYSIS_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "summary",
    "events",
    "primaryEventIndex",
    "recommendedSegments",
    "omittedRanges",
    "warnings",
  ],
  properties: {
    summary: {
      type: "string",
      description: "Concise whole-video summary for the editing planner.",
    },
    events: {
      type: "array",
      minItems: 1,
      description:
        "Chronological key events found by watching the full source video.",
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "eventIndex",
          "title",
          "description",
          "startSeconds",
          "endSeconds",
          "importance",
          "confidence",
          "visualEvidence",
          "transcriptEvidence",
        ],
        properties: {
          eventIndex: {
            type: "integer",
            minimum: 1,
            description: "One-based event index in chronological order.",
          },
          title: {
            type: "string",
            description: "Short editor-facing title for this event.",
          },
          description: {
            type: "string",
            description: "What happens during this event.",
          },
          startSeconds: {
            type: "number",
            minimum: 0,
            description: "Event start time in source video seconds.",
          },
          endSeconds: {
            type: "number",
            minimum: 0,
            description: "Event end time in source video seconds.",
          },
          importance: {
            type: "string",
            enum: ["primary", "supporting", "context"],
            description: "How important this event is to the requested edit.",
          },
          confidence: {
            type: "number",
            minimum: 0,
            maximum: 1,
            description: "Confidence from 0 to 1.",
          },
          visualEvidence: {
            type: "string",
            description: "Visual evidence seen in the source video.",
          },
          transcriptEvidence: {
            type: "string",
            description: "Speech/audio evidence or 'No speech evidence'.",
          },
        },
      },
    },
    primaryEventIndex: {
      type: "integer",
      minimum: 1,
      description: "eventIndex of the most important whole-video event.",
    },
    recommendedSegments: {
      type: "array",
      description:
        "Source ranges the edit planner should strongly consider preserving.",
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "segmentIndex",
          "eventIndex",
          "sourceStart",
          "sourceEnd",
          "reason",
          "confidence",
        ],
        properties: {
          segmentIndex: {
            type: "integer",
            minimum: 1,
            description: "One-based recommended segment index.",
          },
          eventIndex: {
            type: "integer",
            minimum: 1,
            description: "Related eventIndex.",
          },
          sourceStart: {
            type: "number",
            minimum: 0,
            description: "Segment start time in source video seconds.",
          },
          sourceEnd: {
            type: "number",
            minimum: 0,
            description: "Segment end time in source video seconds.",
          },
          reason: {
            type: "string",
            description: "Why this segment matters for the requested edit.",
          },
          confidence: {
            type: "number",
            minimum: 0,
            maximum: 1,
            description: "Confidence from 0 to 1.",
          },
        },
      },
    },
    omittedRanges: {
      type: "array",
      description: "Chronological source ranges likely safe to omit.",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["sourceStart", "sourceEnd", "reason"],
        properties: {
          sourceStart: {
            type: "number",
            minimum: 0,
            description: "Range start time in source video seconds.",
          },
          sourceEnd: {
            type: "number",
            minimum: 0,
            description: "Range end time in source video seconds.",
          },
          reason: {
            type: "string",
            description: "Why this range appears less important.",
          },
        },
      },
    },
    warnings: {
      type: "array",
      items: { type: "string" },
      description: "Uncertainty notes, limitations, or empty array.",
    },
  },
} as const;

const TOP_LEVEL_KEYS = new Set([
  "summary",
  "events",
  "primaryEventIndex",
  "recommendedSegments",
  "omittedRanges",
  "warnings",
]);
const EVENT_KEYS = new Set([
  "eventIndex",
  "title",
  "description",
  "startSeconds",
  "endSeconds",
  "importance",
  "confidence",
  "visualEvidence",
  "transcriptEvidence",
]);
const RECOMMENDED_SEGMENT_KEYS = new Set([
  "segmentIndex",
  "eventIndex",
  "sourceStart",
  "sourceEnd",
  "reason",
  "confidence",
]);
const OMITTED_RANGE_KEYS = new Set(["sourceStart", "sourceEnd", "reason"]);
const IMPORTANCE_VALUES = new Set<VideoEventImportance>([
  "primary",
  "supporting",
  "context",
]);
const CONTROL_CHARACTER_PATTERN = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/;
const HTML_LIKE_PATTERN = /<\s*\/?\s*[a-z][^>]*>/i;
const SCRIPT_URL_PATTERN = /\b(?:javascript|data)\s*:/i;
const EVENT_HANDLER_PATTERN = /\bon[a-z]+\s*=/i;

function fail(message: string): never {
  throw new VideoEventAnalysisValidationError(message);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function assertAllowedKeys(
  value: Record<string, unknown>,
  allowedKeys: ReadonlySet<string>,
  fieldName: string
) {
  for (const key of Object.keys(value)) {
    if (!allowedKeys.has(key)) {
      fail(`${fieldName} contains unsupported field ${key}`);
    }
  }
}

function validateSafeString(value: unknown, fieldName: string, maxLength: number) {
  if (typeof value !== "string") {
    fail(`${fieldName} must be a string`);
  }

  const trimmed = value.trim();

  if (!trimmed) {
    fail(`${fieldName} must not be empty`);
  }

  if (trimmed.length > maxLength) {
    fail(`${fieldName} must be ${maxLength} characters or fewer`);
  }

  if (
    CONTROL_CHARACTER_PATTERN.test(trimmed) ||
    HTML_LIKE_PATTERN.test(trimmed) ||
    SCRIPT_URL_PATTERN.test(trimmed) ||
    EVENT_HANDLER_PATTERN.test(trimmed)
  ) {
    fail(`${fieldName} contains unsafe markup-like text`);
  }

  return trimmed;
}

function validateNumber(value: unknown, fieldName: string) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    fail(`${fieldName} must be a finite number`);
  }

  return Math.round(value * 100) / 100;
}

function validatePositiveInteger(value: unknown, fieldName: string) {
  if (typeof value !== "number" || !Number.isInteger(value) || value <= 0) {
    fail(`${fieldName} must be a positive integer`);
  }

  return value;
}

function validateConfidence(value: unknown, fieldName: string) {
  const confidence = validateNumber(value, fieldName);

  if (confidence < 0 || confidence > 1) {
    fail(`${fieldName} must be between 0 and 1`);
  }

  return confidence;
}

function validateRange(
  start: unknown,
  end: unknown,
  fieldName: string,
  sourceDurationSeconds: number
) {
  const sourceStart = validateNumber(start, `${fieldName}.sourceStart`);
  const sourceEnd = validateNumber(end, `${fieldName}.sourceEnd`);

  if (sourceStart < 0 || sourceEnd > sourceDurationSeconds) {
    fail(`${fieldName} must be inside the source video duration`);
  }

  if (sourceEnd <= sourceStart) {
    fail(`${fieldName} must have sourceStart before sourceEnd`);
  }

  return { sourceStart, sourceEnd };
}

export function validateVideoEventAnalysis(
  value: unknown,
  options: ValidateVideoEventAnalysisOptions
): VideoEventAnalysis {
  if (!isRecord(value)) {
    fail("Video event analysis must be an object");
  }

  if (
    !Number.isFinite(options.sourceDurationSeconds) ||
    options.sourceDurationSeconds <= 0
  ) {
    fail("sourceDurationSeconds must be positive");
  }

  assertAllowedKeys(value, TOP_LEVEL_KEYS, "videoEventAnalysis");

  const summary = validateSafeString(value.summary, "summary", 1200);

  if (!Array.isArray(value.events) || value.events.length === 0) {
    fail("events must contain at least one event");
  }

  const eventIndexes = new Set<number>();
  const events: VideoEventAnalysisEvent[] = value.events.map((event, index) => {
    const fieldName = `events[${index}]`;

    if (!isRecord(event)) {
      fail(`${fieldName} must be an object`);
    }

    assertAllowedKeys(event, EVENT_KEYS, fieldName);

    const eventIndex = validatePositiveInteger(
      event.eventIndex,
      `${fieldName}.eventIndex`
    );
    const startSeconds = validateNumber(
      event.startSeconds,
      `${fieldName}.startSeconds`
    );
    const endSeconds = validateNumber(event.endSeconds, `${fieldName}.endSeconds`);

    if (eventIndexes.has(eventIndex)) {
      fail(`${fieldName}.eventIndex must be unique`);
    }

    eventIndexes.add(eventIndex);

    if (startSeconds < 0 || endSeconds > options.sourceDurationSeconds) {
      fail(`${fieldName} must be inside the source video duration`);
    }

    if (endSeconds <= startSeconds) {
      fail(`${fieldName} must have startSeconds before endSeconds`);
    }

    if (!IMPORTANCE_VALUES.has(event.importance as VideoEventImportance)) {
      fail(`${fieldName}.importance must be primary, supporting, or context`);
    }

    return {
      eventIndex,
      title: validateSafeString(event.title, `${fieldName}.title`, 140),
      description: validateSafeString(
        event.description,
        `${fieldName}.description`,
        1200
      ),
      startSeconds,
      endSeconds,
      importance: event.importance as VideoEventImportance,
      confidence: validateConfidence(event.confidence, `${fieldName}.confidence`),
      visualEvidence: validateSafeString(
        event.visualEvidence,
        `${fieldName}.visualEvidence`,
        1200
      ),
      transcriptEvidence: validateSafeString(
        event.transcriptEvidence,
        `${fieldName}.transcriptEvidence`,
        1200
      ),
    };
  });

  const primaryEventIndex = validatePositiveInteger(
    value.primaryEventIndex,
    "primaryEventIndex"
  );

  if (!eventIndexes.has(primaryEventIndex)) {
    fail("primaryEventIndex must reference an existing event");
  }

  if (!Array.isArray(value.recommendedSegments)) {
    fail("recommendedSegments must be an array");
  }

  const recommendedSegments: VideoEventAnalysisRecommendedSegment[] =
    value.recommendedSegments.map((segment, index) => {
      const fieldName = `recommendedSegments[${index}]`;

      if (!isRecord(segment)) {
        fail(`${fieldName} must be an object`);
      }

      assertAllowedKeys(segment, RECOMMENDED_SEGMENT_KEYS, fieldName);

      const segmentIndex = validatePositiveInteger(
        segment.segmentIndex,
        `${fieldName}.segmentIndex`
      );
      const eventIndex = validatePositiveInteger(
        segment.eventIndex,
        `${fieldName}.eventIndex`
      );

      if (!eventIndexes.has(eventIndex)) {
        fail(`${fieldName}.eventIndex must reference an existing event`);
      }

      const { sourceStart, sourceEnd } = validateRange(
        segment.sourceStart,
        segment.sourceEnd,
        fieldName,
        options.sourceDurationSeconds
      );

      return {
        segmentIndex,
        eventIndex,
        sourceStart,
        sourceEnd,
        reason: validateSafeString(segment.reason, `${fieldName}.reason`, 800),
        confidence: validateConfidence(
          segment.confidence,
          `${fieldName}.confidence`
        ),
      };
    });

  if (!Array.isArray(value.omittedRanges)) {
    fail("omittedRanges must be an array");
  }

  const omittedRanges: VideoEventAnalysisOmittedRange[] = value.omittedRanges.map(
    (range, index) => {
      const fieldName = `omittedRanges[${index}]`;

      if (!isRecord(range)) {
        fail(`${fieldName} must be an object`);
      }

      assertAllowedKeys(range, OMITTED_RANGE_KEYS, fieldName);
      const { sourceStart, sourceEnd } = validateRange(
        range.sourceStart,
        range.sourceEnd,
        fieldName,
        options.sourceDurationSeconds
      );

      return {
        sourceStart,
        sourceEnd,
        reason: validateSafeString(range.reason, `${fieldName}.reason`, 800),
      };
    }
  );

  if (!Array.isArray(value.warnings)) {
    fail("warnings must be an array");
  }

  const warnings = value.warnings.map((warning, index) =>
    validateSafeString(warning, `warnings[${index}]`, 500)
  );

  return {
    summary,
    events,
    primaryEventIndex,
    recommendedSegments,
    omittedRanges,
    warnings,
  };
}
