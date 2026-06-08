import { validateLesson } from "../../server/vercel/education-validation.js";
import { createApiHandler, readJsonBody, sendJson } from "../../server/vercel/http.js";
import { getScheduleStore } from "../../server/vercel/store.js";

export default createApiHandler(["POST"], async (request, response) => {
  const store = await getScheduleStore();
  const lesson = await store.createLesson(validateLesson(await readJsonBody(request)));
  sendJson(response, 201, { lesson });
}, { requireAdmin: true });
