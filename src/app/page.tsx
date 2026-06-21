"use client";

import { useEffect, useRef, useState } from "react";
import type { ChangeEvent, FormEvent } from "react";

import { ProcessingBoard } from "@/app/_components/processing-board";
import type { ProcessingDisplayInput } from "@/lib/processing-stage-copy";

const demoProcessingStages: ProcessingDisplayInput[] = [
  {
    status: "created",
    currentStage: "created",
    progress: 0,
  },
  {
    status: "processing",
    currentStage: "downloading_source",
    progress: 8,
  },
  {
    status: "processing",
    currentStage: "analyzing_visuals",
    progress: 50,
  },
  {
    status: "processing",
    currentStage: "planning_segments",
    progress: 60,
  },
  {
    status: "completed",
    currentStage: "completed",
    progress: 100,
  },
];

function formatFileSize(bytes: number) {
  if (bytes < 1024 * 1024) {
    return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  }

  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export default function Home() {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const previewUrlRef = useRef("");
  const [prompt, setPrompt] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [progressStepIndex, setProgressStepIndex] = useState(0);

  useEffect(() => {
    return () => {
      if (previewUrlRef.current) {
        URL.revokeObjectURL(previewUrlRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!isProcessing) {
      return;
    }

    const nextStepIndex = Math.min(
      progressStepIndex + 1,
      demoProcessingStages.length - 1
    );

    if (progressStepIndex >= demoProcessingStages.length - 1) {
      return;
    }

    const timeout = window.setTimeout(() => {
      setProgressStepIndex(nextStepIndex);

      if (nextStepIndex >= demoProcessingStages.length - 1) {
        setIsProcessing(false);
      }
    }, 1100);

    return () => {
      window.clearTimeout(timeout);
    };
  }, [isProcessing, progressStepIndex]);

  function chooseVideo(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null;
    const nextPreviewUrl = file ? URL.createObjectURL(file) : "";

    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current);
    }

    previewUrlRef.current = nextPreviewUrl;

    setSelectedFile(file);
    setPreviewUrl(nextPreviewUrl);
    setProgressStepIndex(0);
    setIsProcessing(false);
  }

  function sendPrompt(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!prompt.trim() && !selectedFile) {
      return;
    }

    setProgressStepIndex(1);
    setIsProcessing(true);
  }

  const hasInput = Boolean(prompt.trim()) || Boolean(selectedFile);
  const demoProcessingStage = demoProcessingStages[progressStepIndex];

  return (
    <main className="min-h-screen bg-white text-black lg:h-screen lg:overflow-hidden">
      <div className="grid min-h-screen grid-cols-1 lg:h-screen lg:grid-cols-[minmax(0,1fr)_360px]">
        <section className="flex min-h-screen flex-col border-black/10 lg:h-screen lg:min-h-0 lg:border-r">
          <header className="flex h-14 shrink-0 items-center justify-between border-b border-black/10 px-4 sm:px-6">
            <div className="flex items-center gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-md border border-black bg-black text-sm font-semibold text-white">
                B
              </div>
              <p className="text-sm font-semibold tracking-tight">Blooclip</p>
            </div>
            <p className="text-xs font-medium text-black/45">
              Frontend preview only
            </p>
          </header>

          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-5 sm:px-6 sm:py-8">
            <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
              <ProcessingBoard
                label="AI processing board"
                status={demoProcessingStage.status}
                currentStage={demoProcessingStage.currentStage}
                progress={demoProcessingStage.progress}
              />
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
                placeholder="Tell Blooclip what you want this video to become..."
                className="max-h-40 min-h-12 w-full resize-none border-0 bg-transparent text-sm leading-6 text-black outline-none placeholder:text-black/35"
              />

              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex min-w-0 items-center gap-2">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="video/*"
                    onChange={chooseVideo}
                    className="hidden"
                  />
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="h-9 rounded-md border border-black px-3 text-sm font-medium text-black transition hover:bg-black hover:text-white"
                  >
                    Upload video
                  </button>
                  {selectedFile && (
                    <p className="min-w-0 truncate text-sm text-black/55">
                      {selectedFile.name}
                    </p>
                  )}
                </div>

                <button
                  type="submit"
                  disabled={!hasInput || isProcessing}
                  className="h-9 rounded-md bg-black px-4 text-sm font-semibold text-white transition hover:bg-black/80 disabled:cursor-not-allowed disabled:bg-black/25"
                >
                  {isProcessing ? "Sending" : "Send"}
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
                Local browser preview. Nothing is uploaded.
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
              {selectedFile?.name ?? "No file yet"}
            </p>
            <p className="mt-1 text-sm text-black/50">
              {selectedFile
                ? `${selectedFile.type || "video"} - ${formatFileSize(
                    selectedFile.size
                  )}`
                : "Choose one video from the composer."}
            </p>
          </div>

          <div className="mt-auto pt-5">
            <button
              type="button"
              disabled
              className="w-full rounded-md border border-black/15 bg-black/5 px-3 py-2.5 text-sm font-medium text-black/35"
            >
              Download unavailable - backend disconnected
            </button>
          </div>
        </aside>
      </div>
    </main>
  );
}
