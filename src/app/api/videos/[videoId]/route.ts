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
  current_stage: string | null;
  error_message: string | null;
  error_code: string | null;
  error_provider: string | null;
  provider_request_id: string | null;
  retryable: boolean | null;
  final_r2_key: string | null;
  transcript_r2_key: string | null;
  edit_plan_r2_key: string | null;
  instruction_doc_r2_key: string | null;
  instruction_pdf_r2_key: string | null;
  voiceover_script_r2_key: string | null;
  subtitle_r2_key: string | null;
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
      "id,status,progress,current_stage,error_message,error_code,error_provider,provider_request_id,retryable,final_r2_key,transcript_r2_key,edit_plan_r2_key,instruction_doc_r2_key,instruction_pdf_r2_key,voiceover_script_r2_key,subtitle_r2_key,created_at,updated_at"
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
    currentStage: video.current_stage,
    errorMessage: video.error_message,
    errorCode: video.error_code,
    provider: video.error_provider,
    providerRequestId: video.provider_request_id,
    retryable: video.retryable,
    transcriptReady: Boolean(video.transcript_r2_key),
    editPlanReady: Boolean(video.edit_plan_r2_key),
    instructionReady: Boolean(video.instruction_doc_r2_key),
    instructionPdfReady: Boolean(video.instruction_pdf_r2_key),
    voiceoverReady: Boolean(video.voiceover_script_r2_key),
    subtitlesReady: Boolean(video.subtitle_r2_key),
    downloadReady: video.status === "completed" && Boolean(video.final_r2_key),
    createdAt: video.created_at,
    updatedAt: video.updated_at,
  });
}
