import { spawn } from "node:child_process";
import { mkdtemp, mkdir, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import type { RenderDimensions } from "./video-rendering.ts";

export type WatermarkSegment = {
  startSeconds: number;
  endSeconds: number;
  startX: number;
  startY: number;
  endX: number;
  endY: number;
};

export type WatermarkLayout = {
  dimensions: RenderDimensions;
  fontSize: number;
  startX: number;
  startY: number;
  velocityX: number;
  velocityY: number;
  left: number;
  right: number;
  top: number;
  bottom: number;
};

export type SmoothBouncingWatermarkOptions = {
  text?: string;
  fontsDir?: string;
  fontFamily?: string;
  ffmpegPath?: string;
  ffprobePath?: string;
  crf?: string;
  preset?: string;
  workDir?: string;
};

type VideoMetadata = RenderDimensions & {
  durationSeconds: number;
  frameRateExpression: string;
  audioStreamCount: number;
  audioBitrate: number | null;
};

type CommandResult = {
  stdout: string;
  stderr: string;
};

const BASE_WIDTH = 1366;
const BASE_HEIGHT = 768;
const BASE_FONT_SIZE = 36;
const BASE_START_X = 150;
const BASE_START_Y = 490;
const BASE_VELOCITY_X = 30;
const BASE_VELOCITY_Y = -18;
const BASE_LEFT = 50;
const BASE_RIGHT = 1190;
const BASE_TOP = 50;
const BASE_BOTTOM = 650;
const DEFAULT_TEXT = "CSJ创赛捷";
const DEFAULT_FONT_FAMILY = "Noto Sans CJK SC";
const DEFAULT_CRF = "14";
const DEFAULT_PRESET = "medium";
const DEFAULT_ALPHA_HEX = "CC";
const WATERMARK_ANGLE_DEGREES = 22;
const MIN_SEGMENT_SECONDS = 0.001;
const COLLISION_EPSILON_SECONDS = 1e-6;

function runCommand(command: string, args: string[]) {
  return new Promise<CommandResult>((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: ["ignore", "pipe", "pipe"],
    });
    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];

    child.stdout.on("data", (chunk: Buffer) => {
      stdoutChunks.push(chunk);
    });

    child.stderr.on("data", (chunk: Buffer) => {
      stderrChunks.push(chunk);
    });

    child.on("error", (error) => {
      reject(error);
    });

    child.on("exit", (code) => {
      const stdout = Buffer.concat(stdoutChunks).toString("utf8");
      const stderr = Buffer.concat(stderrChunks).toString("utf8");

      if (code === 0) {
        resolve({ stdout, stderr });
        return;
      }

      reject(
        new Error(
          `${command} failed with exit code ${code}${
            stderr.trim() ? `: ${stderr.trim()}` : ""
          }`
        )
      );
    });
  });
}

function runFfmpeg(command: string, args: string[]) {
  return new Promise<CommandResult>((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: ["ignore", "pipe", "pipe"],
    });
    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];

    child.stdout.on("data", (chunk: Buffer) => {
      stdoutChunks.push(chunk);
    });

    child.stderr.on("data", (chunk: Buffer) => {
      stderrChunks.push(chunk);
    });

    child.on("error", (error) => {
      reject(error);
    });

    child.on("exit", (code) => {
      const stdout = Buffer.concat(stdoutChunks).toString("utf8");
      const stderr = Buffer.concat(stderrChunks).toString("utf8");

      if (code === 0) {
        resolve({ stdout, stderr });
        return;
      }

      reject(
        new Error(
          `${command} failed with exit code ${code}${
            stderr.trim() ? `: ${stderr.trim()}` : ""
          }`
        )
      );
    });
  });
}

function parsePositiveNumber(value: unknown) {
  const numberValue =
    typeof value === "number" ? value : Number(String(value ?? "").trim());

  return Number.isFinite(numberValue) && numberValue > 0 ? numberValue : null;
}

