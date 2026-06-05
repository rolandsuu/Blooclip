"use client";

import { useState } from "react";

type CreateUploadResponse = {
  videoId: string;
  uploadUrl: string;
};

async function readErrorMessage(response: Response, fallback: string) {
  const text = await response.text().catch(() => "");

  if (!text) {
    return fallback;
  }

  try {
    const data = JSON.parse(text) as { error?: unknown };

    if (typeof data.error === "string" && data.error.trim()) {
      return data.error;
    }
  } catch {
    return text;
  }

  return fallback;
}

function isCreateUploadResponse(data: unknown): data is CreateUploadResponse {
  if (typeof data !== "object" || data === null) {
    return false;
  }

  return (
    "videoId" in data &&
    "uploadUrl" in data &&
    typeof data.videoId === "string" &&
    typeof data.uploadUrl === "string"
  );
}

export default function Home() {
  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState("Choose a video");
  const [videoId, setVideoId] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  async function uploadVideo() {
    if (!file || isUploading) return;

    setIsUploading(true);
    setVideoId(null);

    try {
      setStatus("Creating upload URL...");

      const createResponse = await fetch("/api/videos/create-upload", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          filename: file.name,
          contentType: file.type,
          size: file.size,
          prompt: "Create a key-event video with voiceover and subtitles",
          targetLanguage: "en",
        }),
      });

      if (!createResponse.ok) {
        setStatus(
          await readErrorMessage(createResponse, "Failed to create upload")
        );
        return;
      }

      const uploadData = (await createResponse.json()) as unknown;

      if (!isCreateUploadResponse(uploadData)) {
        setStatus("Upload API response was invalid");
        return;
      }

      setStatus("Uploading video to R2...");

      const r2Response = await fetch(uploadData.uploadUrl, {
        method: "PUT",
        headers: {
          "Content-Type": file.type,
        },
        body: file,
      });

      if (!r2Response.ok) {
        setStatus("R2 upload failed");
        return;
      }

      setStatus("Confirming upload...");

      const completeResponse = await fetch(
        `/api/videos/${uploadData.videoId}/complete-upload`,
        {
          method: "POST",
        }
      );

      if (!completeResponse.ok) {
        setStatus(
          await readErrorMessage(completeResponse, "Failed to confirm upload")
        );
        return;
      }

      setVideoId(uploadData.videoId);
      setStatus("Upload complete");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Upload failed");
    } finally {
      setIsUploading(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col justify-center gap-6 p-6">
      <h1 className="text-2xl font-semibold">Blooclip Upload Test</h1>

      <input
        type="file"
        accept="video/mp4,video/webm,video/quicktime"
        onChange={(event) => setFile(event.target.files?.[0] ?? null)}
      />

      <button
        onClick={uploadVideo}
        disabled={!file || isUploading}
        className="rounded bg-black px-4 py-2 text-white disabled:opacity-40"
      >
        {isUploading ? "Uploading..." : "Upload Video"}
      </button>

      <p>{status}</p>

      {videoId && (
        <p className="text-sm text-gray-600">
          Video ID: <span className="font-mono">{videoId}</span>
        </p>
      )}
    </main>
  );
}
