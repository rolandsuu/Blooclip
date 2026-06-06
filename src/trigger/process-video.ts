import { task } from "@trigger.dev/sdk/v3";
import { GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { pipeline } from "node:stream/promises";

import { r2, R2_BUCKET_NAME } from "../lib/r2";
import { supabaseAdmin } from "../lib/supabase-admin";

type ProcessVideoPayload = {
  videoId: string;
  originalR2Key: string;
};

type VideoRow = {
  id: string;
  original_r2_key: string | null;
  prompt: string | null;
  target_language: string | null;
};

type WorkerStage =
  | "queued"
  | "downloading_source"
  | "extracting_audio"
  | "transcribing_audio"
  | "transcript_ready"
  | "sampling_frames"
  | "analyzing_visuals"
  | "visual_analysis_ready"
  | "planning_segments"
  | "edit_plan_ready";

type AssemblyAiSubmitResponse = {
  id?: unknown;
};

type AssemblyAiTranscriptResponse = {
  id?: unknown;
  status?: unknown;
  error?: unknown;
  text?: unknown;
  words?: unknown;
  utterances?: unknown;
  language_code?: unknown;
  language_confidence?: unknown;
};

type SampledFrame = {
  index: number;
  timestampSeconds: number;
  filePath: string;
  r2Key: string;
  sizeBytes: number;
};

type OpenAiResponsesResponse = {
  id?: unknown;
  status?: unknown;
  error?: unknown;
  incomplete_details?: unknown;
  model?: unknown;
  output?: unknown;
  output_text?: unknown;
  usage?: unknown;
};

const STAGE_PROGRESS: Record<WorkerStage, number> = {
  queued: 5,
  downloading_source: 8,
  extracting_audio: 12,
  transcribing_audio: 24,
  transcript_ready: 24,
  sampling_frames: 34,
  analyzing_visuals: 48,
  visual_analysis_ready: 48,
  planning_segments: 60,
  edit_plan_ready: 60,
};

const ASSEMBLYAI_PROVIDER = "assemblyai";
const ASSEMBLYAI_DEFAULT_BASE_URL = "https://api.assemblyai.com";
const ASSEMBLYAI_TRANSCRIPT_TIMEOUT_MS = 25 * 60 * 1000;
const ASSEMBLYAI_POLL_INTERVAL_MS = 3000;
const OPENAI_PROVIDER = "openai";
const OPENAI_DEFAULT_BASE_URL = "https://api.openai.com/v1";
const OPENAI_DEFAULT_MODEL = "gpt-5-mini";
const DEFAULT_FRAME_SAMPLE_INTERVAL_SECONDS = 3;
const DEFAULT_MAX_VISUAL_FRAMES = 30;
const MAX_TRANSCRIPT_CONTEXT_CHARS = 6000;
const MAX_EDIT_PLAN_UTTERANCES = 80;
const MAX_EDIT_PLAN_WORDS = 300;
const VISUAL_TIMELINE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["summary", "frames", "candidateMoments", "warnings"],
  properties: {
    summary: {
      type: "string",
      description: "Concise summary of the visual story visible in the frames.",
    },
    frames: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "index",
          "timestampSeconds",
          "description",
          "visibleText",
          "actions",
          "setting",
          "shotType",
          "quality",
          "promptRelevance",
          "confidence",
        ],
        properties: {
          index: {
            type: "integer",
            description: "Frame index provided by the worker.",
          },
          timestampSeconds: {
            type: "number",
            description: "Frame timestamp in seconds provided by the worker.",
          },
          description: {
            type: "string",
            description: "What is visually happening in the frame.",
          },
          visibleText: {
            type: "array",
            items: { type: "string" },
            description: "Any readable text visible in the frame.",
          },
          actions: {
            type: "array",
            items: { type: "string" },
            description: "Visible actions or events in the frame.",
          },
          setting: {
            type: "string",
            description: "Location, environment, or scene type.",
          },
          shotType: {
            type: "string",
            description: "Camera framing or visual composition.",
          },
          quality: {
            type: "object",
            additionalProperties: false,
            required: ["usable", "issues"],
            properties: {
              usable: {
                type: "boolean",
                description: "Whether this frame appears usable for editing.",
              },
              issues: {
                type: "array",
                items: { type: "string" },
                description: "Blur, darkness, obstruction, or other issues.",
              },
            },
          },
          promptRelevance: {
            type: "string",
            description: "How this frame may relate to the user prompt.",
          },
          confidence: {
            type: "number",
            description: "Confidence from 0 to 1.",
          },
        },
      },
    },
    candidateMoments: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "startSeconds",
          "endSeconds",
          "description",
          "reason",
          "confidence",
        ],
        properties: {
          startSeconds: {
            type: "number",
            description: "Rough visual moment start time in seconds.",
          },
          endSeconds: {
            type: "number",
            description: "Rough visual moment end time in seconds.",
          },
          description: {
            type: "string",
            description: "What the candidate moment visually contains.",
          },
          reason: {
            type: "string",
            description: "Why this moment may be useful later.",
          },
          confidence: {
            type: "number",
            description: "Confidence from 0 to 1.",
          },
        },
      },
    },
    warnings: {
      type: "array",
      items: { type: "string" },
      description: "Any limitations caused by sparse frame sampling.",
    },
  },
} as const;
const EDIT_PLAN_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "tutorialGoal",
    "tutorialSteps",
    "segments",
    "omittedContent",
    "warnings",
  ],
  properties: {
    tutorialGoal: {
      type: "string",
      description:
        "The inferred tutorial goal that the selected segments must preserve.",
    },
    tutorialSteps: {
      type: "array",
      description:
        "The logical tutorial step sequence inferred before selecting clips. Must contain at least one step.",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["stepIndex", "title", "objective", "evidence"],
        properties: {
          stepIndex: {
            type: "integer",
            description: "One-based tutorial step index.",
          },
          title: {
            type: "string",
            description: "Short title for this tutorial step.",
          },
          objective: {
            type: "string",
            description: "What the viewer should understand from this step.",
          },
          evidence: {
            type: "string",
            description:
              "Transcript or visual evidence used to identify this step.",
          },
        },
      },
    },
    segments: {
      type: "array",
      description:
        "Selected source ranges for the final tutorial edit. Must contain at least one segment.",
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "segmentIndex",
          "tutorialStepIndex",
          "sourceStart",
          "sourceEnd",
          "reason",
          "visualEvidenceFrameIndexes",
          "transcriptEvidence",
          "confidence",
        ],
        properties: {
          segmentIndex: {
            type: "integer",
            description: "One-based selected segment index.",
          },
          tutorialStepIndex: {
            type: "integer",
            description:
              "The tutorial step index this selected segment supports.",
          },
          sourceStart: {
            type: "number",
            description:
              "Start time in source video seconds. Required for FFmpeg rendering.",
          },
          sourceEnd: {
            type: "number",
            description:
              "End time in source video seconds. Required for FFmpeg rendering.",
          },
          reason: {
            type: "string",
            description:
              "Why this exact source range is needed for tutorial clarity.",
          },
          visualEvidenceFrameIndexes: {
            type: "array",
            items: { type: "integer" },
            description:
              "Frame indexes from the visual timeline that support this segment.",
          },
          transcriptEvidence: {
            type: "string",
            description:
              "Transcript evidence or timing cues that support this segment.",
          },
          confidence: {
            type: "number",
            description: "Confidence from 0 to 1.",
          },
        },
      },
    },
    omittedContent: {
      type: "array",
      description:
        "Chronological source ranges intentionally omitted from the tutorial edit.",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["sourceStart", "sourceEnd", "reason"],
        properties: {
          sourceStart: {
            type: "number",
            description: "Start time in source video seconds.",
          },
          sourceEnd: {
            type: "number",
            description: "End time in source video seconds.",
          },
          reason: {
            type: "string",
            description:
              "Why this range can be removed without breaking viewer understanding.",
          },
        },
      },
    },
    warnings: {
      type: "array",
      items: { type: "string" },
      description:
        "Planning limitations, including weak tutorial evidence or sparse frame sampling.",
    },
  },
} as const;

