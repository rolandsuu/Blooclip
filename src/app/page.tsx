"use client";

import { useState } from "react";

export default function Home() {
  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState("Choose a video");
  const [videoId, setVideoId] = useState<string | null>(null);

  async function uploadVideo() {
    if (!file) return;

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
      const error = await createResponse.json();
      setStatus(error.error || "Failed to create upload");
      return;
    }

    const uploadData = await createResponse.json();

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
      const error = await completeResponse.json();
      setStatus(error.error || "Failed to confirm upload");
      return;
    }

    setVideoId(uploadData.videoId);
    setStatus("Upload complete");
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
        disabled={!file}
        className="rounded bg-black px-4 py-2 text-white disabled:opacity-40"
      >
        Upload Video
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