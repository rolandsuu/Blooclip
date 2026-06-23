"use client";

import { useUploadSession } from "./use-upload-session";
import {
  AppHeader,
  RecentJobs,
  UploadProgressList,
} from "./upload-workspace-ui";

export function HistoryWorkspace() {
  const historySession = useUploadSession();

  return (
    <main className="min-h-screen bg-[#f6f7fb] text-[#11131a]">
      <AppHeader
        navLink={{
          href: "/",
          label: "上传视频",
        }}
      />

      <RecentJobs
        items={historySession.videoHistory}
        isLoading={historySession.isLoadingHistory}
        message={historySession.historyMessage}
        activeBatchId={historySession.activeBatchId}
        activeContent={
          historySession.activeBatchId ? (
            <UploadProgressList
              items={historySession.uploadItems}
              batchStatus={historySession.batchStatus}
              statusMessage={historySession.batchStatusMessage}
              downloadingVideoId={historySession.downloadingVideoId}
              downloadingInstructionPdfId={
                historySession.downloadingInstructionPdfId
              }
              retryingVideoId={historySession.retryingVideoId}
              onDownloadVideo={historySession.downloadVideo}
              onDownloadInstructionPdf={historySession.downloadInstructionPdf}
              onRetryProcessing={historySession.retryProcessing}
              layout="drawer"
            />
          ) : null
        }
        showEmptyState
        onSelect={historySession.openHistoryBatch}
      />
    </main>
  );
}