class WorkerError extends Error {
  code: string;
  provider: string | null;
  providerRequestId: string | null;
  retryable: boolean;

  constructor(
    message: string,
    options: {
      code: string;
      provider?: string | null;
      providerRequestId?: string | null;
      retryable?: boolean;
    }
  ) {
    super(message);
    this.name = "WorkerError";
    this.code = options.code;
    this.provider = options.provider ?? null;
    this.providerRequestId = options.providerRequestId ?? null;
    this.retryable = options.retryable ?? false;
  }
}

async function updateVideo(videoId: string, values: Record<string, unknown>) {
  const { error } = await supabaseAdmin
    .from("videos")
    .update({ ...values, updated_at: new Date().toISOString() })
    .eq("id", videoId);

  if (error) {
    throw new Error(`Failed to update video status: ${error.message}`);
  }
}

async function loadVideo(videoId: string) {
  const { data, error } = await supabaseAdmin
    .from("videos")
    .select("id,original_r2_key,prompt,target_language")
    .eq("id", videoId)
    .single();

  if (error) {
    throw new WorkerError(`Failed to load video row: ${error.message}`, {
      code:
        error.code === "PGRST116" ? "video_not_found" : "supabase_load_failed",
      provider: "supabase",
      retryable: error.code !== "PGRST116",
    });
  }

  return data as VideoRow;
}

async function updateStage(videoId: string, stage: WorkerStage) {
  await updateVideo(videoId, {
    status: "processing",
    current_stage: stage,
    progress: STAGE_PROGRESS[stage],
    error_message: null,
    error_code: null,
    error_provider: null,
    provider_request_id: null,
    retryable: null,
  });
}

async function downloadFromR2(key: string, filePath: string) {
  const result = await r2.send(
    new GetObjectCommand({
      Bucket: R2_BUCKET_NAME,
      Key: key,
    })
  );

  if (!result.Body) {
    throw new Error("R2 object has no body");
  }

  await pipeline(
    result.Body as NodeJS.ReadableStream,
    createWriteStream(filePath)
  );
}

async function uploadFileToR2(
  key: string,
  filePath: string,
  contentType: string
) {
  await r2.send(
    new PutObjectCommand({
      Bucket: R2_BUCKET_NAME,
      Key: key,
      Body: createReadStream(filePath),
      ContentType: contentType,
    })
  );
}

async function uploadJsonToR2(key: string, value: unknown) {
  await r2.send(
    new PutObjectCommand({
      Bucket: R2_BUCKET_NAME,
      Key: key,
      Body: JSON.stringify(value, null, 2),
      ContentType: "application/json",
    })
  );
}

function runFfmpeg(args: string[]) {
  return new Promise<void>((resolve, reject) => {
    const child = spawn("ffmpeg", args, { stdio: "inherit" });

    child.on("error", (error) => {
      reject(error);
    });

    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`ffmpeg failed with exit code ${code}`));
      }
    });
  });
}

function runCommand(command: string, args: string[]) {
  return new Promise<{ stdout: string; stderr: string }>((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: ["ignore", "pipe", "pipe"],
    });
    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];

    child.stdout.on("data", (chunk: Buffer) => {
      stdoutChunks.push(chunk);
    });

    child.stderr.on("data", (chunk: Buffer) => {
      stderrChunks.push(chunk);
    });

    child.on("error", (error) => {
      reject(error);
    });

    child.on("exit", (code) => {
      const stdout = Buffer.concat(stdoutChunks).toString("utf8");
      const stderr = Buffer.concat(stderrChunks).toString("utf8");

      if (code === 0) {
        resolve({ stdout, stderr });
      } else {
        reject(
          new Error(
            `${command} failed with exit code ${code}${
              stderr.trim() ? `: ${stderr.trim()}` : ""
            }`
          )
        );
      }
    });
  });
}

