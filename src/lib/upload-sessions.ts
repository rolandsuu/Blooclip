import { supabaseAdmin } from "./supabase-admin.ts";

import {
  MAX_BATCH_UPLOAD_FILES,
  UploadValidationError,
  assertValidVideoUploadInput,
  createVideoUploadRecord,
  getTrimmedString,
  normalizePrompt,
  type VideoUploadInput,
  type VideoUploadRecord,
} from "./upload-records.ts";

export { UploadValidationError } from "./upload-records.ts";

type RawUploadSessionBody = {
  title?: unknown;
  targetLanguage?: unknown;
  prompt?: unknown;
  videos?: unknown;
};

export type UploadSessionVideoInput = Omit<
  VideoUploadInput,
  "batchId" | "batchPosition"
>;

export type CreateUploadSessionInput = {
  title: string;
  targetLanguage: string;
  prompt: string;
  userId?: string;
  videos: UploadSessionVideoInput[];
};

export type UploadSessionBatchInput = {
  title: string;
  targetLanguage: string;
  expectedVideoCount: number;
  userId?: string;
};

export type UploadSessionBatch = {
  id: string;
};

export type UploadSessionRecord = {
  batchId: string;
  statusUrl: string;
  totalVideos: number;
  videos: VideoUploadRecord[];
};

export type UploadSessionDependencies = {
  createBatch(input: UploadSessionBatchInput): Promise<UploadSessionBatch>;
  createVideo(input: VideoUploadInput): Promise<VideoUploadRecord>;
};

function assertVideosArray(value: unknown): asserts value is unknown[] {
  if (!Array.isArray(value)) {
    throw new UploadValidationError("videos must be an array");
  }

  if (value.length === 0) {
    throw new UploadValidationError("At least one video is required");
  }

  if (value.length > MAX_BATCH_UPLOAD_FILES) {
    throw new UploadValidationError(
      `A batch can include at most ${MAX_BATCH_UPLOAD_FILES} videos`
    );
  }
}

export function buildUploadSessionTitle(
  value: unknown,
  filenames: readonly string[]
) {
  const title = getTrimmedString(value);

  if (title) {
    return title;
  }

  const firstFilename = filenames[0] ?? "Video upload";

  if (filenames.length <= 1) {
    return firstFilename;
  }

  return `${firstFilename} + ${filenames.length - 1} more`;
}

function parseUploadVideoInput(
  value: unknown,
  targetLanguage: string,
  prompt: string
): UploadSessionVideoInput {
  if (typeof value !== "object" || value === null) {
    throw new UploadValidationError("Each video must be an object");
  }

  const video = value as {
    filename?: unknown;
    contentType?: unknown;
    size?: unknown;
  };
  const filename = getTrimmedString(video.filename);
  const contentType = getTrimmedString(video.contentType);

  if (!filename || !contentType) {
    throw new UploadValidationError(
      "Each video requires filename and contentType"
    );
  }

  if (typeof video.size !== "number") {
    throw new UploadValidationError("Each video requires a numeric size");
  }

  const input = {
    filename,
    contentType,
    size: video.size,
    prompt,
    targetLanguage,
  };

  assertValidVideoUploadInput(input);

  return input;
}

export function parseCreateUploadSessionBody(
  body: RawUploadSessionBody
): CreateUploadSessionInput {
  const targetLanguage = getTrimmedString(body.targetLanguage);

  if (!targetLanguage) {
    throw new UploadValidationError("targetLanguage is required");
  }

  assertVideosArray(body.videos);

  const prompt = normalizePrompt(body.prompt);
  const videos = body.videos.map((video) =>
    parseUploadVideoInput(video, targetLanguage, prompt)
  );
  const title = buildUploadSessionTitle(
    body.title,
    videos.map((video) => video.filename)
  );

  return {
    title,
    targetLanguage,
    prompt,
    videos,
  };
}

function defaultUploadSessionDependencies(): UploadSessionDependencies {
  return {
    async createBatch(input) {
      const { data, error } = await supabaseAdmin
        .from("video_batches")
        .insert({
          title: input.title,
          target_language: input.targetLanguage,
          expected_video_count: input.expectedVideoCount,
          ...(input.userId ? { user_id: input.userId } : {}),
        })
        .select("id")
        .single();

      if (error) {
        throw new Error(`Failed to create video batch: ${error.message}`);
      }

      return data as UploadSessionBatch;
    },
    createVideo: createVideoUploadRecord,
  };
}

export async function createUploadSession(
  input: CreateUploadSessionInput,
  dependencies: UploadSessionDependencies = defaultUploadSessionDependencies()
): Promise<UploadSessionRecord> {
  assertVideosArray(input.videos);

  const batch = await dependencies.createBatch({
    title: input.title,
    targetLanguage: input.targetLanguage,
    expectedVideoCount: input.videos.length,
    ...(input.userId ? { userId: input.userId } : {}),
  });

  const videos = await Promise.all(
    input.videos.map((video, index) =>
      dependencies.createVideo({
        ...video,
        ...(input.userId ? { userId: input.userId } : {}),
        batchId: batch.id,
        batchPosition: index,
      })
    )
  );

  return {
    batchId: batch.id,
    statusUrl: `/video-batches/${batch.id}`,
    totalVideos: videos.length,
    videos,
  };
}
