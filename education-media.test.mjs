import assert from "node:assert/strict";
import test from "node:test";
import {
  createPrivateVideoPlayback,
  createPrivateVideoUpload
} from "./server/vercel/education-media.js";

test("private video helpers scope signed URLs to one exact pathname", async () => {
  process.env.BLOB_STORE_ID = "store_test";
  const calls = [];
  const blobClient = {
    async issueSignedToken(options) {
      calls.push(["token", options]);
      return {
        clientSigningToken: "client",
        delegationToken: "delegation",
        validUntil: options.validUntil
      };
    },
    async presignUrl(token, options) {
      calls.push(["url", options]);
      return { presignedUrl: `https://blob.example/${options.pathname}` };
    }
  };

  const upload = await createPrivateVideoUpload("lesson-1", {
    fileName: "lesson.mp4",
    contentType: "video/mp4",
    size: 1024
  }, blobClient);
  assert.match(upload.videoPath, /^sloy198\/private\/courses\/lesson-1\/.+\.mp4$/);
  assert.equal(calls[0][1].pathname, upload.videoPath);
  assert.deepEqual(calls[0][1].operations, ["put"]);
  assert.equal(calls[1][1].access, "private");

  calls.length = 0;
  const playback = await createPrivateVideoPlayback(upload.videoPath, blobClient);
  assert.match(playback.url, /^https:\/\/blob\.example\//);
  assert.deepEqual(calls[0][1].operations, ["get"]);
  assert.equal(calls[0][1].pathname, upload.videoPath);
  assert.equal(calls[1][1].access, "private");

  delete process.env.BLOB_STORE_ID;
});
