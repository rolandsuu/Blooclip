"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";

type VideoStatus = {
  id: string;
  status: string;
  progress: number;
  errorMessage: string | null;
  downloadReady: boolean;
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

export default function VideoPage() {
  const params = useParams<{ videoId: string }>();
  const [video, setVideo] = useState<VideoStatus | null>(null);
  const [message, setMessage] = useState("Loading video status...");
  const [isDownloading, setIsDownloading] = useState(false);

  useEffect(() => {
    let active = true;

    async function loadVideo() {
      try {
        const response = await fetch(`/api/videos/${params.videoId}`);

        if (!response.ok) {
          const error = await readErrorMessage(
            response,
            "Failed to load video status"
          );

          if (active) {
            setMessage(error);
          }

          return;
        }

        const data = (await response.json()) as VideoStatus;

        if (active) {
          setVideo(data);
          setMessage("Video status loaded");
        }
      } catch (error) {
        if (active) {
          setMessage(error instanceof Error ? error.message : "Load failed");
        }
      }
    }

    loadVideo();
    const interval = window.setInterval(loadVideo, 3000);

    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, [params.videoId]);

  async function downloadVideo() {
    if (isDownloading) return;

    setIsDownloading(true);

    try {
      const response = await fetch(`/api/videos/${params.videoId}/download-url`);

      if (!response.ok) {
        setMessage(await readErrorMessage(response, "Failed to download video"));
        return;
      }

      const data = (await response.json()) as { downloadUrl?: unknown };

      if (typeof data.downloadUrl !== "string") {
        setMessage("Download URL response was invalid");
        return;
      }

      window.location.href = data.downloadUrl;
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Download failed");
    } finally {
      setIsDownloading(false);
    }
  }

  const progress = Math.max(0, Math.min(100, video?.progress ?? 0));
  const canDownload = Boolean(video?.downloadReady) && !isDownloading;

  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col justify-center gap-6 p-6">
      <div className="space-y-2">
        <p className="text-sm text-gray-500">Blooclip</p>
        <h1 className="text-2xl font-semibold">Video Status</h1>
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between gap-4 text-sm">
          <span>Status</span>
          <span className="font-mono">{video?.status ?? "loading"}</span>
        </div>

        <div className="h-3 overflow-hidden rounded bg-gray-200">
          <div
            className="h-full rounded bg-black transition-all"
            style={{ width: `${progress}%` }}
          />
        </div>

        <p className="text-sm text-gray-600">Progress: {progress}%</p>
      </div>

      {video?.errorMessage && (
        <p className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {video.errorMessage}
        </p>
      )}

      <button
        onClick={downloadVideo}
        disabled={!canDownload}
        className="rounded bg-black px-4 py-2 text-white disabled:opacity-40"
      >
        {isDownloading ? "Preparing Download..." : "Download Final Video"}
      </button>

      <p className="text-sm text-gray-500">{message}</p>
    </main>
  );
}
