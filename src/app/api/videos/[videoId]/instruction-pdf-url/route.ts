import { GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { NextResponse } from "next/server";

import { AuthError } from "@/lib/auth";
import { loadAccessibleVideo } from "@/lib/ownership";
import { r2, R2_BUCKET_NAME } from "@/lib/r2";

export const runtime = "nodejs";

type InstructionPdfContext = {
  params: Promise<{
    videoId: string;
  }>;
};

type InstructionPdfRow = {
  instruction_pdf_r2_key: string | null;
  user_id: string | null;
};

function errorResponse(error: string, status: number) {
  return NextResponse.json({ error }, { status });
}

async function signR2Object(key: string, filename: string) {
  return getSignedUrl(
    r2,
    new GetObjectCommand({
      Bucket: R2_BUCKET_NAME,
      Key: key,
      ResponseContentDisposition: `attachment; filename="${filename}"`,
    }),
    { expiresIn: 60 * 10 }
  );
}

export async function GET(_request: Request, context: InstructionPdfContext) {
  const { videoId } = await context.params;

  if (!videoId) {
    return errorResponse("Missing videoId", 400);
  }

  let video: InstructionPdfRow;

  try {
    video = await loadAccessibleVideo<InstructionPdfRow>(
      videoId,
      "instruction_pdf_r2_key,user_id"
    );
  } catch (error) {
    if (error instanceof AuthError) {
      return errorResponse(error.message, error.status);
    }

    const message =
      error instanceof Error ? error.message : "Failed to load video";

    return errorResponse(message, 500);
  }

  if (!video.instruction_pdf_r2_key) {
    return errorResponse("Instruction PDF is not ready", 409);
  }

  try {
    const pdfDownloadUrl = await signR2Object(
      video.instruction_pdf_r2_key,
      `${videoId}-instructions.pdf`
    );

    return NextResponse.json({ pdfDownloadUrl });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to sign instruction PDF";

    return errorResponse(message, 500);
  }
}
