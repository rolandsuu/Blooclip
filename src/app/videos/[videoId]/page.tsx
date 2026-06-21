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
  await response.text().catch(() => "");
  return fallback;
}

export default function VideoPage() {
  const params = useParams<{ videoId: string }>();
  const [video, setVideo] = useState<VideoStatus | null>(null);
  const [message, setMessage] = useState("正在加载视频状态...");
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
            "加载视频状态失败。"
          );

          if (active) {
            setMessage(error);
          }

          return;
        }

        const data = (await response.json()) as VideoStatus;

        if (active) {
          setVideo(data);
          setMessage("视频状态已更新。");
        }
      } catch {
        if (active) {
          setMessage("加载失败，请稍后重试。");
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
        setMessage(await readErrorMessage(response, "下载视频失败。"));
        return;
      }

      const data = (await response.json()) as { downloadUrl?: unknown };

      if (typeof data.downloadUrl !== "string") {
        setMessage("下载链接响应无效。");
        return;
      }

      window.location.href = data.downloadUrl;
    } catch {
      setMessage("下载失败，请稍后重试。");
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
            "下载操作 PDF 失败。"
          )
        );
        return;
      }

      const data = (await response.json()) as { pdfDownloadUrl?: unknown };

      if (typeof data.pdfDownloadUrl !== "string") {
        setMessage("操作 PDF 响应无效。");
        return;
      }

      window.location.href = data.pdfDownloadUrl;
    } catch {
      setMessage("操作 PDF 下载失败，请稍后重试。");
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
        <h1 className="text-2xl font-semibold">视频状态</h1>
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
        {isDownloading ? "正在准备下载..." : "下载最终视频"}
      </button>

      <div className="grid gap-3 sm:grid-cols-2">
        {canViewInstructionDocument ? (
          <Link
            href={`/videos/${params.videoId}/instructions`}
            className="rounded border border-gray-300 px-4 py-2 text-center text-sm font-medium"
          >
            查看操作文档
          </Link>
        ) : (
          <button
            disabled
            className="rounded border border-gray-300 px-4 py-2 text-sm font-medium opacity-40"
          >
            查看操作文档
          </button>
        )}

        <button
          onClick={downloadInstructionPdf}
          disabled={!canDownloadInstructionPdf}
          className="rounded border border-gray-300 px-4 py-2 text-sm font-medium disabled:opacity-40"
        >
          {isDownloadingInstructionPdf
            ? "正在准备 PDF..."
            : "下载操作 PDF"}
        </button>
      </div>

      <p className="text-sm text-gray-500">{message}</p>
    </main>
  );
}
