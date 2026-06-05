import { NextResponse } from "next/server";

import { supabaseAdmin } from "@/lib/supabase-admin";

export const runtime = "nodejs";

type VideoContext = {
  params: Promise<{
    videoId: string;
  }>;
};

type VideoStatusRow = {
  id: string;
  status: string;
  progress: number | null;
  error_message: string | null;
  final_r2_key: string | null;
  created_at: string;
  updated_at: string;
};

function errorResponse(error: string, status: number) {
  return NextResponse.json({ error }, { status });
}

export async function GET(_request: Request, context: VideoContext) {
  const { videoId } = await context.params;

  if (!videoId) {
    return errorResponse("Missing videoId", 400);
  }

  const { data, error } = await supabaseAdmin
    .from("videos")
    .select(
      "id,status,progress,error_message,final_r2_key,created_at,updated_at"
    )
    .eq("id", videoId)
    .single();

  if (error) {
    if (error.code === "PGRST116") {
      return errorResponse("Video not found", 404);
    }

    return errorResponse(`Failed to load video: ${error.message}`, 500);
  }

  const video = data as VideoStatusRow;

  return NextResponse.json({
    id: video.id,
    status: video.status,
    progress: video.progress ?? 0,
    errorMessage: video.error_message,
    downloadReady: video.status === "completed" && Boolean(video.final_r2_key),
    createdAt: video.created_at,
    updatedAt: video.updated_at,
  });
}