function normalizeBaseUrl(baseUrl: string) {
  return baseUrl.replace(/\/+$/, "");
}

function getPositiveNumberEnv(name: string, fallback: number) {
  const rawValue = process.env[name];

  if (!rawValue) {
    return fallback;
  }

  const value = Number(rawValue);

  if (!Number.isFinite(value) || value <= 0) {
    throw new WorkerError(`${name} must be a positive number`, {
      code: "worker_config_invalid",
      retryable: false,
    });
  }

  return value;
}

function getPositiveIntegerEnv(name: string, fallback: number) {
  const value = getPositiveNumberEnv(name, fallback);

  if (!Number.isInteger(value)) {
    throw new WorkerError(`${name} must be a positive integer`, {
      code: "worker_config_invalid",
      retryable: false,
    });
  }

  return value;
}

function getAssemblyAiConfig() {
  const apiKey = process.env.ASSEMBLYAI_API_KEY;

  if (!apiKey) {
    throw new WorkerError(
      "Missing AssemblyAI API key. Set ASSEMBLYAI_API_KEY.",
      {
        code: "assemblyai_api_key_missing",
        provider: ASSEMBLYAI_PROVIDER,
        retryable: false,
      }
    );
  }

  return {
    apiKey,
    baseUrl: normalizeBaseUrl(
      process.env.ASSEMBLYAI_BASE_URL ?? ASSEMBLYAI_DEFAULT_BASE_URL
    ),
  };
}

function getOpenAiConfig() {
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    throw new WorkerError("Missing OpenAI API key. Set OPENAI_API_KEY.", {
      code: "openai_api_key_missing",
      provider: OPENAI_PROVIDER,
      retryable: false,
    });
  }

  return {
    apiKey,
    baseUrl: normalizeBaseUrl(
      process.env.OPENAI_BASE_URL ?? OPENAI_DEFAULT_BASE_URL
    ),
    model: process.env.OPENAI_WORKER_MODEL ?? OPENAI_DEFAULT_MODEL,
  };
}

function getFrameSamplingConfig() {
  return {
    intervalSeconds: getPositiveNumberEnv(
      "VISUAL_FRAME_SAMPLE_INTERVAL_SECONDS",
      DEFAULT_FRAME_SAMPLE_INTERVAL_SECONDS
    ),
    maxFrames: getPositiveIntegerEnv(
      "VISUAL_FRAME_SAMPLE_MAX_FRAMES",
      DEFAULT_MAX_VISUAL_FRAMES
    ),
  };
}

async function readJsonResponse(response: Response) {
  const text = await response.text();

  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function getProviderRequestId(response: Response) {
  return (
    response.headers.get("x-request-id") ??
    response.headers.get("request-id") ??
    null
  );
}

function getAssemblyAiErrorMessage(body: unknown, fallback: string) {
  if (body && typeof body === "object" && "error" in body) {
    const error = (body as { error?: unknown }).error;

    if (typeof error === "string" && error.trim()) {
      return error;
    }
  }

  if (typeof body === "string" && body.trim()) {
    return body;
  }

  return fallback;
}

async function uploadToAssemblyAi(filePath: string) {
  const { apiKey, baseUrl } = getAssemblyAiConfig();
  const response = await fetch(`${baseUrl}/v2/upload`, {
    method: "POST",
    headers: {
      authorization: apiKey,
    },
    body: createReadStream(filePath) as unknown as BodyInit,
    duplex: "half",
  } as RequestInit & { duplex: "half" });

  const body = await readJsonResponse(response);

  if (!response.ok) {
    throw new WorkerError(
      getAssemblyAiErrorMessage(
        body,
        `AssemblyAI upload failed with HTTP ${response.status}`
      ),
      {
        code: "assemblyai_upload_failed",
        provider: ASSEMBLYAI_PROVIDER,
        providerRequestId: getProviderRequestId(response),
        retryable: response.status === 429 || response.status >= 500,
      }
    );
  }

  if (
    !body ||
    typeof body !== "object" ||
    typeof (body as { upload_url?: unknown }).upload_url !== "string"
  ) {
    throw new WorkerError("AssemblyAI upload response was invalid", {
      code: "assemblyai_upload_response_invalid",
      provider: ASSEMBLYAI_PROVIDER,
      providerRequestId: getProviderRequestId(response),
      retryable: true,
    });
  }

  return (body as { upload_url: string }).upload_url;
}

async function submitAssemblyAiTranscript(audioUrl: string) {
  const { apiKey, baseUrl } = getAssemblyAiConfig();
  const response = await fetch(`${baseUrl}/v2/transcript`, {
    method: "POST",
    headers: {
      authorization: apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      audio_url: audioUrl,
      speech_models: ["universal-3-pro", "universal-2"],
      language_detection: true,
      speaker_labels: true,
    }),
  });

  const body = (await readJsonResponse(response)) as AssemblyAiSubmitResponse;

  if (!response.ok) {
    throw new WorkerError(
      getAssemblyAiErrorMessage(
        body,
        `AssemblyAI transcript submit failed with HTTP ${response.status}`
      ),
      {
        code: "assemblyai_submit_failed",
        provider: ASSEMBLYAI_PROVIDER,
        providerRequestId: getProviderRequestId(response),
        retryable: response.status === 429 || response.status >= 500,
      }
    );
  }

  if (!body || typeof body.id !== "string") {
    throw new WorkerError("AssemblyAI transcript submit response was invalid", {
      code: "assemblyai_submit_response_invalid",
      provider: ASSEMBLYAI_PROVIDER,
      providerRequestId: getProviderRequestId(response),
      retryable: true,
    });
  }

  return body.id;
}

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function pollAssemblyAiTranscript(transcriptId: string) {
  const { apiKey, baseUrl } = getAssemblyAiConfig();
  const startedAt = Date.now();

  while (Date.now() - startedAt < ASSEMBLYAI_TRANSCRIPT_TIMEOUT_MS) {
    const response = await fetch(`${baseUrl}/v2/transcript/${transcriptId}`, {
      headers: {
        authorization: apiKey,
      },
    });

    const body =
      (await readJsonResponse(response)) as AssemblyAiTranscriptResponse | null;

    if (!response.ok) {
      throw new WorkerError(
        getAssemblyAiErrorMessage(
          body,
          `AssemblyAI transcript poll failed with HTTP ${response.status}`
        ),
        {
          code: "assemblyai_poll_failed",
          provider: ASSEMBLYAI_PROVIDER,
          providerRequestId: transcriptId,
          retryable: response.status === 429 || response.status >= 500,
        }
      );
    }

    if (body?.status === "completed") {
      return body;
    }

    if (body?.status === "error") {
      throw new WorkerError(
        getAssemblyAiErrorMessage(body, "AssemblyAI transcription failed"),
        {
          code: "assemblyai_transcription_failed",
          provider: ASSEMBLYAI_PROVIDER,
          providerRequestId: transcriptId,
          retryable: false,
        }
      );
    }

    await wait(ASSEMBLYAI_POLL_INTERVAL_MS);
  }

  throw new WorkerError("AssemblyAI transcription timed out", {
    code: "assemblyai_transcription_timeout",
    provider: ASSEMBLYAI_PROVIDER,
    providerRequestId: transcriptId,
    retryable: true,
  });
}

