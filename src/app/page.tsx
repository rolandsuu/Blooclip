"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { ChangeEvent, FormEvent } from "react";
import { useRouter } from "next/navigation";

import { ProcessingBoard } from "@/app/_components/processing-board";
import {
  DEFAULT_TARGET_LANGUAGE,
  TARGET_LANGUAGE_OPTIONS,
} from "@/lib/languages";
import {
  prepareClientUploadFiles,
  type PreparedClientUploadFile,
} from "@/lib/client-upload";
import type { ProcessingDisplayInput } from "@/lib/processing-stage-copy";

type UploadPhase =
  | "idle"
  | "creating"
  | "uploading"
  | "marking_failed"
  | "queueing"
  | "redirecting"
  | "error";

type UploadItemStatus = "ready" | "uploading" | "uploaded" | "failed";

type UploadItem = PreparedClientUploadFile<File> & {
  id: string;
  status: UploadItemStatus;
  progress: number;
  loadedBytes: number;
  totalBytes: number;
  speedBytesPerSecond: number;
  error: string | null;
  videoId: string | null;
};

type RejectedUploadItem = {
  id: string;
  filename: string;
  error: string;
};

type CreateUploadSessionResponse = {
  batchId: string;
  totalVideos: number;
  videos: Array<{
    videoId: string;
    uploadUrl: string;
    filename: string;
    batchPosition: number | null;
  }>;
};

type CompleteUploadSessionResponse = {
  batchId: string;
  totalVideos: number;
  queuedCount: number;
  failedCount: number;
};

type UploadProgress = {
  loadedBytes: number;
  totalBytes: number;
  progress: number;
  speedBytesPerSecond: number;
};

const UPLOAD_ACCEPT_ATTRIBUTE =
  "video/mp4,video/webm,video/quicktime,.mp4,.webm,.mov";

function clampProgress(progress: number) {
  return Math.max(0, Math.min(100, Math.round(progress)));
}

function formatFileSize(bytes: number) {
  if (bytes < 1024 * 1024) {
    return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  }

  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function formatUploadSpeed(bytesPerSecond: number) {
  if (!Number.isFinite(bytesPerSecond) || bytesPerSecond <= 0) {
    return "Waiting";
  }

  if (bytesPerSecond < 1024 * 1024) {
    return `${Math.max(1, Math.round(bytesPerSecond / 1024))} KB/s`;
  }

  return `${(bytesPerSecond / 1024 / 1024).toFixed(1)} MB/s`;
}

function readErrorMessageFromBody(text: string, fallback: string) {
  if (!text.trim()) {
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

async function readErrorMessage(response: Response, fallback: string) {
  const text = await response.text().catch(() => "");
  return readErrorMessageFromBody(text, fallback);
}

async function postJson<TResponse>(
  url: string,
  body: unknown,
  fallbackError: string
) {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error(await readErrorMessage(response, fallbackError));
  }

  return (await response.json()) as TResponse;
}

function getUploadItemId(file: File, index: number) {
  return `${file.name}-${file.size}-${file.lastModified}-${index}`;
}

function buildUploadItem(
  upload: PreparedClientUploadFile<File>,
  index: number
): UploadItem {
  return {
    ...upload,
    id: getUploadItemId(upload.file, index),
    status: "ready",
    progress: 0,
    loadedBytes: 0,
    totalBytes: upload.size,
    speedBytesPerSecond: 0,
    error: null,
    videoId: null,
  };
}

function uploadFileToR2(options: {
  file: File;
  uploadUrl: string;
  contentType: string;
  onProgress(progress: UploadProgress): void;
}) {
  return new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const startedAt = Date.now();

    xhr.open("PUT", options.uploadUrl);
    xhr.setRequestHeader("Content-Type", options.contentType);

    xhr.upload.onprogress = (event) => {
      const totalBytes = event.lengthComputable ? event.total : options.file.size;
      const loadedBytes = event.loaded;
      const elapsedSeconds = Math.max(0.001, (Date.now() - startedAt) / 1000);

      options.onProgress({
        loadedBytes,
        totalBytes,
        progress: totalBytes > 0 ? clampProgress((loadedBytes / totalBytes) * 100) : 0,
        speedBytesPerSecond: loadedBytes / elapsedSeconds,
      });
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        options.onProgress({
          loadedBytes: options.file.size,
          totalBytes: options.file.size,
          progress: 100,
          speedBytesPerSecond:
            options.file.size /
            Math.max(0.001, (Date.now() - startedAt) / 1000),
        });
        resolve();
        return;
      }

      reject(new Error(`R2 upload failed with HTTP ${xhr.status}`));
    };

    xhr.onerror = () => {
      reject(new Error("R2 upload failed because of a network error"));
    };
    xhr.onabort = () => {
      reject(new Error("R2 upload was canceled by the browser"));
    };
    xhr.ontimeout = () => {
      reject(new Error("R2 upload timed out"));
    };

    xhr.send(options.file);
  });
}

