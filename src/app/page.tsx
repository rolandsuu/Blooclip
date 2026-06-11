"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import {
  DEFAULT_TARGET_LANGUAGE,
  TARGET_LANGUAGE_OPTIONS,
} from "@/lib/languages";

const DEFAULT_UPLOAD_PROMPT =
  "Create a key-event video with voiceover and subtitles";
const MAX_BATCH_UPLOAD_FILES = 20;
const UPLOAD_CONCURRENCY = 3;

type UploadItemStatus =
  | "pending"
  | "uploading"
  | "queueing"
  | "queued"
  | "failed";

type UploadItem = {
  id: string;
  file: File;
  prompt: string;
  status: UploadItemStatus;
  message: string;
  videoId: string | null;
};

type BatchUploadVideo = {
  videoId: string;
  uploadUrl: string;
  filename: string;
  batchPosition: number;
};

type CreateBatchUploadResponse = {
  batchId: string;
  videos: BatchUploadVideo[];
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

function isBatchUploadVideo(data: unknown): data is BatchUploadVideo {
  if (typeof data !== "object" || data === null) {
    return false;
  }

  return (
    "videoId" in data &&
    "uploadUrl" in data &&
    "filename" in data &&
    "batchPosition" in data &&
    typeof data.videoId === "string" &&
    typeof data.uploadUrl === "string" &&
    typeof data.filename === "string" &&
    typeof data.batchPosition === "number"
  );
}

function isCreateBatchUploadResponse(
  data: unknown
): data is CreateBatchUploadResponse {
  if (typeof data !== "object" || data === null) {
    return false;
  }

  return (
    "batchId" in data &&
    "videos" in data &&
    typeof data.batchId === "string" &&
    Array.isArray(data.videos) &&
    data.videos.every(isBatchUploadVideo)
  );
}

function createUploadItem(file: File): UploadItem {
  return {
    id:
      typeof crypto.randomUUID === "function"
        ? crypto.randomUUID()
        : `${file.name}-${file.size}-${Date.now()}-${Math.random()}`,
    file,
    prompt: DEFAULT_UPLOAD_PROMPT,
    status: "pending",
    message: "Ready",
    videoId: null,
  };
}

function getFilenameTitle(filename: string) {
  const lastDotIndex = filename.lastIndexOf(".");

  if (lastDotIndex <= 0) {
    return filename;
  }

  return filename.slice(0, lastDotIndex);
}

function getDefaultBatchTitle(files: File[]) {
  if (files.length === 1) {
    return getFilenameTitle(files[0].name);
  }

  if (files.length > 1) {
    return `Bulk upload - ${files.length} videos`;
  }

  return "New video batch";
}

function formatBytes(bytes: number) {
  if (bytes < 1024) {
    return `${bytes} B`;
  }

  const units = ["KB", "MB", "GB"];
  let value = bytes / 1024;
  let unitIndex = 0;

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }

  return `${value.toFixed(value >= 10 ? 0 : 1)} ${units[unitIndex]}`;
}