function roundSeconds(value: number) {
  return Math.round(value * 100) / 100;
}

async function getVideoDurationSeconds(filePath: string) {
  const { stdout } = await runCommand("ffprobe", [
    "-v",
    "error",
    "-show_entries",
    "format=duration",
    "-of",
    "default=noprint_wrappers=1:nokey=1",
    filePath,
  ]);
  const duration = Number(stdout.trim());

  if (!Number.isFinite(duration) || duration <= 0) {
    throw new WorkerError("Unable to read video duration with ffprobe", {
      code: "ffprobe_duration_invalid",
      provider: "ffmpeg",
      retryable: false,
    });
  }

  return duration;
}

function buildFrameTimestamps(
  durationSeconds: number,
  intervalSeconds: number,
  maxFrames: number
) {
  const timestamps: number[] = [];

  for (
    let timestamp = 0;
    timestamp < durationSeconds && timestamps.length <= maxFrames;
    timestamp += intervalSeconds
  ) {
    timestamps.push(roundSeconds(timestamp));
  }

  if (timestamps.length === 0) {
    return [0];
  }

  if (timestamps.length <= maxFrames) {
    return timestamps;
  }

  if (maxFrames === 1) {
    return [0];
  }

  const lastTimestamp = Math.max(0, durationSeconds - 0.25);

  return Array.from({ length: maxFrames }, (_value, index) =>
    roundSeconds((lastTimestamp * index) / (maxFrames - 1))
  );
}

async function sampleFrames(
  videoId: string,
  inputPath: string,
  framesDir: string
) {
  const { intervalSeconds, maxFrames } = getFrameSamplingConfig();
  const durationSeconds = await getVideoDurationSeconds(inputPath);
  const timestamps = buildFrameTimestamps(
    durationSeconds,
    intervalSeconds,
    maxFrames
  );
  const sampledFrames: SampledFrame[] = [];

  await mkdir(framesDir, { recursive: true });

  for (const [index, timestampSeconds] of timestamps.entries()) {
    const frameNumber = String(index + 1).padStart(4, "0");
    const filename = `frame-${frameNumber}.jpg`;
    const filePath = path.join(framesDir, filename);
    const r2Key = `artifacts/${videoId}/frames/${filename}`;

    await runFfmpeg([
      "-y",
      "-hide_banner",
      "-loglevel",
      "error",
      "-ss",
      timestampSeconds.toFixed(3),
      "-i",
      inputPath,
      "-frames:v",
      "1",
      "-vf",
      "scale=640:-2",
      "-q:v",
      "3",
      filePath,
    ]);

    const fileStats = await stat(filePath);

    if (fileStats.size <= 0) {
      throw new WorkerError("FFmpeg produced an empty sampled frame", {
        code: "frame_sample_empty",
        provider: "ffmpeg",
        retryable: true,
      });
    }

    await uploadFileToR2(r2Key, filePath, "image/jpeg");
    sampledFrames.push({
      index: index + 1,
      timestampSeconds,
      filePath,
      r2Key,
      sizeBytes: fileStats.size,
    });
  }

  if (sampledFrames.length === 0) {
    throw new WorkerError("No frames were sampled from the source video", {
      code: "frame_sampling_empty",
      provider: "ffmpeg",
      retryable: false,
    });
  }

  return {
    durationSeconds: roundSeconds(durationSeconds),
    intervalSeconds,
    maxFrames,
    frames: sampledFrames,
  };
}

function getOpenAiErrorMessage(body: unknown, fallback: string) {
  if (body && typeof body === "object" && "error" in body) {
    const error = (body as { error?: unknown }).error;

    if (typeof error === "string" && error.trim()) {
      return error;
    }

    if (error && typeof error === "object" && "message" in error) {
      const message = (error as { message?: unknown }).message;

      if (typeof message === "string" && message.trim()) {
        return message;
      }
    }
  }

  if (typeof body === "string" && body.trim()) {
    return body;
  }

  return fallback;
}

