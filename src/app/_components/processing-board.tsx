"use client";

import {
  getProcessingDisplay,
  type ProcessingDisplayInput,
  type ProcessingDisplayTone,
} from "@/lib/processing-stage-copy";

type ProcessingBoardProps = ProcessingDisplayInput & {
  label?: string;
  className?: string;
  compact?: boolean;
};

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

function getToneClasses(tone: ProcessingDisplayTone) {
  switch (tone) {
    case "success":
      return {
        dot: "bg-black",
        panel: "border-black bg-black text-white",
        detail: "text-white/70",
        badge: "border-black/10 text-black/60",
        bar: "bg-black",
      };
    case "error":
      return {
        dot: "bg-red-600",
        panel: "border-red-200 bg-red-50 text-red-950",
        detail: "text-red-800/75",
        badge: "border-red-200 text-red-700",
        bar: "bg-red-600",
      };
    case "canceled":
      return {
        dot: "bg-black/35",
        panel: "border-black/10 bg-black/[0.025] text-black",
        detail: "text-black/55",
        badge: "border-black/10 text-black/55",
        bar: "bg-black/35",
      };
    case "loading":
      return {
        dot: "bg-black/30",
        panel: "border-black/10 bg-black/[0.015] text-black",
        detail: "text-black/55",
        badge: "border-black/10 text-black/55",
        bar: "bg-black/35",
      };
    case "idle":
      return {
        dot: "bg-black/35",
        panel: "border-black/10 bg-white text-black",
        detail: "text-black/55",
        badge: "border-black/10 text-black/55",
        bar: "bg-black/35",
      };
    case "active":
      return {
        dot: "bg-black processing-dot-pulse",
        panel: "border-black bg-white text-black",
        detail: "text-black/58",
        badge: "border-black/10 text-black/60",
        bar: "bg-black",
      };
  }
}

export function ProcessingBoard({
  label = "AI 处理中",
  className,
  compact = false,
  ...input
}: ProcessingBoardProps) {
  const display = getProcessingDisplay(input);
  const toneClasses = getToneClasses(display.tone);

  if (compact) {
    return (
      <div
        className={cx(
          "rounded-md border border-black/10 bg-white p-3",
          className
        )}
        aria-live="polite"
      >
        <div
          key={display.stageKey}
          className="task-emerge grid grid-cols-[auto_1fr_auto] items-start gap-3"
        >
          <span
            className={cx(
              "mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full",
              toneClasses.dot
            )}
            aria-hidden="true"
          />
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-black">
              {display.title}
            </p>
            <p className="mt-1 line-clamp-2 text-sm leading-5 text-black/55">
              {display.detail}
            </p>
          </div>
          <span className="font-mono text-xs text-black/50">
            {display.progress}%
          </span>
        </div>

        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-black/10">
          <div
            className={cx("h-full rounded-full transition-all", toneClasses.bar)}
            style={{ width: `${display.progress}%` }}
          />
        </div>
      </div>
    );
  }

  return (
    <section
      className={cx(
        "rounded-md border border-black/10 bg-white p-4 shadow-sm shadow-black/[0.03]",
        className
      )}
      aria-live="polite"
    >
      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-black text-xs font-semibold text-white">
          AI
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h1 className="text-lg font-semibold tracking-tight">{label}</h1>
            <span
              className={cx(
                "rounded border bg-white px-2 py-1 text-xs font-medium",
                toneClasses.badge
              )}
            >
              {display.statusLabel}
            </span>
          </div>
          <p className="mt-1 text-sm leading-6 text-black/60">
            Blooclip 会实时显示当前任务。
          </p>
        </div>
      </div>

      <div
        key={display.stageKey}
        className={cx(
          "task-emerge mt-5 rounded-md border p-4",
          toneClasses.panel
        )}
      >
        <div className="flex items-start gap-3">
          <span
            className={cx(
              "mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full",
              toneClasses.dot
            )}
            aria-hidden="true"
          />
          <div className="min-w-0">
            <p className="text-base font-semibold">{display.title}</p>
            <p className={cx("mt-1 text-sm leading-6", toneClasses.detail)}>
              {display.detail}
            </p>
          </div>
        </div>
      </div>

      <div className="mt-4 grid gap-2">
        <div className="flex items-center justify-between gap-3 text-xs font-medium text-black/50">
          <span>进度</span>
          <span className="font-mono">{display.progress}%</span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-black/10">
          <div
            className={cx("h-full rounded-full transition-all", toneClasses.bar)}
            style={{ width: `${display.progress}%` }}
          />
        </div>
      </div>
    </section>
  );
}
