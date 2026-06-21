"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";

import { ProcessingBoard } from "@/app/_components/processing-board";

type VideoStatus = {
  id: string;
  status: string;
  progress: number;
  currentStage: string | null;
  errorMessage: string | null;
  instructionReady: boolean;
  instructionPdfReady: boolean;
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
  const [isDownloadingInstructionPdf, setIsDownloadingInstructionPdf] =
    useState(false);

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

  async function downloadInstructionPdf() {
    if (isDownloadingInstructionPdf) return;

    setIsDownloadingInstructionPdf(true);

    try {
      const response = await fetch(
        `/api/videos/${params.videoId}/instruction-document`
      );

      if (!response.ok) {
        setMessage(
          await readErrorMessage(
            response,
            "Failed to download instruction PDF"
          )
        );
        return;
      }

      const data = (await response.json()) as { pdfDownloadUrl?: unknown };

      if (typeof data.pdfDownloadUrl !== "string") {
        setMessage("Instruction PDF response was invalid");
        return;
      }

      window.location.href = data.pdfDownloadUrl;
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Instruction PDF download failed"
      );
    } finally {
      setIsDownloadingInstructionPdf(false);
    }
  }

  const progress = Math.max(0, Math.min(100, video?.progress ?? 0));
  const canDownload = Boolean(video?.downloadReady) && !isDownloading;
  const canViewInstructionDocument =
    Boolean(video?.instructionReady) && Boolean(video?.instructionPdfReady);
  const canDownloadInstructionPdf =
    Boolean(video?.instructionPdfReady) && !isDownloadingInstructionPdf;

  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col justify-center gap-6 p-6">
      <div className="space-y-2">
        <p className="text-sm text-gray-500">Blooclip</p>
        <h1 className="text-2xl font-semibold">Video Status</h1>
      </div>

      <ProcessingBoard
        status={video?.status ?? "loading"}
        currentStage={video?.currentStage ?? null}
        progress={progress}
        errorMessage={video?.errorMessage ?? null}
      />

      <button
        onClick={downloadVideo}
        disabled={!canDownload}
        className="rounded bg-black px-4 py-2 text-white disabled:opacity-40"
      >
        {isDownloading ? "Preparing Download..." : "Download Final Video"}
      </button>

      <div className="grid gap-3 sm:grid-cols-2">
        {canViewInstructionDocument ? (
          <Link
            href={`/videos/${params.videoId}/instructions`}
            className="rounded border border-gray-300 px-4 py-2 text-center text-sm font-medium"
          >
            View instruction document
          </Link>
        ) : (
          <button
            disabled
            className="rounded border border-gray-300 px-4 py-2 text-sm font-medium opacity-40"
          >
            View instruction document
          </button>
        )}

        <button
          onClick={downloadInstructionPdf}
          disabled={!canDownloadInstructionPdf}
          className="rounded border border-gray-300 px-4 py-2 text-sm font-medium disabled:opacity-40"
        >
          {isDownloadingInstructionPdf
            ? "Preparing PDF..."
            : "Download instruction PDF"}
        </button>
      </div>

      <p className="text-sm text-gray-500">{message}</p>
    </main>
  );
}
