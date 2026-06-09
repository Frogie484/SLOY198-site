import { createHttpError } from "./http.js";

const isHttpUrl = (value) => {
  try {
    return ["http:", "https:"].includes(new URL(value).protocol);
  } catch {
    return false;
  }
};

const isSupportedVideoUrl = (value) => {
  try {
    const url = new URL(value);
    const host = url.hostname.replace(/^www\./, "");
    if (host === "youtu.be") {
      return /^[a-zA-Z0-9_-]{6,}$/.test(url.pathname.slice(1));
    }
    if (host === "youtube.com" || host === "m.youtube.com") {
      const videoId = url.pathname.startsWith("/embed/")
        ? url.pathname.split("/")[2]
        : url.searchParams.get("v");
      return /^[a-zA-Z0-9_-]{6,}$/.test(videoId || "");
    }
    if (host === "vimeo.com" || host === "player.vimeo.com") {
      const videoId = url.pathname.split("/").filter(Boolean).pop();
      return /^\d+$/.test(videoId || "");
    }
    return false;
  } catch {
    return false;
  }
};

export const validateCourse = (body, partial = false) => {
  const result = {};
  if (!partial || body.title !== undefined) {
    result.title = String(body.title || "").trim();
    if (result.title.length < 2) {
      throw createHttpError("Укажите название курса.", 400);
    }
  }
  for (const field of ["shortDescription", "fullDescription", "coverImageUrl", "videoUrl"]) {
    if (!partial || body[field] !== undefined) {
      result[field] = String(body[field] || "").trim();
    }
  }
  if (result.coverImageUrl && !isHttpUrl(result.coverImageUrl)) {
    throw createHttpError("Укажите корректную ссылку на обложку курса.", 400);
  }
  if (result.videoUrl && !isSupportedVideoUrl(result.videoUrl)) {
    throw createHttpError("Поддерживаются только ссылки YouTube или Vimeo.", 400);
  }
  if (!partial || body.price !== undefined) {
    result.price = Number(body.price) || 0;
    if (result.price < 0) {
      throw createHttpError("Стоимость курса не может быть отрицательной.", 400);
    }
  }
  if (!partial || body.status !== undefined) {
    if (!["draft", "published"].includes(body.status)) {
      throw createHttpError("Некорректный статус курса.", 400);
    }
    result.status = body.status;
  }
  return result;
};

export const validateLesson = (body, partial = false) => {
  const result = {};
  if (!partial || body.courseId !== undefined) {
    result.courseId = String(body.courseId || "").trim();
    if (!result.courseId) {
      throw createHttpError("Не указан курс.", 400);
    }
  }
  if (!partial || body.title !== undefined) {
    result.title = String(body.title || "").trim();
    if (result.title.length < 2) {
      throw createHttpError("Укажите название урока.", 400);
    }
  }
  for (const field of ["description", "videoPath"]) {
    if (body[field] !== undefined) {
      result[field] = String(body[field] || "").trim();
    }
  }
  if (body.published !== undefined) {
    result.published = Boolean(body.published);
  } else if (!partial) {
    result.published = false;
  }
  return result;
};
