import {
  createPrivateVideoUpload,
  deletePrivateVideos
} from "../../server/vercel/education-media.js";
import {
  validateCourse,
  validateLesson
} from "../../server/vercel/education-validation.js";
import {
  createApiHandler,
  createHttpError,
  getRouteId,
  readJsonBody,
  sendJson
} from "../../server/vercel/http.js";
import { getScheduleStore } from "../../server/vercel/store.js";

export default createApiHandler(["GET", "POST", "PATCH", "DELETE"], async (request, response) => {
  const action = getAction(request);
  const store = await getScheduleStore();

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
    const courseId = requireId(request, "Не указан курс.");
    if (request.method === "PATCH") {
      const course = await store.updateCourse(
        courseId,
        validateCourse(await readJsonBody(request), true)
      );
      sendJson(response, 200, { course });
      return;
    }
    if (request.method === "DELETE") {
      const deleted = await store.deleteCourse(courseId);
      await deletePrivateVideos(deleted.videoPaths);
      sendJson(response, 200, deleted);
      return;
    }
  }

  if (action === "lessons" && request.method === "POST") {
    const lesson = await store.createLesson(validateLesson(await readJsonBody(request)));
    sendJson(response, 201, { lesson });
    return;
  }

  if (action === "lesson") {
    const lessonId = requireId(request, "Не указан урок.");
    if (request.method === "DELETE") {
      const deleted = await store.deleteLesson(lessonId);
      await deletePrivateVideos(deleted.videoPath);
      sendJson(response, 200, deleted);
      return;
    }
    if (request.method === "PATCH") {
      const body = await readJsonBody(request);
      if (body.direction) {
        if (!["up", "down"].includes(body.direction)) {
          throw createHttpError("Некорректное направление перемещения.", 400);
        }
        sendJson(response, 200, {
          lesson: await store.moveLesson(lessonId, body.direction)
        });
        return;
      }

      const courses = await store.listAdminCourses();
      const previous = courses.flatMap((course) => course.lessons)
        .find((lesson) => lesson.id === lessonId);
      const lesson = await store.updateLesson(lessonId, validateLesson(body, true));
      if (
        previous?.videoPath &&
        body.videoPath !== undefined &&
        previous.videoPath !== lesson.videoPath
      ) {
        await deletePrivateVideos(previous.videoPath);
      }
      sendJson(response, 200, { lesson });
      return;
    }
  }

  if (action === "course-access" && request.method === "POST") {
    const body = await readJsonBody(request);
    const userId = String(body.userId || "").trim();
    const courseId = String(body.courseId || "").trim();
    if (!userId || !courseId) {
      throw createHttpError("Укажите ID пользователя и курс.", 400);
    }
    const purchase = await store.grantCourseAccess(userId, courseId, "admin-test");
    sendJson(response, 200, { purchase });
    return;
  }

  if (action === "video-upload" && request.method === "POST") {
    const body = await readJsonBody(request);
    const lessonId = String(body.lessonId || "").trim();
    if (!lessonId) {
      throw createHttpError("Не указан урок.", 400);
    }
    const courses = await store.listAdminCourses();
    if (!courses.some((course) => course.lessons.some((lesson) => lesson.id === lessonId))) {
      throw createHttpError("Урок не найден.", 404);
    }
    sendJson(response, 200, await createPrivateVideoUpload(lessonId, body));
    return;
  }

  throw createHttpError("Метод управления обучением не найден.", 404);
}, { requireAdmin: true });

const getAction = (request) =>
  String(
    request.query?.action ||
    new URL(request.url || "/", "http://localhost").searchParams.get("action") ||
    ""
  );

const requireId = (request, message) => {
  const id = getRouteId(request);
  if (!id) {
    throw createHttpError(message, 400);
  }
  return id;
};
