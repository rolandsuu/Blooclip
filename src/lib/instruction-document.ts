export type InstructionDocumentFrameReference = {
  index: number;
  timestampSeconds: number;
};

export type InstructionDocumentKeyFrame = {
  visualFrameIndex: number;
  timestampSeconds: number;
  altText: string;
};

export type InstructionDocumentStep = {
  stepIndex: number;
  title: string;
  purpose: string;
  procedure: string;
  inspectionCriteria: string[];
  importantNotes: string[];
  timestampSeconds: number;
  sourceStartSeconds: number;
  sourceEndSeconds: number;
  keyFrame: InstructionDocumentKeyFrame;
};

export type InstructionDocument = {
  title: string;
  overview: string;
  targetLanguage: string;
  safetyPrecautions: string[];
  requiredToolsAndComponents: string[];
  finalInspectionChecklist: string[];
  maintenanceRecommendations: string[];
  steps: InstructionDocumentStep[];
};

export type InstructionDocumentArtifactStep = Omit<
  InstructionDocumentStep,
  "keyFrame"
> & {
  keyFrame: InstructionDocumentKeyFrame & {
    r2Key: string;
    sizeBytes: number;
  };
};

export type InstructionDocumentArtifact = Omit<
  InstructionDocument,
  "steps"
> & {
  videoId: string;
  sourceR2Key: string;
  transcriptR2Key: string;
  visualTimelineR2Key: string;
  editPlanR2Key: string;
  provider: string;
  providerRequestId: string | null;
  model: string;
  completedAt: string;
  sourceDurationSeconds: number;
  steps: InstructionDocumentArtifactStep[];
  rawResponse?: unknown;
};

export type ValidateInstructionDocumentOptions = {
  requestedTargetLanguage: string;
  sourceDurationSeconds: number;
  frameReferences: readonly InstructionDocumentFrameReference[];
  maxSteps?: number;
};

export class InstructionDocumentValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InstructionDocumentValidationError";
  }
}

export const INSTRUCTION_DOCUMENT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "title",
    "overview",
    "targetLanguage",
    "safetyPrecautions",
    "requiredToolsAndComponents",
    "finalInspectionChecklist",
    "maintenanceRecommendations",
    "steps",
  ],
  properties: {
    title: {
      type: "string",
      description: "Short user-facing title for the instruction document.",
    },
    safetyPrecautions: {
      type: "array",
      minItems: 1,
      maxItems: 12,
      items: { type: "string" },
      description:
        "Safety precautions to show as part of the customer-facing safety section.",
    },
    requiredToolsAndComponents: {
      type: "array",
      minItems: 0,
      maxItems: 20,
      items: { type: "string" },
      description:
        "Required tools and components needed for successful operation or installation. Can be empty if not identifiable.",
    },
    finalInspectionChecklist: {
      type: "array",
      minItems: 3,
      maxItems: 12,
      items: { type: "string" },
      description:
        "Final inspection checklist items customers should verify after completing all steps.",
    },
    maintenanceRecommendations: {
      type: "array",
      minItems: 1,
      maxItems: 12,
      items: { type: "string" },
      description:
        "Post-operation maintenance recommendations for continued safe operation.",
    },
    overview: {
      type: "string",
      description: "Brief summary of what the instruction steps teach.",
    },
    targetLanguage: {
      type: "string",
      description: "Must exactly match the requested target language value.",
    },
    steps: {
      type: "array",
      minItems: 1,
      description:
        "Ordered step-by-step instructions. Each step must include one key frame reference.",
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "stepIndex",
          "title",
          "purpose",
          "procedure",
          "inspectionCriteria",
          "timestampSeconds",
          "sourceStartSeconds",
          "sourceEndSeconds",
          "keyFrame",
        ],
        properties: {
          stepIndex: {
            type: "integer",
            minimum: 1,
            description: "One-based step index in chronological order.",
          },
          title: {
            type: "string",
            description: "Short user-facing step title.",
          },
          purpose: {
            type: "string",
            description:
              "Purpose of this step and what outcome it establishes.",
          },
          procedure: {
            type: "string",
            description:
              "Detailed operator procedure for this step. No markdown or HTML.",
          },
          inspectionCriteria: {
            type: "array",
            minItems: 1,
            maxItems: 6,
            items: { type: "string" },
            description:
              "Inspection criteria for this step. Operators should verify these points after completion.",
          },
          importantNotes: {
            type: "array",
            minItems: 0,
            maxItems: 6,
            items: { type: "string" },
            description:
              "Optional practical notes for operators for this step.",
          },
          timestampSeconds: {
            type: "number",
            minimum: 0,
            description:
              "Primary source-video timestamp for this instruction step.",
          },
          sourceStartSeconds: {
            type: "number",
            minimum: 0,
            description: "Start of the supporting source-video range.",
          },
          sourceEndSeconds: {
            type: "number",
            minimum: 0,
            description: "End of the supporting source-video range.",
          },
          keyFrame: {
            type: "object",
            additionalProperties: false,
            required: ["visualFrameIndex", "timestampSeconds", "altText"],
            properties: {
              visualFrameIndex: {
                type: "integer",
                minimum: 1,
                description:
                  "Index of the sampled visual frame that should represent this step.",
              },
              timestampSeconds: {
                type: "number",
                minimum: 0,
                description:
                  "Timestamp of the sampled visual frame. Must match the referenced frame index.",
              },
              altText: {
                type: "string",
                description: "Short accessible description of the key frame.",
              },
            },
          },
        },
      },
    },
  },
} as const;

