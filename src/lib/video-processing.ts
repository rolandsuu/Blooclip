import { HeadObjectCommand } from "@aws-sdk/client-s3";
import { tasks } from "@trigger.dev/sdk/v3";

import { r2, R2_BUCKET_NAME } from "@/lib/r2";
import { supabaseAdmin } from "@/lib/supabase-admin";

type VideoProcessingRow = {
  id: string;
  status: string;
  original_r2_key: string | null;
};

type QueueVideoProcessingOptions = {
  allowedStatuses?: readonly string[];
};

export type QueueVideoProcessingResult = {
  videoId: string;
  status: "queued";
  triggerRunId: string;
};

export class VideoProcessingQueueError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "VideoProcessingQueueError";
    this.status = status;
  }
}

const DEFAULT_ALLOWED_STATUSES = ["uploaded"] as const;

function getHttpStatus(error: unknown) {
  const metadata = (error as { $metadata?: { httpStatusCode?: unknown } })
    .$metadata;

  return typeof metadata?.httpStatusCode === "number"
    ? metadata.httpStatusCode
    : null;
}

function queueError(message: string, status: number) {
  return new VideoProcessingQueueError(message, status);
}

export async function queueVideoProcessing(
  videoId: string,
  options: QueueVideoProcessingOptions = {}
): Promise<QueueVideoProcessingResult> {
  const allowedStatuses = options.allowedStatuses ?? DEFAULT_ALLOWED_STATUSES;

  const { data, error: selectError } = await supabaseAdmin
    .from("videos")
    .select("id,status,original_r2_key")
    .eq("id", videoId)
    .single();

  if (selectError) {
    if (selectError.code === "PGRST116") {
      throw queueError("Video not found", 404);
    }

    throw queueError(`Failed to load video record: ${selectError.message}`, 500);
  }

  const video = data as VideoProcessingRow | null;

  if (!video?.original_r2_key) {
    throw queueError("Video record is missing an R2 object key", 500);
  }

  if (!allowedStatuses.includes(video.status)) {
    throw queueError(
      `Video cannot start processing from status ${video.status}`,
      409
    );
  }

  try {
    await r2.send(
      new HeadObjectCommand({
        Bucket: R2_BUCKET_NAME,
        Key: video.original_r2_key,
      })
    );
  } catch (error) {
    const status = getHttpStatus(error);

    if (status === 404) {
      throw queueError("Uploaded object was not found in R2", 400);
    }

    const message =
      error instanceof Error ? error.message : "Failed to verify R2 upload";

    throw queueError(message, 500);
  }

  let triggerRun;

  try {
    triggerRun = await tasks.trigger("process-video", {
      videoId,
      originalR2Key: video.original_r2_key,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to trigger processing task";

    await supabaseAdmin
      .from("videos")
      .update({
        status: "failed",
        current_stage: "queued",
        error_message: message,
        error_code: "trigger_failed",
        error_provider: "trigger.dev",
        retryable: true,
        updated_at: new Date().toISOString(),
      })
      .eq("id", videoId);

    throw queueError(message, 500);
  }

  const { error: updateError } = await supabaseAdmin
    .from("videos")
    .update({
      status: "queued",
      progress: 5,
      current_stage: "queued",
      trigger_run_id: triggerRun.id,
      error_message: null,
      error_code: null,
      error_provider: null,
      provider_request_id: null,
      retryable: null,
      transcript_r2_key: null,
      visual_timeline_r2_key: null,
      edit_plan_r2_key: null,
      voiceover_script_r2_key: null,
      subtitle_r2_key: null,
      final_r2_key: null,
      provider_run_ids: {},
      updated_at: new Date().toISOString(),
    })
    .eq("id", videoId);

  if (updateError) {
    throw queueError(`Failed to mark video queued: ${updateError.message}`, 500);
  }

  return {
    videoId,
    status: "queued",
    triggerRunId: triggerRun.id,
  };
}
