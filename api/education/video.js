import { getEducationUser } from "../../server/vercel/education-session.js";
import { createPrivateVideoPlayback } from "../../server/vercel/education-media.js";
import {
  createApiHandler,
  createHttpError,
  getRouteId,
  sendJson
} from "../../server/vercel/http.js";
import { getScheduleStore } from "../../server/vercel/store.js";

export default createApiHandler(["GET"], async (request, response) => {
  const user = getEducationUser(request);
  if (!user) {
    throw createHttpError("Требуется доступ к курсу.", 401);
  }
  const lessonId = getRouteId(request);
  if (!lessonId) {
    throw createHttpError("Не указан урок.", 400);
  }
  const store = await getScheduleStore();
  const lesson = await store.getLessonWithAccess(user.id, lessonId);
  sendJson(response, 200, await createPrivateVideoPlayback(lesson.videoPath));
});
