import PDFDocument from "pdfkit";
import { createWriteStream } from "node:fs";
import path from "node:path";

import type { InstructionDocumentArtifact } from "./instruction-document";

export type InstructionDocumentPdfFrameAsset = {
  stepIndex: number;
  filePath: string;
  timestampSeconds: number;
};

export type RenderInstructionDocumentPdfOptions = {
  document: InstructionDocumentArtifact;
  frameAssets: InstructionDocumentPdfFrameAsset[];
  outputPath: string;
};

const PAGE_SIZE = "A4";
const PAGE_MARGIN = 44;
const CONTENT_WIDTH = 595.28 - PAGE_MARGIN * 2;
const STEP_MIN_HEIGHT = 370;
const STEP_IMAGE_MAX_HEIGHT = 220;
const FONT_PATH = path.join(
  process.cwd(),
  "assets",
  "fonts",
  "NotoSansCJKsc-Regular.otf"
);
const FONT_NAME = "NotoSansCJK";

const COLORS = {
  ink: "#172033",
  muted: "#637083",
  faint: "#f5f7fb",
  line: "#d7dde8",
  primary: "#18223b",
  primarySoft: "#e9eef8",
  caution: "#fff7df",
  cautionLine: "#e3b245",
  checklist: "#eaf7ef",
  checklistLine: "#45a866",
} as const;

type LocalizedPdfCopy = {
  guideLabel: string;
  equipmentName: string;
  overview: string;
  safetyPrecautions: string;
  requiredTools: string;
  steps: string;
  purpose: string;
  procedure: string;
  inspection: string;
  notes: string;
  finalChecklist: string;
  maintenance: string;
  page: (pageNumber: number, pageCount: number) => string;
};

function isChineseTargetLanguage(targetLanguage: string) {
  const normalized = targetLanguage.trim().toLowerCase().replace(/_/g, "-");

  return (
    normalized === "zh" ||
    normalized.startsWith("zh-") ||
    targetLanguage.trim() === "中文"
  );
}

function getLocalizedCopy(targetLanguage: string): LocalizedPdfCopy {
  if (isChineseTargetLanguage(targetLanguage)) {
    return {
      guideLabel: "客户操作指南",
      equipmentName: "设备名称",
      overview: "概览",
      safetyPrecautions: "安全注意事项",
      requiredTools: "所需工具与部件",
      steps: "操作/安装程序",
      purpose: "目标",
      procedure: "操作",
      inspection: "检验标准",
      notes: "重要提示",
      finalChecklist: "完成检查清单",
      maintenance: "维护建议",
      page: (pageNumber, pageCount) => `第 ${pageNumber} 页 / 共 ${pageCount} 页`,
    };
  }

  return {
    guideLabel: "Customer Operation Manual",
    equipmentName: "Equipment Name",
    overview: "Overview",
    safetyPrecautions: "Safety Precautions",
    requiredTools: "Required Tools and Components",
    steps: "Operating / Installation Procedure",
    purpose: "Purpose",
    procedure: "Procedure",
    inspection: "Inspection Criteria",
    notes: "Important Notes",
    finalChecklist: "Final Inspection Checklist",
    maintenance: "Maintenance Recommendations",
    page: (pageNumber, pageCount) => `Page ${pageNumber} of ${pageCount}`,
  };
}

function ensureSpace(doc: PDFKit.PDFDocument, height: number) {
  if (!doc.page) {
    doc.addPage();
    return;
  }

  if (doc.y + height > doc.page.height - PAGE_MARGIN - 34) {
    doc.addPage();
  }
}

function setFont(
  doc: PDFKit.PDFDocument,
  options: { size: number; color?: string }
) {
  doc.font(FONT_NAME).fontSize(options.size).fillColor(options.color ?? COLORS.ink);
}

function addSectionHeading(doc: PDFKit.PDFDocument, title: string) {
  ensureSpace(doc, 38);
  const x = PAGE_MARGIN;
  const y = doc.y + 4;

  doc
    .roundedRect(x, y, 5, 22, 2)
    .fill(COLORS.primary)
    .fillColor(COLORS.ink);
  setFont(doc, { size: 15 });
  doc.text(title, x + 14, y - 1, {
    width: CONTENT_WIDTH - 14,
    lineGap: 1,
  });
  doc.y = y + 32;
}

