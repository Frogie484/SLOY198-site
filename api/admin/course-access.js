import {
  createApiHandler,
  createHttpError,
  readJsonBody,
  sendJson
} from "../../server/vercel/http.js";
import { getScheduleStore } from "../../server/vercel/store.js";

export default createApiHandler(["POST"], async (request, response) => {
  const body = await readJsonBody(request);
  const userId = String(body.userId || "").trim();
  const courseId = String(body.courseId || "").trim();
  if (!userId || !courseId) {
    throw createHttpError("Укажите ID пользователя и курс.", 400);
  }
  const store = await getScheduleStore();
  const purchase = await store.grantCourseAccess(userId, courseId, "admin-test");
  sendJson(response, 200, { purchase });
}, { requireAdmin: true });
