import assert from "node:assert/strict";
import test from "node:test";

import {
  completeBatchUpload,
  createUploadSession,
  type ClientUploadRequestFile,
} from "./client-api.ts";

type CapturedRequest = {
  input: RequestInfo | URL;
  init: RequestInit | undefined;
  body: unknown;
};

const upload: ClientUploadRequestFile = {
  filename: "clip.mp4",
  contentType: "video/mp4",
  size: 1024,
};

function okJson(value: unknown) {
  return new Response(JSON.stringify(value), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
    },
  });
}

function mockFetch(response: Response, requests: CapturedRequest[]) {
  const originalFetch = globalThis.fetch;

  globalThis.fetch = async (input, init) => {
    const body =
      typeof init?.body === "string" ? JSON.parse(init.body) : undefined;

    requests.push({
      input,
      init,
      body,
    });

    return response.clone();
  };

  return () => {
    globalThis.fetch = originalFetch;
  };
}

function uploadSessionResponse() {
  return {
    batchId: "batch-1",
    statusUrl: "/video-batches/batch-1",
    totalVideos: 1,
    videos: [
      {
        videoId: "video-1",
        uploadUrl: "https://upload.test/video-1",
        filename: "clip.mp4",
        batchPosition: 0,
      },
    ],
  };
}

test("createUploadSession omits prompt when it is empty", async () => {
  for (const prompt of [null, undefined, "", "   "]) {
    const requests: CapturedRequest[] = [];
    const restoreFetch = mockFetch(okJson(uploadSessionResponse()), requests);

    try {
      await createUploadSession([upload], prompt, "zh");
    } finally {
      restoreFetch();
    }

    assert.equal(requests.length, 1);
    assert.deepEqual(requests[0].body, {
      targetLanguage: "zh",
      videos: [
        {
          filename: "clip.mp4",
          contentType: "video/mp4",
          size: 1024,
        },
      ],
    });
  }
});

test("createUploadSession trims and sends custom prompts", async () => {
  const requests: CapturedRequest[] = [];
  const restoreFetch = mockFetch(okJson(uploadSessionResponse()), requests);

  try {
    await createUploadSession([upload], "  Make a concise tutorial  ", "zh");
  } finally {
    restoreFetch();
  }

  assert.deepEqual(requests[0].body, {
    targetLanguage: "zh",
    prompt: "Make a concise tutorial",
    videos: [
      {
        filename: "clip.mp4",
        contentType: "video/mp4",
        size: 1024,
      },
    ],
  });
});

test("completeBatchUpload omits empty prompts", async () => {
  const requests: CapturedRequest[] = [];
  const restoreFetch = mockFetch(okJson({ queuedCount: 1 }), requests);

  try {
    await completeBatchUpload("batch-1", "   ");
  } finally {
    restoreFetch();
  }

  assert.equal(requests[0].input, "/api/video-batches/batch-1/complete-upload");
  assert.deepEqual(requests[0].body, {});
});

test("completeBatchUpload trims and sends custom prompts", async () => {
  const requests: CapturedRequest[] = [];
  const restoreFetch = mockFetch(okJson({ queuedCount: 1 }), requests);

  try {
    await completeBatchUpload("batch-1", "  Make a concise tutorial  ");
  } finally {
    restoreFetch();
  }

  assert.deepEqual(requests[0].body, {
    prompt: "Make a concise tutorial",
  });
});
