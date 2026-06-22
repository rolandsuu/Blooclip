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
    title: "等待你的视频",
    detail: "准备好后添加视频和提示词。",
  },
  selected: {
    title: "已选择视频",
    detail: "确认视频后发送给 Blooclip。",
  },
  uploaded: {
    title: "准备开始",
    detail: "上传已准备好，Blooclip 可以开始 AI 处理。",
  },
  creating_upload: {
    title: "正在准备上传",
    detail: "Blooclip 正在为视频创建安全上传链接。",
  },
  uploading: {
    title: "正在上传视频",
    detail: "浏览器正在把已选择的视频发送到存储。",
  },
  marking_failed: {
    title: "正在保存上传错误",
    detail: "Blooclip 正在记录需要重试的上传。",
  },
  queueing: {
    title: "正在启动 AI 处理",
    detail: "已上传的视频正在发送给 AI 处理器。",
  },
  redirecting: {
    title: "正在打开批量状态",
    detail: "Blooclip 正在打开后续处理页面。",
  },
  queued: {
    title: "等待 AI 处理器",
    detail: "你的视频正在排队，很快会开始处理。",
  },
  downloading_source: {
    title: "正在打开视频",
    detail: "Blooclip 正在加载源文件用于处理。",
  },
  extracting_audio: {
    title: "正在读取音频",
    detail: "Blooclip 正在从视频中分离声音。",
  },
  transcribing_audio: {
    title: "正在生成转写",
    detail: "AI 正在把语音转换成文字。",
  },
  transcript_ready: {
    title: "转写已完成",
    detail: "语音文字已准备好进入下一步 AI 处理。",
  },
  analyzing_video_events: {
    title: "正在寻找关键时刻",
    detail: "AI 正在识别视频里的重要动作。",
  },
  video_event_analysis_ready: {
    title: "关键时刻已找到",
    detail: "主要事件已准备好用于剪辑决策。",
  },
  sampling_frames: {
    title: "正在截取画面",
    detail: "Blooclip 正在提取画面，让 AI 理解场景。",
  },
  analyzing_visuals: {
    title: "正在理解视频",
    detail: "AI 正在读取画面细节和动作顺序。",
  },
  visual_analysis_ready: {
    title: "画面理解已完成",
    detail: "视频场景分析已准备好用于规划。",
  },
  planning_segments: {
    title: "正在规划剪辑",
    detail: "AI 正在选择最适合最终教程的片段。",
  },
  edit_plan_ready: {
    title: "剪辑计划已完成",
    detail: "剪辑列表和时间安排已准备好。",
  },
  writing_instruction_document: {
    title: "正在生成操作 PDF",
    detail: "AI 正在整理分步骤说明并生成 PDF。",
  },
  instruction_document_ready: {
    title: "操作 PDF 已完成",
    detail: "PDF 很快可以下载。",
  },
  writing_script: {
    title: "正在编写旁白",
    detail: "AI 正在准备解说脚本。",
  },
  generating_voiceover: {
    title: "正在生成旁白",
    detail: "Blooclip 正在创建解说音轨。",
  },
  building_subtitles: {
    title: "正在制作字幕",
    detail: "Blooclip 正在把字幕和旁白对齐。",
  },
  voiceover_subtitles_ready: {
    title: "旁白和字幕已完成",
    detail: "解说和字幕已准备好进入渲染。",
  },
  cutting_clips: {
    title: "正在剪辑片段",
    detail: "Blooclip 正在组装选中的视频时刻。",
  },
  rendering_final: {
    title: "正在渲染最终视频",
    detail: "Blooclip 正在合成视频、旁白和字幕。",
  },
  uploading_final: {
    title: "正在保存最终视频",
    detail: "Blooclip 正在上传完成的 MP4。",
  },
  completed: {
    title: "最终视频已完成",
    detail: "AI 处理已完成。",
  },
  canceled: {
    title: "处理已取消",
    detail: "这个任务在完成前已停止。",
  },
  upload_failed: {
    title: "上传失败",
    detail: "视频没有成功上传。请重新选择视频后再试。",
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
      return "处理中";
    case "success":
      return "完成";
    case "error":
      return "需要处理";
    case "canceled":
      return "已取消";
    case "loading":
      return "加载中";
    case "idle":
      return "等待中";
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
        title: "正在加载状态",
        detail: "正在检查最新处理进度。",
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
        title: "处理失败",
        detail: "Blooclip 没能完成这个视频。请重新上传后再试。",
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
      title: "AI 正在处理",
      detail: "Blooclip 正在处理这个视频。",
    },
    status === "queued" || status === "processing" ? "active" : "idle"
  );
}
