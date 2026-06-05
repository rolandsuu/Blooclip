import { GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { NextResponse } from "next/server";

import { r2, R2_BUCKET_NAME } from "@/lib/r2";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const runtime = "nodejs";

type DownloadContext = {
  params: Promise<{
    videoId: string;
  }>;
};

type DownloadRow = {
  status: string;
  final_r2_key: string | null;
};

function errorResponse(error: string, status: number) {
  return NextResponse.json({ error }, { status });
}

export async function GET(_request: Request, context: DownloadContext) {
  const { videoId } = await context.params;

  if (!videoId) {
    return errorResponse("Missing videoId", 400);
  }

  const { data, error } = await supabaseAdmin
    .from("videos")
    .select("status,final_r2_key")
    .eq("id", videoId)
    .single();

  if (error) {
    if (error.code === "PGRST116") {
      return errorResponse("Video not found", 404);
    }

    return errorResponse(`Failed to load video: ${error.message}`, 500);
  }

  const video = data as DownloadRow;

  if (video.status !== "completed" || !video.final_r2_key) {
    return errorResponse("Video is not ready to download", 400);
  }

  const downloadUrl = await getSignedUrl(
    r2,
    new GetObjectCommand({
      Bucket: R2_BUCKET_NAME,
      Key: video.final_r2_key,
    }),
    { expiresIn: 60 * 10 }
  );

  return NextResponse.json({ downloadUrl });
}