function getUploadProgress(uploadItems: UploadItem[]) {
  if (uploadItems.length === 0) {
    return 0;
  }

  const totalProgress = uploadItems.reduce(
    (total, item) => total + item.progress,
    0
  );

  return clampProgress(totalProgress / uploadItems.length);
}

function getProcessingInput(
  phase: UploadPhase,
  uploadItems: UploadItem[],
  message: string
): ProcessingDisplayInput {
  const uploadProgress = getUploadProgress(uploadItems);

  switch (phase) {
    case "creating":
      return {
        status: "processing",
        currentStage: "creating_upload",
        progress: 2,
      };
    case "uploading":
      return {
        status: "processing",
        currentStage: "uploading",
        progress: uploadProgress,
      };
    case "marking_failed":
      return {
        status: "processing",
        currentStage: "marking_failed",
        progress: uploadProgress,
      };
    case "queueing":
      return {
        status: "processing",
        currentStage: "queueing",
        progress: 94,
      };
    case "redirecting":
      return {
        status: "processing",
        currentStage: "redirecting",
        progress: 100,
      };
    case "error":
      return {
        status: "failed",
        currentStage: "failed",
        progress: uploadProgress,
        errorMessage: message,
      };
    case "idle":
      return uploadItems.length > 0
        ? {
            status: "created",
            currentStage: "selected",
            progress: 0,
          }
        : {
            status: "created",
            currentStage: "created",
            progress: 0,
          };
  }
}

function isBusyPhase(phase: UploadPhase) {
  return (
    phase === "creating" ||
    phase === "uploading" ||
    phase === "marking_failed" ||
    phase === "queueing" ||
    phase === "redirecting"
  );
}

function getSubmitLabel(phase: UploadPhase) {
  switch (phase) {
    case "creating":
      return "Preparing";
    case "uploading":
      return "Uploading";
    case "marking_failed":
      return "Saving errors";
    case "queueing":
      return "Starting";
    case "redirecting":
      return "Opening status";
    default:
      return "Send";
  }
}

