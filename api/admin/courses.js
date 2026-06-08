import { createApiHandler, readJsonBody, sendJson } from "../../server/vercel/http.js";
import { getScheduleStore } from "../../server/vercel/store.js";
import { validateCourse } from "../../server/vercel/education-validation.js";

export default createApiHandler(["GET", "POST"], async (request, response) => {
  const store = await getScheduleStore();
  if (request.method === "GET") {
    sendJson(response, 200, { courses: await store.listAdminCourses() });
    return;
  }
  const course = await store.createCourse(validateCourse(await readJsonBody(request)));
  sendJson(response, 201, { course });
}, { requireAdmin: true });
