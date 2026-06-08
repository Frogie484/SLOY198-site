import { deletePrivateVideos } from "../../server/vercel/education-media.js";
import { validateCourse } from "../../server/vercel/education-validation.js";
import {
  createApiHandler,
  createHttpError,
  getRouteId,
  readJsonBody,
  sendJson
} from "../../server/vercel/http.js";
import { getScheduleStore } from "../../server/vercel/store.js";

export default createApiHandler(["PATCH", "DELETE"], async (request, response) => {
  const courseId = getRouteId(request);
  if (!courseId) {
    throw createHttpError("Не указан курс.", 400);
  }
  const store = await getScheduleStore();
  if (request.method === "DELETE") {
    const deleted = await store.deleteCourse(courseId);
    await deletePrivateVideos(deleted.videoPaths);
    sendJson(response, 200, deleted);
    return;
  }
  const course = await store.updateCourse(
    courseId,
    validateCourse(await readJsonBody(request), true)
  );
  sendJson(response, 200, { course });
}, { requireAdmin: true });