export default function Home() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const previewUrlRef = useRef("");
  const [prompt, setPrompt] = useState("");
  const [targetLanguage, setTargetLanguage] = useState<string>(
    DEFAULT_TARGET_LANGUAGE
  );
  const [uploadItems, setUploadItems] = useState<UploadItem[]>([]);
  const [rejectedItems, setRejectedItems] = useState<RejectedUploadItem[]>([]);
  const [previewUrl, setPreviewUrl] = useState("");
  const [phase, setPhase] = useState<UploadPhase>("idle");
  const [message, setMessage] = useState("Choose videos to start a batch.");
  const isBusy = isBusyPhase(phase);
  const canSubmit = uploadItems.length > 0 && !isBusy;
  const processingInput = getProcessingInput(phase, uploadItems, message);
  const totalSize = useMemo(
    () => uploadItems.reduce((total, item) => total + item.size, 0),
    [uploadItems]
  );

  useEffect(() => {
    return () => {
      if (previewUrlRef.current) {
        URL.revokeObjectURL(previewUrlRef.current);
      }
    };
  }, []);

  function updateUploadItem(id: string, values: Partial<UploadItem>) {
    setUploadItems((items) =>
      items.map((item) => (item.id === id ? { ...item, ...values } : item))
    );
  }

  function chooseVideos(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    const prepared = prepareClientUploadFiles(files);
    const nextUploadItems = prepared.accepted.map(buildUploadItem);
    const nextRejectedItems = prepared.rejected.map((item, index) => ({
      id: `rejected-${item.filename}-${index}`,
      filename: item.filename,
      error: item.error,
    }));
    const previewFile = nextUploadItems[0]?.file ?? null;

    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current);
    }

    const nextPreviewUrl = previewFile ? URL.createObjectURL(previewFile) : "";
    previewUrlRef.current = nextPreviewUrl;

    setUploadItems(nextUploadItems);
    setRejectedItems(nextRejectedItems);
    setPreviewUrl(nextPreviewUrl);
    setPhase("idle");
    setMessage(
      nextUploadItems.length > 0
        ? `${nextUploadItems.length} video${
            nextUploadItems.length === 1 ? "" : "s"
          } ready.`
        : "Choose videos to start a batch."
    );
    event.target.value = "";
  }

  async function markUploadFailed(videoId: string, error: string) {
    const response = await fetch(`/api/videos/${videoId}/upload-failed`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ error }),
    });

    if (!response.ok) {
      throw new Error(
        await readErrorMessage(response, "Failed to mark upload failed")
      );
    }
  }

  async function sendPrompt(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!canSubmit) {
      return;
    }

    const uploadsForSubmit = uploadItems;

    setPhase("creating");
    setMessage("Creating secure upload links...");
    setRejectedItems([]);

    try {
      const session = await postJson<CreateUploadSessionResponse>(
        "/api/video-batches/create-upload",
        {
          targetLanguage,
          prompt,
          videos: uploadsForSubmit.map((item) => ({
            filename: item.filename,
            contentType: item.contentType,
            size: item.size,
          })),
        },
        "Failed to create upload URLs"
      );

      if (session.videos.length !== uploadsForSubmit.length) {
        throw new Error("Upload session returned the wrong number of videos");
      }

      setPhase("uploading");
      setMessage("Uploading videos to storage...");

      const uploadResults = await Promise.all(
        session.videos.map(async (sessionVideo, index) => {
          const item = uploadsForSubmit[index];

          updateUploadItem(item.id, {
            status: "uploading",
            videoId: sessionVideo.videoId,
            error: null,
          });

          try {
            await uploadFileToR2({
              file: item.file,
              uploadUrl: sessionVideo.uploadUrl,
              contentType: item.contentType,
              onProgress(progress) {
                updateUploadItem(item.id, {
                  ...progress,
                  status: "uploading",
                });
              },
            });

            updateUploadItem(item.id, {
              status: "uploaded",
              progress: 100,
              loadedBytes: item.size,
              totalBytes: item.size,
              videoId: sessionVideo.videoId,
              error: null,
            });

            return {
              status: "uploaded" as const,
              itemId: item.id,
              videoId: sessionVideo.videoId,
            };
          } catch (error) {
            const errorMessage =
              error instanceof Error ? error.message : "Upload failed";

            updateUploadItem(item.id, {
              status: "failed",
              videoId: sessionVideo.videoId,
              error: errorMessage,
            });

            return {
              status: "failed" as const,
              itemId: item.id,
              videoId: sessionVideo.videoId,
              error: errorMessage,
            };
          }
        })
      );
      const failedUploads = uploadResults.filter(
        (result) => result.status === "failed"
      );

      if (failedUploads.length > 0) {
        setPhase("marking_failed");
        setMessage("Recording failed uploads...");

        await Promise.all(
          failedUploads.map(async (failure) => {
            try {
              await markUploadFailed(failure.videoId, failure.error);
            } catch (error) {
              const markerError =
                error instanceof Error ? error.message : "Failed to save error";

              updateUploadItem(failure.itemId, {
                error: `${failure.error} (${markerError})`,
              });
            }
          })
        );
      }

      setPhase("queueing");
      setMessage("Starting AI processing...");

      const completeResult = await postJson<CompleteUploadSessionResponse>(
        `/api/video-batches/${session.batchId}/complete-upload`,
        { prompt },
        "Failed to queue upload session"
      );

      setPhase("redirecting");
      setMessage(
        `Queued ${completeResult.queuedCount}/${completeResult.totalVideos} videos.`
      );
      router.push(`/video-batches/${encodeURIComponent(session.batchId)}`);
    } catch (error) {
      setPhase("error");
      setMessage(error instanceof Error ? error.message : "Upload failed");
    }
  }

  return (
    <main className="min-h-screen bg-white text-black lg:h-screen lg:overflow-hidden">
      <div className="grid min-h-screen grid-cols-1 lg:h-screen lg:grid-cols-[minmax(0,1fr)_380px]">
        <section className="flex min-h-screen flex-col border-black/10 lg:h-screen lg:min-h-0 lg:border-r">
          <header className="flex h-14 shrink-0 items-center justify-between border-b border-black/10 px-4 sm:px-6">
            <div className="flex items-center gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-md border border-black bg-black text-sm font-semibold text-white">
                B
              </div>
              <p className="text-sm font-semibold tracking-tight">Blooclip</p>
            </div>
            <p className="text-xs font-medium text-black/45">
              Batch upload connected
            </p>
          </header>

          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-5 sm:px-6 sm:py-8">
            <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
              <ProcessingBoard
                label="Upload and AI pipeline"
                status={processingInput.status}
                currentStage={processingInput.currentStage}
                progress={processingInput.progress}
                errorMessage={processingInput.errorMessage}
              />

              <section className="rounded-md border border-black/10 bg-white p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h2 className="text-base font-semibold">Batch videos</h2>
                    <p className="mt-1 text-sm text-black/55">{message}</p>
                  </div>
                  <span className="rounded border border-black/10 px-2 py-1 text-xs font-medium text-black/55">
                    {uploadItems.length}/10
                  </span>
                </div>

                <div className="mt-4 grid gap-3">
                  {uploadItems.map((item, index) => (
                    <div
                      key={item.id}
                      className="rounded-md border border-black/10 p-3"
                    >
                      <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">
                            {index + 1}. {item.filename}
                          </p>
                          <p className="mt-1 text-xs text-black/50">
                            {formatFileSize(item.size)} · {item.contentType}
                          </p>
                        </div>
                        <span className="rounded border border-black/10 px-2 py-1 text-xs font-medium text-black/55">
                          {item.status}
                        </span>
                      </div>

                      <div className="mt-3 h-2 overflow-hidden rounded-full bg-black/10">
                        <div
                          className={
                            item.status === "failed"
                              ? "h-full rounded-full bg-red-600 transition-all"
                              : "h-full rounded-full bg-black transition-all"
                          }
                          style={{ width: `${item.progress}%` }}
                        />
                      </div>

                      <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-black/50">
                        <span>
                          {formatFileSize(item.loadedBytes)} /{" "}
                          {formatFileSize(item.totalBytes)}
                        </span>
                        <span>{formatUploadSpeed(item.speedBytesPerSecond)}</span>
                      </div>

                      {item.error && (
                        <p className="mt-2 text-sm text-red-700">
                          {item.error}
                        </p>
                      )}
                    </div>
                  ))}

                  {rejectedItems.map((item) => (
                    <div
                      key={item.id}
                      className="rounded-md border border-red-200 bg-red-50 p-3"
                    >
                      <p className="truncate text-sm font-medium text-red-950">
                        {item.filename}
                      </p>
                      <p className="mt-1 text-sm text-red-800">{item.error}</p>
                    </div>
                  ))}

                  {uploadItems.length === 0 && rejectedItems.length === 0 && (
                    <div className="rounded-md border border-dashed border-black/15 p-4 text-sm text-black/50">
                      No videos selected.
                    </div>
                  )}
                </div>
              </section>
            </div>
          </div>

          <form
            onSubmit={sendPrompt}
            className="shrink-0 border-t border-black/10 bg-white px-4 py-3 sm:px-6"
          >
            <div className="mx-auto flex w-full max-w-3xl flex-col gap-3 rounded-md border border-black/15 bg-white p-3 shadow-lg shadow-black/[0.05]">
              <label htmlFor="prompt" className="sr-only">
                Prompt
              </label>
              <textarea
                id="prompt"
                value={prompt}
                onChange={(event) => setPrompt(event.target.value)}
                rows={2}
                disabled={isBusy}
                placeholder="Tell Blooclip what you want this video batch to become..."
                className="max-h-40 min-h-12 w-full resize-none border-0 bg-transparent text-sm leading-6 text-black outline-none placeholder:text-black/35 disabled:text-black/45"
              />

              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex min-w-0 flex-wrap items-center gap-2">
                  <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    accept={UPLOAD_ACCEPT_ATTRIBUTE}
                    onChange={chooseVideos}
                    disabled={isBusy}
                    className="hidden"
                  />
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isBusy}
                    className="h-9 rounded-md border border-black px-3 text-sm font-medium text-black transition hover:bg-black hover:text-white disabled:cursor-not-allowed disabled:border-black/15 disabled:text-black/35"
                  >
                    Choose videos
                  </button>

                  <label htmlFor="target-language" className="sr-only">
                    Target language
                  </label>
                  <select
                    id="target-language"
                    value={targetLanguage}
                    onChange={(event) => setTargetLanguage(event.target.value)}
                    disabled={isBusy}
                    className="h-9 rounded-md border border-black/15 bg-white px-2 text-sm font-medium text-black disabled:text-black/35"
                  >
                    {TARGET_LANGUAGE_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>

                  {uploadItems.length > 0 && (
                    <p className="text-sm text-black/55">
                      {uploadItems.length} selected · {formatFileSize(totalSize)}
                    </p>
                  )}
                </div>

                <button
                  type="submit"
                  disabled={!canSubmit}
                  className="h-9 rounded-md bg-black px-4 text-sm font-semibold text-white transition hover:bg-black/80 disabled:cursor-not-allowed disabled:bg-black/25"
                >
                  {getSubmitLabel(phase)}
                </button>
              </div>
            </div>
          </form>
        </section>

        <aside className="flex min-h-[520px] flex-col border-t border-black/10 bg-white p-4 sm:p-6 lg:h-screen lg:min-h-0 lg:border-t-0">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold">Video preview</h2>
              <p className="mt-1 text-xs leading-5 text-black/50">
                First selected video.
              </p>
            </div>
            <span className="rounded border border-black/10 px-2 py-1 text-xs font-medium text-black/50">
              Local
            </span>
          </div>

          <div className="mt-5 overflow-hidden rounded-md border border-black/10 bg-black">
            {previewUrl ? (
              <video
                key={previewUrl}
                src={previewUrl}
                controls
                className="aspect-video w-full bg-black"
              />
            ) : (
              <div className="flex aspect-video w-full items-center justify-center bg-black text-sm text-white/55">
                No video selected
              </div>
            )}
          </div>

          <div className="mt-4 rounded-md border border-black/10 p-3">
            <p className="text-sm font-medium">
              {uploadItems[0]?.filename ?? "No file yet"}
            </p>
            <p className="mt-1 text-sm text-black/50">
              {uploadItems.length > 0
                ? `${uploadItems.length} video${
                    uploadItems.length === 1 ? "" : "s"
                  } · ${formatFileSize(totalSize)}`
                : "Choose videos from the composer."}
            </p>
          </div>

          <div className="mt-auto pt-5">
            <button
              type="button"
              disabled
              className="w-full rounded-md border border-black/15 bg-black/5 px-3 py-2.5 text-sm font-medium text-black/35"
            >
              Downloads appear after processing
            </button>
          </div>
        </aside>
      </div>
    </main>
  );
}
