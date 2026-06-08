import { createHttpError } from "./http.js";

export const validateCourse = (body, partial = false) => {
  const result = {};
  if (!partial || body.title !== undefined) {
    result.title = String(body.title || "").trim();
    if (result.title.length < 2) {
      throw createHttpError("Укажите название курса.", 400);
    }
  }
  for (const field of ["description", "previewImageUrl"]) {
    if (!partial || body[field] !== undefined) {
      result[field] = String(body[field] || "").trim();
    }
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
