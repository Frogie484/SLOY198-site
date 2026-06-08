import { randomUUID } from "node:crypto";
import { extname } from "node:path";
import {
  del,
  issueSignedToken,
  presignUrl
} from "@vercel/blob";
import {
  ensureBlobConfigured,
  getBlobCommandOptions
} from "./blob-schedule-adapter.js";
import { createHttpError } from "./http.js";

const UPLOAD_URL_LIFETIME = 15 * 60 * 1000;
const PLAYBACK_URL_LIFETIME = 10 * 60 * 1000;
const MAX_VIDEO_SIZE = 2 * 1024 * 1024 * 1024;
const VIDEO_TYPES = ["video/mp4", "video/webm", "video/quicktime"];

export const createPrivateVideoUpload = async (
  lessonId,
  file,
  blobClient = { issueSignedToken, presignUrl }
) => {
  ensureBlobConfigured();
  const contentType = normalizeVideoType(file.contentType, file.fileName);
  const size = Number(file.size);
  if (!VIDEO_TYPES.includes(contentType) || !Number.isFinite(size) || size <= 0) {
    throw createHttpError("Выберите видео MP4, WebM или MOV.", 400);
  }
  if (size > MAX_VIDEO_SIZE) {
    throw createHttpError("Размер видео не должен превышать 2 ГБ.", 413);
  }

  const extension = safeVideoExtension(file.fileName, contentType);
  const videoPath = `sloy198/private/courses/${lessonId}/${randomUUID()}${extension}`;
  const validUntil = Date.now() + UPLOAD_URL_LIFETIME;
  const signedToken = await blobClient.issueSignedToken({
    pathname: videoPath,
    operations: ["put"],
    validUntil,
    allowedContentTypes: [contentType],
    maximumSizeInBytes: MAX_VIDEO_SIZE,
    ...getBlobCommandOptions()
  });
  const { presignedUrl } = await blobClient.presignUrl(signedToken, {
    access: "private",
    operation: "put",
    pathname: videoPath,
    validUntil,
    allowedContentTypes: [contentType],
    maximumSizeInBytes: MAX_VIDEO_SIZE,
    allowOverwrite: false,
    addRandomSuffix: false
  });

  return { uploadUrl: presignedUrl, videoPath, contentType, expiresAt: validUntil };
};

export const createPrivateVideoPlayback = async (
  videoPath,
  blobClient = { issueSignedToken, presignUrl }
) => {
  ensureBlobConfigured();
  const validUntil = Date.now() + PLAYBACK_URL_LIFETIME;
  const signedToken = await blobClient.issueSignedToken({
    pathname: videoPath,
    operations: ["get"],
    validUntil,
    ...getBlobCommandOptions()
  });
  const { presignedUrl } = await blobClient.presignUrl(signedToken, {
    access: "private",
    operation: "get",
    pathname: videoPath,
    validUntil
  });
  return { url: presignedUrl, expiresAt: validUntil };
};

export const deletePrivateVideos = async (paths, blobClient = { del }) => {
  const existingPaths = [...new Set((Array.isArray(paths) ? paths : [paths]).filter(Boolean))];
  if (existingPaths.length === 0) {
    return;
  }
  try {
    ensureBlobConfigured();
    await blobClient.del(existingPaths, getBlobCommandOptions());
  } catch (error) {
    console.error("Не удалось удалить private Blob:", error);
  }
};

const safeVideoExtension = (fileName, contentType) => {
  const extension = extname(String(fileName || "")).toLowerCase();
  if ([".mp4", ".webm", ".mov"].includes(extension)) {
    return extension;
  }
  return contentType === "video/webm" ? ".webm" : contentType === "video/quicktime" ? ".mov" : ".mp4";
};

const normalizeVideoType = (contentType, fileName) => {
  const provided = String(contentType || "").toLowerCase();
  if (VIDEO_TYPES.includes(provided)) {
    return provided;
  }
  const extension = extname(String(fileName || "")).toLowerCase();
  if (extension === ".webm") {
    return "video/webm";
  }
  if (extension === ".mov") {
    return "video/quicktime";
  }
  return extension === ".mp4" ? "video/mp4" : provided;
};
