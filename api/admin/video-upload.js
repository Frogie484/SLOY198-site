import { createPrivateVideoUpload } from "../../server/vercel/education-media.js";
import {
  createApiHandler,
  createHttpError,
  readJsonBody,
  sendJson
} from "../../server/vercel/http.js";
import { getScheduleStore } from "../../server/vercel/store.js";

export default createApiHandler(["POST"], async (request, response) => {
  const body = await readJsonBody(request);
  const lessonId = String(body.lessonId || "").trim();
  if (!lessonId) {
    throw createHttpError("Не указан урок.", 400);
  }
  const store = await getScheduleStore();
  const courses = await store.listAdminCourses();
  if (!courses.some((course) => course.lessons.some((lesson) => lesson.id === lessonId))) {
    throw createHttpError("Урок не найден.", 404);
  }
  sendJson(response, 200, await createPrivateVideoUpload(lessonId, body));
}, { requireAdmin: true });
