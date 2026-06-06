import { task } from "@trigger.dev/sdk/v3";
import { GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
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
};

type WorkerStage =
  | "queued"
  | "downloading_source"
  | "extracting_audio"
  | "transcribing_audio"
  | "transcript_ready";

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

const STAGE_PROGRESS: Record<WorkerStage, number> = {
  queued: 5,
  downloading_source: 8,
  extracting_audio: 12,
  transcribing_audio: 24,
  transcript_ready: 24,
};

const ASSEMBLYAI_PROVIDER = "assemblyai";
const ASSEMBLYAI_DEFAULT_BASE_URL = "https://api.assemblyai.com";
const ASSEMBLYAI_TRANSCRIPT_TIMEOUT_MS = 25 * 60 * 1000;
const ASSEMBLYAI_POLL_INTERVAL_MS = 3000;

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
    .select("id,original_r2_key")
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

function normalizeBaseUrl(baseUrl: string) {
  return baseUrl.replace(/\/+$/, "");
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
  const workDir = await mkdtemp(
    path.join(os.tmpdir(), `blooclip-${payload.videoId}-`)
  );
  const inputPath = path.join(workDir, "input.mp4");
  const audioPath = path.join(workDir, "audio.wav");
  const audioR2Key = `artifacts/${payload.videoId}/audio.wav`;
  const transcriptR2Key = `artifacts/${payload.videoId}/transcript.json`;

  try {
    const video = await loadVideo(payload.videoId);
    const originalR2Key = video.original_r2_key;

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
  } catch (error) {
    const workerError = toWorkerError(error);
    await updateVideo(payload.videoId, {
      status: "failed",
      current_stage: stage,
      error_message: workerError.message,
      error_code: workerError.code,
      error_provider: workerError.provider,
      provider_request_id: workerError.providerRequestId ?? transcriptId,
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