function addParagraph(
  doc: PDFKit.PDFDocument,
  text: string,
  options: { size?: number; color?: string; gapAfter?: number } = {}
) {
  const size = options.size ?? 10.5;
  const gapAfter = options.gapAfter ?? 10;
  const height = doc.heightOfString(text, {
    width: CONTENT_WIDTH,
    lineGap: 3,
  });

  ensureSpace(doc, height + gapAfter);
  setFont(doc, { size, color: options.color });
  doc.text(text, PAGE_MARGIN, doc.y, {
    width: CONTENT_WIDTH,
    lineGap: 3,
  });
  doc.moveDown(gapAfter / 12);
}

function addBulletList(
  doc: PDFKit.PDFDocument,
  items: readonly string[],
  options: {
    background?: string;
    lineColor?: string;
    title?: string;
    emptyText?: string;
  } = {}
) {
  if (items.length === 0 && !options.emptyText) {
    return;
  }

  const bulletItems = items.length > 0 ? items : [options.emptyText ?? ""];
  const titleHeight = options.title ? 19 : 0;
  const itemHeights = bulletItems.map((item) =>
    doc.heightOfString(`- ${item}`, {
      width: CONTENT_WIDTH - 32,
      lineGap: 3,
    })
  );
  const boxHeight =
    titleHeight + itemHeights.reduce((sum, height) => sum + height + 7, 0) + 18;

  ensureSpace(doc, boxHeight + 10);

  const x = PAGE_MARGIN;
  const y = doc.y;

  if (options.background) {
    doc.roundedRect(x, y, CONTENT_WIDTH, boxHeight, 7).fill(options.background);
    if (options.lineColor) {
      doc
        .roundedRect(x, y, CONTENT_WIDTH, boxHeight, 7)
        .lineWidth(1)
        .stroke(options.lineColor);
    }
  }

  let currentY = y + 11;

  if (options.title) {
    setFont(doc, { size: 11.5, color: COLORS.ink });
    doc.text(options.title, x + 16, currentY, {
      width: CONTENT_WIDTH - 32,
      lineGap: 2,
    });
    currentY += titleHeight;
  }

  setFont(doc, { size: 10, color: COLORS.ink });

  for (const item of bulletItems) {
    const bulletText = `- ${item}`;

    doc.text(bulletText, x + 16, currentY, {
      width: CONTENT_WIDTH - 32,
      lineGap: 3,
    });
    currentY +=
      doc.heightOfString(bulletText, {
        width: CONTENT_WIDTH - 32,
        lineGap: 3,
      }) + 7;
  }

  doc.y = y + boxHeight + 12;
}

function addStepImage(doc: PDFKit.PDFDocument, filePath: string) {
  const maxHeight = STEP_IMAGE_MAX_HEIGHT;

  ensureSpace(doc, maxHeight + 18);

  const x = PAGE_MARGIN;
  const y = doc.y;

  doc
    .roundedRect(x, y, CONTENT_WIDTH, maxHeight + 10, 8)
    .fill("#ffffff")
    .stroke(COLORS.line);
  doc.image(filePath, x + 8, y + 5, {
    fit: [CONTENT_WIDTH - 16, maxHeight],
    align: "center",
    valign: "center",
  });
  doc.y = y + maxHeight + 24;
}

function addCover(doc: PDFKit.PDFDocument, options: {
  document: InstructionDocumentArtifact;
  copy: LocalizedPdfCopy;
}) {
  const { document, copy } = options;

  doc.rect(0, 0, doc.page.width, 174).fill(COLORS.primary);
  setFont(doc, { size: 13, color: "#ffffff" });
  doc.text(copy.guideLabel, PAGE_MARGIN, 52, {
    width: CONTENT_WIDTH,
    lineGap: 2,
  });
  setFont(doc, { size: 26, color: "#ffffff" });
  doc.text(document.title, PAGE_MARGIN, 78, {
    width: CONTENT_WIDTH,
    lineGap: 4,
  });
  doc.y = 205;

  addSectionHeading(doc, copy.equipmentName);
  addParagraph(doc, document.title, { size: 12, gapAfter: 18 });
  addSectionHeading(doc, copy.overview);
  addParagraph(doc, document.overview, { size: 11.5, gapAfter: 16 });
}