function extractOpenAiOutputText(body: OpenAiResponsesResponse) {
  if (typeof body.output_text === "string" && body.output_text.trim()) {
    return body.output_text;
  }

  if (!Array.isArray(body.output)) {
    return null;
  }

  const textParts: string[] = [];

  for (const outputItem of body.output) {
    if (!outputItem || typeof outputItem !== "object") {
      continue;
    }

    const content = (outputItem as { content?: unknown }).content;

    if (!Array.isArray(content)) {
      continue;
    }

    for (const contentItem of content) {
      if (!contentItem || typeof contentItem !== "object") {
        continue;
      }

      const text = (contentItem as { text?: unknown }).text;

      if (typeof text === "string") {
        textParts.push(text);
      }
    }
  }

  return textParts.length > 0 ? textParts.join("\n") : null;
}

function parseJsonObject(text: string) {
  const trimmed = text.trim();
  const withoutFence = trimmed
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "");
  const parsed = JSON.parse(withoutFence) as unknown;

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("OpenAI response JSON was not an object");
  }

  return parsed as Record<string, unknown>;
}

function compactTranscriptContext(transcript: AssemblyAiTranscriptResponse) {
  const text =
    typeof transcript.text === "string"
      ? transcript.text.slice(0, MAX_TRANSCRIPT_CONTEXT_CHARS)
      : "";
  const utterances = Array.isArray(transcript.utterances)
    ? transcript.utterances.slice(0, 20)
    : [];

  return {
    text,
    textWasTruncated:
      typeof transcript.text === "string" &&
      transcript.text.length > MAX_TRANSCRIPT_CONTEXT_CHARS,
    languageCode:
      typeof transcript.language_code === "string"
        ? transcript.language_code
        : null,
    utteranceSamples: utterances,
  };
}

function buildVisualAnalysisInstructions(options: {
  prompt: string;
  targetLanguage: string;
  transcript: AssemblyAiTranscriptResponse;
  frames: SampledFrame[];
}) {
  return [
    "Analyze sampled still frames from a source video for an editing pipeline.",
    "You are receiving image frames with timestamps, not raw video input.",
    "Do not infer motion or events that are not visible in the sampled frames.",
    "Return JSON only, following the required schema.",
    "Use concise English descriptions for internal editor use.",
    "Candidate moments are rough visual cues for a future edit-planning step; do not create a final edit plan.",
    "",
    `User prompt: ${options.prompt}`,
    `Target language for later voiceover: ${options.targetLanguage}`,
    `Frames: ${options.frames
      .map((frame) => `${frame.index} at ${frame.timestampSeconds}s`)
      .join(", ")}`,
    "",
    "Transcript context from original audio:",
    JSON.stringify(compactTranscriptContext(options.transcript), null, 2),
  ].join("\n");
}

async function analyzeVisualTimeline(options: {
  videoId: string;
  sourceR2Key: string;
  transcriptR2Key: string;
  prompt: string;
  targetLanguage: string;
  transcript: AssemblyAiTranscriptResponse;
  sampledFrames: SampledFrame[];
  durationSeconds: number;
  intervalSeconds: number;
  maxFrames: number;
}) {
  const { apiKey, baseUrl, model } = getOpenAiConfig();
  const content: Record<string, unknown>[] = [
    {
      type: "input_text",
      text: buildVisualAnalysisInstructions({
        prompt: options.prompt,
        targetLanguage: options.targetLanguage,
        transcript: options.transcript,
        frames: options.sampledFrames,
      }),
    },
  ];

  for (const frame of options.sampledFrames) {
    const frameBytes = await readFile(frame.filePath);

    content.push({
      type: "input_text",
      text: `Frame ${frame.index}, timestamp ${frame.timestampSeconds}s`,
    });
    content.push({
      type: "input_image",
      image_url: `data:image/jpeg;base64,${frameBytes.toString("base64")}`,
      detail: "low",
    });
  }

  const response = await fetch(`${baseUrl}/responses`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      input: [
        {
          role: "user",
          content,
        },
      ],
      text: {
        format: {
          type: "json_schema",
          name: "visual_timeline",
          strict: true,
          schema: VISUAL_TIMELINE_SCHEMA,
        },
      },
      max_output_tokens: 5000,
      store: false,
    }),
  });

  const body = (await readJsonResponse(response)) as OpenAiResponsesResponse;
  const requestId = getProviderRequestId(response);

  if (!response.ok) {
    throw new WorkerError(
      getOpenAiErrorMessage(
        body,
        `OpenAI visual analysis failed with HTTP ${response.status}`
      ),
      {
        code: "openai_visual_analysis_failed",
        provider: OPENAI_PROVIDER,
        providerRequestId: requestId,
        retryable: response.status === 429 || response.status >= 500,
      }
    );
  }

  const outputText = body ? extractOpenAiOutputText(body) : null;

  if (!outputText) {
    throw new WorkerError("OpenAI visual analysis response had no output text", {
      code: "openai_visual_analysis_output_missing",
      provider: OPENAI_PROVIDER,
      providerRequestId:
        typeof body?.id === "string" ? body.id : requestId ?? null,
      retryable: true,
    });
  }

  let parsedOutput: Record<string, unknown>;

  try {
    parsedOutput = parseJsonObject(outputText);
  } catch (error) {
    throw new WorkerError(
      error instanceof Error
        ? error.message
        : "OpenAI visual analysis JSON was invalid",
      {
        code: "openai_visual_analysis_json_invalid",
        provider: OPENAI_PROVIDER,
        providerRequestId:
          typeof body?.id === "string" ? body.id : requestId ?? null,
        retryable: true,
      }
    );
  }

  return {
    videoId: options.videoId,
    sourceR2Key: options.sourceR2Key,
    transcriptR2Key: options.transcriptR2Key,
    provider: OPENAI_PROVIDER,
    providerRequestId: typeof body?.id === "string" ? body.id : requestId,
    model,
    completedAt: new Date().toISOString(),
    sampling: {
      durationSeconds: options.durationSeconds,
      intervalSeconds: options.intervalSeconds,
      maxFrames: options.maxFrames,
      frameCount: options.sampledFrames.length,
    },
    prompt: options.prompt,
    targetLanguage: options.targetLanguage,
    frames: options.sampledFrames.map((frame) => ({
      index: frame.index,
      timestampSeconds: frame.timestampSeconds,
      r2Key: frame.r2Key,
      sizeBytes: frame.sizeBytes,
    })),
    analysis: parsedOutput,
    rawResponse: body,
  };
}

