"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";

import { ProcessingBoard } from "@/app/_components/processing-board";
import { getTargetLanguageLabel } from "@/lib/languages";
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
  await response.text().catch(() => "");
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
      errorMessage: `${failedCount} 个视频处理失败。`,
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
  const [message, setMessage] = useState("正在加载批量状态...");

  useEffect(() => {
    let active = true;

    async function loadBatch() {
      try {
        const response = await fetch(`/api/video-batches/${params.batchId}`);

        if (!response.ok) {
          const error = await readErrorMessage(
            response,
            "加载批量状态失败。"
          );

          if (active) {
            setMessage(error);
          }

          return;
        }

        const data = (await response.json()) as BatchStatus;

        if (active) {
          setBatch(data);
          setMessage("批量状态已更新。");
        }
      } catch {
        if (active) {
          setMessage("加载失败，请稍后重试。");
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
          {batch?.title ?? "视频批次"}
        </h1>
        <p className="text-sm text-gray-500">
          目标语言：{batch ? getTargetLanguageLabel(batch.targetLanguage) : "加载中"}
        </p>
      </div>

      <section className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-4">
          <div className="rounded border border-gray-200 p-3">
            <p className="text-sm text-gray-500">视频</p>
            <p className="text-xl font-semibold">
              {batch?.videos.length ?? 0}/{batch?.expectedVideoCount ?? 0}
            </p>
          </div>
          <div className="rounded border border-gray-200 p-3">
            <p className="text-sm text-gray-500">进行中</p>
            <p className="text-xl font-semibold">{queuedOrActiveCount}</p>
          </div>
          <div className="rounded border border-gray-200 p-3">
            <p className="text-sm text-gray-500">已完成</p>
            <p className="text-xl font-semibold">{completedCount}</p>
          </div>
          <div className="rounded border border-gray-200 p-3">
            <p className="text-sm text-gray-500">失败</p>
            <p className="text-xl font-semibold">{failedCount}</p>
          </div>
        </div>

        <ProcessingBoard
          label="批量 AI 处理"
          status={batchProcessingInput.status}
          currentStage={batchProcessingInput.currentStage}
          progress={batchProcessingInput.progress}
          errorMessage={batchProcessingInput.errorMessage}
        />
      </section>

      <section className="space-y-3">
        <h2 className="text-base font-semibold">视频列表</h2>

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
                      {video.filename ?? "未命名视频"}
                    </p>
                  </div>
                  <Link
                    href={`/videos/${video.id}`}
                    className="rounded border border-gray-300 px-3 py-1 text-sm"
                  >
                    打开
                  </Link>
                </div>

                <p className="text-sm text-gray-700">
                  {video.prompt ?? "没有提示词"}
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
