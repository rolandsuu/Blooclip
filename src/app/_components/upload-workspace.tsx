"use client";

import { useMemo, useState } from "react";
import type { ChangeEvent, DragEvent, FormEvent } from "react";
import { useRouter } from "next/navigation";

import {
  DEFAULT_TARGET_LANGUAGE,
  TARGET_LANGUAGE_OPTIONS,
} from "@/lib/languages";
import {
  prepareClientUploadFiles,
  type PreparedClientUploadFile,
} from "@/lib/client-upload";

type RejectedUploadItem = {
  id: string;
  filename: string;
  error: string;
};

type UploadSelection = PreparedClientUploadFile<File> & {
  id: string;
};

type UploadPhase = "creating" | "uploading" | "uploaded" | "queueing" | "failed";

type UploadProgressItem = {
  id: string;
  videoId: string | null;
  filename: string;
  contentType: string;
  size: number;
  phase: UploadPhase;
  progress: number;
  message: string;
};

type UploadSessionVideo = {
  videoId: string;
  uploadUrl: string;
  filename: string;
  batchPosition: number | null;
};

type UploadSessionResponse = {
  batchId: string;
  statusUrl: string;
  totalVideos: number;
  videos: UploadSessionVideo[];
};

type UploadResult = {
  ok: boolean;
  selectionId: string;
};

const UPLOAD_ACCEPT_ATTRIBUTE =
  "video/mp4,video/webm,video/quicktime,.mp4,.webm,.mov";

const R2_UPLOAD_TIMEOUT_MS = 30 * 60 * 1000;

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

function formatFileSize(bytes: number) {
  if (bytes < 1024 * 1024) {
    return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  }

  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function getUploadItemId(file: File, index: number) {
  return `${file.name}-${file.size}-${file.lastModified}-${index}`;
}

function getErrorMessage(error: unknown, fallback = "Upload failed") {
  return error instanceof Error ? error.message : fallback;
}

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

function parseUploadSessionResponse(value: unknown): UploadSessionResponse {
  if (typeof value !== "object" || value === null) {
    throw new Error("Create upload response was invalid");
  }

  const data = value as {
    batchId?: unknown;
    statusUrl?: unknown;
    totalVideos?: unknown;
    videos?: unknown;
  };

  if (
    typeof data.batchId !== "string" ||
    typeof data.statusUrl !== "string" ||
    typeof data.totalVideos !== "number" ||
    !Array.isArray(data.videos)
  ) {
    throw new Error("Create upload response was invalid");
  }

  const videos = data.videos.map((video) => {
    if (typeof video !== "object" || video === null) {
      throw new Error("Create upload response included an invalid video");
    }

    const upload = video as {
      videoId?: unknown;
      uploadUrl?: unknown;
      filename?: unknown;
      batchPosition?: unknown;
    };

    if (
      typeof upload.videoId !== "string" ||
      typeof upload.uploadUrl !== "string" ||
      typeof upload.filename !== "string" ||
      !(
        typeof upload.batchPosition === "number" ||
        upload.batchPosition === null
      )
    ) {
      throw new Error("Create upload response included an invalid video");
    }

    return {
      videoId: upload.videoId,
      uploadUrl: upload.uploadUrl,
      filename: upload.filename,
      batchPosition: upload.batchPosition,
    };
  });

  return {
    batchId: data.batchId,
    statusUrl: data.statusUrl,
    totalVideos: data.totalVideos,
    videos,
  };
}

function getSafeStatusUrl(session: UploadSessionResponse) {
  const expectedStatusUrl = `/video-batches/${session.batchId}`;

  if (session.statusUrl === expectedStatusUrl) {
    return session.statusUrl;
  }

  return `/video-batches/${encodeURIComponent(session.batchId)}`;
}

async function createUploadSession(
  selectedUploads: UploadSelection[],
  prompt: string,
  targetLanguage: string
) {
  const response = await fetch("/api/video-batches/create-upload", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      targetLanguage,
      prompt,
      videos: selectedUploads.map((selection) => ({
        filename: selection.filename,
        contentType: selection.contentType,
        size: selection.size,
      })),
    }),
  });

  if (!response.ok) {
    throw new Error(
      await readErrorMessage(response, "Failed to create upload session")
    );
  }

  const session = parseUploadSessionResponse(await response.json());

  if (session.videos.length !== selectedUploads.length) {
    throw new Error("Create upload response did not match selected videos");
  }

  return session;
}

