"use client";

import {
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { ChangeEvent, DragEvent, FormEvent } from "react";

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
  previewUrl: string;
};

type MockJobStatus = "queued" | "processing" | "ready" | "error";

type MockJob = {
  id: string;
  filename: string;
  contentType: string;
  size: number;
  previewUrl: string;
  prompt: string;
  targetLanguage: string;
  targetLanguageLabel: string;
  status: MockJobStatus;
  progress: number;
  stage: string;
  createdAt: number;
};

const UPLOAD_ACCEPT_ATTRIBUTE =
  "video/mp4,video/webm,video/quicktime,.mp4,.webm,.mov";

const READY_STAGE = "Completed";
const QUEUED_STAGE = "Waiting to start";

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

function getBaseFilename(filename: string) {
  const dotIndex = filename.lastIndexOf(".");

  if (dotIndex <= 0) {
    return filename || "blooclip-video";
  }

  return filename.slice(0, dotIndex);
}

function getTargetLanguageLabel(value: string) {
  return (
    TARGET_LANGUAGE_OPTIONS.find((option) => option.value === value)?.label ??
    value
  );
}

function getProcessingStage(progress: number) {
  if (progress < 30) return "Analyzing video";
  if (progress < 55) return "Writing edit plan";
  if (progress < 78) return "Rendering AI edit";
  if (progress < 94) return "Building instruction PDF";
  return "Finalizing downloads";
}

function getStatusLabel(status: MockJobStatus) {
  switch (status) {
    case "queued":
      return "Queued";
    case "processing":
      return "Processing";
    case "ready":
      return "Ready";
    case "error":
      return "Error";
  }
}

function getStatusClasses(status: MockJobStatus) {
  switch (status) {
    case "queued":
      return {
        dot: "bg-[#ff9f0a]",
        text: "text-[#b76a00]",
        bar: "bg-[#ff9f0a]",
      };
    case "processing":
      return {
        dot: "processing-dot-pulse bg-[#155dfc]",
        text: "text-[#155dfc]",
        bar: "bg-[#155dfc]",
      };
    case "ready":
      return {
        dot: "bg-[#20a03f]",
        text: "text-[#198a35]",
        bar: "bg-[#20a03f]",
      };
    case "error":
      return {
        dot: "bg-[#e92b2b]",
        text: "text-[#c81818]",
        bar: "bg-[#e92b2b]",
      };
  }
}

function toPdfText(value: string) {
  return value
    .replace(/[^\x20-\x7E]/g, "?")
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)");
}

function wrapText(value: string, maxLength = 72) {
  const normalized = value.replace(/\s+/g, " ").trim();

  if (!normalized) {
    return ["No prompt provided."];
  }

  const lines: string[] = [];
  let currentLine = "";

  for (const word of normalized.split(" ")) {
    if (!currentLine) {
      currentLine = word;
      continue;
    }

    if (`${currentLine} ${word}`.length > maxLength) {
      lines.push(currentLine);
      currentLine = word;
      continue;
    }

    currentLine = `${currentLine} ${word}`;
  }

  if (currentLine) {
    lines.push(currentLine);
  }

  return lines.slice(0, 5);
}