type VisualTimelineArtifact = Awaited<ReturnType<typeof analyzeVisualTimeline>>;

function compactTranscriptForEditPlan(transcript: AssemblyAiTranscriptResponse) {
  return {
    ...compactTranscriptContext(transcript),
    utterances: Array.isArray(transcript.utterances)
      ? transcript.utterances.slice(0, MAX_EDIT_PLAN_UTTERANCES)
      : [],
    words: Array.isArray(transcript.words)
      ? transcript.words.slice(0, MAX_EDIT_PLAN_WORDS)
      : [],
  };
}

function compactVisualTimelineForEditPlan(
  visualTimeline: VisualTimelineArtifact
) {
  return {
    sampling: visualTimeline.sampling,
    frames: visualTimeline.frames,
    analysis: visualTimeline.analysis,
  };
}

function buildEditPlanInstructions(options: {
  prompt: string;
  targetLanguage: string;
  transcript: AssemblyAiTranscriptResponse;
  visualTimeline: VisualTimelineArtifact;
  durationSeconds: number;
}) {
  return [
    "Create a tutorial-preserving edit plan for a video assembly pipeline.",
    "Return JSON only, following the required schema.",
    "This is not a generic highlight reel. Preserve tutorial logic and viewer understanding.",
    "You are receiving transcript timing and sampled-frame visual analysis, not raw video.",
    "",
    `User prompt, the main editing intent: ${options.prompt}`,
    `Target language for later voiceover: ${options.targetLanguage}`,
    `Source video duration: ${options.durationSeconds}s`,
    "",
    "Planning behavior:",
    "1. First infer tutorialGoal from the user prompt, transcript, and visual timeline.",
    "2. Then identify the logical tutorial step sequence.",
    "3. Then select chronological source video segments that preserve that sequence.",
    "4. The selected segments must still feel like a complete tutorial after trimming.",
    "5. Preserve setup context, key actions, UI or physical state changes, action/result pairs, confirmations, and final outcome moments.",
    "6. Remove or shorten dead air, loading waits, repeated explanation, mistakes, duplicated shots, and irrelevant tangents only when viewer understanding remains intact.",
    "7. Prefer 3-8 selected segments, but allow fewer or more when tutorial clarity requires it.",
    "8. segments must contain at least one selected segment. Zero segments is invalid in all cases.",
    "9. If tutorial evidence is weak, create one fallback tutorial step named Best Available Tutorial Context, select the best available chronological source range, and add a warning. Do not return an empty segment list.",
    "10. Use transcript timing as semantic evidence and visual timeline frames/candidate moments as visual evidence.",
    "",
    "Segment timing rules:",
    "- sourceStart and sourceEnd are in source video seconds.",
    "- Every selected segment must satisfy 0 <= sourceStart < sourceEnd <= source video duration.",
    "- Selected segments must be ordered chronologically and must not overlap.",
    "- Keep sourceStart and sourceEnd precise enough for FFmpeg cutting.",
    "",
    "Transcript context with timing evidence:",
    JSON.stringify(compactTranscriptForEditPlan(options.transcript), null, 2),
    "",
    "Visual timeline context:",
    JSON.stringify(
      compactVisualTimelineForEditPlan(options.visualTimeline),
      null,
      2
    ),
  ].join("\n");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function throwEditPlanValidationError(
  message: string,
  providerRequestId: string | null
): never {
  throw new WorkerError(message, {
    code: "openai_edit_plan_validation_failed",
    provider: OPENAI_PROVIDER,
    providerRequestId,
    retryable: true,
  });
}

function validateEditPlan(
  editPlan: Record<string, unknown>,
  durationSeconds: number,
  providerRequestId: string | null
) {
  const tutorialSteps = editPlan.tutorialSteps;

  if (!Array.isArray(tutorialSteps) || tutorialSteps.length === 0) {
    throwEditPlanValidationError(
      "OpenAI edit plan must contain at least one tutorial step",
      providerRequestId
    );
  }

  const segments = editPlan.segments;

  if (!Array.isArray(segments) || segments.length === 0) {
    throwEditPlanValidationError(
      "OpenAI edit plan must contain at least one selected segment",
      providerRequestId
    );
  }

  let previousStart = -Infinity;
  let previousEnd = -Infinity;

  for (const [index, segment] of segments.entries()) {
    const segmentNumber = index + 1;

    if (!isRecord(segment)) {
      throwEditPlanValidationError(
        `OpenAI edit plan segment ${segmentNumber} was invalid`,
        providerRequestId
      );
    }

    const sourceStart = segment.sourceStart;
    const sourceEnd = segment.sourceEnd;

    if (typeof sourceStart !== "number" || typeof sourceEnd !== "number") {
      throwEditPlanValidationError(
        `OpenAI edit plan segment ${segmentNumber} is missing sourceStart or sourceEnd`,
        providerRequestId
      );
    }

    if (!Number.isFinite(sourceStart) || !Number.isFinite(sourceEnd)) {
      throwEditPlanValidationError(
        `OpenAI edit plan segment ${segmentNumber} has non-finite timestamps`,
        providerRequestId
      );
    }

    if (sourceEnd <= sourceStart) {
      throwEditPlanValidationError(
        `OpenAI edit plan segment ${segmentNumber} has an empty or negative duration`,
        providerRequestId
      );
    }

    if (sourceStart < 0 || sourceEnd > durationSeconds) {
      throwEditPlanValidationError(
        `OpenAI edit plan segment ${segmentNumber} is outside the source video duration`,
        providerRequestId
      );
    }

    if (sourceStart < previousStart) {
      throwEditPlanValidationError(
        `OpenAI edit plan segment ${segmentNumber} is not in chronological order`,
        providerRequestId
      );
    }

    if (sourceStart < previousEnd) {
      throwEditPlanValidationError(
        `OpenAI edit plan segment ${segmentNumber} overlaps the previous segment`,
        providerRequestId
      );
    }

    previousStart = sourceStart;
    previousEnd = sourceEnd;
  }
}

async function planTutorialSegments(options: {
  videoId: string;
  sourceR2Key: string;
  transcriptR2Key: string;
  visualTimelineR2Key: string;
  prompt: string;
  targetLanguage: string;
  transcript: AssemblyAiTranscriptResponse;
  visualTimeline: VisualTimelineArtifact;
  durationSeconds: number;
}) {
  const { apiKey, baseUrl, model } = getOpenAiConfig();
  const response = await fetch(`${baseUrl}/responses`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      input: [
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: buildEditPlanInstructions(options),
            },
          ],
        },
      ],
      text: {
        format: {
          type: "json_schema",
          name: "tutorial_edit_plan",
          strict: true,
          schema: EDIT_PLAN_SCHEMA,
        },
      },
      max_output_tokens: 5000,
      store: false,
    }),
  });

  const body = (await readJsonResponse(response)) as OpenAiResponsesResponse;
  const requestId = getProviderRequestId(response);

  if (!response.ok) {
    throw new WorkerError(
      getOpenAiErrorMessage(
        body,
        `OpenAI edit planning failed with HTTP ${response.status}`
      ),
      {
        code: "openai_edit_plan_failed",
        provider: OPENAI_PROVIDER,
        providerRequestId: requestId,
        retryable: response.status === 429 || response.status >= 500,
      }
    );
  }

  const outputText = body ? extractOpenAiOutputText(body) : null;
  const providerRequestId =
    typeof body?.id === "string" ? body.id : requestId ?? null;

  if (!outputText) {
    throw new WorkerError("OpenAI edit planning response had no output text", {
      code: "openai_edit_plan_output_missing",
      provider: OPENAI_PROVIDER,
      providerRequestId,
      retryable: true,
    });
  }

  let parsedOutput: Record<string, unknown>;

  try {
    parsedOutput = parseJsonObject(outputText);
  } catch (error) {
    throw new WorkerError(
      error instanceof Error
        ? error.message
        : "OpenAI edit plan JSON was invalid",
      {
        code: "openai_edit_plan_json_invalid",
        provider: OPENAI_PROVIDER,
        providerRequestId,
        retryable: true,
      }
    );
  }

  validateEditPlan(parsedOutput, options.durationSeconds, providerRequestId);

  return {
    videoId: options.videoId,
    sourceR2Key: options.sourceR2Key,
    transcriptR2Key: options.transcriptR2Key,
    visualTimelineR2Key: options.visualTimelineR2Key,
    provider: OPENAI_PROVIDER,
    providerRequestId,
    model,
    completedAt: new Date().toISOString(),
    planningMode: "tutorial_key_steps",
    sourceDurationSeconds: options.durationSeconds,
    prompt: options.prompt,
    targetLanguage: options.targetLanguage,
    ...parsedOutput,
    rawResponse: body,
  };
}