const TOP_LEVEL_KEYS = new Set([
  "title",
  "overview",
  "targetLanguage",
  "safetyPrecautions",
  "requiredToolsAndComponents",
  "finalInspectionChecklist",
  "maintenanceRecommendations",
  "steps",
]);
const STEP_KEYS = new Set([
  "stepIndex",
  "title",
  "purpose",
  "procedure",
  "inspectionCriteria",
  "importantNotes",
  "timestampSeconds",
  "sourceStartSeconds",
  "sourceEndSeconds",
  "keyFrame",
]);
const KEY_FRAME_KEYS = new Set([
  "visualFrameIndex",
  "timestampSeconds",
  "altText",
]);

const STRING_LIMITS = {
  title: 140,
  overview: 1400,
  targetLanguage: 32,
  stepTitle: 110,
  purpose: 500,
  procedure: 2500,
  inspectionCriteria: 500,
  importantNotes: 500,
  safetyPrecaution: 500,
  requiredTool: 500,
  checklistItem: 500,
  finalChecklistItem: 500,
  maintenanceRecommendation: 500,
  altText: 240,
} as const;

const CONTROL_CHARACTER_PATTERN = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/;
const HTML_LIKE_PATTERN = /<\s*\/?\s*[a-z][^>]*>/i;
const SCRIPT_URL_PATTERN = /\b(?:javascript|data)\s*:/i;
const EVENT_HANDLER_PATTERN = /\bon[a-z]+\s*=/i;
const FRAME_TIMESTAMP_TOLERANCE_SECONDS = 0.05;
const DEFAULT_MAX_STEPS = 20;
const MAX_STEP_INSPECTION_CRITERIA = 6;
const MAX_STEP_NOTES = 6;
const MIN_SAFETY_PRECAUTIONS = 1;
const MAX_SAFETY_PRECAUTIONS = 12;
const MAX_REQUIRED_TOOLS = 20;
const MIN_FINAL_INSPECTION_CHECKLIST_ITEMS = 3;
const MAX_FINAL_INSPECTION_CHECKLIST_ITEMS = 12;
const MIN_MAINTENANCE_RECOMMENDATIONS = 1;
const MAX_MAINTENANCE_RECOMMENDATIONS = 12;

function fail(message: string): never {
  throw new InstructionDocumentValidationError(message);
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

function validateSafeString(
  value: unknown,
  fieldName: string,
  maxLength: number
) {
  if (typeof value !== "string") {
    fail(`${fieldName} must be a string`);
  }

  const trimmed = value.trim();

  if (!trimmed) {
    fail(`${fieldName} must be a non-empty string`);
  }

  if (trimmed.length > maxLength) {
    fail(`${fieldName} must be ${maxLength} characters or fewer`);
  }

  if (CONTROL_CHARACTER_PATTERN.test(trimmed)) {
    fail(`${fieldName} contains unsafe control characters`);
  }

  if (
    HTML_LIKE_PATTERN.test(trimmed) ||
    SCRIPT_URL_PATTERN.test(trimmed) ||
    EVENT_HANDLER_PATTERN.test(trimmed)
  ) {
    fail(`${fieldName} contains unsafe markup-like text`);
  }

  return trimmed;
}

function validateNumber(
  value: unknown,
  fieldName: string,
  sourceDurationSeconds: number
) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    fail(`${fieldName} must be a finite number`);
  }

  if (value < 0 || value > sourceDurationSeconds) {
    fail(`${fieldName} must be inside the source video duration`);
  }

  return Math.round(value * 100) / 100;
}