function buildPdfDocument(content: string) {
  const encoder = new TextEncoder();
  const contentLength = encoder.encode(content).length;
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${contentLength} >>\nstream\n${content}\nendstream`,
  ];
  let pdf = "%PDF-1.4\n";
  const offsets = [0];

  objects.forEach((object, index) => {
    offsets.push(encoder.encode(pdf).length);
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });

  const xrefOffset = encoder.encode(pdf).length;
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += "0000000000 65535 f \n";
  for (const offset of offsets.slice(1)) {
    pdf += `${String(offset).padStart(10, "0")} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\n`;
  pdf += `startxref\n${xrefOffset}\n%%EOF`;

  return pdf;
}

function createMockInstructionPdf(job: MockJob) {
  const promptLines = wrapText(job.prompt);
  const textLines = [
    { x: 72, y: 720, size: 24, text: "Blooclip Instruction PDF" },
    { x: 72, y: 690, size: 12, text: `Video: ${job.filename}` },
    {
      x: 72,
      y: 670,
      size: 12,
      text: `Target language: ${job.targetLanguageLabel}`,
    },
    { x: 72, y: 642, size: 14, text: "Instruction" },
    ...promptLines.map((line, index) => ({
      x: 72,
      y: 620 - index * 18,
      size: 11,
      text: line,
    })),
    { x: 72, y: 500, size: 14, text: "Screenshot guide" },
    { x: 72, y: 344, size: 11, text: "Screenshot 1: key action frame" },
    { x: 320, y: 344, size: 11, text: "Screenshot 2: final result frame" },
    { x: 72, y: 274, size: 14, text: "Steps" },
    {
      x: 72,
      y: 250,
      size: 11,
      text: "1. Review the source video and find the key action.",
    },
    {
      x: 72,
      y: 232,
      size: 11,
      text: "2. Edit a concise AI video with voiceover and subtitles.",
    },
    {
      x: 72,
      y: 214,
      size: 11,
      text: "3. Use the screenshots to repeat the process.",
    },
  ];
  const textCommands = textLines
    .map(
      (line) =>
        `/F1 ${line.size} Tf 1 0 0 1 ${line.x} ${line.y} Tm (${toPdfText(
          line.text
        )}) Tj`
    )
    .join("\n");
  const content = [
    "q 0.95 0.96 0.98 rg 72 370 210 112 re f Q",
    "q 0.78 0.81 0.87 RG 72 370 210 112 re S Q",
    "q 0.12 0.14 0.18 rg 96 398 162 52 re f Q",
    "q 0.95 0.96 0.98 rg 320 370 210 112 re f Q",
    "q 0.78 0.81 0.87 RG 320 370 210 112 re S Q",
    "q 0.88 0.18 0.18 rg 344 398 162 52 re f Q",
    "BT",
    textCommands,
    "ET",
  ].join("\n");

  return new Blob([buildPdfDocument(content)], { type: "application/pdf" });
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function downloadFromUrl(url: string, filename: string) {
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
}

function UploadIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2.4"
      aria-hidden="true"
    >
      <path d="M12 16V4" />
      <path d="m7 9 5-5 5 5" />
      <path d="M5 16v3h14v-3" />
    </svg>
  );
}

function DownloadIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2"
      aria-hidden="true"
    >
      <path d="M12 3v12" />
      <path d="m7 10 5 5 5-5" />
      <path d="M5 21h14" />
    </svg>
  );
}

function PdfIcon({ className }: { className?: string }) {
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
      <path d="M7 3h7l4 4v14H7z" />
      <path d="M14 3v5h4" />
      <path d="M9 14h6" />
      <path d="M9 17h4" />
    </svg>
  );
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

function DocumentPreview() {
  return (
    <div className="hidden w-[92px] shrink-0 rounded-md border border-[#d6dce7] bg-white p-2 shadow-sm shadow-black/[0.03] lg:block">
      <div className="mb-2 h-1.5 w-11 rounded bg-[#1f2430]" />
      <div className="mb-1 h-1 w-16 rounded bg-[#d7dce5]" />
      <div className="mb-3 h-1 w-12 rounded bg-[#d7dce5]" />
      <div className="grid grid-cols-2 gap-1.5">
        <div className="aspect-video rounded-sm bg-[#eef1f6]">
          <div className="mx-auto mt-2 h-3 w-4 rounded-sm bg-[#ee2b2f]" />
        </div>
        <div className="aspect-video rounded-sm bg-[#eef1f6]">
          <div className="mx-auto mt-2 h-3 w-4 rounded-sm bg-[#11131a]" />
        </div>
      </div>
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

function ProgressCell({ job }: { job: MockJob }) {
  const tone = getStatusClasses(job.status);

  return (
    <div className="grid grid-cols-[44px_1fr] items-center gap-3">
      <span className="font-mono text-sm font-semibold text-[#11131a]">
        {job.status === "queued" ? "-" : `${job.progress}%`}
      </span>
      <div className="h-2 overflow-hidden rounded-full bg-[#e2e6ed]">
        <div
          className={cx("h-full rounded-full transition-all duration-500", tone.bar)}
          style={{ width: `${job.status === "queued" ? 0 : job.progress}%` }}
        />
      </div>
    </div>
  );
}

function StatusCell({ job }: { job: MockJob }) {
  const tone = getStatusClasses(job.status);

  return (
    <div className="min-w-0">
      <div className="flex items-center gap-2">
        <span className={cx("h-2.5 w-2.5 rounded-full", tone.dot)} />
        <span className={cx("text-sm font-semibold", tone.text)}>
          {getStatusLabel(job.status)}
        </span>
      </div>
      <p className="mt-1 truncate text-sm text-[#6f7785]">{job.stage}</p>
    </div>
  );
}

function ResultActions({
  job,
  onDownloadVideo,
  onDownloadPdf,
}: {
  job: MockJob;
  onDownloadVideo(job: MockJob): void;
  onDownloadPdf(job: MockJob): void;
}) {
  if (job.status !== "ready") {
    return <span className="text-sm text-[#6f7785]">-</span>;
  }

  return (
    <div className="flex min-w-[260px] items-center justify-end gap-4">
      <DocumentPreview />
      <div className="grid min-w-[220px] gap-2">
        <button
          type="button"
          onClick={() => onDownloadVideo(job)}
          className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-[#ee2b2f] px-3 text-sm font-semibold text-white shadow-sm shadow-red-600/20 transition hover:bg-[#d92327] focus:outline-none focus:ring-2 focus:ring-[#ee2b2f]/30"
        >
          <DownloadIcon className="h-4 w-4" />
          Download AI-edited video
        </button>
        <button
          type="button"
          onClick={() => onDownloadPdf(job)}
          className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-[#ee2b2f] bg-white px-3 text-sm font-semibold text-[#11131a] transition hover:bg-red-50 focus:outline-none focus:ring-2 focus:ring-[#ee2b2f]/25"
        >
          <PdfIcon className="h-4 w-4 text-[#ee2b2f]" />
          Download instruction PDF
        </button>
      </div>
    </div>
  );
}

function JobDesktopRow({
  job,
  onDownloadVideo,
  onDownloadPdf,
}: {
  job: MockJob;
  onDownloadVideo(job: MockJob): void;
  onDownloadPdf(job: MockJob): void;
}) {
  return (
    <li className="hidden grid-cols-[260px_250px_120px_190px_210px_1fr] items-center gap-5 border-t border-[#dce1ea] px-4 py-4 first:border-t-0 md:grid">
      <div className="grid min-w-0 grid-cols-[70px_minmax(0,1fr)] items-center gap-4">
        <FileThumb />
        <div className="min-w-0">
          <p className="truncate text-sm font-bold text-[#11131a]">
            {job.filename}
          </p>
          <p className="mt-1 text-sm text-[#6f7785]">{formatFileSize(job.size)}</p>
        </div>
      </div>
      <p className="line-clamp-2 text-sm leading-5 text-[#11131a]">{job.prompt}</p>
      <p className="text-sm text-[#11131a]">{job.targetLanguageLabel}</p>
      <StatusCell job={job} />
      <ProgressCell job={job} />
      <ResultActions
        job={job}
        onDownloadVideo={onDownloadVideo}
        onDownloadPdf={onDownloadPdf}
      />
    </li>
  );
}

function JobMobileCard({
  job,
  onDownloadVideo,
  onDownloadPdf,
}: {
  job: MockJob;
  onDownloadVideo(job: MockJob): void;
  onDownloadPdf(job: MockJob): void;
}) {
  return (
    <li className="grid gap-4 border-t border-[#dce1ea] px-4 py-4 first:border-t-0 md:hidden">
      <div className="grid grid-cols-[70px_minmax(0,1fr)] items-center gap-4">
        <FileThumb />
        <div className="min-w-0">
          <p className="truncate text-sm font-bold text-[#11131a]">
            {job.filename}
          </p>
          <p className="mt-1 text-sm text-[#6f7785]">
            {formatFileSize(job.size)} · {job.targetLanguageLabel}
          </p>
        </div>
      </div>
      <p className="text-sm leading-5 text-[#11131a]">{job.prompt}</p>
      <StatusCell job={job} />
      <ProgressCell job={job} />
      {job.status === "ready" ? (
        <div className="grid gap-2">
          <button
            type="button"
            onClick={() => onDownloadVideo(job)}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-[#ee2b2f] px-3 text-sm font-semibold text-white"
          >
            <DownloadIcon className="h-4 w-4" />
            Download AI-edited video
          </button>
          <button
            type="button"
            onClick={() => onDownloadPdf(job)}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-[#ee2b2f] bg-white px-3 text-sm font-semibold text-[#11131a]"
          >
            <PdfIcon className="h-4 w-4 text-[#ee2b2f]" />
            Download instruction PDF
          </button>
        </div>
      ) : (
        <p className="text-sm text-[#6f7785]">Result will appear here.</p>
      )}
    </li>
  );
}

function ProcessingList({
  jobs,
  onDownloadVideo,
  onDownloadPdf,
}: {
  jobs: MockJob[];
  onDownloadVideo(job: MockJob): void;
  onDownloadPdf(job: MockJob): void;
}) {
  const sortedJobs = useMemo(
    () => [...jobs].sort((a, b) => a.createdAt - b.createdAt),
    [jobs]
  );

  return (
    <section className="border-t border-[#d5dbe5] bg-white px-4 py-5 sm:px-8">
      <div className="mx-auto max-w-[1500px]">
        <h2 className="text-2xl font-bold tracking-tight text-[#11131a]">
          Processing
        </h2>

        <div className="mt-3 overflow-hidden rounded-lg border border-[#cfd6e1] bg-white">
          <div className="hidden grid-cols-[260px_250px_120px_190px_210px_1fr] gap-5 border-b border-[#dce1ea] bg-[#fbfcfe] px-4 py-3 text-sm font-semibold text-[#586273] md:grid">
            <span>Video</span>
            <span>Prompt</span>
            <span>Language</span>
            <span>Status</span>
            <span>Progress</span>
            <span>Result</span>
          </div>

          {sortedJobs.length > 0 ? (
            <ul aria-live="polite">
              {sortedJobs.map((job) => (
                <Fragment key={job.id}>
                  <JobDesktopRow
                    job={job}
                    onDownloadVideo={onDownloadVideo}
                    onDownloadPdf={onDownloadPdf}
                  />
                  <JobMobileCard
                    job={job}
                    onDownloadVideo={onDownloadVideo}
                    onDownloadPdf={onDownloadPdf}
                  />
                </Fragment>
              ))}
            </ul>
          ) : (
            <div className="grid min-h-[180px] place-items-center px-4 py-10 text-center">
              <div>
                <p className="text-base font-semibold text-[#11131a]">
                  No videos are processing yet.
                </p>
                <p className="mt-2 text-sm text-[#6f7785]">
                  Upload a video, write a prompt, choose a language, and click
                  Generate.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

export function UploadWorkspace() {
  const [prompt, setPrompt] = useState("");
  const [targetLanguage, setTargetLanguage] = useState<string>(
    DEFAULT_TARGET_LANGUAGE
  );
  const [selectedUploads, setSelectedUploads] = useState<UploadSelection[]>([]);
  const [rejectedItems, setRejectedItems] = useState<RejectedUploadItem[]>([]);
  const [jobs, setJobs] = useState<MockJob[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const selectedUrlsRef = useRef<string[]>([]);
  const allObjectUrlsRef = useRef<string[]>([]);

  const selectedTotalSize = useMemo(
    () => selectedUploads.reduce((total, item) => total + item.size, 0),
    [selectedUploads]
  );
  const canGenerate =
    selectedUploads.length > 0 && prompt.trim().length > 0;

  const releaseSelectedUrls = useCallback(() => {
    for (const url of selectedUrlsRef.current) {
      URL.revokeObjectURL(url);
    }
    selectedUrlsRef.current = [];
  }, []);

  useEffect(() => {
    const objectUrls = allObjectUrlsRef.current;

    return () => {
      for (const url of objectUrls) {
        URL.revokeObjectURL(url);
      }
    };
  }, []);

  useEffect(() => {
    const activeJob = jobs.find((job) => job.status === "processing");

    if (!activeJob) {
      const queuedJob = jobs.find((job) => job.status === "queued");

      if (!queuedJob) {
        return;
      }

      const startTimer = window.setTimeout(() => {
        setJobs((currentJobs) => {
          const queuedIndex = currentJobs.findIndex(
            (job) => job.status === "queued"
          );

          if (queuedIndex < 0) {
            return currentJobs;
          }

          return currentJobs.map((job, index) =>
            index === queuedIndex
              ? {
                  ...job,
                  status: "processing",
                  progress: 8,
                  stage: getProcessingStage(8),
                }
              : job
          );
        });
      }, 300);

      return () => window.clearTimeout(startTimer);
    }

    const progressTimer = window.setInterval(() => {
      setJobs((currentJobs) =>
        currentJobs.map((job) => {
          if (job.id !== activeJob.id || job.status !== "processing") {
            return job;
          }

          const nextProgress = Math.min(100, job.progress + 8);

          if (nextProgress >= 100) {
            return {
              ...job,
              status: "ready",
              progress: 100,
              stage: READY_STAGE,
            };
          }

          return {
            ...job,
            progress: nextProgress,
            stage: getProcessingStage(nextProgress),
          };
        })
      );
    }, 650);

    return () => window.clearInterval(progressTimer);
  }, [jobs]);

  function processFiles(files: File[]) {
    if (files.length === 0) {
      return;
    }

    releaseSelectedUrls();

    const prepared = prepareClientUploadFiles(files);
    const nextSelections = prepared.accepted.map((upload, index) => {
      const previewUrl = URL.createObjectURL(upload.file);

      return {
        ...upload,
        id: getUploadItemId(upload.file, index),
        previewUrl,
      };
    });
    const nextRejectedItems = prepared.rejected.map((item, index) => ({
      id: `rejected-${item.filename}-${item.file.size}-${index}`,
      filename: item.filename,
      error: item.error,
    }));
    const nextUrls = nextSelections.map((selection) => selection.previewUrl);

    selectedUrlsRef.current = nextUrls;
    allObjectUrlsRef.current.push(...nextUrls);
    setSelectedUploads(nextSelections);
    setRejectedItems(nextRejectedItems);
  }

  function chooseVideos(event: ChangeEvent<HTMLInputElement>) {
    processFiles(Array.from(event.target.files ?? []));
    event.target.value = "";
  }

  function handleDragEnter(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    event.stopPropagation();
    setIsDragging(true);
  }

  function handleDragOver(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    event.stopPropagation();
    setIsDragging(true);
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

  function generateMockJobs(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!canGenerate) {
      return;
    }

    const createdAt = Date.now();
    const trimmedPrompt = prompt.trim();
    const targetLanguageLabel = getTargetLanguageLabel(targetLanguage);
    const nextJobs = selectedUploads.map((selection, index) => ({
      id: `mock-job-${createdAt}-${index}-${selection.id}`,
      filename: selection.filename,
      contentType: selection.contentType,
      size: selection.size,
      previewUrl: selection.previewUrl,
      prompt: trimmedPrompt,
      targetLanguage,
      targetLanguageLabel,
      status: "queued" as const,
      progress: 0,
      stage: QUEUED_STAGE,
      createdAt: createdAt + index,
    }));

    selectedUrlsRef.current = [];
    setJobs((currentJobs) => [...currentJobs, ...nextJobs]);
    setSelectedUploads([]);
    setRejectedItems([]);
    setPrompt("");
  }

  function downloadVideo(job: MockJob) {
    downloadFromUrl(job.previewUrl, `ai-edited-${job.filename}`);
  }

  function downloadInstructionPdf(job: MockJob) {
    downloadBlob(
      createMockInstructionPdf(job),
      `${getBaseFilename(job.filename)}-instruction.pdf`
    );
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
              href="#processing-list"
              className="hidden text-sm font-semibold text-[#11131a] transition hover:text-[#ee2b2f] sm:inline"
            >
              My projects
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
          onSubmit={generateMockJobs}
          className="mx-auto grid w-full max-w-[560px] gap-4"
        >
          <h1 className="text-center text-3xl font-bold tracking-tight text-[#11131a] sm:text-4xl">
            Upload your video
          </h1>

          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept={UPLOAD_ACCEPT_ATTRIBUTE}
            onChange={chooseVideos}
            className="hidden"
          />

          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="inline-flex h-[70px] items-center justify-center gap-4 rounded-lg bg-[#ee2b2f] px-6 text-xl font-bold text-white shadow-lg shadow-red-600/20 transition hover:bg-[#d92327] focus:outline-none focus:ring-4 focus:ring-[#ee2b2f]/25"
          >
            <UploadIcon className="h-8 w-8" />
            Choose video file
          </button>

          <label
            onDragEnter={handleDragEnter}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            className={cx(
              "flex min-h-[70px] cursor-pointer items-center justify-center rounded-lg border border-dashed px-4 text-base font-medium transition",
              isDragging
                ? "border-[#ee2b2f] bg-red-50 text-[#ee2b2f]"
                : "border-[#b9c2d0] bg-white/55 text-[#586273] hover:border-[#ee2b2f] hover:text-[#ee2b2f]"
            )}
          >
            <input
              type="file"
              multiple
              accept={UPLOAD_ACCEPT_ATTRIBUTE}
              onChange={chooseVideos}
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
              placeholder="Describe what you want Blooclip to create..."
              className="min-h-[94px] resize-none rounded-lg border border-[#c5ccd8] bg-white px-4 py-3 text-base leading-6 text-[#11131a] outline-none transition placeholder:text-[#7b8493] focus:border-[#11131a] focus:ring-4 focus:ring-[#11131a]/5"
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
                className="h-[52px] w-full appearance-none rounded-lg border border-[#c5ccd8] bg-white px-12 text-base font-medium text-[#11131a] outline-none transition focus:border-[#11131a] focus:ring-4 focus:ring-[#11131a]/5"
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
            Generate
          </button>
        </form>
      </section>

      <div id="processing-list">
        <ProcessingList
          jobs={jobs}
          onDownloadVideo={downloadVideo}
          onDownloadPdf={downloadInstructionPdf}
        />
      </div>
    </main>
  );
}