function toWorkerError(error: unknown) {
  if (error instanceof WorkerError) {
    return error;
  }

  if (error instanceof Error) {
    return new WorkerError(error.message, {
      code: "worker_error",
      retryable: true,
    });
  }

  return new WorkerError("Unknown processing error", {
    code: "worker_error",
    retryable: true,
  });
}

export async function runProcessVideo(payload: ProcessVideoPayload) {
  let stage: WorkerStage = "queued";
  let transcriptId: string | null = null;
  let openAiVisualResponseId: string | null = null;
  let openAiEditPlanResponseId: string | null = null;
  const workDir = await mkdtemp(
    path.join(os.tmpdir(), `blooclip-${payload.videoId}-`)
  );
  const inputPath = path.join(workDir, "input.mp4");
  const audioPath = path.join(workDir, "audio.wav");
  const framesDir = path.join(workDir, "frames");
  const audioR2Key = `artifacts/${payload.videoId}/audio.wav`;
  const transcriptR2Key = `artifacts/${payload.videoId}/transcript.json`;
  const visualTimelineR2Key = `artifacts/${payload.videoId}/visual-timeline.json`;
  const editPlanR2Key = `artifacts/${payload.videoId}/edit-plan.json`;

  try {
    const video = await loadVideo(payload.videoId);
    const originalR2Key = video.original_r2_key;
    const prompt =
      typeof video.prompt === "string" && video.prompt.trim()
        ? video.prompt.trim()
        : "Create a key-event video with voiceover and subtitles";
    const targetLanguage =
      typeof video.target_language === "string" && video.target_language.trim()
        ? video.target_language.trim()
        : "en";

    if (!originalR2Key) {
      throw new WorkerError("Video record is missing an original R2 key", {
        code: "original_r2_key_missing",
        provider: "supabase",
        retryable: false,
      });
    }

    await updateVideo(payload.videoId, {
      status: "processing",
      current_stage: "queued",
      progress: STAGE_PROGRESS.queued,
      error_message: null,
      error_code: null,
      error_provider: null,
      provider_request_id: null,
      retryable: null,
      transcript_r2_key: null,
      visual_timeline_r2_key: null,
      edit_plan_r2_key: null,
      provider_run_ids: {},
    });

    stage = "downloading_source";
    await updateStage(payload.videoId, stage);
    await downloadFromR2(originalR2Key, inputPath);

    stage = "extracting_audio";
    await updateStage(payload.videoId, stage);
    await runFfmpeg([
      "-y",
      "-hide_banner",
      "-loglevel",
      "error",
      "-i",
      inputPath,
      "-vn",
      "-ac",
      "1",
      "-ar",
      "16000",
      "-c:a",
      "pcm_s16le",
      audioPath,
    ]);
    await uploadFileToR2(audioR2Key, audioPath, "audio/wav");

    stage = "transcribing_audio";
    await updateStage(payload.videoId, stage);
    const assemblyAiAudioUrl = await uploadToAssemblyAi(audioPath);
    transcriptId = await submitAssemblyAiTranscript(assemblyAiAudioUrl);
    await updateVideo(payload.videoId, {
      provider_request_id: transcriptId,
      provider_run_ids: {
        assemblyai_transcript_id: transcriptId,
      },
    });
    const transcript = await pollAssemblyAiTranscript(transcriptId);

    await uploadJsonToR2(transcriptR2Key, {
      videoId: payload.videoId,
      sourceR2Key: originalR2Key,
      audioR2Key,
      provider: ASSEMBLYAI_PROVIDER,
      providerRequestId: transcriptId,
      speechModels: ["universal-3-pro", "universal-2"],
      languageDetection: true,
      speakerLabels: true,
      completedAt: new Date().toISOString(),
      text: typeof transcript.text === "string" ? transcript.text : "",
      languageCode:
        typeof transcript.language_code === "string"
          ? transcript.language_code
          : null,
      languageConfidence:
        typeof transcript.language_confidence === "number"
          ? transcript.language_confidence
          : null,
      words: Array.isArray(transcript.words) ? transcript.words : [],
      utterances: Array.isArray(transcript.utterances)
        ? transcript.utterances
        : [],
      raw: transcript,
    });

    stage = "transcript_ready";
    await updateVideo(payload.videoId, {
      status: "processing",
      current_stage: stage,
      progress: STAGE_PROGRESS[stage],
      transcript_r2_key: transcriptR2Key,
      provider_request_id: transcriptId,
      provider_run_ids: {
        assemblyai_transcript_id: transcriptId,
      },
      error_message: null,
      error_code: null,
      error_provider: null,
      retryable: null,
    });

    stage = "sampling_frames";
    await updateStage(payload.videoId, stage);
    const sampledFrameResult = await sampleFrames(
      payload.videoId,
      inputPath,
      framesDir
    );

    stage = "analyzing_visuals";
    await updateStage(payload.videoId, stage);
    const visualTimeline = await analyzeVisualTimeline({
      videoId: payload.videoId,
      sourceR2Key: originalR2Key,
      transcriptR2Key,
      prompt,
      targetLanguage,
      transcript,
      sampledFrames: sampledFrameResult.frames,
      durationSeconds: sampledFrameResult.durationSeconds,
      intervalSeconds: sampledFrameResult.intervalSeconds,
      maxFrames: sampledFrameResult.maxFrames,
    });
    openAiVisualResponseId =
      typeof visualTimeline.providerRequestId === "string"
        ? visualTimeline.providerRequestId
        : null;
    await uploadJsonToR2(visualTimelineR2Key, visualTimeline);

    stage = "visual_analysis_ready";
    await updateVideo(payload.videoId, {
      status: "processing",
      current_stage: stage,
      progress: STAGE_PROGRESS[stage],
      transcript_r2_key: transcriptR2Key,
      visual_timeline_r2_key: visualTimelineR2Key,
      provider_request_id: openAiVisualResponseId ?? transcriptId,
      provider_run_ids: {
        assemblyai_transcript_id: transcriptId,
        openai_visual_response_id: openAiVisualResponseId,
      },
      error_message: null,
      error_code: null,
      error_provider: null,
      retryable: null,
    });

    stage = "planning_segments";
    await updateStage(payload.videoId, stage);
    const editPlan = await planTutorialSegments({
      videoId: payload.videoId,
      sourceR2Key: originalR2Key,
      transcriptR2Key,
      visualTimelineR2Key,
      prompt,
      targetLanguage,
      transcript,
      visualTimeline,
      durationSeconds: sampledFrameResult.durationSeconds,
    });
    openAiEditPlanResponseId =
      typeof editPlan.providerRequestId === "string"
        ? editPlan.providerRequestId
        : null;
    await uploadJsonToR2(editPlanR2Key, editPlan);

    stage = "edit_plan_ready";
    await updateVideo(payload.videoId, {
      status: "processing",
      current_stage: stage,
      progress: STAGE_PROGRESS[stage],
      transcript_r2_key: transcriptR2Key,
      visual_timeline_r2_key: visualTimelineR2Key,
      edit_plan_r2_key: editPlanR2Key,
      provider_request_id:
        openAiEditPlanResponseId ?? openAiVisualResponseId ?? transcriptId,
      provider_run_ids: {
        assemblyai_transcript_id: transcriptId,
        openai_visual_response_id: openAiVisualResponseId,
        openai_edit_plan_response_id: openAiEditPlanResponseId,
      },
      error_message: null,
      error_code: null,
      error_provider: null,
      retryable: null,
    });
  } catch (error) {
    const workerError = toWorkerError(error);
    await updateVideo(payload.videoId, {
      status: "failed",
      current_stage: stage,
      error_message: workerError.message,
      error_code: workerError.code,
      error_provider: workerError.provider,
      provider_request_id:
        workerError.providerRequestId ??
        openAiEditPlanResponseId ??
        openAiVisualResponseId ??
        transcriptId,
      retryable: workerError.retryable,
    });

    throw error;
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
}

export const processVideoTask = task({
  id: "process-video",
  maxDuration: 60 * 30,
  run: async (payload: ProcessVideoPayload) => {
    await runProcessVideo(payload);
  },
});
