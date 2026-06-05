import { task } from "@trigger.dev/sdk/v3";
import { GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, rm } from "node:fs/promises";
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

async function updateVideo(videoId: string, values: Record<string, unknown>) {
  const { error } = await supabaseAdmin
    .from("videos")
    .update({ ...values, updated_at: new Date().toISOString() })
    .eq("id", videoId);

  if (error) {
    throw new Error(`Failed to update video status: ${error.message}`);
  }
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

async function uploadToR2(key: string, filePath: string) {
  await r2.send(
    new PutObjectCommand({
      Bucket: R2_BUCKET_NAME,
      Key: key,
      Body: createReadStream(filePath),
      ContentType: "video/mp4",
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

export const processVideoTask = task({
  id: "process-video",
  maxDuration: 60 * 30,
  run: async (payload: ProcessVideoPayload) => {
    const workDir = path.join(os.tmpdir(), `blooclip-${payload.videoId}`);
    const inputPath = path.join(workDir, "input.mp4");
    const outputPath = path.join(workDir, "final.mp4");
    const finalR2Key = `outputs/dev/${payload.videoId}/final.mp4`;

    try {
      await mkdir(workDir, { recursive: true });
      await updateVideo(payload.videoId, {
        status: "processing",
        progress: 20,
        error_message: null,
      });

      await downloadFromR2(payload.originalR2Key, inputPath);
      await updateVideo(payload.videoId, {
        progress: 50,
      });

      await runFfmpeg([
        "-y",
        "-i",
        inputPath,
        "-t",
        "10",
        "-c:v",
        "libx264",
        "-c:a",
        "aac",
        "-movflags",
        "+faststart",
        outputPath,
      ]);

      await updateVideo(payload.videoId, {
        progress: 80,
      });

      await uploadToR2(finalR2Key, outputPath);

      await updateVideo(payload.videoId, {
        status: "completed",
        progress: 100,
        final_r2_key: finalR2Key,
        error_message: null,
      });
    } catch (error) {
      await updateVideo(payload.videoId, {
        status: "failed",
        error_message:
          error instanceof Error ? error.message : "Unknown processing error",
      });

      throw error;
    } finally {
      await rm(workDir, { recursive: true, force: true });
    }
  },
});
