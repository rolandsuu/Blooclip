import { NextResponse } from "next/server";

import {
  queueVideoProcessing,
  VideoProcessingQueueError,
} from "@/lib/video-processing";

export const runtime = "nodejs";

type StartProcessingContext = {
  params: Promise<{
    videoId: string;
  }>;
};

function errorResponse(error: string, status: number) {
  return NextResponse.json({ error }, { status });
}

export async function POST(_request: Request, context: StartProcessingContext) {
  const { videoId } = await context.params;

  if (!videoId) {
    return errorResponse("Missing videoId", 400);
  }

  try {
    const result = await queueVideoProcessing(videoId);

    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof VideoProcessingQueueError) {
      return errorResponse(error.message, error.status);
    }

    const message =
      error instanceof Error ? error.message : "Failed to queue processing";

    return errorResponse(message, 500);
  }
}