function uploadFileToR2({
  uploadUrl,
  file,
  contentType,
  onProgress,
}: {
  uploadUrl: string;
  file: File;
  contentType: string;
  onProgress(progress: number): void;
}) {
  return new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();

    xhr.open("PUT", uploadUrl);
    xhr.timeout = R2_UPLOAD_TIMEOUT_MS;
    xhr.setRequestHeader("Content-Type", contentType);

    xhr.upload.onprogress = (event) => {
      if (!event.lengthComputable || event.total <= 0) {
        onProgress(1);
        return;
      }

      onProgress(
        Math.max(1, Math.min(99, Math.round((event.loaded / event.total) * 100)))
      );
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        onProgress(100);
        resolve();
        return;
      }

      reject(
        new Error(
          xhr.statusText
            ? `R2 upload failed with status ${xhr.status}: ${xhr.statusText}`
            : `R2 upload failed with status ${xhr.status}`
        )
      );
    };

    xhr.onerror = () => {
      reject(new Error("Network error while uploading to R2"));
    };

    xhr.ontimeout = () => {
      reject(
        new Error(
          "Upload to R2 timed out. Try a smaller file or a faster connection."
        )
      );
    };

    xhr.onabort = () => {
      reject(new Error("Upload to R2 was canceled"));
    };

    xhr.send(file);
  });
}

async function markUploadFailed(videoId: string, error: string) {
  const response = await fetch(
    `/api/videos/${encodeURIComponent(videoId)}/upload-failed`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ error }),
    }
  );

  if (!response.ok) {
    throw new Error(
      await readErrorMessage(response, "Failed to mark upload failed")
    );
  }
}

async function completeBatchUpload(batchId: string, prompt: string) {
  const response = await fetch(
    `/api/video-batches/${encodeURIComponent(batchId)}/complete-upload`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ prompt }),
    }
  );

  if (!response.ok) {
    throw new Error(
      await readErrorMessage(response, "Failed to start AI processing")
    );
  }
}

function getPhaseLabel(phase: UploadPhase) {
  switch (phase) {
    case "creating":
      return "Creating";
    case "uploading":
      return "Uploading";
    case "uploaded":
      return "Uploaded";
    case "queueing":
      return "Queueing";
    case "failed":
      return "Failed";
  }
}

function getPhaseClasses(phase: UploadPhase) {
  switch (phase) {
    case "creating":
      return {
        dot: "bg-[#ff9f0a]",
        text: "text-[#b76a00]",
        bar: "bg-[#ff9f0a]",
      };
    case "uploading":
      return {
        dot: "processing-dot-pulse bg-[#155dfc]",
        text: "text-[#155dfc]",
        bar: "bg-[#155dfc]",
      };
    case "uploaded":
    case "queueing":
      return {
        dot: "bg-[#20a03f]",
        text: "text-[#198a35]",
        bar: "bg-[#20a03f]",
      };
    case "failed":
      return {
        dot: "bg-[#e92b2b]",
        text: "text-[#c81818]",
        bar: "bg-[#e92b2b]",
      };
  }
}

function getSubmitLabel(uploadItems: UploadProgressItem[]) {
  if (uploadItems.some((item) => item.phase === "creating")) {
    return "Creating upload...";
  }

  if (uploadItems.some((item) => item.phase === "uploading")) {
    return "Uploading...";
  }

  if (uploadItems.some((item) => item.phase === "queueing")) {
    return "Starting AI processing...";
  }

  return "Working...";
}

function GlobeIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.8"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18" />
      <path d="M12 3c2.3 2.6 3.5 5.6 3.5 9S14.3 18.4 12 21" />
      <path d="M12 3c-2.3 2.6-3.5 5.6-3.5 9s1.2 6.4 3.5 9" />
    </svg>
  );
}

function ChevronDownIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2"
      aria-hidden="true"
    >
      <path d="m5 8 5 5 5-5" />
    </svg>
  );
}

function PlayIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M8 5.4v13.2L18.5 12z" />
    </svg>
  );
}

function HelpIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.8"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="9" />
      <path d="M9.8 9a2.4 2.4 0 0 1 4.5 1.2c0 1.8-2.3 2-2.3 3.8" />
      <path d="M12 17h.01" />
    </svg>
  );
}

function UserIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.8"
      aria-hidden="true"
    >
      <circle cx="12" cy="8" r="3.2" />
      <path d="M5.5 20a6.7 6.7 0 0 1 13 0" />
    </svg>
  );
}

function LogoMark() {
  return (
    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[#ee2b2f] text-xl font-black text-white shadow-sm shadow-red-600/20">
      B
    </div>
  );
}

function RejectedFiles({ rejectedItems }: { rejectedItems: RejectedUploadItem[] }) {
  if (rejectedItems.length === 0) {
    return null;
  }

  return (
    <div className="grid gap-2" aria-live="polite">
      {rejectedItems.map((item) => (
        <div
          key={item.id}
          className="rounded-lg border border-red-200 bg-red-50 px-4 py-3"
        >
          <p className="truncate text-sm font-semibold text-red-950">
            {item.filename}
          </p>
          <p className="mt-1 text-sm text-red-800">{item.error}</p>
        </div>
      ))}
    </div>
  );
}

function FileThumb() {
  return (
    <div className="relative h-[58px] w-[70px] shrink-0 overflow-hidden rounded-lg bg-[#eef1f6]">
      <div className="absolute inset-0 flex items-center justify-center">
        <PlayIcon className="h-7 w-7 text-[#11131a]" />
      </div>
    </div>
  );
}

function SelectedFiles({ selections }: { selections: UploadSelection[] }) {
  if (selections.length === 0) {
    return null;
  }

  return (
    <div className="rounded-lg border border-[#cfd5df] bg-white px-4 py-3 text-left">
      <p className="text-sm font-semibold text-[#11131a]">
        {selections.length} video{selections.length === 1 ? "" : "s"} selected
      </p>
      <div className="mt-3 grid gap-2">
        {selections.map((selection) => (
          <div
            key={selection.id}
            className="grid grid-cols-[56px_minmax(0,1fr)] items-center gap-3"
          >
            <div className="flex aspect-video w-14 items-center justify-center rounded-md bg-[#eef1f6] text-[#11131a]">
              <PlayIcon className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-[#11131a]">
                {selection.filename}
              </p>
              <p className="text-xs text-[#6f7785]">
                {formatFileSize(selection.size)} · {selection.contentType}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function UploadProgressList({ items }: { items: UploadProgressItem[] }) {
  if (items.length === 0) {
    return null;
  }

  return (
    <section
      id="upload-progress"
      className="border-t border-[#d5dbe5] bg-white px-4 py-5 sm:px-8"
    >
      <div className="mx-auto max-w-[1100px]">
        <h2 className="text-2xl font-bold tracking-tight text-[#11131a]">
          Upload progress
        </h2>

        <div className="mt-3 overflow-hidden rounded-lg border border-[#cfd6e1] bg-white">
          <div className="hidden grid-cols-[minmax(0,1fr)_180px_210px] gap-5 border-b border-[#dce1ea] bg-[#fbfcfe] px-4 py-3 text-sm font-semibold text-[#586273] md:grid">
            <span>Video</span>
            <span>Status</span>
            <span>Progress</span>
          </div>

          <ul aria-live="polite">
            {items.map((item) => {
              const tone = getPhaseClasses(item.phase);
              const progress = Math.max(0, Math.min(100, item.progress));

              return (
                <li
                  key={item.id}
                  className="grid gap-4 border-t border-[#dce1ea] px-4 py-4 first:border-t-0 md:grid-cols-[minmax(0,1fr)_180px_210px] md:items-center md:gap-5"
                >
                  <div className="grid min-w-0 grid-cols-[70px_minmax(0,1fr)] items-center gap-4">
                    <FileThumb />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-bold text-[#11131a]">
                        {item.filename}
                      </p>
                      <p className="mt-1 text-sm text-[#6f7785]">
                        {formatFileSize(item.size)} · {item.contentType}
                      </p>
                    </div>
                  </div>

                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className={cx("h-2.5 w-2.5 rounded-full", tone.dot)} />
                      <span className={cx("text-sm font-semibold", tone.text)}>
                        {getPhaseLabel(item.phase)}
                      </span>
                    </div>
                    <p className="mt-1 text-sm text-[#6f7785]">{item.message}</p>
                  </div>

                  <div className="grid grid-cols-[44px_1fr] items-center gap-3">
                    <span className="font-mono text-sm font-semibold text-[#11131a]">
                      {item.phase === "creating" ? "-" : `${progress}%`}
                    </span>
                    <div className="h-2 overflow-hidden rounded-full bg-[#e2e6ed]">
                      <div
                        className={cx(
                          "h-full rounded-full transition-all duration-500",
                          tone.bar
                        )}
                        style={{ width: `${item.phase === "creating" ? 0 : progress}%` }}
                      />
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </section>
  );
}

export function UploadWorkspace() {
  const router = useRouter();
  const [prompt, setPrompt] = useState("");
  const [targetLanguage, setTargetLanguage] = useState<string>(
    DEFAULT_TARGET_LANGUAGE
  );
  const [selectedUploads, setSelectedUploads] = useState<UploadSelection[]>([]);
  const [rejectedItems, setRejectedItems] = useState<RejectedUploadItem[]>([]);
  const [uploadItems, setUploadItems] = useState<UploadProgressItem[]>([]);
  const [formError, setFormError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const selectedTotalSize = useMemo(
    () => selectedUploads.reduce((total, item) => total + item.size, 0),
    [selectedUploads]
  );
  const canGenerate =
    selectedUploads.length > 0 && prompt.trim().length > 0 && !isSubmitting;

  function updateUploadItem(
    id: string,
    values: Partial<Omit<UploadProgressItem, "id">>
  ) {
    setUploadItems((currentItems) =>
      currentItems.map((item) =>
        item.id === id
          ? {
              ...item,
              ...values,
            }
          : item
      )
    );
  }

  function processFiles(files: File[]) {
    if (files.length === 0 || isSubmitting) {
      return;
    }

    const prepared = prepareClientUploadFiles(files);
    const nextSelections = prepared.accepted.map((upload, index) => ({
      ...upload,
      id: getUploadItemId(upload.file, index),
    }));
    const nextRejectedItems = prepared.rejected.map((item, index) => ({
      id: `rejected-${item.filename}-${item.file.size}-${index}`,
      filename: item.filename,
      error: item.error,
    }));

    setSelectedUploads(nextSelections);
    setRejectedItems(nextRejectedItems);
    setUploadItems([]);
    setFormError(null);
  }

  function chooseVideos(event: ChangeEvent<HTMLInputElement>) {
    processFiles(Array.from(event.target.files ?? []));
    event.target.value = "";
  }

  function handleDragEnter(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    event.stopPropagation();

    if (!isSubmitting) {
      setIsDragging(true);
    }
  }

  function handleDragOver(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    event.stopPropagation();

    if (!isSubmitting) {
      setIsDragging(true);
    }
  }

  function handleDragLeave(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    event.stopPropagation();
    setIsDragging(false);
  }

  function handleDrop(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    event.stopPropagation();
    setIsDragging(false);
    processFiles(Array.from(event.dataTransfer.files));
  }

  async function uploadSelection(
    selection: UploadSelection,
    upload: UploadSessionVideo
  ): Promise<UploadResult> {
    updateUploadItem(selection.id, {
      videoId: upload.videoId,
      phase: "uploading",
      progress: 0,
      message: "Uploading to storage",
    });

    try {
      await uploadFileToR2({
        uploadUrl: upload.uploadUrl,
        file: selection.file,
        contentType: selection.contentType,
        onProgress: (progress) =>
          updateUploadItem(selection.id, {
            progress,
            message: progress >= 100 ? "Upload finished" : "Uploading to storage",
          }),
      });

      updateUploadItem(selection.id, {
        phase: "uploaded",
        progress: 100,
        message: "Upload finished",
      });

      return {
        ok: true,
        selectionId: selection.id,
      };
    } catch (error) {
      let message = getErrorMessage(error, "Upload to R2 failed");

      try {
        await markUploadFailed(upload.videoId, message);
      } catch (markError) {
        message = `${message}. ${getErrorMessage(
          markError,
          "Failed to mark upload failed"
        )}`;
      }

      updateUploadItem(selection.id, {
        videoId: upload.videoId,
        phase: "failed",
        message,
      });

      return {
        ok: false,
        selectionId: selection.id,
      };
    }
  }

  async function submitUpload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!canGenerate) {
      return;
    }

    const trimmedPrompt = prompt.trim();
    const uploads = selectedUploads;

    setIsSubmitting(true);
    setFormError(null);
    setRejectedItems([]);
    setUploadItems(
      uploads.map((selection) => ({
        id: selection.id,
        videoId: null,
        filename: selection.filename,
        contentType: selection.contentType,
        size: selection.size,
        phase: "creating",
        progress: 0,
        message: "Preparing upload URL",
      }))
    );

    try {
      const session = await createUploadSession(
        uploads,
        trimmedPrompt,
        targetLanguage
      );
      const uploadResults = await Promise.all(
        session.videos.map((upload, index) => {
          const selection = uploads[index];

          if (!selection) {
            return Promise.resolve({
              ok: false,
              selectionId: upload.videoId,
            });
          }

          return uploadSelection(selection, upload);
        })
      );
      const uploadedIds = new Set(
        uploadResults
          .filter((result) => result.ok)
          .map((result) => result.selectionId)
      );

      setUploadItems((currentItems) =>
        currentItems.map((item) =>
          uploadedIds.has(item.id)
            ? {
                ...item,
                phase: "queueing",
                progress: 100,
                message: "Starting AI processing",
              }
            : item
        )
      );

      await completeBatchUpload(session.batchId, trimmedPrompt);
      router.push(getSafeStatusUrl(session));
    } catch (error) {
      setFormError(getErrorMessage(error));
      setIsSubmitting(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#f6f7fb] text-[#11131a]">
      <header className="border-b border-[#d5dbe5] bg-white">
        <div className="flex h-16 items-center justify-between px-5 sm:px-8">
          <div className="flex min-w-0 items-center gap-4">
            <LogoMark />
            <div className="flex min-w-0 items-center gap-4">
              <p className="truncate text-2xl font-bold tracking-tight text-[#11131a]">
                Blooclip
              </p>
              <span className="hidden h-7 w-px bg-[#d5dbe5] sm:block" />
              <p className="hidden text-base font-medium text-[#586273] sm:block">
                AI video editor
              </p>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <a
              href="#upload-progress"
              className="hidden text-sm font-semibold text-[#11131a] transition hover:text-[#ee2b2f] sm:inline"
            >
              Upload progress
            </a>
            <button
              type="button"
              className="flex h-9 w-9 items-center justify-center rounded-full border border-[#aeb7c5] text-[#586273] transition hover:border-[#11131a] hover:text-[#11131a]"
              aria-label="Help"
            >
              <HelpIcon className="h-5 w-5" />
            </button>
            <button
              type="button"
              className="flex h-9 w-9 items-center justify-center rounded-full border border-[#aeb7c5] text-[#586273] transition hover:border-[#11131a] hover:text-[#11131a]"
              aria-label="Account"
            >
              <UserIcon className="h-5 w-5" />
            </button>
          </div>
        </div>
      </header>

      <section className="px-4 py-8 sm:px-6 sm:py-9">
        <form
          onSubmit={submitUpload}
          className="mx-auto grid w-full max-w-[560px] gap-4"
        >
          <h1 className="text-center text-3xl font-bold tracking-tight text-[#11131a] sm:text-4xl">
            Upload your video
          </h1>

          <label
            onDragEnter={handleDragEnter}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            className={cx(
              "flex min-h-[70px] items-center justify-center rounded-lg border border-dashed px-4 text-base font-medium transition",
              isSubmitting
                ? "cursor-not-allowed border-[#cbd2dd] bg-[#eef1f6] text-[#8a93a3]"
                : isDragging
                  ? "cursor-pointer border-[#ee2b2f] bg-red-50 text-[#ee2b2f]"
                  : "cursor-pointer border-[#b9c2d0] bg-white/55 text-[#586273] hover:border-[#ee2b2f] hover:text-[#ee2b2f]"
            )}
          >
            <input
              type="file"
              multiple
              accept={UPLOAD_ACCEPT_ATTRIBUTE}
              onChange={chooseVideos}
              disabled={isSubmitting}
              className="sr-only"
            />
            Drop video here
          </label>

          <SelectedFiles selections={selectedUploads} />

          {selectedUploads.length > 0 && (
            <p className="text-center text-sm font-medium text-[#586273]">
              Selected total: {formatFileSize(selectedTotalSize)}
            </p>
          )}

          <RejectedFiles rejectedItems={rejectedItems} />

          {formError && (
            <div
              className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-900"
              role="alert"
            >
              {formError}
            </div>
          )}

          <div className="grid gap-2 text-left">
            <label
              htmlFor="prompt"
              className="text-base font-bold text-[#11131a]"
            >
              Prompt
            </label>
            <textarea
              id="prompt"
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              rows={4}
              required
              disabled={isSubmitting}
              placeholder="Describe what you want Blooclip to create..."
              className="min-h-[94px] resize-none rounded-lg border border-[#c5ccd8] bg-white px-4 py-3 text-base leading-6 text-[#11131a] outline-none transition placeholder:text-[#7b8493] focus:border-[#11131a] focus:ring-4 focus:ring-[#11131a]/5 disabled:cursor-not-allowed disabled:bg-[#eef1f6] disabled:text-[#6f7785]"
            />
          </div>

          <div className="grid gap-2 text-left">
            <label
              htmlFor="target-language"
              className="text-base font-bold text-[#11131a]"
            >
              Target language
            </label>
            <div className="relative">
              <GlobeIcon className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-[#586273]" />
              <select
                id="target-language"
                value={targetLanguage}
                onChange={(event) => setTargetLanguage(event.target.value)}
                disabled={isSubmitting}
                className="h-[52px] w-full appearance-none rounded-lg border border-[#c5ccd8] bg-white px-12 text-base font-medium text-[#11131a] outline-none transition focus:border-[#11131a] focus:ring-4 focus:ring-[#11131a]/5 disabled:cursor-not-allowed disabled:bg-[#eef1f6] disabled:text-[#6f7785]"
              >
                {TARGET_LANGUAGE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              <ChevronDownIcon className="pointer-events-none absolute right-4 top-1/2 h-5 w-5 -translate-y-1/2 text-[#11131a]" />
            </div>
          </div>

          <button
            type="submit"
            disabled={!canGenerate}
            className="mt-1 h-[52px] rounded-lg bg-[#090a0d] px-6 text-base font-bold text-white shadow-sm shadow-black/20 transition hover:bg-black focus:outline-none focus:ring-4 focus:ring-black/15 disabled:cursor-not-allowed disabled:bg-[#aeb7c5] disabled:shadow-none"
          >
            {isSubmitting ? getSubmitLabel(uploadItems) : "Generate"}
          </button>
        </form>
      </section>

      <UploadProgressList items={uploadItems} />
    </main>
  );
}