function parseFrameRateExpression(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  const ratioMatch = /^(\d+)\/(\d+)$/.exec(trimmed);

  if (ratioMatch) {
    const numerator = Number(ratioMatch[1]);
    const denominator = Number(ratioMatch[2]);

    if (numerator > 0 && denominator > 0) {
      return denominator === 1 ? String(numerator) : `${numerator}/${denominator}`;
    }
  }

  const numericValue = Number(trimmed);

  if (Number.isFinite(numericValue) && numericValue > 0) {
    return String(numericValue);
  }

  return null;
}

async function probeVideoMetadata(
  inputPath: string,
  ffprobePath: string
): Promise<VideoMetadata> {
  const { stdout } = await runCommand(ffprobePath, [
    "-v",
    "error",
    "-select_streams",
    "v:0",
    "-show_entries",
    "stream=width,height,r_frame_rate,avg_frame_rate,duration",
    "-show_entries",
    "format=duration",
    "-of",
    "json",
    inputPath,
  ]);

  let parsed: unknown;

  try {
    parsed = JSON.parse(stdout) as unknown;
  } catch {
    throw new Error("Unable to parse ffprobe video metadata output");
  }

  if (!parsed || typeof parsed !== "object") {
    throw new Error("ffprobe video metadata output was invalid");
  }

  const streams = "streams" in parsed ? parsed.streams : null;
  const format = "format" in parsed ? parsed.format : null;
  const videoStream = Array.isArray(streams) ? streams[0] : null;

  if (!videoStream || typeof videoStream !== "object") {
    throw new Error("ffprobe did not return a video stream");
  }

  const width = parsePositiveNumber("width" in videoStream ? videoStream.width : null);
  const height = parsePositiveNumber(
    "height" in videoStream ? videoStream.height : null
  );
  const streamDuration = parsePositiveNumber(
    "duration" in videoStream ? videoStream.duration : null
  );
  const formatDuration =
    format && typeof format === "object"
      ? parsePositiveNumber("duration" in format ? format.duration : null)
      : null;
  const frameRateExpression =
    parseFrameRateExpression(
      "avg_frame_rate" in videoStream ? videoStream.avg_frame_rate : null
    ) ??
    parseFrameRateExpression(
      "r_frame_rate" in videoStream ? videoStream.r_frame_rate : null
    );

  if (!width || !height) {
    throw new Error("ffprobe video metadata is missing width or height");
  }

  if (!streamDuration && !formatDuration) {
    throw new Error("ffprobe video metadata is missing duration");
  }

  if (!frameRateExpression) {
    throw new Error("ffprobe video metadata is missing a valid frame rate");
  }

  const audio = await probeAudioMetadata(inputPath, ffprobePath);

  return {
    width: Math.round(width),
    height: Math.round(height),
    durationSeconds: streamDuration ?? formatDuration ?? 0,
    frameRateExpression,
    audioStreamCount: audio.audioStreamCount,
    audioBitrate: audio.audioBitrate,
  };
}

async function probeAudioMetadata(inputPath: string, ffprobePath: string) {
  const { stdout } = await runCommand(ffprobePath, [
    "-v",
    "error",
    "-select_streams",
    "a",
    "-show_entries",
    "stream=index,bit_rate",
    "-of",
    "json",
    inputPath,
  ]);

  let parsed: unknown;

  try {
    parsed = JSON.parse(stdout) as unknown;
  } catch {
    throw new Error("Unable to parse ffprobe audio metadata output");
  }

  if (!parsed || typeof parsed !== "object") {
    return { audioStreamCount: 0, audioBitrate: null };
  }

  const streams = "streams" in parsed ? parsed.streams : null;
  const audioStreams = Array.isArray(streams) ? streams : [];
  const firstBitrate =
    audioStreams[0] && typeof audioStreams[0] === "object"
      ? parsePositiveNumber(
          "bit_rate" in audioStreams[0] ? audioStreams[0].bit_rate : null
        )
      : null;

  return {
    audioStreamCount: audioStreams.length,
    audioBitrate: firstBitrate ? Math.round(firstBitrate) : null,
  };
}

async function assertFontsDir(fontsDir: string) {
  const stats = await stat(fontsDir);

  if (!stats.isDirectory()) {
    throw new Error(`Watermark fonts directory is not a directory: ${fontsDir}`);
  }
}

