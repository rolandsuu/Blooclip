"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";

import { ProcessingBoard } from "@/app/_components/processing-board";
import type { ProcessingDisplayInput } from "@/lib/processing-stage-copy";

type BatchVideoStatus = {
  id: string;
  batchPosition: number | null;
  filename: string | null;
  prompt: string | null;
  status: string;
  progress: number;
  currentStage: string | null;
  errorMessage: string | null;
  downloadReady: boolean;
  instructionReady: boolean;
  instructionPdfReady: boolean;
  createdAt: string;
  updatedAt: string;
};

type BatchStatus = {
  id: string;
  title: string;
  targetLanguage: string;
  expectedVideoCount: number;
  createdAt: string;
  updatedAt: string;
  videos: BatchVideoStatus[];
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

function getProgress(batch: BatchStatus | null) {
  if (!batch || batch.expectedVideoCount <= 0) {
    return 0;
  }

  const progressTotal = batch.videos.reduce(
    (total, video) => total + Math.max(0, Math.min(100, video.progress)),
    0
  );

  return Math.round(progressTotal / batch.expectedVideoCount);
}

function isTerminalStatus(status: string) {
  return status === "completed" || status === "failed";
}

function pluralizeVideo(count: number) {
  return count === 1 ? "video" : "videos";
}

function getBatchProcessingInput(
  batch: BatchStatus | null,
  progress: number
): ProcessingDisplayInput {
  if (!batch) {
    return {
      status: "loading",
      currentStage: null,
      progress: 0,
    };
  }

  const activeVideo = batch.videos.find(
    (video) => !isTerminalStatus(video.status)
  );

  if (activeVideo) {
    return {
      status: activeVideo.status,
      currentStage: activeVideo.currentStage ?? activeVideo.status,
      progress,
      errorMessage: activeVideo.errorMessage,
    };
  }

  const failedCount = batch.videos.filter(
    (video) => video.status === "failed"
  ).length;

  if (failedCount > 0) {
    return {
      status: "failed",
      currentStage: "failed",
      progress,
      errorMessage: `${failedCount} ${pluralizeVideo(failedCount)} failed.`,
    };
  }

  if (
    batch.videos.length >= batch.expectedVideoCount &&
    batch.videos.every((video) => video.status === "completed")
  ) {
    return {
      status: "completed",
      currentStage: "completed",
      progress: 100,
    };
  }

  return {
    status: "created",
    currentStage: "created",
    progress,
  };
}

export default function BatchPage() {
  const params = useParams<{ batchId: string }>();
  const [batch, setBatch] = useState<BatchStatus | null>(null);
  const [message, setMessage] = useState("Loading batch status...");

  useEffect(() => {
    let active = true;

    async function loadBatch() {
      try {
        const response = await fetch(`/api/video-batches/${params.batchId}`);

        if (!response.ok) {
          const error = await readErrorMessage(
            response,
            "Failed to load batch status"
          );

          if (active) {
            setMessage(error);
          }

          return;
        }

        const data = (await response.json()) as BatchStatus;

        if (active) {
          setBatch(data);
          setMessage("Batch status loaded");
        }
      } catch (error) {
        if (active) {
          setMessage(error instanceof Error ? error.message : "Load failed");
        }
      }
    }

    loadBatch();
    const interval = window.setInterval(loadBatch, 3000);

    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, [params.batchId]);

  const progress = getProgress(batch);
  const completedCount = useMemo(
    () => batch?.videos.filter((video) => video.status === "completed").length ?? 0,
    [batch]
  );
  const failedCount = useMemo(
    () => batch?.videos.filter((video) => video.status === "failed").length ?? 0,
    [batch]
  );
  const queuedOrActiveCount = useMemo(
    () =>
      batch?.videos.filter((video) => !isTerminalStatus(video.status)).length ??
      0,
    [batch]
  );
  const batchProcessingInput = getBatchProcessingInput(batch, progress);

  return (
    <main className="mx-auto flex min-h-screen max-w-4xl flex-col gap-6 p-6 py-10">
      <div className="space-y-2">
        <p className="text-sm text-gray-500">Blooclip</p>
        <h1 className="text-2xl font-semibold">
          {batch?.title ?? "Video Batch"}
        </h1>
        <p className="text-sm text-gray-500">
          Target language: {batch?.targetLanguage ?? "loading"}
        </p>
      </div>

      <section className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-4">
          <div className="rounded border border-gray-200 p-3">
            <p className="text-sm text-gray-500">Videos</p>
            <p className="text-xl font-semibold">
              {batch?.videos.length ?? 0}/{batch?.expectedVideoCount ?? 0}
            </p>
          </div>
          <div className="rounded border border-gray-200 p-3">
            <p className="text-sm text-gray-500">Active</p>
            <p className="text-xl font-semibold">{queuedOrActiveCount}</p>
          </div>
          <div className="rounded border border-gray-200 p-3">
            <p className="text-sm text-gray-500">Completed</p>
            <p className="text-xl font-semibold">{completedCount}</p>
          </div>
          <div className="rounded border border-gray-200 p-3">
            <p className="text-sm text-gray-500">Failed</p>
            <p className="text-xl font-semibold">{failedCount}</p>
          </div>
        </div>

        <ProcessingBoard
          label="Batch AI processing"
          status={batchProcessingInput.status}
          currentStage={batchProcessingInput.currentStage}
          progress={batchProcessingInput.progress}
          errorMessage={batchProcessingInput.errorMessage}
        />
      </section>

      <section className="space-y-3">
        <h2 className="text-base font-semibold">Videos</h2>

        <div className="space-y-3">
          {(batch?.videos ?? []).map((video, index) => {
            return (
              <div
                key={video.id}
                className="grid gap-3 rounded border border-gray-200 p-4"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-medium">
                      {(video.batchPosition ?? index) + 1}.{" "}
                      {video.filename ?? "Untitled video"}
                    </p>
                  </div>
                  <Link
                    href={`/videos/${video.id}`}
                    className="rounded border border-gray-300 px-3 py-1 text-sm"
                  >
                    Open
                  </Link>
                </div>

                <p className="text-sm text-gray-700">
                  {video.prompt ?? "No prompt"}
                </p>

                <ProcessingBoard
                  compact
                  status={video.status}
                  currentStage={video.currentStage}
                  progress={video.progress}
                  errorMessage={video.errorMessage}
                  className="bg-black/[0.015]"
                />
              </div>
            );
          })}
        </div>
      </section>

      <p className="text-sm text-gray-500">{message}</p>
    </main>
  );
}