export default function Home() {
  const router = useRouter();
  const [items, setItems] = useState<UploadItem[]>([]);
  const [batchTitle, setBatchTitle] = useState("New video batch");
  const [titleTouched, setTitleTouched] = useState(false);
  const [targetLanguage, setTargetLanguage] = useState<string>(
    DEFAULT_TARGET_LANGUAGE
  );
  const [status, setStatus] = useState("Choose one or more videos");
  const [isUploading, setIsUploading] = useState(false);

  function updateItem(id: string, patch: Partial<UploadItem>) {
    setItems((currentItems) =>
      currentItems.map((item) =>
        item.id === id ? { ...item, ...patch } : item
      )
    );
  }

  function handleFilesSelected(fileList: FileList | null) {
    if (isUploading) return;

    const selectedFiles = Array.from(fileList ?? []);
    const limitedFiles = selectedFiles.slice(0, MAX_BATCH_UPLOAD_FILES);
    const nextItems = limitedFiles.map(createUploadItem);

    setItems(nextItems);

    if (!titleTouched) {
      setBatchTitle(getDefaultBatchTitle(limitedFiles));
    }

    if (selectedFiles.length > MAX_BATCH_UPLOAD_FILES) {
      setStatus(`Only the first ${MAX_BATCH_UPLOAD_FILES} videos were added.`);
    } else if (selectedFiles.length > 0) {
      setStatus(`${selectedFiles.length} video file(s) ready.`);
    } else {
      setStatus("Choose one or more videos");
    }
  }

  function updatePrompt(id: string, prompt: string) {
    updateItem(id, { prompt });
  }

  function removeItem(id: string) {
    if (isUploading) return;

    setItems((currentItems) => {
      const nextItems = currentItems.filter((item) => item.id !== id);

      if (!titleTouched) {
        setBatchTitle(getDefaultBatchTitle(nextItems.map((item) => item.file)));
      }

      return nextItems;
    });
  }

  async function markUploadFailed(videoId: string, message: string) {
    await fetch(`/api/videos/${videoId}/upload-failed`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ error: message }),
    }).catch(() => undefined);
  }

  async function uploadItem(
    item: UploadItem,
    upload: BatchUploadVideo
  ) {
    updateItem(item.id, {
      status: "uploading",
      message: "Uploading to R2...",
      videoId: upload.videoId,
    });

    let shouldMarkUploadFailed = false;

    try {
      const r2Response = await fetch(upload.uploadUrl, {
        method: "PUT",
        headers: {
          "Content-Type": item.file.type,
        },
        body: item.file,
      });

      if (!r2Response.ok) {
        shouldMarkUploadFailed = true;
        throw new Error(`R2 upload failed with HTTP ${r2Response.status}`);
      }

      updateItem(item.id, {
        status: "queueing",
        message: "Confirming upload and queueing worker...",
      });

      const completeResponse = await fetch(
        `/api/videos/${upload.videoId}/complete-upload`,
        {
          method: "POST",
        }
      );

      if (!completeResponse.ok) {
        shouldMarkUploadFailed = true;
        throw new Error(
          await readErrorMessage(completeResponse, "Failed to confirm upload")
        );
      }

      updateItem(item.id, {
        status: "queued",
        message: "Worker queued",
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Upload failed";

      if (shouldMarkUploadFailed) {
        await markUploadFailed(upload.videoId, message);
      }

      updateItem(item.id, {
        status: "failed",
        message,
      });
    }
  }

  async function runUploads(
    uploadItems: UploadItem[],
    uploadVideos: BatchUploadVideo[]
  ) {
    let nextIndex = 0;
    const workers = Array.from({
      length: Math.min(UPLOAD_CONCURRENCY, uploadItems.length),
    }).map(async () => {
      while (nextIndex < uploadItems.length) {
        const itemIndex = nextIndex;
        nextIndex += 1;

        const upload = uploadVideos.find(
          (video) => video.batchPosition === itemIndex
        );

        if (!upload) {
          updateItem(uploadItems[itemIndex].id, {
            status: "failed",
            message: "Upload API response did not include this file",
          });
          continue;
        }

        await uploadItem(uploadItems[itemIndex], upload);
      }
    });

    await Promise.all(workers);
  }

  async function uploadBatch() {
    if (items.length === 0 || isUploading) return;

    setIsUploading(true);

    try {
      setStatus("Creating batch upload URLs...");
      setItems((currentItems) =>
        currentItems.map((item) => ({
          ...item,
          status: "pending",
          message: "Creating upload URL...",
          videoId: null,
        }))
      );

      const uploadItems = items;
      const createResponse = await fetch("/api/video-batches/create-upload", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          title:
            batchTitle.trim() ||
            getDefaultBatchTitle(items.map((item) => item.file)),
          targetLanguage,
          videos: uploadItems.map((item) => ({
            filename: item.file.name,
            contentType: item.file.type,
            size: item.file.size,
            prompt: item.prompt.trim() || DEFAULT_UPLOAD_PROMPT,
          })),
        }),
      });

      if (!createResponse.ok) {
        setStatus(
          await readErrorMessage(createResponse, "Failed to create upload")
        );
        return;
      }

      const batchData = (await createResponse.json()) as unknown;

      if (!isCreateBatchUploadResponse(batchData)) {
        setStatus("Upload API response was invalid");
        return;
      }

      setStatus(`Uploading ${uploadItems.length} video file(s)...`);
      await runUploads(uploadItems, batchData.videos);
      setStatus("Upload finished. Opening batch status...");
      router.push(`/video-batches/${batchData.batchId}`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Upload failed");
    } finally {
      setIsUploading(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-4xl flex-col gap-6 p-6 py-10">
      <div className="space-y-2">
        <p className="text-sm text-gray-500">Blooclip</p>
        <h1 className="text-2xl font-semibold">Bulk Upload</h1>
      </div>

      <input
        type="file"
        accept="video/mp4,video/webm,video/quicktime"
        multiple
        disabled={isUploading}
        onChange={(event) => handleFilesSelected(event.target.files)}
      />

      <label className="flex flex-col gap-2 text-sm">
        <span className="font-medium">Batch title</span>
        <input
          value={batchTitle}
          onChange={(event) => {
            setBatchTitle(event.target.value);
            setTitleTouched(true);
          }}
          disabled={isUploading}
          className="rounded border border-gray-300 px-3 py-2 text-base"
        />
      </label>

      <label className="flex flex-col gap-2 text-sm">
        <span className="font-medium">Target language</span>
        <select
          value={targetLanguage}
          onChange={(event) => setTargetLanguage(event.target.value)}
          disabled={isUploading}
          className="rounded border border-gray-300 bg-white px-3 py-2 text-base text-black"
        >
          {TARGET_LANGUAGE_OPTIONS.map((language) => (
            <option key={language.value} value={language.value}>
              {language.label}
            </option>
          ))}
        </select>
      </label>

      {items.length > 0 && (
        <section className="space-y-3">
          <div className="flex items-center justify-between gap-4">
            <h2 className="text-base font-semibold">
              Videos ({items.length}/{MAX_BATCH_UPLOAD_FILES})
            </h2>
            <span className="text-sm text-gray-500">
              One language, one prompt per video
            </span>
          </div>

          <div className="space-y-3">
            {items.map((item, index) => (
              <div
                key={item.id}
                className="grid gap-3 rounded border border-gray-200 p-4"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-medium">
                      {index + 1}. {item.file.name}
                    </p>
                    <p className="text-sm text-gray-500">
                      {formatBytes(item.file.size)} -{" "}
                      {item.file.type || "unknown type"}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => removeItem(item.id)}
                    disabled={isUploading}
                    className="rounded border border-gray-300 px-3 py-1 text-sm disabled:opacity-40"
                  >
                    Remove
                  </button>
                </div>

                <label className="grid gap-2 text-sm">
                  <span className="font-medium">Prompt for this video</span>
                  <textarea
                    value={item.prompt}
                    onChange={(event) =>
                      updatePrompt(item.id, event.target.value)
                    }
                    rows={3}
                    disabled={isUploading}
                    className="resize-y rounded border border-gray-300 px-3 py-2 text-base"
                  />
                </label>

                <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
                  <span className="font-mono">{item.status}</span>
                  <span className="text-gray-600">{item.message}</span>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      <button
        onClick={uploadBatch}
        disabled={items.length === 0 || isUploading}
        className="rounded bg-black px-4 py-2 text-white disabled:opacity-40"
      >
        {isUploading ? "Uploading..." : "Upload Batch"}
      </button>

      <p className="text-sm text-gray-600">{status}</p>
    </main>
  );
}