async function assertNonEmptyOutput(outputPath: string) {
  const stats = await stat(outputPath);

  if (stats.size <= 0) {
    throw new Error(`Watermark output file is empty: ${outputPath}`);
  }
}

async function assertSubtitlesFilterAvailable(ffmpegPath: string) {
  const { stdout, stderr } = await runCommand(ffmpegPath, [
    "-hide_banner",
    "-h",
    "filter=subtitles",
  ]);
  const output = `${stdout}\n${stderr}`;

  if (output.includes("Unknown filter 'subtitles'")) {
    throw new Error(
      "FFmpeg subtitles/libass filter is required for the smooth bouncing watermark"
    );
  }
}

function formatAssTimestamp(seconds: number) {
  const totalCentiseconds = Math.max(0, Math.round(seconds * 100));
  const hours = Math.floor(totalCentiseconds / 360000);
  const minutes = Math.floor((totalCentiseconds % 360000) / 6000);
  const wholeSeconds = Math.floor((totalCentiseconds % 6000) / 100);
  const centiseconds = totalCentiseconds % 100;

  return `${hours}:${String(minutes).padStart(2, "0")}:${String(
    wholeSeconds
  ).padStart(2, "0")}.${String(centiseconds).padStart(2, "0")}`;
}

function escapeAssText(text: string) {
  return text
    .replace(/\\/g, "\\\\")
    .replace(/{/g, "\\{")
    .replace(/}/g, "\\}")
    .replace(/\r?\n/g, "\\N")
    .trim();
}

function escapeAssStyleValue(value: string) {
  return value.replace(/,/g, " ").trim();
}

function escapeFfmpegFilterOption(value: string) {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/:/g, "\\:")
    .replace(/'/g, "\\'")
    .replace(/,/g, "\\,")
    .replace(/\[/g, "\\[")
    .replace(/\]/g, "\\]");
}

function formatAssNumber(value: number) {
  return value.toFixed(2);
}

function formatMilliseconds(seconds: number) {
  return String(Math.max(1, Math.round(seconds * 1000)));
}

function getAudioBitrateArgument(audioBitrate: number | null) {
  if (!audioBitrate) {
    return "192k";
  }

  return `${Math.max(64, Math.round(audioBitrate / 1000))}k`;
}

export function resolveWatermarkLayout(dimensions: RenderDimensions): WatermarkLayout {
  const scaleX = dimensions.width / BASE_WIDTH;
  const scaleY = dimensions.height / BASE_HEIGHT;
  const fontScale = Math.min(scaleX, scaleY);

  return {
    dimensions,
    fontSize: Math.max(1, Math.round(BASE_FONT_SIZE * fontScale)),
    startX: BASE_START_X * scaleX,
    startY: BASE_START_Y * scaleY,
    velocityX: BASE_VELOCITY_X * scaleX,
    velocityY: BASE_VELOCITY_Y * scaleY,
    left: BASE_LEFT * scaleX,
    right: BASE_RIGHT * scaleX,
    top: BASE_TOP * scaleY,
    bottom: BASE_BOTTOM * scaleY,
  };
}

