import { validateCourse } from "../../server/vercel/education-validation.js";
import { getEducationStore } from "../../server/vercel/education-store.js";
import {
  createApiHandler,
  createHttpError,
  getRouteId,
  readJsonBody,
  sendJson
} from "../../server/vercel/http.js";

export default createApiHandler(["GET", "POST", "PATCH", "DELETE"], async (
  request,
  response
) => {
  const action = getAction(request);
  const store = await getEducationStore();

  if (action === "courses") {
    if (request.method === "GET") {
      sendJson(response, 200, { courses: await store.listAdminCourses() });
      return;
    }
    if (request.method === "POST") {
      const course = await store.createCourse(validateCourse(await readJsonBody(request)));
      sendJson(response, 201, { course });
      return;
    }
  }

  if (action === "course") {
    const courseId = getRouteId(request);
    if (!courseId) {
      throw createHttpError("Не указан курс.", 400);
    }
    if (request.method === "PATCH") {
      const course = await store.updateCourse(
        courseId,
        validateCourse(await readJsonBody(request), true)
      );
      sendJson(response, 200, { course });
      return;
    }
    if (request.method === "DELETE") {
      sendJson(response, 200, await store.deleteCourse(courseId));
      return;
    }
  }

  throw createHttpError("Метод управления курсами не найден.", 404);
}, { requireAdmin: true });

const getAction = (request) =>
  String(
    request.query?.action ||
    new URL(request.url || "/", "http://localhost").searchParams.get("action") ||
    ""
  );
