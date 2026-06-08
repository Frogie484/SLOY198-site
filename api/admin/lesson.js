import { deletePrivateVideos } from "../../server/vercel/education-media.js";
import { validateLesson } from "../../server/vercel/education-validation.js";
import {
  createApiHandler,
  createHttpError,
  getRouteId,
  readJsonBody,
  sendJson
} from "../../server/vercel/http.js";
import { getScheduleStore } from "../../server/vercel/store.js";

export default createApiHandler(["PATCH", "DELETE"], async (request, response) => {
  const lessonId = getRouteId(request);
  if (!lessonId) {
    throw createHttpError("Не указан урок.", 400);
  }
  const store = await getScheduleStore();
  if (request.method === "DELETE") {
    const deleted = await store.deleteLesson(lessonId);
    await deletePrivateVideos(deleted.videoPath);
    sendJson(response, 200, deleted);
    return;
  }

  const body = await readJsonBody(request);
  if (body.direction) {
    if (!["up", "down"].includes(body.direction)) {
      throw createHttpError("Некорректное направление перемещения.", 400);
    }
    sendJson(response, 200, { lesson: await store.moveLesson(lessonId, body.direction) });
    return;
  }

  const courses = await store.listAdminCourses();
  const previous = courses.flatMap((course) => course.lessons)
    .find((lesson) => lesson.id === lessonId);
  const lesson = await store.updateLesson(lessonId, validateLesson(body, true));
  if (previous?.videoPath && body.videoPath !== undefined && previous.videoPath !== lesson.videoPath) {
    await deletePrivateVideos(previous.videoPath);
  }
  sendJson(response, 200, { lesson });
}, { requireAdmin: true });