export function calculateWatermarkSegments(
  layout: WatermarkLayout,
  durationSeconds: number
): WatermarkSegment[] {
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) {
    throw new Error("Watermark duration must be a positive number");
  }

  const segments: WatermarkSegment[] = [];
  let currentTime = 0;
  let currentX = layout.startX;
  let currentY = layout.startY;
  let velocityX = layout.velocityX;
  let velocityY = layout.velocityY;

  while (currentTime < durationSeconds - MIN_SEGMENT_SECONDS) {
    const timeToVerticalBoundary =
      velocityX > 0
        ? (layout.right - currentX) / velocityX
        : (currentX - layout.left) / Math.abs(velocityX);
    const timeToHorizontalBoundary =
      velocityY > 0
        ? (layout.bottom - currentY) / velocityY
        : (currentY - layout.top) / Math.abs(velocityY);
    const nextCollisionSeconds = Math.min(
      timeToVerticalBoundary,
      timeToHorizontalBoundary
    );
    const remainingSeconds = durationSeconds - currentTime;
    const segmentDuration = Math.min(nextCollisionSeconds, remainingSeconds);

    if (!Number.isFinite(segmentDuration) || segmentDuration < MIN_SEGMENT_SECONDS) {
      break;
    }

    let endX = currentX + velocityX * segmentDuration;
    let endY = currentY + velocityY * segmentDuration;
    const endTime = currentTime + segmentDuration;
    const hitVerticalBoundary =
      nextCollisionSeconds <= remainingSeconds + COLLISION_EPSILON_SECONDS &&
      Math.abs(timeToVerticalBoundary - nextCollisionSeconds) <=
        COLLISION_EPSILON_SECONDS;
    const hitHorizontalBoundary =
      nextCollisionSeconds <= remainingSeconds + COLLISION_EPSILON_SECONDS &&
      Math.abs(timeToHorizontalBoundary - nextCollisionSeconds) <=
        COLLISION_EPSILON_SECONDS;

    if (hitVerticalBoundary) {
      endX = velocityX > 0 ? layout.right : layout.left;
    }

    if (hitHorizontalBoundary) {
      endY = velocityY > 0 ? layout.bottom : layout.top;
    }

    segments.push({
      startSeconds: currentTime,
      endSeconds: endTime,
      startX: currentX,
      startY: currentY,
      endX,
      endY,
    });

    currentTime = endTime;
    currentX = endX;
    currentY = endY;

    if (hitVerticalBoundary) {
      velocityX *= -1;
    }

    if (hitHorizontalBoundary) {
      velocityY *= -1;
    }
  }

  return segments;
}

export function buildSmoothBouncingWatermarkAss(options: {
  dimensions: RenderDimensions;
  durationSeconds: number;
  text?: string;
  fontFamily?: string;
}) {
  const text = options.text ?? DEFAULT_TEXT;
  const fontFamily =
    escapeAssStyleValue(options.fontFamily ?? DEFAULT_FONT_FAMILY) ||
    DEFAULT_FONT_FAMILY;
  const layout = resolveWatermarkLayout(options.dimensions);
  const segments = calculateWatermarkSegments(layout, options.durationSeconds);
  const escapedText = escapeAssText(text);
  const dialogueLines = segments.map((segment) => {
    const segmentDurationSeconds = segment.endSeconds - segment.startSeconds;
    const moveTag = [
      "\\an7",
      `\\frz${WATERMARK_ANGLE_DEGREES}`,
      `\\fs${layout.fontSize}`,
      `\\alpha&H${DEFAULT_ALPHA_HEX}&`,
      `\\move(${formatAssNumber(segment.startX)},${formatAssNumber(
        segment.startY
      )},${formatAssNumber(segment.endX)},${formatAssNumber(
        segment.endY
      )},0,${formatMilliseconds(segmentDurationSeconds)})`,
    ].join("");

    return `Dialogue: 10,${formatAssTimestamp(
      segment.startSeconds
    )},${formatAssTimestamp(
      segment.endSeconds
    )},Watermark,,0,0,0,,{${moveTag}}${escapedText}`;
  });

  return [
    "[Script Info]",
    "ScriptType: v4.00+",
    "WrapStyle: 2",
    "ScaledBorderAndShadow: yes",
    `PlayResX: ${options.dimensions.width}`,
    `PlayResY: ${options.dimensions.height}`,
    "",
    "[V4+ Styles]",
    "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding",
    `Style: Watermark,${fontFamily},${layout.fontSize},&H${DEFAULT_ALPHA_HEX}FFFFFF,&H${DEFAULT_ALPHA_HEX}FFFFFF,&H${DEFAULT_ALPHA_HEX}FFFFFF,&H00000000,0,0,0,0,100,100,0,0,1,0,0,7,0,0,0,1`,
    "",
    "[Events]",
    "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text",
    ...dialogueLines,
    "",
  ].join("\n");
}