function addFooters(doc: PDFKit.PDFDocument, copy: LocalizedPdfCopy) {
  const range = doc.bufferedPageRange();
  const pageCount = range.count;

  for (
    let pageIndex = range.start;
    pageIndex < range.start + range.count;
    pageIndex += 1
  ) {
    doc.switchToPage(pageIndex);
    const footerY = doc.page.height - PAGE_MARGIN - 18;

    doc
      .moveTo(PAGE_MARGIN, footerY - 10)
      .lineTo(doc.page.width - PAGE_MARGIN, footerY - 10)
      .lineWidth(0.5)
      .stroke(COLORS.line);
    setFont(doc, { size: 8.5, color: COLORS.muted });
    doc.text(copy.guideLabel, PAGE_MARGIN, footerY, {
      width: CONTENT_WIDTH / 2,
      lineGap: 1,
      continued: false,
    });
    doc.text(copy.page(pageIndex + 1, pageCount), PAGE_MARGIN, footerY, {
      width: CONTENT_WIDTH,
      align: "right",
      lineGap: 1,
    });
  }
}

export async function renderInstructionDocumentPdf({
  document,
  frameAssets,
  outputPath,
}: RenderInstructionDocumentPdfOptions) {
  const copy = getLocalizedCopy(document.targetLanguage);
  const frameAssetByStepIndex = new Map(
    frameAssets.map((asset) => [asset.stepIndex, asset])
  );

  await new Promise<void>((resolve, reject) => {
    const doc = new PDFDocument({
      size: PAGE_SIZE,
      margin: PAGE_MARGIN,
      font: FONT_PATH,
      bufferPages: true,
      autoFirstPage: true,
      info: {
        Title: document.title,
        Subject: copy.guideLabel,
        Creator: "Blooclip",
      },
    });
    const output = createWriteStream(outputPath);

    output.on("finish", resolve);
    output.on("error", reject);
    doc.on("error", reject);
    doc.pipe(output);
    doc.registerFont(FONT_NAME, FONT_PATH);

    addCover(doc, { document, copy });
    doc.addPage();

    addSectionHeading(doc, copy.safetyPrecautions);
    addBulletList(doc, document.safetyPrecautions, {
      background: COLORS.checklist,
      lineColor: COLORS.checklistLine,
    });

    if (document.requiredToolsAndComponents.length > 0) {
      addSectionHeading(doc, copy.requiredTools);
      addBulletList(doc, document.requiredToolsAndComponents, {
        background: COLORS.primarySoft,
      });
    }

    addSectionHeading(doc, copy.steps);

    for (const step of document.steps) {
      const frameAsset = frameAssetByStepIndex.get(step.stepIndex);

      ensureSpace(doc, STEP_MIN_HEIGHT);
      setFont(doc, { size: 17, color: COLORS.ink });
      doc.text(`${step.stepIndex}. ${step.title}`, PAGE_MARGIN, doc.y, {
        width: CONTENT_WIDTH,
        lineGap: 2,
      });
      doc.moveDown(0.35);
      setFont(doc, { size: 9.5, color: COLORS.muted });
      doc.text(`${copy.purpose}:`, PAGE_MARGIN, doc.y, {
        width: CONTENT_WIDTH,
        lineGap: 1,
      });
      doc.moveDown(0.35);
      addParagraph(doc, step.purpose, { size: 11, gapAfter: 10 });

      setFont(doc, { size: 9.5, color: COLORS.muted });
      doc.text(`${copy.procedure}:`, PAGE_MARGIN, doc.y, {
        width: CONTENT_WIDTH,
        lineGap: 1,
      });
      doc.moveDown(0.75);

      if (frameAsset) {
        addStepImage(doc, frameAsset.filePath);
      }

      addParagraph(doc, step.procedure, { size: 11, gapAfter: 10 });
      addBulletList(doc, step.inspectionCriteria, {
        title: copy.inspection,
        background: COLORS.caution,
        lineColor: COLORS.cautionLine,
      });

      if (step.importantNotes.length > 0) {
        addBulletList(doc, step.importantNotes, {
          title: copy.notes,
          background: COLORS.primarySoft,
          lineColor: COLORS.primary,
        });
      }
    }

    addSectionHeading(doc, copy.finalChecklist);
    addBulletList(doc, document.finalInspectionChecklist, {
      background: COLORS.checklist,
      lineColor: COLORS.checklistLine,
    });

    if (document.maintenanceRecommendations.length > 0) {
      addSectionHeading(doc, copy.maintenance);
      addBulletList(doc, document.maintenanceRecommendations, {
        background: COLORS.primarySoft,
        lineColor: COLORS.primary,
      });
    }

    addFooters(doc, copy);
    doc.end();
  });
}
