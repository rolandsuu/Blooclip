import { NextResponse } from "next/server";

import {
  UploadValidationError,
  createVideoUploadRecord,
  getTrimmedString,
  normalizePrompt,
} from "@/lib/upload-records";

export const runtime = "nodejs";

type CreateUploadBody = {
  filename?: unknown;
  contentType?: unknown;
  size?: unknown;
  prompt?: unknown;
  targetLanguage?: unknown;
};

function errorResponse(error: string, status: number) {
  return NextResponse.json({ error }, { status });
}

export async function POST(request: Request) {
  let body: CreateUploadBody;

  try {
    body = (await request.json()) as CreateUploadBody;
  } catch {
    return errorResponse("Request body must be valid JSON", 400);
  }

  const filename = getTrimmedString(body.filename);
  const contentType = getTrimmedString(body.contentType);
  const targetLanguage = getTrimmedString(body.targetLanguage);

  if (!filename || !contentType || !targetLanguage) {
    return errorResponse(
      "Missing required fields: filename, contentType, and targetLanguage are required",
      400
    );
  }

  try {
    if (typeof body.size !== "number") {
      return errorResponse("size must be a positive integer", 400);
    }

    const upload = await createVideoUploadRecord({
      filename,
      contentType,
      size: body.size,
      prompt: normalizePrompt(body.prompt),
      targetLanguage,
    });

    return NextResponse.json({
      videoId: upload.videoId,
      uploadUrl: upload.uploadUrl,
    });
  } catch (error) {
    if (error instanceof UploadValidationError) {
      return errorResponse(error.message, error.status);
    }

    const message =
      error instanceof Error ? error.message : "Failed to create upload URL";

    return errorResponse(message, 500);
  }
}
