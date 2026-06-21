export type ProcessingDisplayInput = {
  status?: string | null;
  currentStage?: string | null;
  progress?: number | null;
  errorMessage?: string | null;
};

export type ProcessingDisplayTone =
  | "idle"
  | "loading"
  | "active"
  | "success"
  | "error"
  | "canceled";

export type ProcessingDisplay = {
  title: string;
  detail: string;
  statusLabel: string;
  progress: number;
  tone: ProcessingDisplayTone;
  stageKey: string;
};

type StageCopy = {
  title: string;
  detail: string;
};

const STAGE_COPY: Record<string, StageCopy> = {
  created: {
    title: "Waiting for your video",
    detail: "Add a video and prompt when you are ready.",
  },
  uploaded: {
    title: "Ready to start",
    detail: "The upload is ready. Blooclip can begin the AI work.",
  },
  queued: {
    title: "Waiting for AI worker",
    detail: "Your video is in line and will start soon.",
  },
  downloading_source: {
    title: "Opening your video",
    detail: "Blooclip is loading the source file for processing.",
  },
  extracting_audio: {
    title: "Listening to the audio",
    detail: "Blooclip is separating the sound from the video.",
  },
  transcribing_audio: {
    title: "Writing the transcript",
    detail: "AI is turning the spoken audio into text.",
  },
  transcript_ready: {
    title: "Transcript ready",
    detail: "The speech text is ready for the next AI step.",
  },
  analyzing_video_events: {
    title: "Finding key moments",
    detail: "AI is looking for the important actions in the video.",
  },
  video_event_analysis_ready: {
    title: "Key moments found",
    detail: "The main events are ready for editing decisions.",
  },
  sampling_frames: {
    title: "Taking visual snapshots",
    detail: "Blooclip is grabbing frames so AI can inspect the scene.",
  },
  analyzing_visuals: {
    title: "Understanding your video",
    detail: "AI is reading the visual details and action sequence.",
  },
  visual_analysis_ready: {
    title: "Visual understanding ready",
    detail: "The video scene analysis is ready for planning.",
  },
  planning_segments: {
    title: "Planning the edit",
    detail: "AI is choosing the best parts for the final tutorial.",
  },
  edit_plan_ready: {
    title: "Edit plan ready",
    detail: "The cut list and timing plan are ready.",
  },
  writing_instruction_document: {
    title: "Writing the instruction guide",
    detail: "AI is building the step-by-step document.",
  },
  instruction_document_ready: {
    title: "Instruction guide ready",
    detail: "The document and PDF are ready for download soon.",
  },
  writing_script: {
    title: "Writing the voiceover",
    detail: "AI is preparing the narration script.",
  },
  generating_voiceover: {
    title: "Generating the voiceover",
    detail: "Blooclip is creating the narrated audio track.",
  },
  building_subtitles: {
    title: "Building subtitles",
    detail: "Blooclip is timing the captions to the voiceover.",
  },
  voiceover_subtitles_ready: {
    title: "Voiceover and subtitles ready",
    detail: "The narration and captions are ready for rendering.",
  },
  cutting_clips: {
    title: "Cutting the clips",
    detail: "Blooclip is assembling the selected video moments.",
  },
  rendering_final: {
    title: "Rendering final video",
    detail: "Blooclip is combining video, voiceover, and subtitles.",
  },
  uploading_final: {
    title: "Saving final video",
    detail: "Blooclip is uploading the finished MP4.",
  },
  completed: {
    title: "Final video ready",
    detail: "The AI processing is complete.",
  },
  canceled: {
    title: "Processing canceled",
    detail: "This job was stopped before it finished.",
  },
  upload_failed: {
    title: "Upload failed",
    detail: "The video did not finish uploading. Try again with a new upload.",
  },
};

function normalize(value: string | null | undefined) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function clampProgress(progress: number | null | undefined) {
  if (typeof progress !== "number" || !Number.isFinite(progress)) {
    return 0;
  }

  return Math.max(0, Math.min(100, Math.round(progress)));
}

function getStatusLabel(tone: ProcessingDisplayTone) {
  switch (tone) {
    case "active":
      return "Working";
    case "success":
      return "Done";
    case "error":
      return "Needs attention";
    case "canceled":
      return "Canceled";
    case "loading":
      return "Loading";
    case "idle":
      return "Waiting";
  }
}

function buildDisplay(
  input: ProcessingDisplayInput,
  copy: StageCopy,
  tone: ProcessingDisplayTone,
  progressOverride?: number
): ProcessingDisplay {
  const status = normalize(input.status) || "unknown";
  const stage = normalize(input.currentStage) || "none";

  return {
    ...copy,
    statusLabel: getStatusLabel(tone),
    progress:
      typeof progressOverride === "number"
        ? progressOverride
        : clampProgress(input.progress),
    tone,
    stageKey: `${status}:${stage}:${tone}`,
  };
}

export function getProcessingDisplay(
  input: ProcessingDisplayInput
): ProcessingDisplay {
  const status = normalize(input.status);
  const stage = normalize(input.currentStage);

  if (!status || status === "loading") {
    return buildDisplay(
      input,
      {
        title: "Loading status",
        detail: "Checking the latest processing update.",
      },
      "loading"
    );
  }

  if (stage === "upload_failed" || status === "upload_failed") {
    return buildDisplay(input, STAGE_COPY.upload_failed, "error");
  }

  if (status === "failed") {
    return buildDisplay(
      input,
      {
        title: "Processing failed",
        detail:
          input.errorMessage?.trim() ||
          "Blooclip could not finish this video.",
      },
      "error"
    );
  }

  if (stage === "canceled" || status === "canceled") {
    return buildDisplay(input, STAGE_COPY.canceled, "canceled");
  }

  if (stage === "completed" || status === "completed") {
    return buildDisplay(input, STAGE_COPY.completed, "success", 100);
  }

  const stageCopy = STAGE_COPY[stage] ?? STAGE_COPY[status];

  if (stageCopy) {
    const tone = status === "created" ? "idle" : "active";

    return buildDisplay(input, stageCopy, tone);
  }

  return buildDisplay(
    input,
    {
      title: "AI is working",
      detail: "Blooclip is processing this video.",
    },
    status === "queued" || status === "processing" ? "active" : "idle"
  );
}
