import { NextResponse } from "next/server";

import { supabaseAdmin } from "@/lib/supabase-admin";

export const runtime = "nodejs";

type UploadFailedContext = {
  params: Promise<{
    videoId: string;
  }>;
};

type UploadFailedBody = {
  error?: unknown;
};

type VideoRow = {
  status: string;
};

const MARK_FAILED_STATUSES = new Set(["created", "uploaded"]);

function errorResponse(error: string, status: number) {
  return NextResponse.json({ error }, { status });
}

function getErrorMessage(body: UploadFailedBody) {
  if (typeof body.error === "string" && body.error.trim()) {
    return body.error.trim().slice(0, 500);
  }

  return "Upload to R2 failed";
}

export async function POST(request: Request, context: UploadFailedContext) {
  const { videoId } = await context.params;

  if (!videoId) {
    return errorResponse("Missing videoId", 400);
  }

  let body: UploadFailedBody = {};

  try {
    body = (await request.json()) as UploadFailedBody;
  } catch {
    body = {};
  }

  const { data, error: selectError } = await supabaseAdmin
    .from("videos")
    .select("status")
    .eq("id", videoId)
    .single();

  if (selectError) {
    if (selectError.code === "PGRST116") {
      return errorResponse("Video not found", 404);
    }

    return errorResponse(`Failed to load video: ${selectError.message}`, 500);
  }

  const video = data as VideoRow;

  if (!MARK_FAILED_STATUSES.has(video.status)) {
    return errorResponse(
      `Video cannot be marked upload failed from status ${video.status}`,
      409
    );
  }

  const { error: updateError } = await supabaseAdmin
    .from("videos")
    .update({
      status: "failed",
      current_stage: "upload_failed",
      error_message: getErrorMessage(body),
      error_code: "upload_failed",
      error_provider: "client_upload",
      retryable: true,
      updated_at: new Date().toISOString(),
    })
    .eq("id", videoId);

  if (updateError) {
    return errorResponse(
      `Failed to mark upload failed: ${updateError.message}`,
      500
    );
  }

  return NextResponse.json({
    videoId,
    status: "failed",
    currentStage: "upload_failed",
  });
}
