"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";

type InstructionDocumentStep = {
  stepIndex: number;
  title: string;
  instruction: string;
  timestampSeconds: number;
  sourceStartSeconds: number;
  sourceEndSeconds: number;
  keyFrame: {
    visualFrameIndex: number;
    timestampSeconds: number;
    altText: string;
    r2Key: string;
    sizeBytes: number;
    url: string;
  };
};

type InstructionDocumentResponse = {
  document: {
    title: string;
    overview: string;
    targetLanguage: string;
    steps: InstructionDocumentStep[];
    warnings: string[];
  };
  pdfDownloadUrl: string;
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

function formatTimestamp(seconds: number) {
  const totalSeconds = Math.max(0, Math.round(seconds));
  const minutes = Math.floor(totalSeconds / 60);
  const remainingSeconds = totalSeconds % 60;

  return `${minutes}:${String(remainingSeconds).padStart(2, "0")}`;
}

export default function InstructionsPage() {
  const params = useParams<{ videoId: string }>();
  const [data, setData] = useState<InstructionDocumentResponse | null>(null);
  const [message, setMessage] = useState("Loading instruction document...");

  useEffect(() => {
    let active = true;

    async function loadInstructionDocument() {
      try {
        const response = await fetch(
          `/api/videos/${params.videoId}/instruction-document`
        );

        if (!response.ok) {
          const error = await readErrorMessage(
            response,
            "Failed to load instruction document"
          );

          if (active) {
            setMessage(error);
          }

          return;
        }

        const result = (await response.json()) as InstructionDocumentResponse;

        if (active) {
          setData(result);
          setMessage("Instruction document loaded");
        }
      } catch (error) {
        if (active) {
          setMessage(error instanceof Error ? error.message : "Load failed");
        }
      }
    }

    loadInstructionDocument();

    return () => {
      active = false;
    };
  }, [params.videoId]);

  function downloadPdf() {
    if (data?.pdfDownloadUrl) {
      window.location.href = data.pdfDownloadUrl;
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col gap-8 p-6 py-10">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link
          href={`/videos/${params.videoId}`}
          className="text-sm font-medium text-gray-600"
        >
          Back to video status
        </Link>

        <button
          onClick={downloadPdf}
          disabled={!data?.pdfDownloadUrl}
          className="rounded bg-black px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
        >
          Download PDF
        </button>
      </div>

      {data ? (
        <>
          <header className="space-y-3 border-b border-gray-200 pb-6">
            <p className="text-sm text-gray-500">Instruction document</p>
            <h1 className="text-3xl font-semibold">{data.document.title}</h1>
            <p className="text-base leading-7 text-gray-700">
              {data.document.overview}
            </p>
          </header>

          <section className="space-y-8">
            {data.document.steps.map((step) => (
              <article
                key={step.stepIndex}
                className="grid gap-4 border-b border-gray-200 pb-8"
              >
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <h2 className="text-xl font-semibold">
                      {step.stepIndex}. {step.title}
                    </h2>
                    <span className="font-mono text-sm text-gray-500">
                      {formatTimestamp(step.timestampSeconds)}
                    </span>
                  </div>
                  <p className="leading-7 text-gray-700">{step.instruction}</p>
                </div>

                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={step.keyFrame.url}
                  alt={step.keyFrame.altText}
                  className="aspect-video w-full rounded border border-gray-200 object-contain"
                />
              </article>
            ))}
          </section>

          {data.document.warnings.length > 0 && (
            <section className="space-y-3">
              <h2 className="text-lg font-semibold">Warnings</h2>
              <ul className="list-disc space-y-2 pl-5 text-sm text-gray-600">
                {data.document.warnings.map((warning) => (
                  <li key={warning}>{warning}</li>
                ))}
              </ul>
            </section>
          )}
        </>
      ) : (
        <p className="rounded border border-gray-200 p-4 text-sm text-gray-600">
          {message}
        </p>
      )}

      {data && <p className="text-sm text-gray-500">{message}</p>}
    </main>
  );
}