function validateStepIndex(value: unknown, expectedIndex: number) {
  if (
    typeof value !== "number" ||
    !Number.isInteger(value) ||
    value !== expectedIndex
  ) {
    fail(`steps[${expectedIndex - 1}].stepIndex must be ${expectedIndex}`);
  }

  return value;
}

function validateStringArray(
  value: unknown,
  fieldName: string,
  options: {
    minItems?: number;
    maxItems?: number;
    maxStringLength: number;
  }
) {
  if (!Array.isArray(value)) {
    fail(`${fieldName} must be an array`);
  }

  if (
    typeof options.minItems === "number" &&
    value.length < options.minItems
  ) {
    fail(`${fieldName} must contain at least ${options.minItems} item(s)`);
  }

  if (
    typeof options.maxItems === "number" &&
    value.length > options.maxItems
  ) {
    fail(`${fieldName} must contain ${options.maxItems} or fewer item(s)`);
  }

  return value.map((item, index) =>
    validateSafeString(item, `${fieldName}[${index}]`, options.maxStringLength)
  );
}

export function normalizeInstructionLanguage(value: string) {
  return value.trim().toLowerCase();
}

export function validateInstructionDocument(
  value: unknown,
  options: ValidateInstructionDocumentOptions
): InstructionDocument {
  if (!isRecord(value)) {
    fail("InstructionDocument must be an object");
  }

  assertAllowedKeys(value, TOP_LEVEL_KEYS, "InstructionDocument");

  const sourceDurationSeconds = options.sourceDurationSeconds;

  if (!Number.isFinite(sourceDurationSeconds) || sourceDurationSeconds <= 0) {
    fail("sourceDurationSeconds must be a positive finite number");
  }

  const frameMap = new Map<number, number>();

  for (const frame of options.frameReferences) {
    if (
      Number.isInteger(frame.index) &&
      frame.index > 0 &&
      Number.isFinite(frame.timestampSeconds) &&
      frame.timestampSeconds >= 0 &&
      frame.timestampSeconds <= sourceDurationSeconds
    ) {
      frameMap.set(frame.index, Math.round(frame.timestampSeconds * 100) / 100);
    }
  }

  if (frameMap.size === 0) {
    fail("At least one valid frame reference is required");
  }

  const targetLanguage = validateSafeString(
    value.targetLanguage,
    "targetLanguage",
    STRING_LIMITS.targetLanguage
  );

  if (
    normalizeInstructionLanguage(targetLanguage) !==
    normalizeInstructionLanguage(options.requestedTargetLanguage)
  ) {
    fail("targetLanguage must match the requested target language");
  }

  if (!Array.isArray(value.steps)) {
    fail("steps must be an array");
  }

  if (value.steps.length === 0) {
    fail("steps must contain at least one step");
  }

  const maxSteps = options.maxSteps ?? DEFAULT_MAX_STEPS;

  if (value.steps.length > maxSteps) {
    fail(`steps must contain ${maxSteps} or fewer steps`);
  }

  const steps = value.steps.map((rawStep, index): InstructionDocumentStep => {
    const fieldPrefix = `steps[${index}]`;

    if (!isRecord(rawStep)) {
      fail(`${fieldPrefix} must be an object`);
    }

    assertAllowedKeys(rawStep, STEP_KEYS, fieldPrefix);

    if (!isRecord(rawStep.keyFrame)) {
      fail(`${fieldPrefix}.keyFrame must be an object`);
    }

    assertAllowedKeys(rawStep.keyFrame, KEY_FRAME_KEYS, `${fieldPrefix}.keyFrame`);

    const stepIndex = validateStepIndex(rawStep.stepIndex, index + 1);
    const sourceStartSeconds = validateNumber(
      rawStep.sourceStartSeconds,
      `${fieldPrefix}.sourceStartSeconds`,
      sourceDurationSeconds
    );
    const sourceEndSeconds = validateNumber(
      rawStep.sourceEndSeconds,
      `${fieldPrefix}.sourceEndSeconds`,
      sourceDurationSeconds
    );
    const timestampSeconds = validateNumber(
      rawStep.timestampSeconds,
      `${fieldPrefix}.timestampSeconds`,
      sourceDurationSeconds
    );

    if (sourceEndSeconds <= sourceStartSeconds) {
      fail(`${fieldPrefix}.sourceEndSeconds must be greater than sourceStartSeconds`);
    }

    if (
      timestampSeconds < sourceStartSeconds ||
      timestampSeconds > sourceEndSeconds
    ) {
      fail(`${fieldPrefix}.timestampSeconds must be inside the step source range`);
    }

    const visualFrameIndex = rawStep.keyFrame.visualFrameIndex;

    if (
      typeof visualFrameIndex !== "number" ||
      !Number.isInteger(visualFrameIndex)
    ) {
      fail(`${fieldPrefix}.keyFrame.visualFrameIndex must be an integer`);
    }

    const expectedFrameTimestamp = frameMap.get(visualFrameIndex);

    if (typeof expectedFrameTimestamp !== "number") {
      fail(`${fieldPrefix}.keyFrame.visualFrameIndex references an unknown frame`);
    }

    const keyFrameTimestampSeconds = validateNumber(
      rawStep.keyFrame.timestampSeconds,
      `${fieldPrefix}.keyFrame.timestampSeconds`,
      sourceDurationSeconds
    );

    if (
      Math.abs(keyFrameTimestampSeconds - expectedFrameTimestamp) >
      FRAME_TIMESTAMP_TOLERANCE_SECONDS
    ) {
      fail(
        `${fieldPrefix}.keyFrame.timestampSeconds must match the referenced frame timestamp`
      );
    }

    if (
      keyFrameTimestampSeconds < sourceStartSeconds ||
      keyFrameTimestampSeconds > sourceEndSeconds
    ) {
      fail(`${fieldPrefix}.keyFrame.timestampSeconds must be inside the step source range`);
    }

    return {
      stepIndex,
      title: validateSafeString(
        rawStep.title,
        `${fieldPrefix}.title`,
        STRING_LIMITS.stepTitle
      ),
      purpose: validateSafeString(
        rawStep.purpose,
        `${fieldPrefix}.purpose`,
        STRING_LIMITS.purpose
      ),
      procedure: validateSafeString(
        rawStep.procedure,
        `${fieldPrefix}.procedure`,
        STRING_LIMITS.procedure
      ),
      inspectionCriteria: validateStringArray(
        rawStep.inspectionCriteria,
        `${fieldPrefix}.inspectionCriteria`,
        {
        minItems: 1,
          maxItems: MAX_STEP_INSPECTION_CRITERIA,
          maxStringLength: STRING_LIMITS.inspectionCriteria,
        }
      ),
      importantNotes: Array.isArray(rawStep.importantNotes)
        ? validateStringArray(rawStep.importantNotes, `${fieldPrefix}.importantNotes`, {
            minItems: 0,
            maxItems: MAX_STEP_NOTES,
            maxStringLength: STRING_LIMITS.importantNotes,
          })
        : [],
      timestampSeconds,
      sourceStartSeconds,
      sourceEndSeconds,
      keyFrame: {
        visualFrameIndex,
        timestampSeconds: keyFrameTimestampSeconds,
        altText: validateSafeString(
          rawStep.keyFrame.altText,
          `${fieldPrefix}.keyFrame.altText`,
          STRING_LIMITS.altText
        ),
      },
    };
  });

  const safetyPrecautions = validateStringArray(
    value.safetyPrecautions,
    "safetyPrecautions",
    {
    minItems: MIN_SAFETY_PRECAUTIONS,
    maxItems: MAX_SAFETY_PRECAUTIONS,
    maxStringLength: STRING_LIMITS.safetyPrecaution,
  });
  const requiredToolsAndComponents = validateStringArray(
    value.requiredToolsAndComponents,
    "requiredToolsAndComponents",
    {
    minItems: 0,
    maxItems: MAX_REQUIRED_TOOLS,
    maxStringLength: STRING_LIMITS.requiredTool,
  });
  const finalInspectionChecklist = validateStringArray(
    value.finalInspectionChecklist,
    "finalInspectionChecklist",
    {
    minItems: MIN_FINAL_INSPECTION_CHECKLIST_ITEMS,
    maxItems: MAX_FINAL_INSPECTION_CHECKLIST_ITEMS,
    maxStringLength: STRING_LIMITS.finalChecklistItem,
  });
  const maintenanceRecommendations = validateStringArray(
    value.maintenanceRecommendations,
    "maintenanceRecommendations",
    {
    minItems: MIN_MAINTENANCE_RECOMMENDATIONS,
    maxItems: MAX_MAINTENANCE_RECOMMENDATIONS,
    maxStringLength: STRING_LIMITS.maintenanceRecommendation,
  });

  return {
    title: validateSafeString(value.title, "title", STRING_LIMITS.title),
    overview: validateSafeString(
      value.overview,
      "overview",
      STRING_LIMITS.overview
    ),
    targetLanguage,
    steps,
    safetyPrecautions,
    requiredToolsAndComponents,
    finalInspectionChecklist,
    maintenanceRecommendations,
  };
}