function buildWatermarkFilter(options: {
  assPath: string;
  fontsDir: string;
  frameRateExpression: string;
}) {
  const subtitleFilter = [
    `filename=${escapeFfmpegFilterOption(options.assPath)}`,
    `fontsdir=${escapeFfmpegFilterOption(options.fontsDir)}`,
  ].join(":");

  return [
    `subtitles=${subtitleFilter}`,
    `fps=${options.frameRateExpression}`,
    "format=yuv420p",
  ].join(",");
}

function buildFfmpegArgs(options: {
  inputPath: string;
  outputPath: string;
  assPath: string;
  fontsDir: string;
  metadata: VideoMetadata;
  crf: string;
  preset: string;
  audioMode: "copy" | "aac";
}) {
  const filter = buildWatermarkFilter({
    assPath: options.assPath,
    fontsDir: options.fontsDir,
    frameRateExpression: options.metadata.frameRateExpression,
  });
  const audioArgs =
    options.metadata.audioStreamCount > 0
      ? options.audioMode === "copy"
        ? ["-map", "0:a?", "-c:a", "copy"]
        : [
            "-map",
            "0:a?",
            "-c:a",
            "aac",
            "-b:a",
            getAudioBitrateArgument(options.metadata.audioBitrate),
          ]
      : ["-an"];

  return [
    "-y",
    "-hide_banner",
    "-loglevel",
    "error",
    "-i",
    options.inputPath,
    "-filter_complex",
    `[0:v]${filter}[vout]`,
    "-map",
    "[vout]",
    ...audioArgs,
    "-c:v",
    "libx264",
    "-preset",
    options.preset,
    "-crf",
    options.crf,
    "-pix_fmt",
    "yuv420p",
    "-movflags",
    "+faststart",
    options.outputPath,
  ];
}

export async function addSmoothBouncingWatermark(
  inputPath: string,
  outputPath: string,
  options: SmoothBouncingWatermarkOptions = {}
) {
  if (path.resolve(inputPath) === path.resolve(outputPath)) {
    throw new Error("Watermark input and output paths must be different");
  }

  const ffmpegPath = options.ffmpegPath ?? "ffmpeg";
  const ffprobePath = options.ffprobePath ?? "ffprobe";
  const fontsDir =
    options.fontsDir ?? path.join(process.cwd(), "assets", "fonts");
  const crf = options.crf ?? DEFAULT_CRF;
  const preset = options.preset ?? DEFAULT_PRESET;
  const tempParentDir = options.workDir ?? os.tmpdir();
  const tempDir = await mkdtemp(path.join(tempParentDir, "volts24-watermark-"));
  const assPath = path.join(tempDir, "watermark.ass");

  try {
    await mkdir(path.dirname(outputPath), { recursive: true });
    await assertFontsDir(fontsDir);
    await assertSubtitlesFilterAvailable(ffmpegPath);

    const metadata = await probeVideoMetadata(inputPath, ffprobePath);
    const assFile = buildSmoothBouncingWatermarkAss({
      dimensions: { width: metadata.width, height: metadata.height },
      durationSeconds: metadata.durationSeconds,
      text: options.text,
      fontFamily: options.fontFamily,
    });

    await writeFile(assPath, assFile, "utf8");

    try {
      await runFfmpeg(
        ffmpegPath,
        buildFfmpegArgs({
          inputPath,
          outputPath,
          assPath,
          fontsDir,
          metadata,
          crf,
          preset,
          audioMode: "copy",
        })
      );
    } catch (copyError) {
      await rm(outputPath, { force: true });

      try {
        await runFfmpeg(
          ffmpegPath,
          buildFfmpegArgs({
            inputPath,
            outputPath,
            assPath,
            fontsDir,
            metadata,
            crf,
            preset,
            audioMode: "aac",
          })
        );
      } catch (aacError) {
        throw new Error(
          [
            "FFmpeg failed to add smooth bouncing watermark.",
            `Audio copy error: ${
              copyError instanceof Error ? copyError.message : String(copyError)
            }`,
            `AAC fallback error: ${
              aacError instanceof Error ? aacError.message : String(aacError)
            }`,
          ].join("\n")
        );
      }
    }

    await assertNonEmptyOutput(outputPath);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}
